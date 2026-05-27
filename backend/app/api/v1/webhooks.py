"""
Zoom Cloud Recording Webhook Handler
=====================================

Flow
----
1. Org admin creates a Zoom Server-to-Server OAuth app (or General app), adds a
   Subscription for the ``recording.completed`` event, and sets the endpoint URL to:

       https://<your-domain>/api/v1/webhooks/zoom/<org_id>

2. Zoom fires a URL-validation challenge the first time the URL is saved — we answer
   it immediately without checking the signature (Zoom requirement).

3. For every subsequent ``recording.completed`` event we:
   a. Verify the Zoom HMAC-SHA256 signature.
   b. Pick the best audio file (M4A preferred over MP4).
   c. Deduplicate via ``zoom_recording_id`` so retried webhooks are harmless.
   d. Resolve the meeting host — by ``host_email`` first, org owner as fallback.
   e. Create a ``Meeting`` record (status = processing, source = zoom).
   f. Enqueue ``ingest_zoom_recording_task`` which downloads the file from Zoom,
      uploads it to MinIO, then hands off to the existing ``process_meeting_task``.

Zoom Signature Verification
----------------------------
  message  = "v0:{x-zm-request-timestamp}:{raw_body}"
  expected = "v0=" + HMAC-SHA256(ZOOM_WEBHOOK_SECRET_TOKEN, message).hexdigest()
  compare  == x-zm-signature header

Download Token
--------------
  The payload contains a short-lived ``download_access_token`` (valid ≈ 60 min).
  We pass it directly to the Celery task so it can append it to the download URL.
"""
import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone

import structlog
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import DB
from app.config import settings
from app.models.meeting import Meeting, MeetingStatus
from app.models.organisation import Organisation, OrganisationMember, MemberRole
from app.models.user import User
from app.workers.tasks import ingest_zoom_recording_task

