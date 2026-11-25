from datetime import timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Announcement,
    ChatMessage,
    ClassRecord,
    Room,
    RoomAssignment,
    TimetableEntry,
    User,
    UserRole,
    utcnow,
)
from app.security import hash_secret

SEED_ROOMS = [
    ("CSED-101", "CSED", 1, 60, "classroom"),
    ("CSED-102", "CSED", 1, 60, "classroom"),
    ("CSED-103", "CSED", 1, 60, "classroom"),
    ("CSED-104", "CSED", 1, 40, "classroom"),
    ("CSED-105", "CSED", 1, 40, "classroom"),
    ("CSED-201", "CSED", 2, 60, "classroom"),
    ("CSED-202", "CSED", 2, 60, "classroom"),
    ("CSED-203", "CSED", 2, 60, "classroom"),
    ("CSED-204", "CSED", 2, 60, "classroom"),
    ("CSED-205", "CSED", 2, 60, "classroom"),
    ("LT-301", "LT Block", 3, 180, "lt"),
    ("LT-302", "LT Block", 3, 180, "lt"),
    ("Activity Space 1", "Activity Block", 1, 40, "activity_space"),
    ("Activity Space 2", "Activity Block", 1, 40, "activity_space"),
    ("LT-101", "LT Block", 1, 180, "lt"),
    ("LT-102", "LT Block", 1, 180, "lt"),
    ("LP-101", "LP Block", 1, 120, "lt"),
    ("LP-102", "LP Block", 2, 120, "lt"),
    ("CSED-LAB-1", "CSED", 1, 40, "classroom"),
    ("CSED-LAB-2", "CSED", 1, 40, "classroom"),
    ("CSED-LAB-3", "CSED", 2, 40, "classroom"),
    ("SAC-1", "Student Activity Centre", 1, 120, "activity_space"),
    ("SAC-2", "Student Activity Centre", 1, 80, "activity_space"),
]

DEMO_USERS = [
    ("Aarav Student", "student@thapar.edu", "student123", ["student"]),
    ("Simran CR", "cr@thapar.edu", "cr123", ["student", "cr"]),
    ("Rohan CR", "cr2@thapar.edu", "cr123", ["student", "cr"]),
    ("Meera Society", "society@thapar.edu", "society123", ["student", "society_rep"]),
    ("Dr. Meera Teacher", "teacher@thapar.edu", "teacher123", ["student", "teacher"]),
    ("Prof. Arjun Teacher", "teacher2@thapar.edu", "teacher123", ["student", "teacher"]),
    ("DoAA Office", "doaa@thapar.edu", "doaa123", ["student", "admin"]),
]

TEACHER_NAME = "Dr. Meera Teacher"


def _slot(day: int, start: str, end: str, subject: str, room: str, class_name: str, teacher: str):
    return {
        "day": day,
        "start": start,
        "end": end,
        "subject": subject,
        "room": room,
        "class_name": class_name,
        "teacher": teacher,
    }


