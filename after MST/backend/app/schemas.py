from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class RegisterIn(BaseModel):
    name: str = ""
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class OtpRequestIn(BaseModel):
    email: EmailStr


class OtpVerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class MagicVerifyIn(BaseModel):
    token: str


class ResetRequestIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class PasswordChangeIn(BaseModel):
    password: str = Field(min_length=8, max_length=128)


class ProfileUpdateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    active: bool
    created_at: datetime
    roles: list[str]

    model_config = {"from_attributes": True}


class RoomOut(BaseModel):
    id: str
    code: str
    building: str
    floor: int
    capacity: int | None
    room_type: str
    active: bool
    current_status: str
    status_note: str | None
    status_updated_at: datetime
    status_updated_by_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RoomCreateIn(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    building: str = Field(min_length=1, max_length=60)
    floor: int = 0
    capacity: int | None = None
    room_type: str
    current_status: str = "FREE"


class RoomPatchIn(BaseModel):
    code: str | None = None
    building: str | None = None
    floor: int | None = None
    capacity: int | None = None
    room_type: str | None = None
    active: bool | None = None


class StatusUpdateIn(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=280)


class AssignmentOut(BaseModel):
    id: str
    active: bool
    created_at: datetime
    room_id: str
    user_id: str
    rooms: dict
    user: dict


class AssignmentCreateIn(BaseModel):
    email: EmailStr
    room_id: str


class AssignmentPatchIn(BaseModel):
    active: bool


class HistoryOut(BaseModel):
    id: str
    status: str
    note: str | None
    created_at: datetime
    room_id: str
    rooms: dict | None = None
    profiles: dict | None = None


class RoleToggleIn(BaseModel):
    role: str
    on: bool


class RoleAssignIn(BaseModel):
    email: EmailStr
    role: str
    name: str = Field(default="", max_length=120)


class ChallengeOut(BaseModel):
    ok: bool = True
    message: str
    dev_code: str | None = None
    dev_token: str | None = None
    magic_url: str | None = None


# --- timetable -------------------------------------------------------------


class TimetableEntryIn(BaseModel):
    id: str | None = None
    day: int = Field(ge=0, le=6)
    start: str = Field(pattern=r"^\d{2}:\d{2}$")
    end: str = Field(pattern=r"^\d{2}:\d{2}$")
    subject: str = Field(default="", max_length=160)
    room: str = Field(default="", max_length=40)
    className: str = Field(default="", max_length=80)
    teacher: str = Field(default="", max_length=120)


class TimetableReplaceIn(BaseModel):
    entries: list[TimetableEntryIn] = Field(default_factory=list)


class TimetableEntryPatchIn(BaseModel):
    day: int | None = Field(default=None, ge=0, le=6)
    start: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    end: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    subject: str | None = Field(default=None, max_length=160)
    room: str | None = Field(default=None, max_length=40)
    className: str | None = Field(default=None, max_length=80)
    teacher: str | None = Field(default=None, max_length=120)


class TimetableEntryOut(BaseModel):
    id: str
    day: int
    start: str
    end: str
    subject: str
    room: str
    className: str
    teacher: str


class TimetableOut(BaseModel):
    entries: list[TimetableEntryOut]
    scope: str


# --- announcements ---------------------------------------------------------


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(default="", max_length=4000)
    category: str = "general"
    audience: str = "all"
    pinned: bool = False
    room: str | None = Field(default=None, max_length=40)
    className: str | None = Field(default=None, max_length=80)
    source: str = "manual"


class AnnouncementOut(BaseModel):
    id: str
    title: str
    body: str
    category: str
    audience: str
    authorName: str
    authorRole: str
    authorEmail: str
    createdAt: datetime
    room: str | None = None
    className: str | None = None
    pinned: bool = False
    source: str


# --- classes ---------------------------------------------------------------


class ClassIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    code: str = Field(min_length=1, max_length=40)
    department: str = Field(default="", max_length=120)
    year: str = Field(default="", max_length=20)
    section: str = Field(default="", max_length=20)
    crEmail: str = Field(default="", max_length=255)
    room: str = Field(default="", max_length=40)
    students: str = Field(default="", max_length=20)


class ClassOut(BaseModel):
    id: str
    name: str
    code: str
    department: str
    year: str
    section: str
    crEmail: str
    room: str
    students: str
    createdAt: datetime


# --- chat ------------------------------------------------------------------


class ChatMessageIn(BaseModel):
    channel: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1, max_length=4000)
    kind: str = "user"


class ChatMessageOut(BaseModel):
    id: str
    channel: str
    senderId: str
    senderName: str
    senderRole: str
    body: str
    at: datetime
    kind: str


class ChatChannelOut(BaseModel):
    channel: str
    cleared: int
