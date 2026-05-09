import uuid
from datetime import datetime
from pydantic import BaseModel

from app.models.organisation import MemberRole, PlanTier


class OrganisationCreate(BaseModel):
    name: str
    industry: str | None = None
    country: str = "NG"
    timezone: str = "Africa/Lagos"


class OrganisationUpdate(BaseModel):
    name: str | None = None
    industry: str | None = None
    timezone: str | None = None
    whatsapp_group_id: str | None = None


class OrganisationResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    industry: str | None = None
    country: str
    timezone: str
    logo_url: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberInvite(BaseModel):
    email: str
    role: MemberRole = MemberRole.MEMBER


class MemberResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    role: MemberRole
    joined_at: datetime
    user: dict

    model_config = {"from_attributes": True}


class PlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    tier: PlanTier
    price_kobo: int
    max_users: int | None
    max_meetings_per_month: int | None
    max_audio_hours_per_month: int | None
    features: str

    model_config = {"from_attributes": True}