SEED_TIMETABLE = [
    # Monday
    _slot(1, "09:00", "09:50", "Data Structures", "CSED-204", "COE 2A", TEACHER_NAME),
    _slot(1, "09:00", "09:50", "DBMS", "CSED-205", "COE 2B", "Ms. Kaur"),
    _slot(1, "09:00", "09:50", "Computer Networks", "LT-301", "COE 3A", "Dr. Singh"),
    _slot(1, "10:00", "10:50", "Discrete Mathematics", "CSED-204", "COE 2A", "Dr. Sharma"),
    _slot(1, "10:00", "10:50", "Operating Systems", "CSED-205", "COE 2B", TEACHER_NAME),
    _slot(1, "10:00", "10:50", "Software Engineering", "LT-301", "COE 3A", "Dr. Gupta"),
    _slot(1, "11:00", "11:50", "Computer Networks", "LT-301", "COE 2A", "Dr. Singh"),
    _slot(1, "11:00", "11:50", "Data Structures", "CSED-205", "COE 2B", TEACHER_NAME),
    _slot(1, "11:00", "11:50", "DBMS", "CSED-203", "COE 3A", "Ms. Kaur"),
    _slot(1, "13:00", "14:50", "DBMS Lab", "CSED-LAB-1", "COE 2A", "Ms. Kaur"),
    _slot(1, "13:00", "14:50", "Web Technologies Lab", "CSED-LAB-2", "COE 2B", "Dr. Gupta"),
    _slot(1, "15:00", "15:50", "Software Engineering", "CSED-204", "COE 2A", "Dr. Gupta"),
    _slot(1, "15:00", "15:50", "Operating Systems", "CSED-203", "COE 3A", TEACHER_NAME),
    # Tuesday
    _slot(2, "09:00", "09:50", "Operating Systems", "CSED-202", "COE 2A", TEACHER_NAME),
    _slot(2, "09:00", "09:50", "Discrete Mathematics", "CSED-203", "COE 2B", "Dr. Sharma"),
    _slot(2, "09:00", "09:50", "DBMS", "LT-102", "COE 3A", "Ms. Kaur"),
    _slot(2, "10:00", "10:50", "Data Structures", "CSED-204", "COE 2A", TEACHER_NAME),
    _slot(2, "10:00", "10:50", "Computer Networks", "CSED-205", "COE 2B", "Dr. Singh"),
    _slot(2, "10:00", "10:50", "Software Engineering", "LT-102", "COE 3A", "Dr. Gupta"),
    _slot(2, "11:00", "11:50", "Discrete Mathematics", "CSED-204", "COE 2A", "Dr. Sharma"),
    _slot(2, "11:00", "11:50", "Operating Systems", "CSED-205", "COE 2B", TEACHER_NAME),
    _slot(2, "11:00", "11:50", "Computer Networks", "LT-301", "COE 3A", "Dr. Singh"),
    _slot(2, "14:00", "15:50", "Web Technologies Lab", "CSED-LAB-2", "COE 2A", "Mr. Bansal"),
    _slot(2, "14:00", "15:50", "DBMS Lab", "CSED-LAB-3", "COE 2B", "Ms. Kaur"),
    # Wednesday
    _slot(3, "09:00", "09:50", "Computer Networks", "LT-102", "COE 2A", "Dr. Singh"),
    _slot(3, "09:00", "09:50", "Data Structures", "CSED-204", "COE 2B", TEACHER_NAME),
    _slot(3, "09:00", "09:50", "Discrete Mathematics", "CSED-203", "COE 3A", "Dr. Sharma"),
    _slot(3, "10:00", "10:50", "DBMS", "CSED-202", "COE 2A", "Ms. Kaur"),
    _slot(3, "10:00", "10:50", "Operating Systems", "CSED-204", "COE 2B", TEACHER_NAME),
    _slot(3, "10:00", "10:50", "Software Engineering", "LT-102", "COE 3A", "Dr. Gupta"),
    _slot(3, "11:00", "11:50", "Software Engineering", "CSED-204", "COE 2A", "Dr. Gupta"),
    _slot(3, "11:00", "11:50", "DBMS", "CSED-202", "COE 2B", "Ms. Kaur"),
    _slot(3, "11:00", "11:50", "Operating Systems", "CSED-203", "COE 3A", TEACHER_NAME),
    _slot(3, "13:00", "14:50", "Data Structures Lab", "CSED-LAB-1", "COE 2A", TEACHER_NAME),
    # Thursday
    _slot(4, "09:00", "09:50", "Operating Systems", "CSED-202", "COE 2A", TEACHER_NAME),
    _slot(4, "09:00", "09:50", "DBMS", "CSED-204", "COE 2B", "Ms. Kaur"),
    _slot(4, "09:00", "09:50", "Computer Networks", "LT-301", "COE 3A", "Dr. Singh"),
    _slot(4, "10:00", "10:50", "Computer Networks", "LT-301", "COE 2A", "Dr. Singh"),
    _slot(4, "10:00", "10:50", "Data Structures", "CSED-204", "COE 2B", TEACHER_NAME),
    _slot(4, "10:00", "10:50", "Software Engineering", "CSED-203", "COE 3A", "Dr. Gupta"),
    _slot(4, "11:00", "11:50", "Discrete Mathematics", "LT-301", "COE 2A", "Dr. Sharma"),
    _slot(4, "11:00", "11:50", "Operating Systems", "CSED-204", "COE 2B", TEACHER_NAME),
    _slot(4, "11:00", "11:50", "DBMS", "CSED-203", "COE 3A", "Ms. Kaur"),
    _slot(4, "14:00", "14:50", "DBMS", "CSED-204", "COE 2A", "Ms. Kaur"),
    _slot(4, "14:00", "14:50", "Computer Networks", "LT-301", "COE 2B", "Dr. Singh"),
    # Friday
    _slot(5, "09:00", "09:50", "Software Engineering", "CSED-204", "COE 2A", "Dr. Gupta"),
    _slot(5, "09:00", "09:50", "Discrete Mathematics", "CSED-203", "COE 2B", "Dr. Sharma"),
    _slot(5, "09:00", "09:50", "Data Structures", "CSED-205", "COE 3A", TEACHER_NAME),
    _slot(5, "10:00", "10:50", "Data Structures", "CSED-203", "COE 2A", TEACHER_NAME),
    _slot(5, "10:00", "10:50", "Software Engineering", "CSED-204", "COE 2B", "Dr. Gupta"),
    _slot(5, "10:00", "10:50", "DBMS", "CSED-205", "COE 3A", "Ms. Kaur"),
    _slot(5, "11:00", "11:50", "Operating Systems", "CSED-202", "COE 2A", TEACHER_NAME),
    _slot(5, "11:00", "11:50", "Computer Networks", "LT-301", "COE 2B", "Dr. Singh"),
    _slot(5, "11:00", "11:50", "Discrete Mathematics", "LT-302", "COE 3A", "Dr. Sharma"),
    _slot(5, "13:00", "14:50", "DBMS Lab", "CSED-LAB-3", "COE 2A", "Ms. Kaur"),
    _slot(5, "13:00", "14:50", "Data Structures Lab", "CSED-LAB-1", "COE 2B", TEACHER_NAME),
]

