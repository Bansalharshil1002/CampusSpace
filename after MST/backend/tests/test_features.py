"""Timetable, announcements, classes and chat: server-side permissions."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def auth(email: str, password: str) -> dict[str, str]:
    res = client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def restore_campus() -> None:
    admin = auth("doaa@thapar.edu", "doaa123")
    res = client.post("/timetable/restore", headers=admin)
    assert res.status_code == 200, res.text


def test_student_timetable_personal_override_and_campus_fallback():
    student = auth("student@thapar.edu", "student123")

    campus = client.get("/timetable", headers=student)
    assert campus.status_code == 200
    assert campus.json()["scope"] == "campus"
    assert len(campus.json()["entries"]) > 0

    personal = client.put(
        "/timetable",
        json={
            "entries": [
                {
                    "day": 1,
                    "start": "09:00",
                    "end": "09:50",
                    "subject": "My Class",
                    "room": "CSED-101",
                    "className": "COE 2A",
                    "teacher": "Me",
                }
            ]
        },
        headers=student,
    )
    assert personal.status_code == 200, personal.text
    body = personal.json()
    assert body["scope"] == "personal"
    assert len(body["entries"]) == 1
    assert body["entries"][0]["subject"] == "My Class"

    restored = client.post("/timetable/restore", headers=student)
    assert restored.status_code == 200
    assert restored.json()["scope"] == "campus"


def test_student_cannot_edit_campus_entry():
    student = auth("student@thapar.edu", "student123")
    entry = client.get("/timetable", headers=student).json()["entries"][0]
    denied = client.patch(f"/timetable/{entry['id']}", json={"room": "LT-999"}, headers=student)
    assert denied.status_code == 403


def test_cr_can_move_but_cannot_replace_campus_plan():
    cr = auth("cr@thapar.edu", "cr123")
    entry = client.get("/timetable", headers=cr).json()["entries"][0]

    denied = client.put("/timetable", json={"entries": []}, headers=cr)
    assert denied.status_code == 403

    moved = client.patch(f"/timetable/{entry['id']}", json={"room": "CSED-104"}, headers=cr)
    assert moved.status_code == 200, moved.text
    assert moved.json()["room"] == "CSED-104"

    restore_campus()


def test_teacher_can_replace_campus_plan():
    teacher = auth("teacher@thapar.edu", "teacher123")
    replaced = client.put(
        "/timetable",
        json={
            "entries": [
                {
                    "day": 2,
                    "start": "10:00",
                    "end": "10:50",
                    "subject": "Temp Class",
                    "room": "LT-101",
                    "className": "COE 9Z",
                    "teacher": "Temp",
                }
            ]
        },
        headers=teacher,
    )
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["scope"] == "campus"
    assert len(replaced.json()["entries"]) == 1
    restore_campus()


def test_announcement_creation_is_staff_only_and_audience_filtered():
    student = auth("student@thapar.edu", "student123")
    teacher = auth("teacher@thapar.edu", "teacher123")

    denied = client.post(
        "/announcements",
        json={"title": "Nope", "body": "Students cannot post", "category": "general"},
        headers=student,
    )
    assert denied.status_code == 403

    created = client.post(
        "/announcements",
        json={
            "title": "Staff briefing",
            "body": "Only staff see this",
            "category": "general",
            "audience": "staff",
        },
        headers=teacher,
    )
    assert created.status_code == 200, created.text
    announcement = created.json()
    assert announcement["authorEmail"] == "teacher@thapar.edu"
    assert announcement["authorRole"] == "teacher"

    staff_list = client.get("/announcements", headers=teacher).json()
    assert any(item["id"] == announcement["id"] for item in staff_list)
    student_list = client.get("/announcements", headers=student).json()
    assert all(item["id"] != announcement["id"] for item in student_list)


def test_classes_are_staff_only():
    student = auth("student@thapar.edu", "student123")
    cr = auth("cr@thapar.edu", "cr123")

    assert client.get("/classes", headers=student).status_code == 403

    created = client.post(
        "/classes",
        json={
            "name": "Test Class",
            "code": "TEST-1",
            "department": "Computer Engineering",
            "year": "4",
            "section": "C",
            "crEmail": "cr@thapar.edu",
            "room": "CSED-105",
            "students": "30",
        },
        headers=cr,
    )
    assert created.status_code == 200, created.text
    record = created.json()
    assert record["crEmail"] == "cr@thapar.edu"

    listed = client.get("/classes", headers=cr).json()
    assert any(item["id"] == record["id"] for item in listed)

    removed = client.delete(f"/classes/{record['id']}", headers=cr)
    assert removed.status_code == 200


def test_chat_channel_permissions():
    student = auth("student@thapar.edu", "student123")
    cr = auth("cr@thapar.edu", "cr123")

    assert client.get("/chat/messages", params={"channel": "staff"}, headers=student).status_code == 403
    assert client.post(
        "/chat/messages", json={"channel": "staff", "body": "hello"}, headers=student
    ).status_code == 403

    open_channel = client.get("/chat/messages", params={"channel": "general"}, headers=student)
    assert open_channel.status_code == 200
    posted = client.post(
        "/chat/messages", json={"channel": "general", "body": "Hello campus"}, headers=student
    )
    assert posted.status_code == 200, posted.text
    assert posted.json()["senderRole"] == "student"

    staff_read = client.get("/chat/messages", params={"channel": "staff"}, headers=cr)
    assert staff_read.status_code == 200
    staff_post = client.post(
        "/chat/messages", json={"channel": "staff", "body": "Staff note"}, headers=cr
    )
    assert staff_post.status_code == 200

    dm = "dm:cr@thapar.edu|teacher@thapar.edu"
    assert client.get("/chat/messages", params={"channel": dm}, headers=cr).status_code == 200
    assert client.get("/chat/messages", params={"channel": dm}, headers=student).status_code == 403

    assert client.delete("/chat/messages", params={"channel": "general"}, headers=student).status_code == 403
    assert client.delete("/chat/messages", params={"channel": "staff"}, headers=cr).status_code == 200


def test_direct_messages_only_connect_teachers_with_crs_and_the_office():
    cr = auth("cr@thapar.edu", "cr123")
    cr2 = auth("cr2@thapar.edu", "cr123")
    teacher = auth("teacher@thapar.edu", "teacher123")
    admin = auth("doaa@thapar.edu", "doaa123")

    cr_teacher = "dm:cr@thapar.edu|teacher@thapar.edu"
    cr2_teacher = "dm:cr2@thapar.edu|teacher@thapar.edu"
    cr_cr2 = "dm:cr@thapar.edu|cr2@thapar.edu"
    cr_admin = "dm:cr@thapar.edu|doaa@thapar.edu"
    teacher_admin = "dm:teacher@thapar.edu|doaa@thapar.edu"

    assert client.get("/chat/messages", params={"channel": cr_teacher}, headers=teacher).status_code == 200
    assert client.get("/chat/messages", params={"channel": cr2_teacher}, headers=teacher).status_code == 200
    assert client.get("/chat/messages", params={"channel": teacher_admin}, headers=admin).status_code == 200

    # CRs cannot message each other or the DoAA office.
    assert client.get("/chat/messages", params={"channel": cr_cr2}, headers=cr).status_code == 403
    assert client.get("/chat/messages", params={"channel": cr_cr2}, headers=cr2).status_code == 403
    assert (
        client.post("/chat/messages", json={"channel": cr_cr2, "body": "hi"}, headers=cr).status_code
        == 403
    )
    assert client.get("/chat/messages", params={"channel": cr_admin}, headers=cr).status_code == 403
    assert client.get("/chat/messages", params={"channel": cr_admin}, headers=admin).status_code == 403

    # An outsider is not part of the pair at all.
    assert client.get("/chat/messages", params={"channel": cr_teacher}, headers=cr2).status_code == 403


def test_second_cr_and_teacher_demo_accounts_can_sign_in():
    for email, password, role in (
        ("cr2@thapar.edu", "cr123", "cr"),
        ("teacher2@thapar.edu", "teacher123", "teacher"),
    ):
        res = client.post("/auth/login", json={"email": email, "password": password})
        assert res.status_code == 200, res.text
        assert role in res.json()["user"]["roles"]


def test_admin_assigns_role_by_email_and_new_user_claims_it():
    admin = auth("doaa@thapar.edu", "doaa123")
    student = auth("student@thapar.edu", "student123")
    email = "assigned.cr@thapar.edu"

    denied = client.post(
        "/users/assign-role",
        json={"email": email, "role": "cr"},
        headers=student,
    )
    assert denied.status_code == 403

    assigned = client.post(
        "/users/assign-role",
        json={"email": email, "role": "cr", "name": "Assigned CR"},
        headers=admin,
    )
    assert assigned.status_code == 200, assigned.text
    body = assigned.json()
    assert body["email"] == email
    assert "cr" in body["roles"]
    assert "student" in body["roles"]

    listed = client.get("/users", headers=admin).json()
    assert any(item["email"] == email and "cr" in item["roles"] for item in listed)

    # The owner can register later and keeps the role the office assigned.
    claimed = client.post(
        "/auth/register",
        json={"name": "Assigned CR", "email": email, "password": "strongpass123"},
    )
    assert claimed.status_code == 200, claimed.text
    assert "cr" in claimed.json()["user"]["roles"]


def test_otp_sign_in_round_trip():
    email = "otp.login@thapar.edu"
    requested = client.post("/auth/otp/request", json={"email": email})
    assert requested.status_code == 200, requested.text
    code = requested.json()["dev_code"]
    assert code

    verified = client.post("/auth/otp/verify", json={"email": email, "code": code})
    assert verified.status_code == 200, verified.text
    assert verified.json()["user"]["email"] == email


def test_magic_link_round_trip():
    email = "magic.login@thapar.edu"
    requested = client.post("/auth/magic/request", json={"email": email})
    assert requested.status_code == 200, requested.text
    token = requested.json()["dev_token"]
    assert token

    verified = client.post("/auth/magic/verify", json={"token": token})
    assert verified.status_code == 200, verified.text
    assert verified.json()["user"]["email"] == email

    # A magic token is single use.
    repeated = client.post("/auth/magic/verify", json={"token": token})
    assert repeated.status_code == 400


def test_password_reset_round_trip():
    email = "reset.login@thapar.edu"
    client.post(
        "/auth/register",
        json={"name": "Reset Login", "email": email, "password": "oldpass123"},
    )

    requested = client.post("/auth/forgot-password", json={"email": email})
    assert requested.status_code == 200, requested.text
    code = requested.json()["dev_code"]
    assert code and len(code) == 6 and code.isdigit()

    mismatch = client.post(
        "/auth/reset-password",
        json={
            "email": email,
            "code": code,
            "password": "newpass123",
            "confirm_password": "different123",
        },
    )
    assert mismatch.status_code == 400

    reset = client.post(
        "/auth/reset-password",
        json={
            "email": email,
            "code": code,
            "password": "newpass123",
            "confirm_password": "newpass123",
        },
    )
    assert reset.status_code == 200, reset.text

    # The code is single use even if the first attempt succeeded.
    repeated = client.post(
        "/auth/reset-password",
        json={
            "email": email,
            "code": code,
            "password": "another123",
            "confirm_password": "another123",
        },
    )
    assert repeated.status_code == 400

    old = client.post("/auth/login", json={"email": email, "password": "oldpass123"})
    assert old.status_code == 400
    new = client.post("/auth/login", json={"email": email, "password": "newpass123"})
    assert new.status_code == 200, new.text
    assert new.json()["user"]["email"] == email
