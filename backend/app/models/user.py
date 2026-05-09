import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    whatsapp_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    google_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notification_prefs: Mapped[str] = mapped_column(
        String(500),
        default='{"whatsapp": true, "email": true, "in_app": true}'
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    memberships: Mapped[list["OrganisationMember"]] = relationship(back_populates="user")  # noqa: F821
    meetings_hosted: Mapped[list["Meeting"]] = relationship(  # noqa: F821
        back_populates="host", foreign_keys="Meeting.host_id"
    )
    action_items_assigned: Mapped[list["ActionItem"]] = relationship(  # noqa: F821
        back_populates="assignee", foreign_keys="ActionItem.assignee_id"
    )
