"""SQLite connection helpers for the Room Status Tracker prototype."""

from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "room_status.db"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def get_connection(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: Path | None = None) -> None:
    path = db_path or DB_PATH
    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    with get_connection(path) as conn:
        conn.executescript(schema)
        conn.commit()


def is_db_empty(db_path: Path | None = None) -> bool:
    with get_connection(db_path) as conn:
        row = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()
        return row["n"] == 0
