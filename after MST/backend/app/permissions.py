from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.events import publish_room
from app.models import (
    Room,
    RoomAssignment,
    StatusLog,
    TimetableEntry,
    User,
    UserRole,
    utcnow,
)

CLASSROOM_STATUSES = {"ONGOING", "NOT_ARRIVED", "CANCELLED", "CHANGED", "FREE"}
ACTIVITY_STATUSES = {"FREE", "OCCUPIED"}
STAFF_ROLES = ("cr", "teacher", "admin")
ROLE_PRIORITY = ("admin", "teacher", "cr", "society_rep", "student")
STAFF_CHANNELS = {"staff", "cr-teachers", "office"}


def primary_role(user: User) -> str:
    for role in ROLE_PRIORITY:
        if user.has_role(role):
            return role
    return "student"


def is_staff(user: User) -> bool:
    return any(user.has_role(role) for role in STAFF_ROLES)


def can_publish_announcements(user: User) -> bool:
    return user.active and is_staff(user)


def announcement_audiences(user: User) -> set[str]:
    """Students only ever see the public and student audiences."""
    if is_staff(user):
        return {"all", "students", "staff"}
    return {"all", "students"}


def timetable_scope(user: User) -> str:
    """Campus timetable for managers and CRs; a personal copy for everyone else."""
    if user.has_role("teacher") or user.has_role("admin") or user.has_role("cr"):
        return "campus"
    return "personal"


def can_replace_timetable(user: User) -> bool:
    if not user.active:
        return False
    if user.has_role("teacher") or user.has_role("admin"):
        return True
    # Students own a personal copy. A CR edits the campus plan slot-by-slot only.
    return not user.has_role("cr")


def can_edit_timetable_entry(user: User, entry: TimetableEntry) -> bool:
    if not user.active:
        return False
    if user.has_role("admin") or user.has_role("teacher"):
        return True
    if user.has_role("cr"):
        return entry.owner_id is None
    return entry.owner_id == user.id


def can_use_chat_channel(user: User, channel: str, db: Session | None = None) -> bool:
    if not user.active:
        return False
    if channel == "general":
        return True
    if channel.startswith("dm:"):
        if not is_staff(user):
            return False
        pair = [part.strip().lower() for part in channel[3:].split("|")]
        if len(pair) != 2 or not all(pair):
            return False
        me = user.email.strip().lower()
        if me not in pair:
            return False
        if db is None:
            return True
        other_email = pair[0] if pair[1] == me else pair[1]
        other = db.query(User).filter(User.email == other_email).one_or_none()
        if other is None or not other.active:
            return False
        return can_direct_message(primary_role(user), primary_role(other))
    if channel in STAFF_CHANNELS:
        return is_staff(user)
    return False


def can_direct_message(role_a: str, role_b: str) -> bool:
    """Personal messages only connect teachers with CRs and the DoAA/DoSAA office."""
    return {role_a, role_b} in ({"teacher", "cr"}, {"teacher", "admin"})


def can_clear_chat_channel(user: User, channel: str, db: Session | None = None) -> bool:
    return is_staff(user) and can_use_chat_channel(user, channel, db)


def deny(message: str, status: int = 403) -> None:
    raise HTTPException(status_code=status, detail=message)


def can_update_room(user: User, room: Room) -> bool:
    """Server-side rule for FR-05 / FR-06 / BR-02..BR-09. Role alone is not enough."""
    if not user.active or not room.active:
        return False
    if user.has_role("admin"):
        return True
    if user.has_role("teacher") and room.room_type != "activity_space":
        return True
    assigned = any(row.room_id == room.id and row.active for row in user.assignments)
    if room.room_type != "activity_space" and user.has_role("cr") and assigned:
        return True
    if room.room_type == "activity_space" and user.has_role("society_rep") and assigned:
        return True
    return False


def can_assign_room(user: User, room: Room) -> bool:
    if not user.active or not room.active:
        return False
    if user.has_role("admin"):
        return True
    return user.has_role("teacher") and room.room_type != "activity_space"


def can_toggle_assignment(actor: User, room: Room) -> bool:
    if actor.has_role("admin"):
        return True
    return actor.has_role("teacher") and room.room_type != "activity_space"


def can_view_history(actor: User, log: StatusLog) -> bool:
    del log
    return actor.active


def set_room_status(db: Session, actor: User, room: Room, status: str, note: str | None) -> Room:
    if actor.id is None:
        deny("Please sign in first", 401)
    if not can_update_room(actor, room):
        deny("You are not allowed to update this room")
    if room.room_type == "activity_space" and status not in ACTIVITY_STATUSES:
        deny("Activity spaces can only be FREE or OCCUPIED", 400)
    if room.room_type != "activity_space" and status == "OCCUPIED":
        deny("OCCUPIED applies only to activity spaces", 400)
    if room.room_type != "activity_space" and status not in CLASSROOM_STATUSES:
        deny("That status is not allowed for this room type", 400)

    clean = (note or "").strip() or None
    if clean and len(clean) > 280:
        deny("Note is too long (max 280 characters)", 400)

    display = actor.name.strip() or actor.email
    db.add(StatusLog(room_id=room.id, status=status, note=clean, user_id=actor.id))
    room.current_status = status
    room.status_note = clean
    room.status_updated_at = utcnow()
    room.status_updated_by_name = display
    db.commit()
    db.refresh(room)
    publish_room(
        {
            "type": "room.status",
            "id": room.id,
            "code": room.code,
            "current_status": room.current_status,
            "status_note": room.status_note,
            "status_updated_at": room.status_updated_at,
            "status_updated_by_name": room.status_updated_by_name,
        }
    )
    return room


def assign_room(db: Session, actor: User, email: str, room: Room) -> RoomAssignment:
    if not can_assign_room(actor, room):
        deny("You are not allowed to assign this room")
    if not room.active:
        deny("Room is deactivated", 400)

    target = db.query(User).filter(User.email == email.strip().lower(), User.active.is_(True)).one_or_none()
    if target is None:
        deny("No active user with that email. They must sign in once first.", 400)

    existing = (
        db.query(RoomAssignment)
        .filter(
            RoomAssignment.user_id == target.id,
            RoomAssignment.room_id == room.id,
            RoomAssignment.active.is_(True),
        )
        .one_or_none()
    )
    if existing:
        deny("This user is already assigned to this room", 400)

    assignment = RoomAssignment(user_id=target.id, room_id=room.id, granted_by=actor.id, active=True)
    db.add(assignment)

    needed = "society_rep" if room.room_type == "activity_space" else "cr"
    has_role = db.query(UserRole).filter(UserRole.user_id == target.id, UserRole.role == needed).one_or_none()
    if has_role is None:
        db.add(UserRole(user_id=target.id, role=needed))
    db.commit()
    db.refresh(assignment)
    return assignment
