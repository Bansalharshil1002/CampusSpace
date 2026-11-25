"""Permission and persistence tests mapped to SRS FR-04..FR-12, FR-18."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def auth(email: str, password: str) -> dict[str, str]:
    res = client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def make_room(code: str, room_type: str = "classroom") -> str:
    admin = auth("doaa@thapar.edu", "doaa123")
    res = client.post(
        "/rooms",
        json={"code": code, "building": "Test Block", "floor": 0, "room_type": room_type},
        headers=admin,
    )
    assert res.status_code == 200, res.text
    return res.json()["id"]


def test_rejects_non_college_email():
    res = client.post(
        "/auth/register",
        json={"email": "outsider@gmail.com", "password": "password1", "name": "Out"},
    )
    assert res.status_code == 400
    assert "thapar.edu" in res.json()["detail"]


def test_student_cannot_update_room():
    classroom = make_room("TEST-STU")
    headers = auth("student@thapar.edu", "student123")
    res = client.post(f"/rooms/{classroom}/status", json={"status": "CANCELLED"}, headers=headers)
    assert res.status_code == 403
    after = client.get(f"/rooms/{classroom}", headers=headers).json()
    assert after["current_status"] == "FREE"


def test_anonymous_cannot_update():
    classroom = make_room("TEST-ANON")
    res = client.post(f"/rooms/{classroom}/status", json={"status": "ONGOING"})
    assert res.status_code == 401


def test_assigned_cr_can_update_and_history_records():
    classroom = make_room("TEST-CR-OK")
    admin = auth("doaa@thapar.edu", "doaa123")
    assigned = client.post(
        "/assignments",
        json={"email": "cr@thapar.edu", "room_id": classroom},
        headers=admin,
    )
    assert assigned.status_code == 200, assigned.text
    cr = auth("cr@thapar.edu", "cr123")
    res = client.post(
        f"/rooms/{classroom}/status",
        json={"status": "NOT_ARRIVED", "note": "Waiting 10 min"},
        headers=cr,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["current_status"] == "NOT_ARRIVED"
    assert body["status_note"] == "Waiting 10 min"
    history = client.get(f"/rooms/{classroom}/history", headers=admin).json()
    assert history[0]["status"] == "NOT_ARRIVED"
    assert history[0]["profiles"]["email"] == "cr@thapar.edu"


def test_cr_cannot_update_unassigned_classroom():
    classroom = make_room("TEST-CR-NO")
    headers = auth("cr@thapar.edu", "cr123")
    res = client.post(f"/rooms/{classroom}/status", json={"status": "ONGOING"}, headers=headers)
    assert res.status_code == 403


def test_teacher_can_override_classroom_not_activity_space():
    classroom = make_room("TEST-TCH")
    activity = make_room("TEST-ACT", "activity_space")
    headers = auth("teacher@thapar.edu", "teacher123")
    ok = client.post(f"/rooms/{classroom}/status", json={"status": "CHANGED"}, headers=headers)
    assert ok.status_code == 200
    denied = client.post(f"/rooms/{activity}/status", json={"status": "OCCUPIED"}, headers=headers)
    assert denied.status_code == 403


def test_deactivated_assignment_blocks_cr():
    classroom = make_room("TEST-DEACT")
    admin = auth("doaa@thapar.edu", "doaa123")
    row = client.post(
        "/assignments",
        json={"email": "cr@thapar.edu", "room_id": classroom},
        headers=admin,
    ).json()
    client.patch(f"/assignments/{row['id']}", json={"active": False}, headers=admin)
    cr = auth("cr@thapar.edu", "cr123")
    res = client.post(f"/rooms/{classroom}/status", json={"status": "FREE"}, headers=cr)
    assert res.status_code == 403


def test_activity_space_status_vocabulary():
    activity = make_room("TEST-VOCAB", "activity_space")
    admin = auth("doaa@thapar.edu", "doaa123")
    res = client.post(f"/rooms/{activity}/status", json={"status": "ONGOING"}, headers=admin)
    assert res.status_code == 400


def test_list_rooms_filters_by_building_and_type():
    headers = auth("student@thapar.edu", "student123")
    make_room("FILTER-CSED", "classroom")
    res = client.get("/rooms", params={"building": "Test Block", "room_type": "classroom", "active": True}, headers=headers)
    assert res.status_code == 200
    assert all(row["building"] == "Test Block" and row["room_type"] == "classroom" for row in res.json())


def test_deactivated_room_cannot_be_updated():
    classroom = make_room("TEST-ROOM-OFF")
    admin = auth("doaa@thapar.edu", "doaa123")
    client.patch(f"/rooms/{classroom}", json={"active": False}, headers=admin)
    teacher = auth("teacher@thapar.edu", "teacher123")
    res = client.post(f"/rooms/{classroom}/status", json={"status": "CANCELLED"}, headers=teacher)
    assert res.status_code == 403


def test_society_rep_updates_assigned_activity_space_only():
    assigned = make_room("ACT-OK", "activity_space")
    other = make_room("ACT-NO", "activity_space")
    admin = auth("doaa@thapar.edu", "doaa123")
    granted = client.post("/assignments", json={"email": "society@thapar.edu", "room_id": assigned}, headers=admin)
    assert granted.status_code == 200, granted.text
    headers = auth("society@thapar.edu", "society123")
    ok = client.post(f"/rooms/{assigned}/status", json={"status": "OCCUPIED", "note": "Event"}, headers=headers)
    assert ok.status_code == 200, ok.text
    denied = client.post(f"/rooms/{other}/status", json={"status": "OCCUPIED"}, headers=headers)
    assert denied.status_code == 403


def test_student_can_view_room_history_without_email():
    classroom = make_room("TEST-HIST")
    teacher = auth("teacher@thapar.edu", "teacher123")
    client.post(f"/rooms/{classroom}/status", json={"status": "ONGOING"}, headers=teacher)
    student = auth("student@thapar.edu", "student123")
    history = client.get(f"/rooms/{classroom}/history", headers=student)
    assert history.status_code == 200
    assert history.json()[0]["status"] == "ONGOING"
    assert history.json()[0]["profiles"]["email"] is None
