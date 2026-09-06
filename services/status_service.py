"""Status updates, current status, and history."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from db.database import get_connection
from services.assignment_service import can_update_room
from services.room_service import get_room

CLASSROOM_STATUSES = (
    "Teacher not arrived",
    "Class ongoing",
    "Cancelled",
    "Changed",
    "Free",
)

ACTIVITY_STATUSES = (
    "Occupied",
    "Open to all",
)

STATUS_INDICATORS = {
    "Teacher not arrived": "yellow",
    "Class ongoing": "red",
    "Cancelled": "orange",
    "Changed": "blue",
    "Free": "green",
    "Occupied": "red",
    "Open to all": "green",
}


def statuses_for_room_type(room_type: str) -> tuple[str, ...]:
    if room_type in ("classroom", "lt"):
        return CLASSROOM_STATUSES
    if room_type == "activity_space":
        return ACTIVITY_STATUSES
    raise ValueError(f"Unknown room_type: {room_type}")


def get_current_status(room_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT s.id, s.room_id, s.status, s.note, s.updated_by, s.created_at,
                   u.name AS updated_by_name
            FROM status_logs s
            LEFT JOIN users u ON u.id = s.updated_by
            WHERE s.room_id = ?
            ORDER BY s.created_at DESC, s.id DESC
            LIMIT 1
            """,
            (room_id,),
        ).fetchone()
        return dict(row) if row else None


def get_status_history(room_id: int, limit: int = 10) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT s.id, s.room_id, s.status, s.note, s.updated_by, s.created_at,
                   u.name AS updated_by_name
            FROM status_logs s
            LEFT JOIN users u ON u.id = s.updated_by
            WHERE s.room_id = ?
            ORDER BY s.created_at DESC, s.id DESC
            LIMIT ?
            """,
            (room_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]


def update_status(
    room_id: int,
    status: str,
    note: str | None,
    updated_by_user: dict[str, Any],
    *,
    allow_override: bool = False,
) -> int:
    room = get_room(room_id)
    if not room or not room["active"]:
        raise ValueError("Room not found or inactive")

    allowed = statuses_for_room_type(room["room_type"])
    if status not in allowed:
        raise ValueError(
            f"Status '{status}' is not valid for room_type '{room['room_type']}'"
        )

    if not allow_override and not can_update_room(updated_by_user, room_id):
        raise PermissionError("You are not allowed to update this room")

    # Teachers/admins using override still must be teacher/admin
    if allow_override and updated_by_user["role"] not in ("teacher", "admin"):
        raise PermissionError("Only teachers or admins can override status")

    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO status_logs (room_id, status, note, updated_by)
            VALUES (?, ?, ?, ?)
            """,
            (room_id, status, (note or "").strip() or None, updated_by_user["id"]),
        )
        conn.commit()
        return int(cur.lastrowid)


def relative_time(created_at: str) -> str:
    try:
        ts = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except ValueError:
        return created_at
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    delta = now - ts.astimezone(timezone.utc)
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return "just now"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} min ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} hr ago"
    days = hours // 24
    return f"{days} day{'s' if days != 1 else ''} ago"
