"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-09

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Enums ─────────────────────────────────────────────────────────────────
    plan_tier = postgresql.ENUM(
        "free", "starter", "growth", "business", name="plantier", create_type=True
    )
    member_role = postgresql.ENUM(
        "owner", "admin", "member", "viewer", name="memberrole", create_type=True
    )
    meeting_status = postgresql.ENUM(
        "pending", "uploading", "processing", "transcribing", "analysing", "completed", "failed",
        name="meetingstatus", create_type=True,
    )
    action_status = postgresql.ENUM(
        "open", "in_progress", "completed", "cancelled", name="actionitemstatus", create_type=True
    )
    language_enum = postgresql.ENUM(
        "en", "pcm", "yo", "ig", "ha", "fr", "sw", "auto", name="language", create_type=True
    )

    for e in (plan_tier, member_role, meeting_status, action_status, language_enum):
        e.create(op.get_bind(), checkfirst=True)

    # ── plans ─────────────────────────────────────────────────────────────────
    op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(50), unique=True, nullable=False),
        sa.Column("tier", postgresql.ENUM("free", "starter", "growth", "business", name="plantier", create_type=False), nullable=False),
        sa.Column("price_kobo", sa.Integer, nullable=False),
        sa.Column("max_users", sa.Integer, nullable=True),
        sa.Column("max_meetings_per_month", sa.Integer, nullable=True),
        sa.Column("max_audio_hours_per_month", sa.Integer, nullable=True),
        sa.Column("features", sa.String(2000), nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(254), unique=True, nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("whatsapp_number", sa.String(20), nullable=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("hashed_password", sa.String(200), nullable=True),
        sa.Column("google_id", sa.String(100), nullable=True, unique=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_verified", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notification_prefs", sa.String(500), nullable=False,
                  server_default='{"whatsapp": true, "email": true, "in_app": true}'),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # ── organisations ─────────────────────────────────────────────────────────
    op.create_table(
        "organisations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("industry", sa.String(100), nullable=True),
        sa.Column("country", sa.String(10), nullable=False, server_default="NG"),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="Africa/Lagos"),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("whatsapp_group_id", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_organisations_slug", "organisations", ["slug"])

    # ── organisation_members ──────────────────────────────────────────────────
    op.create_table(
        "organisation_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", postgresql.ENUM("owner", "admin", "member", "viewer", name="memberrole", create_type=False), nullable=False,
                  server_default="member"),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
    )

    # ── subscriptions ─────────────────────────────────────────────────────────
    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id"), nullable=False),
        sa.Column("paystack_subscription_code", sa.String(100), nullable=True),
        sa.Column("paystack_customer_code", sa.String(100), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="active"),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ── meetings ──────────────────────────────────────────────────────────────
    op.create_table(
        "meetings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organisation_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("host_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", postgresql.ENUM(
            "pending", "uploading", "processing", "transcribing", "analysing", "completed", "failed",
            name="meetingstatus", create_type=False,
        ), nullable=False, server_default="pending"),
        sa.Column("language", postgresql.ENUM("en", "pcm", "yo", "ig", "ha", "fr", "sw", "auto", name="language", create_type=False),
                  nullable=False, server_default="auto"),
        sa.Column("audio_file_key", sa.String(500), nullable=True),
        sa.Column("audio_duration_seconds", sa.Float, nullable=True),
        sa.Column("audio_size_bytes", sa.Integer, nullable=True),
        sa.Column("original_filename", sa.String(300), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(30), nullable=False, server_default="upload"),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("key_decisions", postgresql.JSONB, nullable=True),
        sa.Column("next_steps", postgresql.JSONB, nullable=True),
        sa.Column("topics_discussed", postgresql.JSONB, nullable=True),
        sa.Column("sentiment", sa.String(20), nullable=True),
        sa.Column("meeting_effectiveness_score", sa.Float, nullable=True),
        sa.Column("whatsapp_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("email_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processing_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_meetings_organisation_id", "meetings", ["organisation_id"])
    op.create_index("ix_meetings_created_at", "meetings", ["created_at"])

    # ── transcripts ───────────────────────────────────────────────────────────
    op.create_table(
        "transcripts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("meetings.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("raw_text", sa.Text, nullable=False),
        sa.Column("segments", postgresql.JSONB, nullable=True),
        sa.Column("detected_language", sa.String(10), nullable=True),
        sa.Column("confidence_score", sa.Float, nullable=True),
        sa.Column("word_count", sa.Integer, nullable=True),
        sa.Column("storage_key", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ── action_items ──────────────────────────────────────────────────────────
    op.create_table(
        "action_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assignee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", postgresql.ENUM(
            "open", "in_progress", "completed", "cancelled", name="actionitemstatus", create_type=False,
        ), nullable=False, server_default="open"),
        sa.Column("priority", sa.String(10), nullable=False, server_default="medium"),
        sa.Column("assignee_name_raw", sa.String(200), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ── meeting_participants ───────────────────────────────────────────────────
    op.create_table(
        "meeting_participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(254), nullable=True),
        sa.Column("whatsapp_number", sa.String(20), nullable=True),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ── Seed default plans ────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO plans (id, name, tier, price_kobo, max_users, max_meetings_per_month, max_audio_hours_per_month, features) VALUES
        (gen_random_uuid(), 'Free', 'free', 0, 3, 5, 2, '{"whatsapp": false, "email": true}'),
        (gen_random_uuid(), 'Starter', 'starter', 800000, 5, 20, 10, '{"whatsapp": true, "email": true}'),
        (gen_random_uuid(), 'Growth', 'growth', 2500000, 15, 100, 50, '{"whatsapp": true, "email": true, "analytics": true}'),
        (gen_random_uuid(), 'Business', 'business', 6000000, NULL, NULL, NULL, '{"whatsapp": true, "email": true, "analytics": true, "api_access": true}');
    """)


def downgrade() -> None:
    for table in [
        "meeting_participants", "action_items", "transcripts",
        "meetings", "subscriptions", "organisation_members",
        "organisations", "users", "plans",
    ]:
        op.drop_table(table)

    for enum in ["actionitemstatus", "meetingstatus", "memberrole", "plantier", "language"]:
        op.execute(f"DROP TYPE IF EXISTS {enum}")
