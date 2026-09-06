# Room Status Tracker (Prototype)

Local **Python + Streamlit + SQLite** prototype for viewing and updating classroom, LT, and activity-space status.

This prototype validates the core product loop:

**Assign → Update → Persist → View → Track History**

It is **not** a production deployment (no FastAPI, React, JWT, OTP, PostgreSQL, or WebSockets).

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m db.seed
streamlit run app.py
```

On first launch the app also seeds the database if it is empty.

## Demo users (after seed)

| Name | Role | Notes |
| --- | --- | --- |
| Aarav Student | student | View-only dashboard |
| Prasuk | student | Assign as CR in Teacher Panel |
| Meera Society | society_rep | Pre-assigned to Activity Space 1 |
| Dr. Sharma | teacher | Assign/revoke CRs, override status |
| Admin DOA | admin | Full admin panel |

## Demo walkthrough (success criteria)

1. Run seed / open the app.
2. Login as **Dr. Sharma** → Teacher Panel → assign **Prasuk** as CR for **CSED-204**.
3. Switch User → **Prasuk** → My Updates → set status (e.g. Class ongoing) + note.
4. Switch User → **Aarav Student** → Dashboard → confirm status, note, and history.
5. Switch User → **Dr. Sharma** → revoke the CR assignment.
6. Switch User → **Prasuk** → confirm My Updates no longer allows updating that room.

Also try:

- **LT-301** status override (classroom status vocabulary).
- **Meera Society** → My Updates → mark Activity Space 1 **Occupied** with a note.

## Project layout

```text
app.py
db/          # schema, connection helpers, seed
services/    # users, rooms, assignments, statuses
ui/          # dashboard, CR/society panel, teacher, admin
data/        # room_status.db (local)
```

## Room types & statuses

| `room_type` | Valid statuses |
| --- | --- |
| `classroom`, `lt` | Teacher not arrived, Class ongoing, Cancelled, Changed, Free |
| `activity_space` | Occupied, Open to all |
