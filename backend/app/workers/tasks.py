"""
Celery task pipeline:

  1. process_meeting_task(meeting_id)
       ├── Download audio from MinIO
       ├── Transcribe (Whisper or Azure)
       ├── Analyse with LLM
       ├── Persist results to DB
       └── Dispatch send_notifications_task

  2. send_notifications_task(meeting_id)
       ├── WhatsApp to each participant with a phone number
       └── Email to each participant with an email address
"""
import uuid
import json
from datetime import datetime, timezone

import structlog
from celery import shared_task
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.models.meeting import Meeting, MeetingStatus, Transcript, ActionItem, ActionItemStatus
from app.models.user import User
from app.services.ai_analysis import get_analysis_service
from app.services.notification import EmailNotificationService, WhatsAppNotificationService
from app.services.storage import StorageService
from app.services.transcription import get_transcription_service
from app.workers.celery_app import celery_app

log = structlog.get_logger()

# Synchronous SQLAlchemy engine for Celery workers
_sync_engine = None


def _get_sync_engine():
    global _sync_engine
    if _sync_engine is None:
        _sync_engine = create_engine(settings.database_url_sync, pool_pre_ping=True)
    return _sync_engine


@celery_app.task(
    name="app.workers.tasks.process_meeting_task",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    soft_time_limit=1800,  # 30 min max per meeting
    time_limit=2100,
)
def process_meeting_task(self, meeting_id: str):
    log.info("task.process_meeting.start", meeting_id=meeting_id)
    engine = _get_sync_engine()

    with Session(engine) as db:
        result = db.execute(
            select(Meeting)
            .options(selectinload(Meeting.participants))
            .where(Meeting.id == uuid.UUID(meeting_id))
        )
        meeting = result.scalar_one_or_none()
        if not meeting:
            log.error("task.process_meeting.not_found", meeting_id=meeting_id)
            return

        meeting.status = MeetingStatus.TRANSCRIBING
        meeting.processing_started_at = datetime.now(timezone.utc)
        db.commit()

        try:
            # ── Step 1: Download audio ─────────────────────────────────────
            storage = StorageService()
            audio_bytes = storage.download_audio(meeting.audio_file_key)
            log.info("task.audio_downloaded", meeting_id=meeting_id, size=len(audio_bytes))

            # ── Step 2: Transcribe ─────────────────────────────────────────
            transcription_svc = get_transcription_service()
            lang_hint = meeting.language.value if meeting.language.value != "auto" else None
            transcript_result = transcription_svc.transcribe(audio_bytes, language_hint=lang_hint)
            log.info(
                "task.transcription_done",
                meeting_id=meeting_id,
                language=transcript_result.detected_language,
                words=transcript_result.word_count,
            )

            transcript = Transcript(
                meeting_id=meeting.id,
                raw_text=transcript_result.text,
                segments=[
                    {
                        "start": s.start,
                        "end": s.end,
                        "text": s.text,
                        "speaker": s.speaker,
                        "confidence": s.confidence,
                    }
                    for s in transcript_result.segments
                ],
                detected_language=transcript_result.detected_language,
                confidence_score=transcript_result.confidence,
                word_count=transcript_result.word_count,
            )
            db.add(transcript)

            transcript_key = storage.save_transcript(meeting.id, transcript_result.text)
            transcript.storage_key = transcript_key

            # ── Step 3: AI analysis ────────────────────────────────────────
            meeting.status = MeetingStatus.ANALYSING
            db.commit()

            analysis_svc = get_analysis_service()
            analysis = analysis_svc.analyse(transcript_result.text)
            log.info("task.analysis_done", meeting_id=meeting_id, items=len(analysis.action_items))

            # ── Step 4: Persist results ────────────────────────────────────
            meeting.summary = analysis.summary
            meeting.key_decisions = analysis.key_decisions
            meeting.next_steps = analysis.next_steps
            meeting.topics_discussed = analysis.topics_discussed
            meeting.sentiment = analysis.sentiment
            meeting.meeting_effectiveness_score = analysis.meeting_effectiveness_score

            for item in analysis.action_items:
                due = None
                if item.get("due_date"):
                    try:
                        due = datetime.fromisoformat(item["due_date"].rstrip("Z"))
                    except ValueError:
                        pass

                db.add(ActionItem(
                    meeting_id=meeting.id,
                    title=item["title"],
                    description=item.get("description"),
                    assignee_name_raw=item.get("assignee"),
                    due_date=due,
                    priority=item.get("priority", "medium"),
                    status=ActionItemStatus.OPEN,
                ))

            meeting.status = MeetingStatus.COMPLETED
            meeting.processing_completed_at = datetime.now(timezone.utc)
            db.commit()

            # ── Step 5: Queue notifications ────────────────────────────────
            send_notifications_task.delay(meeting_id)
            log.info("task.process_meeting.success", meeting_id=meeting_id)

        except Exception as exc:
            meeting.status = MeetingStatus.FAILED
            meeting.error_message = str(exc)
            db.commit()
            log.error("task.process_meeting.failed", meeting_id=meeting_id, error=str(exc))
            raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.tasks.send_notifications_task",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def send_notifications_task(self, meeting_id: str):
    log.info("task.send_notifications.start", meeting_id=meeting_id)
    engine = _get_sync_engine()

    with Session(engine) as db:
        result = db.execute(
            select(Meeting)
            .options(
                selectinload(Meeting.action_items),
                selectinload(Meeting.participants),
                selectinload(Meeting.host),
            )
            .where(Meeting.id == uuid.UUID(meeting_id))
        )
        meeting = result.scalar_one_or_none()
        if not meeting or meeting.status != MeetingStatus.COMPLETED:
            return

        action_items = [
            {
                "title": item.title,
                "assignee": item.assignee_name_raw,
                "due_date": item.due_date.strftime("%d %b %Y") if item.due_date else None,
                "priority": item.priority,
            }
            for item in meeting.action_items
        ]

        meeting_url = f"{settings.app_frontend_url}/meetings/{meeting_id}"
        whatsapp_svc = WhatsAppNotificationService()
        email_svc = EmailNotificationService()

        recipients = []

        # Always notify the host
        if meeting.host:
            recipients.append({
                "name": meeting.host.full_name,
                "email": meeting.host.email,
                "whatsapp": meeting.host.whatsapp_number,
            })

        # Notify all participants
        for p in meeting.participants:
            recipients.append({
                "name": p.name,
                "email": p.email,
                "whatsapp": p.whatsapp_number,
            })

        for recipient in recipients:
            if recipient.get("whatsapp"):
                whatsapp_svc.send_action_items(
                    to_number=recipient["whatsapp"],
                    meeting_title=meeting.title,
                    summary=meeting.summary or "",
                    action_items=action_items,
                    recipient_name=recipient["name"],
                )
            if recipient.get("email"):
                email_svc.send_meeting_summary(
                    to_email=recipient["email"],
                    recipient_name=recipient["name"],
                    meeting_title=meeting.title,
                    summary=meeting.summary or "",
                    action_items=action_items,
                    meeting_url=meeting_url,
                )

        meeting.whatsapp_sent_at = datetime.now(timezone.utc)
        meeting.email_sent_at = datetime.now(timezone.utc)
        db.commit()
        log.info("task.send_notifications.success", meeting_id=meeting_id)
