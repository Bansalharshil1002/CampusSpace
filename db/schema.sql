PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (
        role IN ('student', 'cr', 'teacher', 'admin', 'society_rep')
    ),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    building TEXT NOT NULL,
    floor INTEGER NOT NULL,
    room_type TEXT NOT NULL CHECK (
        room_type IN ('classroom', 'lt', 'activity_space')
    ),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS room_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    assignment_role TEXT NOT NULL CHECK (
        assignment_role IN ('cr', 'society_rep')
    ),
    assigned_by INTEGER REFERENCES users(id),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS status_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    status TEXT NOT NULL,
    note TEXT,
    updated_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_status_logs_room_created
    ON status_logs(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_user_active
    ON room_assignments(user_id, active);

CREATE INDEX IF NOT EXISTS idx_assignments_room_active
    ON room_assignments(room_id, active);