log = structlog.get_logger()

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _verify_zoom_signature(
    secret: str,
    timestamp: str,
    raw_body: bytes,
    signature: str,
) -> bool:
    """Return True if the Zoom HMAC-SHA256 signature is valid."""
    message = f"v0:{timestamp}:{raw_body.decode('utf-8')}"
    expected = "v0=" + hmac.new(
        secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def _pick_audio_file(recording_files: list[dict]) -> dict | None:
    """Return the best completed audio file from a recording_files list.

    Preference order: M4A (audio-only) → MP4 → anything else completed.
    """
    completed = [f for f in recording_files if f.get("status") == "completed"]
    for preferred_type in ("M4A", "MP4"):
        match = next((f for f in completed if f.get("file_type") == preferred_type), None)
        if match:
            return match
    return completed[0] if completed else None


async def _resolve_host(
    db: AsyncSession,
    org_id: uuid.UUID,
    host_email: str,
) -> User | None:
    """Find the meeting host user.

    Tries to match by email inside the org first; falls back to the org owner.
    """
    if host_email:
        result = await db.execute(
            select(User)
            .join(OrganisationMember, OrganisationMember.user_id == User.id)
            .where(
                OrganisationMember.organisation_id == org_id,
                OrganisationMember.is_active == True,  # noqa: E712
                User.email == host_email,
                User.is_active == True,  # noqa: E712
            )
        )
        user = result.scalar_one_or_none()
        if user:
            return user

    # Fallback: first active owner of the org
    owner_result = await db.execute(
        select(User)
        .join(OrganisationMember, OrganisationMember.user_id == User.id)
        .where(
            OrganisationMember.organisation_id == org_id,
            OrganisationMember.role == MemberRole.OWNER,
            OrganisationMember.is_active == True,  # noqa: E712
            User.is_active == True,  # noqa: E712
        )
        .limit(1)
    )
    return owner_result.scalar_one_or_none()


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/zoom/{org_id}", summary="Zoom cloud-recording webhook")
async def zoom_webhook(
    org_id: uuid.UUID,
    request: Request,
    db: DB,
    background_tasks: BackgroundTasks,
    x_zm_signature: str | None = Header(None, alias="x-zm-signature"),
    x_zm_request_timestamp: str | None = Header(None, alias="x-zm-request-timestamp"),
):
    """
    Receives Zoom recording.completed events and queues the audio for processing.

    The endpoint URL to register in Zoom is:
        ``https://<your-domain>/api/v1/webhooks/zoom/<org_id>``
    """
    raw_body = await request.body()
    payload: dict = await request.json()
    event: str = payload.get("event", "")

    # ── URL-validation challenge ──────────────────────────────────────────────
    # Zoom sends this when you first save the endpoint in the Zoom dashboard.
    # We must respond before verifying the signature (the challenge has none).
    if event == "endpoint.url_validation":
        plain_token: str = payload["payload"]["plainToken"]
        encrypted = hmac.new(
            settings.zoom_webhook_secret_token.encode("utf-8"),
            plain_token.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        log.info("zoom.webhook.url_validation", org_id=str(org_id))
        return {"plainToken": plain_token, "encryptedToken": encrypted}

    # ── Guard: integration must be configured ─────────────────────────────────
    if not settings.zoom_webhook_secret_token:
        log.error("zoom.webhook.not_configured")
        raise HTTPException(status_code=500, detail="Zoom integration not configured on this server")

    # ── Signature verification ────────────────────────────────────────────────
    if not x_zm_signature or not x_zm_request_timestamp:
        log.warning("zoom.webhook.missing_headers", org_id=str(org_id))
        raise HTTPException(status_code=400, detail="Missing Zoom signature headers")

    if not _verify_zoom_signature(
        settings.zoom_webhook_secret_token,
        x_zm_request_timestamp,
        raw_body,
        x_zm_signature,
    ):
        log.warning("zoom.webhook.bad_signature", org_id=str(org_id))
        raise HTTPException(status_code=401, detail="Invalid Zoom signature")

    # ── Only process recording.completed ─────────────────────────────────────
    if event != "recording.completed":
        log.debug("zoom.webhook.ignored", event=event)
        return {"ok": True}

    obj: dict = payload["payload"]["object"]
    host_email: str = obj.get("host_email", "")
    topic: str = obj.get("topic") or "Zoom Meeting"
    start_time: str | None = obj.get("start_time")
    duration_minutes: int = int(obj.get("duration") or 0)
    recording_files: list[dict] = obj.get("recording_files", [])
    download_access_token: str = obj.get("download_access_token", "")

    log.info(
        "zoom.webhook.received",
        org_id=str(org_id),
        topic=topic,
        host_email=host_email,
        files=len(recording_files),
    )

    # ── Pick best audio file ──────────────────────────────────────────────────
    audio_file = _pick_audio_file(recording_files)
    if not audio_file:
        log.warning("zoom.webhook.no_audio", org_id=str(org_id), topic=topic)
        return {"ok": True, "skipped": "no completed audio file in payload"}

    zoom_recording_id: str = audio_file.get("id", "")
    download_url: str = audio_file.get("download_url", "")
    file_ext: str = audio_file.get("file_extension", "M4A").lower()
    file_size: int = int(audio_file.get("file_size") or 0)

    # ── Verify org ───────────────────────────────────────────────────────────
    org_result = await db.execute(
        select(Organisation).where(
            Organisation.id == org_id,
            Organisation.is_active == True,  # noqa: E712
        )
    )
    if not org_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Organisation not found")

    # ── Deduplication ─────────────────────────────────────────────────────────
    if zoom_recording_id:
        dup = await db.execute(
            select(Meeting).where(Meeting.zoom_recording_id == zoom_recording_id)
        )
        if dup.scalar_one_or_none():
            log.info("zoom.webhook.duplicate", zoom_recording_id=zoom_recording_id)
            return {"ok": True, "skipped": "already processed"}

    # ── Resolve host user ─────────────────────────────────────────────────────
    host_user = await _resolve_host(db, org_id, host_email)
    if not host_user:
        log.error("zoom.webhook.no_host", org_id=str(org_id), host_email=host_email)
        raise HTTPException(
            status_code=422,
            detail=(
                "Cannot find a matching user in this organisation. "
                "Ensure the Zoom host email matches a MeetingMind account, "
                "or that the organisation has at least one owner."
            ),
        )

    # ── Parse timestamps ──────────────────────────────────────────────────────
    started_at: datetime | None = None
    ended_at: datetime | None = None
    if start_time:
        try:
            started_at = datetime.fromisoformat(start_time.rstrip("Z")).replace(
                tzinfo=timezone.utc
            )
            if duration_minutes:
                ended_at = started_at + timedelta(minutes=duration_minutes)
        except (ValueError, AttributeError):
            pass

    # ── Create Meeting record ─────────────────────────────────────────────────
    meeting = Meeting(
        organisation_id=org_id,
        host_id=host_user.id,
        title=topic,
        status=MeetingStatus.PROCESSING,
        source="zoom",
        audio_size_bytes=file_size or None,
        original_filename=f"{topic}.{file_ext}",
        started_at=started_at,
        ended_at=ended_at,
        audio_duration_seconds=float(duration_minutes * 60) if duration_minutes else None,
        zoom_recording_id=zoom_recording_id or None,
    )
    db.add(meeting)
    await db.flush()  # materialise meeting.id before returning

    log.info(
        "zoom.webhook.meeting_created",
        meeting_id=str(meeting.id),
        org_id=str(org_id),
        topic=topic,
        zoom_recording_id=zoom_recording_id,
    )

    # ── Queue download + processing ───────────────────────────────────────────
    background_tasks.add_task(
        ingest_zoom_recording_task.delay,
        str(meeting.id),
        download_url,
        download_access_token,
        file_ext,
    )

    return {"ok": True, "meeting_id": str(meeting.id)}
