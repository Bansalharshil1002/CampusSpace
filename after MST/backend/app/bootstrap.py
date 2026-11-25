"""Create controlled demo accounts directly in the database.

Example:
    python -m app.bootstrap \
        --name "Aarav Student" \
        --email student@thapar.edu \
        --password-env RST_STUDENT_PASSWORD \
        --role student

    python -m app.bootstrap \
        --name "DoAA Office" \
        --email doaa@thapar.edu \
        --password-env RST_ADMIN_PASSWORD \
        --role admin \
        --assign-rooms CSED-204,CSED-202 \
        --granted-by doaa@thapar.edu
"""

from __future__ import annotations

import argparse
import os
import sys

from app.db import SessionLocal
from app.models import ROLES, Room, RoomAssignment, User, UserRole
from app.security import college_email, hash_secret, is_college_email


def _role_list(values: list[str]) -> list[str]:
    roles = list(dict.fromkeys(value.strip().lower() for value in values if value.strip()))
    invalid = [role for role in roles if role not in ROLES]
    if invalid:
        raise SystemExit(f"Unknown role(s): {', '.join(invalid)}")
    if roles and any(role != "student" for role in roles) and "student" not in roles:
        roles.append("student")
    return roles or ["student"]


def _password_from_args(args: argparse.Namespace) -> str | None:
    if args.password_env:
        value = os.environ.get(args.password_env)
        if not value:
            raise SystemExit(f"Environment variable {args.password_env} is not set")
        return value
    return args.password


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or update a controlled demo account")
    parser.add_argument("--name", default="", help="Display name")
    parser.add_argument("--email", required=True, help="College email address")
    parser.add_argument("--password", help="Password (prefer --password-env)")
    parser.add_argument("--password-env", help="Read password from this environment variable")
    parser.add_argument("--role", action="append", default=[], help="Role; repeat for multiple roles")
    parser.add_argument("--assign-rooms", default="", help="Comma-separated room codes to assign")
    parser.add_argument("--granted-by", default="", help="Email of the admin granting assignments")
    args = parser.parse_args()

    email = college_email(args.email)
    if not is_college_email(email):
        raise SystemExit("Only college email addresses can be bootstrapped")
    roles = _role_list(args.role)
    password = _password_from_args(args)

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one_or_none()
        if user is None:
            user = User(name=args.name.strip() or email.split("@")[0], email=email, active=True)
            db.add(user)
            db.flush()
            print(f"Created user {email}")
        else:
            if args.name.strip():
                user.name = args.name.strip()
            user.active = True
            print(f"Updated user {email}")

        if password:
            if len(password) < 8:
                raise SystemExit("Password must be at least 8 characters")
            user.password_hash = hash_secret(password)

        existing_roles = {row.role for row in user.role_rows}
        for role in roles:
            if role not in existing_roles:
                db.add(UserRole(user_id=user.id, role=role))

        if args.assign_rooms.strip():
            codes = [code.strip() for code in args.assign_rooms.split(",") if code.strip()]
            granter = None
            if args.granted_by.strip():
                granter = (
                    db.query(User).filter(User.email == college_email(args.granted_by)).one_or_none()
                )
            for code in codes:
                room = db.query(Room).filter(Room.code == code).one_or_none()
                if room is None:
                    raise SystemExit(f"Room {code} does not exist; seed/migrate the database first")
                already = (
                    db.query(RoomAssignment)
                    .filter(
                        RoomAssignment.user_id == user.id,
                        RoomAssignment.room_id == room.id,
                        RoomAssignment.active.is_(True),
                    )
                    .one_or_none()
                )
                if already is None:
                    db.add(
                        RoomAssignment(
                            user_id=user.id,
                            room_id=room.id,
                            granted_by=granter.id if granter else None,
                            active=True,
                        )
                    )

        db.commit()
        print(f"Roles: {', '.join(roles)}")
        if args.assign_rooms.strip():
            print(f"Rooms: {args.assign_rooms.strip()}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