SEED_CLASSES = [
    ("COE 2A", "COE-2A", "Computer Engineering", "2", "A", "cr@thapar.edu", "CSED-201", "60"),
    ("COE 2B", "COE-2B", "Computer Engineering", "2", "B", "", "CSED-202", "60"),
    ("COE 3A", "COE-3A", "Computer Engineering", "3", "A", "", "CSED-101", "60"),
]


def _seed_rooms(db: Session) -> None:
    """Add any missing room by code, so new seed rooms reach an existing database."""
    existing = {code for (code,) in db.query(Room.code).all()}
    added = False
    for code, building, floor, capacity, room_type in SEED_ROOMS:
        if code in existing:
            continue
        db.add(
            Room(
                code=code,
                building=building,
                floor=floor,
                capacity=capacity,
                room_type=room_type,
            )
        )
        added = True
    if added:
        db.commit()


def _seed_timetable(db: Session) -> None:
    if db.query(TimetableEntry).filter(TimetableEntry.owner_id.is_(None)).count() > 0:
        return
    for item in SEED_TIMETABLE:
        db.add(TimetableEntry(owner_id=None, **item))
    db.commit()


def _seed_classes(db: Session) -> None:
    if db.query(ClassRecord).count() > 0:
        return
    for name, code, department, year, section, cr_email, room, students in SEED_CLASSES:
        db.add(
            ClassRecord(
                name=name,
                code=code,
                department=department,
                year=year,
                section=section,
                cr_email=cr_email,
                room=room,
                students=students,
            )
        )
    db.commit()


