"""Seed demo users, rooms, and initial status logs."""

from __future__ import annotations

from pathlib import Path

from db.database import get_connection, init_db, is_db_empty


CLASSROOM_STATUSES_DEFAULT = "Free"
ACTIVITY_STATUS_DEFAULT = "Open to all"


USERS = [
    ("Aarav Student", "aarav.student@college.edu", "student"),
    ("Prasuk", "prasuk@college.edu", "student"),
    ("Meera Society", "meera.society@college.edu", "society_rep"),
    ("Dr. Sharma", "sharma@college.edu", "teacher"),
    ("Admin DOA", "admin@college.edu", "admin"),
]

ROOMS = [
    ("CSED-101", "CSED", 1, "classroom"),
    ("CSED-102", "CSED", 1, "classroom"),
    ("CSED-103", "CSED", 1, "classroom"),
    ("CSED-201", "CSED", 2, "classroom"),
    ("CSED-202", "CSED", 2, "classroom"),
    ("CSED-204", "CSED", 2, "classroom"),
    ("LT-301", "LT", 3, "lt"),
    ("LT-302", "LT", 3, "lt"),
    ("Activity Space 1", "Activity Block", 1, "activity_space"),
    ("Activity Space 2", "Activity Block", 1, "activity_space"),
]


def seed(db_path: Path | None = None, force: bool = False) -> None:
    init_db(db_path)
    if not force and not is_db_empty(db_path):
        return

    with get_connection(db_path) as conn:
        if force:
            conn.executescript(
                """
                DELETE FROM status_logs;
                DELETE FROM room_assignments;
                DELETE FROM rooms;
                DELETE FROM users;
                """
            )

        for name, email, role in USERS:
            conn.execute(
                "INSERT INTO users (name, email, role) VALUES (?, ?, ?)",
                (name, email, role),
            )

        for name, building, floor, room_type in ROOMS:
            conn.execute(
                """
                INSERT INTO rooms (name, building, floor, room_type)
                VALUES (?, ?, ?, ?)
                """,
                (name, building, floor, room_type),
            )

        admin = conn.execute(
            "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
        ).fetchone()
        admin_id = admin["id"] if admin else None

        rooms = conn.execute("SELECT id, room_type FROM rooms").fetchall()
        for room in rooms:
            status = (
                ACTIVITY_STATUS_DEFAULT
                if room["room_type"] == "activity_space"
                else CLASSROOM_STATUSES_DEFAULT
            )
            conn.execute(
                """
                INSERT INTO status_logs (room_id, status, note, updated_by)
                VALUES (?, ?, ?, ?)
                """,
                (room["id"], status, "Seeded initial status", admin_id),
            )

        society = conn.execute(
            "SELECT id FROM users WHERE role = 'society_rep' LIMIT 1"
        ).fetchone()
        activity = conn.execute(
            """
            SELECT id FROM rooms
            WHERE room_type = 'activity_space' AND name = 'Activity Space 1'
            LIMIT 1
            """
        ).fetchone()
        if society and activity and admin_id:
            conn.execute(
                """
                INSERT INTO room_assignments
                    (user_id, room_id, assignment_role, assigned_by, active)
                VALUES (?, ?, 'society_rep', ?, 1)
                """,
                (society["id"], activity["id"], admin_id),
            )

        conn.commit()


def main() -> None:
    seed(force=True)
    print("Database seeded successfully.")


if __name__ == "__main__":
    main()
