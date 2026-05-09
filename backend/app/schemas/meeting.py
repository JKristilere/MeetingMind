import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.models.meeting import MeetingStatus, Language, ActionItemStatus


class MeetingCreate(BaseModel):
    title: str
    description: str | None = None
    language: Language = Language.AUTO
    scheduled_at: datetime | None = None
    participant_emails: list[str] = []


class MeetingUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    scheduled_at: datetime | None = None


class TranscriptSegment(BaseModel):
    start: float
    end: float
    speaker: str | None = None
    text: str
    confidence: float | None = None


class TranscriptResponse(BaseModel):
    id: uuid.UUID
    raw_text: str
    segments: list[TranscriptSegment] | None = None
    detected_language: str | None = None
    confidence_score: float | None = None
    word_count: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ActionItemResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    assignee_name_raw: str | None = None
    assignee_id: uuid.UUID | None = None
    due_date: datetime | None = None
    status: ActionItemStatus
    priority: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ActionItemUpdate(BaseModel):
    status: ActionItemStatus | None = None
    due_date: datetime | None = None
    assignee_id: uuid.UUID | None = None
    priority: str | None = None


class ParticipantCreate(BaseModel):
    name: str
    email: str | None = None
    whatsapp_number: str | None = None


class MeetingResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    status: MeetingStatus
    language: Language
    audio_duration_seconds: float | None = None
    original_filename: str | None = None
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    source: str
    summary: str | None = None
    key_decisions: list | None = None
    next_steps: list | None = None
    topics_discussed: list | None = None
    sentiment: str | None = None
    meeting_effectiveness_score: float | None = None
    host_id: uuid.UUID
    organisation_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MeetingDetailResponse(MeetingResponse):
    transcript: TranscriptResponse | None = None
    action_items: list[ActionItemResponse] = []
    participants: list[dict] = []


class MeetingListResponse(BaseModel):
    items: list[MeetingResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
