from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

ROLES = ("student", "cr", "society_rep", "teacher", "admin")
ROOM_TYPES = ("classroom", "lt", "activity_space")
ROOM_STATUSES = ("ONGOING", "NOT_ARRIVED", "CANCELLED", "CHANGED", "FREE", "OCCUPIED")
CHALLENGE_PURPOSES = ("otp_login", "password_reset", "magic")
ANNOUNCEMENT_CATEGORIES = ("schedule", "room", "general", "urgent")
ANNOUNCEMENT_AUDIENCES = ("all", "students", "staff")
ANNOUNCEMENT_SOURCES = ("manual", "room", "timetable")
CHAT_KINDS = ("user", "assistant", "system")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), default="")
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    role_rows: Mapped[list["UserRole"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    assignments: Mapped[list["RoomAssignment"]] = relationship(
        back_populates="user",
        foreign_keys="RoomAssignment.user_id",
    )

    @property
    def roles(self) -> list[str]:
        return [row.role for row in self.role_rows]

    def has_role(self, role: str) -> bool:
        return role in self.roles


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role", name="user_roles_user_role"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(Enum(*ROLES, name="app_role", native_enum=False), nullable=False)

    user: Mapped[User] = relationship(back_populates="role_rows")


class Room(Base):
    __tablename__ = "rooms"
    __table_args__ = (
        CheckConstraint("length(code) BETWEEN 1 AND 40", name="rooms_code_len"),
        CheckConstraint("length(building) BETWEEN 1 AND 60", name="rooms_building_len"),
        CheckConstraint("capacity IS NULL OR (capacity BETWEEN 0 AND 2000)", name="rooms_capacity"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    building: Mapped[str] = mapped_column(String(60), nullable=False)
    floor: Mapped[int] = mapped_column(default=0)
    capacity: Mapped[int | None] = mapped_column(nullable=True)
    room_type: Mapped[str] = mapped_column(Enum(*ROOM_TYPES, name="room_type", native_enum=False), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    current_status: Mapped[str] = mapped_column(
        Enum(*ROOM_STATUSES, name="room_status", native_enum=False), default="FREE", nullable=False
    )
    status_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    status_updated_by_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    assignments: Mapped[list["RoomAssignment"]] = relationship(back_populates="room")
    logs: Mapped[list["StatusLog"]] = relationship(back_populates="room")


class RoomAssignment(Base):
    __tablename__ = "room_assignments"
    __table_args__ = (
        Index(
            "room_assignments_one_active",
            "user_id",
            "room_id",
            unique=True,
            sqlite_where=text("active = 1"),
            postgresql_where=text("active IS TRUE"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    granted_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="assignments", foreign_keys=[user_id])
    granter: Mapped[User | None] = relationship(foreign_keys=[granted_by])
    room: Mapped[Room] = relationship(back_populates="assignments")


class StatusLog(Base):
    __tablename__ = "status_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    room_id: Mapped[str] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(Enum(*ROOM_STATUSES, name="room_status_log", native_enum=False), nullable=False)
    note: Mapped[str | None] = mapped_column(String(280), nullable=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    room: Mapped[Room] = relationship(back_populates="logs")
    user: Mapped[User | None] = relationship()


class TimetableEntry(Base):
    """A class slot. ``owner_id`` NULL means the shared campus timetable."""

    __tablename__ = "timetable_entries"
    __table_args__ = (CheckConstraint("day BETWEEN 0 AND 6", name="timetable_day_range"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    day: Mapped[int] = mapped_column(nullable=False)
    start: Mapped[str] = mapped_column(String(5), nullable=False)
    end: Mapped[str] = mapped_column(String(5), nullable=False)
    subject: Mapped[str] = mapped_column(String(160), default="")
    room: Mapped[str] = mapped_column(String(40), default="")
    class_name: Mapped[str] = mapped_column(String(80), default="")
    teacher: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner: Mapped[User | None] = relationship()


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(
        Enum(*ANNOUNCEMENT_CATEGORIES, name="announcement_category", native_enum=False),
        default="general",
        nullable=False,
    )
    audience: Mapped[str] = mapped_column(
        Enum(*ANNOUNCEMENT_AUDIENCES, name="announcement_audience", native_enum=False),
        default="all",
        nullable=False,
    )
    author_name: Mapped[str] = mapped_column(String(120), default="")
    author_role: Mapped[str] = mapped_column(
        Enum(*ROLES, name="announcement_author_role", native_enum=False), default="student"
    )
    author_email: Mapped[str] = mapped_column(String(255), default="")
    room: Mapped[str | None] = mapped_column(String(40), nullable=True)
    class_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(
        Enum(*ANNOUNCEMENT_SOURCES, name="announcement_source", native_enum=False),
        default="manual",
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ClassRecord(Base):
    __tablename__ = "classes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    department: Mapped[str] = mapped_column(String(120), default="")
    year: Mapped[str] = mapped_column(String(20), default="")
    section: Mapped[str] = mapped_column(String(20), default="")
    cr_email: Mapped[str] = mapped_column(String(255), default="")
    room: Mapped[str] = mapped_column(String(40), default="")
    students: Mapped[str] = mapped_column(String(20), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (Index("chat_messages_channel_at", "channel", "at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    channel: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    sender_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    sender_name: Mapped[str] = mapped_column(String(120), default="")
    sender_role: Mapped[str] = mapped_column(String(20), default="student")
    body: Mapped[str] = mapped_column(Text, default="")
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    kind: Mapped[str] = mapped_column(
        Enum(*CHAT_KINDS, name="chat_message_kind", native_enum=False),
        default="user",
        nullable=False,
    )

    sender: Mapped[User | None] = relationship()


class EmailChallenge(Base):
    __tablename__ = "email_challenges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), index=True)
    purpose: Mapped[str] = mapped_column(Enum(*CHALLENGE_PURPOSES, name="challenge_purpose", native_enum=False))
    secret_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
