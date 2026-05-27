import uuid
import math
import smtplib
import ssl
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, UploadFile, File, Form, Query, BackgroundTasks
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DB
from app.config import settings
from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError, PlanLimitError
from app.models.user import User
from app.models.meeting import Meeting, MeetingStatus, ActionItem, MeetingParticipant, Language
from app.models.organisation import OrganisationMember
from app.schemas.meeting import (
    MeetingCreate,
    MeetingDetailResponse,
    MeetingListResponse,
    MeetingResponse,
    MeetingUpdate,
    ActionItemResponse,
    ActionItemUpdate,
    ParticipantCreate,
)
from app.services.storage import StorageService
from app.workers.tasks import process_meeting_task, send_test_mail_task

router = APIRouter(prefix="/meetings", tags=["meetings"])


async def _check_org_access(org_id: uuid.UUID, user_id: uuid.UUID, db) -> OrganisationMember:
    result = await db.execute(
        select(OrganisationMember).where(
            OrganisationMember.organisation_id == org_id,
            OrganisationMember.user_id == user_id,
            OrganisationMember.is_active == True,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise ForbiddenError("Not a member of this organisation")
    return member


@router.post("/{org_id}/meetings", response_model=MeetingResponse, status_code=201)
async def create_meeting(
    org_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    language: Language = Form(Language.AUTO),
    description: str | None = Form(None),
    participant_ids: str | None = Form(None),
    participant_names: str | None = Form(None),
    file: UploadFile = File(...),
):
    await _check_org_access(org_id, current_user.id, db)

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in settings.supported_audio_formats:
        raise ValidationError(f"Unsupported format '{ext}'. Allowed: {', '.join(settings.supported_audio_formats)}")

    storage = StorageService()
    audio_key, size_bytes = await storage.upload_audio(file, org_id)

    meeting = Meeting(
        organisation_id=org_id,
        host_id=current_user.id,
        title=title,
        description=description,
        language=language,
        status=MeetingStatus.PROCESSING,
        audio_file_key=audio_key,
        audio_size_bytes=size_bytes,
        original_filename=file.filename,
        source="upload",
    )
    db.add(meeting)
    # Flush immediately so meeting.id, created_at, and updated_at are populated
    # by the DB before we reference meeting.id in participant rows below.
    await db.flush()

    # ── Participants: org members referenced by UUID ───────────────────────────
    parsed_ids: list[uuid.UUID] = []
    if participant_ids:
        for raw in participant_ids.split(","):
            raw = raw.strip()
            if raw:
                try:
                    parsed_ids.append(uuid.UUID(raw))
                except ValueError:
                    raise ValidationError(f"Invalid UUID: {raw}")

    for p_id in parsed_ids:
        row_result = await db.execute(
            select(User, OrganisationMember)
            .join(OrganisationMember, OrganisationMember.user_id == User.id)
            .where(
                OrganisationMember.organisation_id == org_id,
                User.id == p_id,
            )
        )
        result = row_result.first()
        if not result:
            raise ValidationError(f"User {p_id} is not a member of the organisation")

        db.add(MeetingParticipant(
            meeting_id=meeting.id,
            user_id=result.User.id,
            notified_at=datetime.now(timezone.utc),
            name=result.User.full_name,
            email=result.User.email,
            whatsapp_number=result.User.whatsapp_number,
        ))

    # ── Participants: free-form names (used by the Chrome extension) ───────────
    if participant_names:
        for entry in participant_names.split(","):
            name = entry.strip()
            if name:
                db.add(MeetingParticipant(
                    meeting_id=meeting.id,
                    name=name,
                ))

    # One bulk flush for all participant rows, then refresh to return full object
    await db.flush()
    await db.refresh(meeting)

    background_tasks.add_task(process_meeting_task.delay, str(meeting.id))
    return meeting


@router.get("/{org_id}/meetings", response_model=MeetingListResponse)
async def list_meetings(
    org_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: MeetingStatus | None = None,
    search: str | None = None,
):
    await _check_org_access(org_id, current_user.id, db)

    query = select(Meeting).where(Meeting.organisation_id == org_id)
    if status:
        query = query.where(Meeting.status == status)
    if search:
        query = query.where(Meeting.title.ilike(f"%{search}%"))

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar_one()

    query = query.order_by(desc(Meeting.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    meetings = result.scalars().all()

    return MeetingListResponse(
        items=meetings,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 1,
    )


@router.get("/{org_id}/meetings/{meeting_id}", 
            # response_model=MeetingDetailResponse
            )
async def get_meeting(
    org_id: uuid.UUID,
    meeting_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    await _check_org_access(org_id, current_user.id, db)

    result = await db.execute(
        select(Meeting)
        .options(
            selectinload(Meeting.transcript),
            selectinload(Meeting.action_items),
            selectinload(Meeting.participants),
        )
        .where(Meeting.id == meeting_id, Meeting.organisation_id == org_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise NotFoundError("Meeting")
    return meeting


@router.patch("/{org_id}/meetings/{meeting_id}", response_model=MeetingResponse)
async def update_meeting(
    org_id: uuid.UUID,
    meeting_id: uuid.UUID,
    body: MeetingUpdate,
    current_user: CurrentUser,
    db: DB,
):
    await _check_org_access(org_id, current_user.id, db)
    result = await db.execute(
        select(Meeting).where(Meeting.id == meeting_id, Meeting.organisation_id == org_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise NotFoundError("Meeting")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(meeting, field, value)
    return meeting


@router.delete("/{org_id}/meetings/{meeting_id}", status_code=204)
async def delete_meeting(
    org_id: uuid.UUID,
    meeting_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    await _check_org_access(org_id, current_user.id, db)
    result = await db.execute(
        select(Meeting).where(Meeting.id == meeting_id, Meeting.organisation_id == org_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise NotFoundError("Meeting")
    if meeting.host_id != current_user.id:
        raise ForbiddenError("Only the host can delete a meeting")
    await db.delete(meeting)


@router.patch("/{org_id}/meetings/{meeting_id}/action-items/{item_id}", response_model=ActionItemResponse)
async def update_action_item(
    org_id: uuid.UUID,
    meeting_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ActionItemUpdate,
    current_user: CurrentUser,
    db: DB,
):
    await _check_org_access(org_id, current_user.id, db)
    result = await db.execute(
        select(ActionItem).where(
            ActionItem.id == item_id,
            ActionItem.meeting_id == meeting_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Action item")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    return item


@router.post("/{org_id}/meetings/{meeting_id}/participants", status_code=201)
async def add_participant(
    org_id: uuid.UUID,
    meeting_id: uuid.UUID,
    body: ParticipantCreate,
    current_user: CurrentUser,
    db: DB,
):
    await _check_org_access(org_id, current_user.id, db)
    result = await db.execute(
        select(Meeting).where(Meeting.id == meeting_id, Meeting.organisation_id == org_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise NotFoundError("Meeting")

    participant = MeetingParticipant(
        meeting_id=meeting_id,
        name=body.name,
        email=body.email,
        whatsapp_number=body.whatsapp_number,
    )
    db.add(participant)
    await db.flush()
    return {"id": str(participant.id), "name": participant.name}


@router.post("/debug/test-email", tags=["debug"])
async def debug_test_email(current_user: CurrentUser):
    """
    Sends a test email synchronously. The real SMTP/Resend error is returned directly
    in the response body — no need to dig through logs.
    """
    from app.services.notification import EmailNotificationService
    try:
        EmailNotificationService().send_test_mail(to_email=current_user.email)
        return {"status": "sent", "provider": settings.email_provider, "to": current_user.email}
    except Exception as exc:
        return {
            "status": "failed",
            "provider": settings.email_provider,
            "to": current_user.email,
            "error": str(exc),
        }


@router.post("/debug/test-email/queued", tags=["debug"])
async def debug_test_email_queued(current_user: CurrentUser, background_tasks: BackgroundTasks):
    """Queues a test email via Celery. Check Flower at :5555 to track the task."""
    background_tasks.add_task(send_test_mail_task.delay, to_email=current_user.email)
    return {"status": "queued", "to": current_user.email}

@router.post("/debug/test-whatsapp", tags=["debug"])
async def debug_test_whatsapp(current_user: CurrentUser):
    """
    Sends a test WhatsApp message synchronously. The real provider error is returned directly
    in the response body.
    """
    from app.services.notification import WhatsAppNotificationService
    try:
        WhatsAppNotificationService().send_test_message(to_number=current_user.whatsapp_number)
        return {"status": "sent", "to": current_user.whatsapp_number}
    except Exception as exc:
        return {
            "status": "failed",
            "to": current_user.whatsapp_number,
            "error": str(exc),
        }
    

@router.post("/debug/test-whatsapp/queued", tags=["debug"])
async def debug_test_whatsapp_queued(current_user: CurrentUser, background_tasks: BackgroundTasks):
    """Queues a test WhatsApp message via Celery. Check Flower at :5555 to track the task."""
    from app.workers.tasks import send_test_whatsapp_task
    background_tasks.add_task(send_test_whatsapp_task.delay, to_number=current_user.whatsapp_number)
    return {"status": "queued", "to": current_user.whatsapp_number}