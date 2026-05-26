"""Add zoom_recording_id to meetings

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-25

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("zoom_recording_id", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_meetings_zoom_recording_id",
        "meetings",
        ["zoom_recording_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_meetings_zoom_recording_id", table_name="meetings")
    op.drop_column("meetings", "zoom_recording_id")
