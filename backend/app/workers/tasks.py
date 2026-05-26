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

    try:
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
                log.warning("task.send_notifications.skipped", meeting_id=meeting_id,
                            reason="not found or not completed")
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

            emails_sent = 0
            emails_failed = 0
            whatsapp_sent = 0

            for recipient in recipients:
                if recipient.get("whatsapp"):
                    ok = whatsapp_svc.send_action_items(
                        to_number=recipient["whatsapp"],
                        meeting_title=meeting.title,
                        summary=meeting.summary or "",
                        action_items=action_items,
                        recipient_name=recipient["name"],
                    )
                    if ok:
                        whatsapp_sent += 1

                if recipient.get("email"):
                    ok = email_svc.send_meeting_summary(
                        to_email=recipient["email"],
                        recipient_name=recipient["name"],
                        meeting_title=meeting.title,
                        summary=meeting.summary or "",
                        action_items=action_items,
                        meeting_url=meeting_url,
                    )
                    if ok:
                        emails_sent += 1
                        log.info("email.sent", to=recipient["email"], meeting_id=meeting_id)
                    else:
                        emails_failed += 1
                        log.error("email.send_failed_for_recipient", to=recipient["email"],
                                  meeting_id=meeting_id)

            now = datetime.now(timezone.utc)
            if whatsapp_sent:
                meeting.whatsapp_sent_at = now
            if emails_sent:
                meeting.email_sent_at = now
            db.commit()

            log.info(
                "task.send_notifications.success",
                meeting_id=meeting_id,
                emails_sent=emails_sent,
                emails_failed=emails_failed,
                whatsapp_sent=whatsapp_sent,
            )

    except Exception as exc:
        log.error("task.send_notifications.failed", meeting_id=meeting_id, error=str(exc))
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.tasks.ingest_zoom_recording_task",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    soft_time_limit=600,   # 10 min: Zoom download + MinIO upload
    time_limit=700,
)
def ingest_zoom_recording_task(
    self,
    meeting_id: str,
    download_url: str,
    access_token: str,
    file_ext: str = "m4a",
) -> None:
    """Download a Zoom cloud recording, upload it to MinIO, then trigger processing.

    The Zoom ``download_access_token`` is valid for approximately 60 minutes from
    the moment the webhook fires, so this task should start promptly.

    Steps
    -----
    1. GET ``{download_url}?access_token={access_token}`` from Zoom CDN.
    2. Upload the raw bytes to MinIO via :meth:`StorageService.upload_audio_from_bytes`.
    3. Patch ``meeting.audio_file_key`` so the main pipeline can download from MinIO.
    4. Enqueue :func:`process_meeting_task` — identical to the upload path from here on.
    """
    import httpx

    log.info("task.ingest_zoom.start", meeting_id=meeting_id)
    engine = _get_sync_engine()

    with Session(engine) as db:
        result = db.execute(
            select(Meeting).where(Meeting.id == uuid.UUID(meeting_id))
        )
        meeting = result.scalar_one_or_none()
        if not meeting:
            log.error("task.ingest_zoom.not_found", meeting_id=meeting_id)
            return

        try:
            # ── Step 1: Download audio from Zoom ──────────────────────────────
            # Zoom accepts the access_token as a query parameter.
            url_with_token = f"{download_url}?access_token={access_token}"
            log.info("task.ingest_zoom.downloading", meeting_id=meeting_id, url=download_url)

            with httpx.Client(timeout=300.0, follow_redirects=True) as client:
                response = client.get(url_with_token)
                response.raise_for_status()
                audio_bytes = response.content

            log.info(
                "task.ingest_zoom.downloaded",
                meeting_id=meeting_id,
                size_bytes=len(audio_bytes),
            )

            # ── Step 2: Upload to MinIO ────────────────────────────────────────
            storage = StorageService()
            safe_title = (meeting.title or "zoom-recording").replace("/", "-")
            filename = f"{safe_title}.{file_ext.lstrip('.')}"
            audio_key, size_bytes = storage.upload_audio_from_bytes(
                audio_bytes,
                meeting.organisation_id,
                filename,
            )
            log.info(
                "task.ingest_zoom.uploaded_to_minio",
                meeting_id=meeting_id,
                key=audio_key,
            )

            # ── Step 3: Patch meeting record ───────────────────────────────────
            meeting.audio_file_key = audio_key
            meeting.audio_size_bytes = size_bytes
            meeting.original_filename = filename
            db.commit()

            # ── Step 4: Hand off to the main pipeline ──────────────────────────
            process_meeting_task.delay(meeting_id)
            log.info("task.ingest_zoom.success", meeting_id=meeting_id)

        except Exception as exc:
            meeting.status = MeetingStatus.FAILED
            meeting.error_message = f"Zoom ingest failed: {exc}"
            db.commit()
            log.error("task.ingest_zoom.failed", meeting_id=meeting_id, error=str(exc))
            raise self.retry(exc=exc)


@celery_app.task(name="app.workers.tasks.send_test_mail_task")
def send_test_mail_task(to_email: str) -> None:
    EmailNotificationService().send_test_mail(to_email=to_email)
    log.info("task.send_test_mail.success", to_email=to_email)