def _seed_announcements(db: Session) -> None:
    if db.query(Announcement).count() > 0:
        return
    now = utcnow()
    rows = [
        Announcement(
            title="Data Structures moved to CSED-203 on Friday",
            body=(
                "Friday's 10:00 AM Data Structures class for COE 2A has been moved from CSED-204 "
                "to CSED-203. The projector in CSED-204 is being serviced. Same time, same faculty."
            ),
            category="schedule",
            audience="all",
            author_name="Dr. Meera Teacher",
            author_role="teacher",
            author_email="teacher@thapar.edu",
            room="CSED-203",
            class_name="COE 2A",
            pinned=True,
            source="timetable",
            created_at=now - timedelta(minutes=55),
        ),
        Announcement(
            title="DBMS lab shifted to CSED-LAB-1 today",
            body=(
                "COE 2A's DBMS lab will run in CSED-LAB-1 instead of CSED-LAB-2. "
                "Please carry your lab manuals."
            ),
            category="schedule",
            audience="students",
            author_name="Diya CR",
            author_role="cr",
            author_email="cr@thapar.edu",
            room="CSED-LAB-1",
            class_name="COE 2A",
            source="timetable",
            created_at=now - timedelta(hours=3),
        ),
        Announcement(
            title="Guest lecture: Building reliable distributed systems",
            body=(
                "A guest lecture by an industry engineer will be held in LT-301 on Thursday at 2:00 PM. "
                "Open to all COE students. Seats are first come, first served."
            ),
            category="general",
            audience="all",
            author_name="DoAA Office",
            author_role="admin",
            author_email="doaa@thapar.edu",
            room="LT-301",
            source="manual",
            created_at=now - timedelta(hours=8),
        ),
        Announcement(
            title="Wi-Fi maintenance in the CSED block",
            body=(
                "Campus Wi-Fi in the CSED block will be unavailable from 6:00 PM to 7:00 PM today. "
                "Classroom projectors are unaffected."
            ),
            category="urgent",
            audience="all",
            author_name="DoAA Office",
            author_role="admin",
            author_email="doaa@thapar.edu",
            source="manual",
            created_at=now - timedelta(hours=26),
        ),
    ]
    db.add_all(rows)
    db.commit()


def _seed_chat(db: Session) -> None:
    if db.query(ChatMessage).count() > 0:
        return
    people = {
        user.email: user for user in db.query(User).filter(User.active.is_(True)).all()
    }
    cr = people.get("cr@thapar.edu")
    cr2 = people.get("cr2@thapar.edu")
    teacher = people.get("teacher@thapar.edu")
    teacher2 = people.get("teacher2@thapar.edu")
    admin = people.get("doaa@thapar.edu")
    if not (cr and cr2 and teacher and teacher2 and admin):
        return

    now = utcnow()

    def message(channel: str, person: User, role: str, body: str, minutes_ago: int) -> ChatMessage:
        return ChatMessage(
            channel=channel,
            sender_id=person.id,
            sender_name=person.name,
            sender_role=role,
            body=body,
            at=now - timedelta(minutes=minutes_ago),
            kind="user",
        )

    db.add_all(
        [
            message(
                "staff",
                cr,
                "cr",
                "Morning! COE 2A's DBMS lab is in CSED-LAB-1 today. I'll post here if anything changes.",
                190,
            ),
            message(
                "staff",
                teacher,
                "teacher",
                "Thanks. I've marked CSED-204 as ongoing for the 9 AM Data Structures class.",
                170,
            ),
            message(
                "staff",
                cr2,
                "cr",
                "COE 2B here — our 10 AM DBMS class is in CSED-205. Is the projector working today?",
                165,
            ),
            message(
                "staff",
                teacher2,
                "teacher",
                "Projector in CSED-205 is fine. I'll take Computer Networks there at 11.",
                160,
            ),
            message(
                "staff",
                admin,
                "admin",
                "Noted. The LT block is available after 4 PM if anyone needs a larger room.",
                150,
            ),
            message(
                "office",
                admin,
                "admin",
                "DoAA office: please report any room clashes here. We're checking the LT block after lunch.",
                120,
            ),
            message(
                "office",
                teacher,
                "teacher",
                "CSED-204 is double-booked on Friday at 10 AM. I've moved my class to CSED-203 and posted an announcement.",
                100,
            ),
            message(
                "office",
                cr2,
                "cr",
                "COE 2B also needs CSED-203 on Friday at 10. We can use CSED-205 instead if that helps.",
                90,
            ),
            message(
                "cr-teachers",
                cr,
                "cr",
                "Could we move Friday's 10 AM Data Structures class to CSED-203? The projector in 204 is being serviced.",
                95,
            ),
            message(
                "cr-teachers",
                teacher,
                "teacher",
                "Approved — I'll update the schedule and post an announcement.",
                80,
            ),
            message(
                "cr-teachers",
                cr2,
                "cr",
                "Thanks. I've moved COE 2B's DBMS slot to CSED-205 so 203 stays free for you.",
                70,
            ),
            message(
                "cr-teachers",
                teacher2,
                "teacher",
                "Perfect. I'll take the 11 AM Computer Networks class in CSED-205 after your DBMS lab.",
                60,
            ),
            message(
                "general",
                admin,
                "admin",
                "Welcome to Room Status. The live board now follows the weekly timetable automatically.",
                240,
            ),
            message(
                "general",
                teacher2,
                "teacher",
                "Two CRs and two teachers are on the demo staff chat now. Teachers can direct-message CRs and the DoAA/DoSAA office.",
                45,
            ),
        ]
    )
    db.commit()


