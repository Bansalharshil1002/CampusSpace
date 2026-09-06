"""Room listing, creation, and deactivation."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from db.database import get_connection

VALID_ROOM_TYPES = ("classroom", "lt", "activity_space")

ROOM_TYPE_LABELS = {
    "classroom": "Classroom",
    "lt": "LT",
    "activity_space": "Activity Space",
}


def list_active_rooms() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, building, floor, room_type, active, created_at
            FROM rooms
            WHERE active = 1
            ORDER BY building, floor, name
            """
        ).fetchall()
        return [dict(r) for r in rows]


def list_all_rooms() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, building, floor, room_type, active, created_at
            FROM rooms
            ORDER BY building, floor, name
            """
        ).fetchall()
        return [dict(r) for r in rows]


def get_room(room_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, name, building, floor, room_type, active, created_at
            FROM rooms WHERE id = ?
            """,
            (room_id,),
        ).fetchone()
        return dict(row) if row else None


def rooms_grouped_by_building_floor(
    rooms: list[dict[str, Any]] | None = None,
) -> dict[str, dict[int, list[dict[str, Any]]]]:
    source = rooms if rooms is not None else list_active_rooms()
    grouped: dict[str, dict[int, list[dict[str, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for room in source:
        grouped[room["building"]][room["floor"]].append(room)
    return {
        building: dict(sorted(floors.items()))
        for building, floors in sorted(grouped.items())
    }


def create_room(
    name: str,
    building: str,
    floor: int,
    room_type: str,
) -> int:
    name = name.strip()
    building = building.strip()
    if not name or not building:
        raise ValueError("Room name and building are required")
    if room_type not in VALID_ROOM_TYPES:
        raise ValueError(f"Invalid room_type: {room_type}")
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO rooms (name, building, floor, room_type)
            VALUES (?, ?, ?, ?)
            """,
            (name, building, int(floor), room_type),
        )
        conn.commit()
        return int(cur.lastrowid)


def deactivate_room(room_id: int) -> None:
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE rooms SET active = 0 WHERE id = ?",
            (room_id,),
        )
        if cur.rowcount == 0:
            raise ValueError(f"Room not found: {room_id}")
        conn.commit()


def activate_room(room_id: int) -> None:
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE rooms SET active = 1 WHERE id = ?",
            (room_id,),
        )
        if cur.rowcount == 0:
            raise ValueError(f"Room not found: {room_id}")
        conn.commit()
