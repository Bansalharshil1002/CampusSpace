# Room Status Tracker backend

FastAPI + SQLAlchemy + Alembic backend for the SRS: college-email auth, rooms, assignments, status updates, history, and live status events. The server is the source of truth for permissions — the UI cannot bypass it.

## Stack (SRS §2.4)

- FastAPI / Python
- PostgreSQL in deployment, SQLite for local work
- SQLAlchemy + Alembic
- JWT sessions after password, OTP, or magic-link login (`@thapar.edu` only)
- Resend (or console logging) for one-time codes

## Run locally (SQLite)

```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs for the API.

Then start the React app (`npm run dev`) with `VITE_API_URL=http://localhost:8000` in the project `.env`.

Seeded accounts (when `SEED_DEMO_USERS=true`):

| Role             | Email                | Password    |
| ---------------- | -------------------- | ----------- |
| Student          | student@thapar.edu   | student123  |
| CR               | cr@thapar.edu        | cr123       |
| Society rep      | society@thapar.edu   | society123  |
| Teacher          | teacher@thapar.edu   | teacher123  |
| DoAA / Admin     | doaa@thapar.edu      | doaa123     |

## PostgreSQL (deployment)

Set `DATABASE_URL=postgresql+psycopg2://USER:PASS@HOST:5432/room_status` and run:

```bat
alembic upgrade head
```

Or `docker compose up` from this folder. Hosts such as Render/Railway can build from `Dockerfile` and bind `PORT`.

Migration `0002_features` adds `timetable_entries`, `announcements`, `classes`
and `chat_messages`. On SQLite the app creates missing tables automatically on
startup; on PostgreSQL run `alembic upgrade head`.

Seeding is idempotent: rooms are matched by code, the campus timetable is
replaced once when empty, and sample classes, announcements and chat messages
are only added when their tables are empty.

## Auth

- Email + password (`POST /auth/register`, `POST /auth/login`)
- College-email OTP (`POST /auth/otp/request`, `POST /auth/otp/verify`)
- Magic link (`POST /auth/magic/request`, `POST /auth/magic/verify`)

Only `@thapar.edu` addresses are accepted. With `EMAIL_BACKEND=console`, codes are printed in the terminal. Set `EMAIL_BACKEND=resend` and `RESEND_API_KEY` to send real mail.

`GET /auth/me` returns the signed-in profile and roles. The React app keeps a JWT in `localStorage` and sends it as `Authorization: Bearer <token>`.

## Timetable

| Method   | Path                    | Who                                                         |
| -------- | ----------------------- | ----------------------------------------------------------- |
| `GET`    | `/timetable`            | Any signed-in user. Returns `{ entries, scope }`.           |
| `PUT`    | `/timetable`            | Students (personal copy), teachers/admins (campus plan).    |
| `PATCH`  | `/timetable/{id}`       | Owner of a personal entry; staff/CR for campus entries.     |
| `DELETE` | `/timetable/{id}`       | Same rule as `PATCH` (cancels a class).                     |
| `POST`   | `/timetable/restore`    | Students clear personal entries; staff restore the seed.    |

Students see their personal timetable when they have one, otherwise the campus
plan. CRs edit the campus plan slot-by-slot but cannot replace it. Every write
is checked again on the server.

## Announcements

- `GET /announcements` filters by audience: students receive `all` and
  `students`; staff also receive `staff`.
- `POST /announcements` is staff-only (CR, teacher, admin). The author name,
  role and email come from the JWT, never from the request body.

## Classes (staff only)

- `GET /classes`, `POST /classes`, `DELETE /classes/{id}`.
- Students receive `403`; these pages are hidden from them in the UI as well.

## Chat

- `GET /chat/messages?channel=<id>`
- `POST /chat/messages` with `{ "channel": "...", "body": "..." }`
- `DELETE /chat/messages?channel=<id>` clears a channel (staff only)

Channels: `general` (any signed-in user), `staff`, `cr-teachers`, `office`
(staff only), and direct messages keyed `dm:<emailA>|<emailB>` (staff only).
The server rejects any channel the caller cannot use.

## Status writes

Room status changes only through `POST /rooms/{id}/status`, which applies `can_update_room` then writes a `status_logs` row.

- Students cannot update
- CRs update assigned classrooms / LTs only
- Society reps update assigned activity spaces only
- Teachers override classrooms / LTs
- Admin / DoAA can update any active room

Deactivated rooms and assignments cannot be used for new updates. History is kept.

## Live updates (FR-14)

`GET /rooms/stream` is a server-sent event feed (`Authorization` header or `?token=`). Each accepted status change publishes `event: room.status`. The React dashboard also polls every 15 seconds.

`GET /rooms` supports `building`, `room_type`, and `active` filters (FR-01).

## Tests

```bat
pytest
```