def seed_if_empty(db: Session) -> None:
    _seed_rooms(db)

    if settings.seed_demo_users:
        for name, email, password, roles in DEMO_USERS:
            if db.query(User).filter(User.email == email).one_or_none():
                continue
            user = User(name=name, email=email, password_hash=hash_secret(password), active=True)
            db.add(user)
            db.flush()
            for role in roles:
                db.add(UserRole(user_id=user.id, role=role))
            db.commit()

        cr = db.query(User).filter(User.email == "cr@thapar.edu").one_or_none()
        if cr:
            for code in ("CSED-204", "CSED-202"):
                room = db.query(Room).filter(Room.code == code).one_or_none()
                if room is None:
                    continue
                exists = (
                    db.query(RoomAssignment)
                    .filter(RoomAssignment.user_id == cr.id, RoomAssignment.room_id == room.id)
                    .one_or_none()
                )
                if exists is None:
                    db.add(
                        RoomAssignment(user_id=cr.id, room_id=room.id, granted_by=cr.id, active=True)
                    )
            db.commit()

        cr2 = db.query(User).filter(User.email == "cr2@thapar.edu").one_or_none()
        if cr2:
            for code in ("CSED-205", "CSED-203"):
                room = db.query(Room).filter(Room.code == code).one_or_none()
                if room is None:
                    continue
                exists = (
                    db.query(RoomAssignment)
                    .filter(RoomAssignment.user_id == cr2.id, RoomAssignment.room_id == room.id)
                    .one_or_none()
                )
                if exists is None:
                    db.add(
                        RoomAssignment(user_id=cr2.id, room_id=room.id, granted_by=cr2.id, active=True)
                    )
            db.commit()

        society = db.query(User).filter(User.email == "society@thapar.edu").one_or_none()
        if society:
            room = db.query(Room).filter(Room.code == "Activity Space 1").one_or_none()
            if room is not None:
                exists = (
                    db.query(RoomAssignment)
                    .filter(
                        RoomAssignment.user_id == society.id,
                        RoomAssignment.room_id == room.id,
                    )
                    .one_or_none()
                )
                if exists is None:
                    db.add(
                        RoomAssignment(
                            user_id=society.id,
                            room_id=room.id,
                            granted_by=society.id,
                            active=True,
                        )
                    )
                db.commit()

    _seed_timetable(db)
    _seed_classes(db)
    _seed_announcements(db)
    _seed_chat(db)
