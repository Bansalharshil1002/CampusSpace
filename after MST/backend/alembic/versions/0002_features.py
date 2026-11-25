"""timetable, announcements, classes and chat

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "timetable_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "owner_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("day", sa.Integer(), nullable=False),
        sa.Column("start", sa.String(5), nullable=False),
        sa.Column("end", sa.String(5), nullable=False),
        sa.Column("subject", sa.String(160), nullable=False, server_default=""),
        sa.Column("room", sa.String(40), nullable=False, server_default=""),
        sa.Column("class_name", sa.String(80), nullable=False, server_default=""),
        sa.Column("teacher", sa.String(120), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("day BETWEEN 0 AND 6", name="timetable_day_range"),
    )
    op.create_index("ix_timetable_entries_owner_id", "timetable_entries", ["owner_id"])

    op.create_table(
        "announcements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("category", sa.String(20), nullable=False, server_default="general"),
        sa.Column("audience", sa.String(20), nullable=False, server_default="all"),
        sa.Column("author_name", sa.String(120), nullable=False, server_default=""),
        sa.Column("author_role", sa.String(20), nullable=False, server_default="student"),
        sa.Column("author_email", sa.String(255), nullable=False, server_default=""),
        sa.Column("room", sa.String(40), nullable=True),
        sa.Column("class_name", sa.String(80), nullable=True),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_announcements_created_at", "announcements", ["created_at"])

    op.create_table(
        "classes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("department", sa.String(120), nullable=False, server_default=""),
        sa.Column("year", sa.String(20), nullable=False, server_default=""),
        sa.Column("section", sa.String(20), nullable=False, server_default=""),
        sa.Column("cr_email", sa.String(255), nullable=False, server_default=""),
        sa.Column("room", sa.String(40), nullable=False, server_default=""),
        sa.Column("students", sa.String(20), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("channel", sa.String(255), nullable=False),
        sa.Column(
            "sender_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("sender_name", sa.String(120), nullable=False, server_default=""),
        sa.Column("sender_role", sa.String(20), nullable=False, server_default="student"),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False, server_default="user"),
    )
    op.create_index("ix_chat_messages_channel", "chat_messages", ["channel"])
    op.create_index("chat_messages_channel_at", "chat_messages", ["channel", "at"])


def downgrade() -> None:
    op.drop_index("chat_messages_channel_at", table_name="chat_messages")
    op.drop_index("ix_chat_messages_channel", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_table("classes")
    op.drop_index("ix_announcements_created_at", table_name="announcements")
    op.drop_table("announcements")
    op.drop_index("ix_timetable_entries_owner_id", table_name="timetable_entries")
    op.drop_table("timetable_entries")
