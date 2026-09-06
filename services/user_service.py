"""User lookup and admin role changes."""

from __future__ import annotations

from typing import Any

from db.database import get_connection

VALID_ROLES = ("student", "cr", "teacher", "admin", "society_rep")


def list_users() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, email, role, created_at FROM users ORDER BY name"
        ).fetchall()
        return [dict(r) for r in rows]


def get_user(user_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None


def list_users_by_roles(roles: list[str]) -> list[dict[str, Any]]:
    if not roles:
        return []
    placeholders = ",".join("?" * len(roles))
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT id, name, email, role, created_at
            FROM users
            WHERE role IN ({placeholders})
            ORDER BY name
            """,
            roles,
        ).fetchall()
        return [dict(r) for r in rows]


def change_role(user_id: int, new_role: str) -> None:
    if new_role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {new_role}")
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE users SET role = ? WHERE id = ?",
            (new_role, user_id),
        )
        if cur.rowcount == 0:
            raise ValueError(f"User not found: {user_id}")
        conn.commit()
