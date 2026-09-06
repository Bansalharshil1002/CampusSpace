"""Room assignment create/revoke and permission checks."""

from __future__ import annotations

from typing import Any

from db.database import get_connection
from services import user_service
from services.room_service import get_room

CR_ROOM_TYPES = ("classroom", "lt")
SOCIETY_ROOM_TYPES = ("activity_space",)


def list_active_assignments_for_user(user_id: int) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT a.id, a.user_id, a.room_id, a.assignment_role,
                   a.assigned_by, a.active, a.created_at,
                   r.name AS room_name, r.building, r.floor, r.room_type
            FROM room_assignments a
            JOIN rooms r ON r.id = a.room_id
            WHERE a.user_id = ? AND a.active = 1 AND r.active = 1
            ORDER BY r.building, r.floor, r.name
            """,
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def list_active_cr_assignments() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT a.id, a.user_id, a.room_id, a.assignment_role,
                   a.assigned_by, a.active, a.created_at,
                   r.name AS room_name, r.room_type,
                   u.name AS user_name, u.email AS user_email
            FROM room_assignments a
            JOIN rooms r ON r.id = a.room_id
            JOIN users u ON u.id = a.user_id
            WHERE a.active = 1 AND a.assignment_role = 'cr'
            ORDER BY r.name, u.name
            """
        ).fetchall()
        return [dict(r) for r in rows]


def list_all_active_assignments() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT a.id, a.user_id, a.room_id, a.assignment_role,
                   a.assigned_by, a.active, a.created_at,
                   r.name AS room_name, r.room_type,
                   u.name AS user_name
            FROM room_assignments a
            JOIN rooms r ON r.id = a.room_id
            JOIN users u ON u.id = a.user_id
            WHERE a.active = 1
            ORDER BY a.assignment_role, r.name, u.name
            """
        ).fetchall()
        return [dict(r) for r in rows]


def has_active_assignment(
    user_id: int,
    room_id: int,
    assignment_role: str | None = None,
) -> bool:
    query = """
        SELECT 1 FROM room_assignments
        WHERE user_id = ? AND room_id = ? AND active = 1
    """
    params: list[Any] = [user_id, room_id]
    if assignment_role:
        query += " AND assignment_role = ?"
        params.append(assignment_role)
    with get_connection() as conn:
        row = conn.execute(query, params).fetchone()
        return row is not None


def can_update_room(user: dict[str, Any], room_id: int) -> bool:
    role = user["role"]
    if role in ("admin", "teacher"):
        return True
    if role == "cr":
        return has_active_assignment(user["id"], room_id, "cr")
    if role == "society_rep":
        return has_active_assignment(user["id"], room_id, "society_rep")
    return False


def assign_cr(room_id: int, student_user_id: int, assigned_by: int) -> int:
    room = get_room(room_id)
    if not room or not room["active"]:
        raise ValueError("Room not found or inactive")
    if room["room_type"] not in CR_ROOM_TYPES:
        raise ValueError("CR assignments are only for classroom or LT rooms")

    student = user_service.get_user(student_user_id)
    if not student:
        raise ValueError("User not found")
    if student["role"] not in ("student", "cr"):
        raise ValueError("Only students (or existing CRs) can be assigned as CR")

    with get_connection() as conn:
        existing = conn.execute(
            """
            SELECT id FROM room_assignments
            WHERE user_id = ? AND room_id = ? AND assignment_role = 'cr' AND active = 1
            """,
            (student_user_id, room_id),
        ).fetchone()
        if existing:
            raise ValueError("User is already CR for this room")

        cur = conn.execute(
            """
            INSERT INTO room_assignments
                (user_id, room_id, assignment_role, assigned_by, active)
            VALUES (?, ?, 'cr', ?, 1)
            """,
            (student_user_id, room_id, assigned_by),
        )
        if student["role"] == "student":
            conn.execute(
                "UPDATE users SET role = 'cr' WHERE id = ?",
                (student_user_id,),
            )
        conn.commit()
        return int(cur.lastrowid)


def assign_society_rep(
    room_id: int,
    user_id: int,
    assigned_by: int,
) -> int:
    room = get_room(room_id)
    if not room or not room["active"]:
        raise ValueError("Room not found or inactive")
    if room["room_type"] not in SOCIETY_ROOM_TYPES:
        raise ValueError("Society Rep assignments are only for activity spaces")

    user = user_service.get_user(user_id)
    if not user:
        raise ValueError("User not found")

    with get_connection() as conn:
        existing = conn.execute(
            """
            SELECT id FROM room_assignments
            WHERE user_id = ? AND room_id = ? AND assignment_role = 'society_rep'
              AND active = 1
            """,
            (user_id, room_id),
        ).fetchone()
        if existing:
            raise ValueError("User is already Society Rep for this room")

        cur = conn.execute(
            """
            INSERT INTO room_assignments
                (user_id, room_id, assignment_role, assigned_by, active)
            VALUES (?, ?, 'society_rep', ?, 1)
            """,
            (user_id, room_id, assigned_by),
        )
        if user["role"] == "student":
            conn.execute(
                "UPDATE users SET role = 'society_rep' WHERE id = ?",
                (user_id,),
            )
        conn.commit()
        return int(cur.lastrowid)


def revoke_assignment(assignment_id: int) -> None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, user_id, assignment_role
            FROM room_assignments WHERE id = ? AND active = 1
            """,
            (assignment_id,),
        ).fetchone()
        if not row:
            raise ValueError("Active assignment not found")

        conn.execute(
            "UPDATE room_assignments SET active = 0 WHERE id = ?",
            (assignment_id,),
        )

        if row["assignment_role"] == "cr":
            remaining = conn.execute(
                """
                SELECT COUNT(*) AS n FROM room_assignments
                WHERE user_id = ? AND assignment_role = 'cr' AND active = 1
                """,
                (row["user_id"],),
            ).fetchone()
            if remaining["n"] == 0:
                user = conn.execute(
                    "SELECT role FROM users WHERE id = ?",
                    (row["user_id"],),
                ).fetchone()
                if user and user["role"] == "cr":
                    conn.execute(
                        "UPDATE users SET role = 'student' WHERE id = ?",
                        (row["user_id"],),
                    )

        conn.commit()
