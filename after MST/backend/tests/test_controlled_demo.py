"""Controlled-demo hardening: no public admin, no public signup, no email auth."""

from fastapi.testclient import TestClient

import app.bootstrap as bootstrap
from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import Room, RoomAssignment, User

client = TestClient(app)


def test_registration_disabled_returns_403(monkeypatch):
    monkeypatch.setattr(settings, "allow_public_registration", False)
    res = client.post(
        "/auth/register",
        json={"name": "Blocked", "email": "blocked.signup@thapar.edu", "password": "password123"},
    )
    assert res.status_code == 403
    assert "registration is disabled" in res.json()["detail"].lower()


def test_registration_never_grants_admin(monkeypatch):
    monkeypatch.setattr(settings, "allow_public_registration", True)
    res = client.post(
        "/auth/register",
        json={"name": "Plain Student", "email": "plain.student@thapar.edu", "password": "password123"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["user"]["roles"] == ["student"]


def test_email_auth_disabled_returns_503_without_dev_code(monkeypatch):
    monkeypatch.setattr(settings, "allow_email_auth", False)
    res = client.post("/auth/otp/request", json={"email": "student@thapar.edu"})
    assert res.status_code == 503
    assert "dev_code" not in res.json()


def test_dev_details_hidden_when_dev_auth_disabled(monkeypatch):
    monkeypatch.setattr(settings, "allow_dev_auth", False)
    res = client.post("/auth/otp/request", json={"email": "student@thapar.edu"})
    assert res.status_code == 200, res.text
    assert res.json().get("dev_code") is None


def test_bootstrap_creates_controlled_admin_with_assignment(monkeypatch):
    monkeypatch.setenv("RST_TEST_ADMIN_PASSWORD", "controlled-admin-password")
    monkeypatch.setattr(
        bootstrap.sys,
        "argv",
        [
            "bootstrap",
            "--name",
            "Controlled Admin",
            "--email",
            "bootstrap.qa@thapar.edu",
            "--password-env",
            "RST_TEST_ADMIN_PASSWORD",
            "--role",
            "admin",
            "--assign-rooms",
            "CSED-204",
            "--granted-by",
            "doaa@thapar.edu",
        ],
    )
    bootstrap.main()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "bootstrap.qa@thapar.edu").one()
        assert set(user.roles) == {"admin", "student"}
        room = db.query(Room).filter(Room.code == "CSED-204").one()
        assignment = (
            db.query(RoomAssignment)
            .filter(RoomAssignment.user_id == user.id, RoomAssignment.room_id == room.id)
            .one_or_none()
        )
        assert assignment is not None
        assert assignment.active is True
    finally:
        db.close()
