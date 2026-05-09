import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    phone: str | None = None
    whatsapp_number: str | None = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    whatsapp_number: str | None = None
    notification_prefs: dict | None = None


class UserResponse(UserBase):
    id: uuid.UUID
    avatar_url: str | None = None
    is_active: bool
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserPublic(BaseModel):
    id: uuid.UUID
    full_name: str
    email: EmailStr
    avatar_url: str | None = None

    model_config = {"from_attributes": True}
