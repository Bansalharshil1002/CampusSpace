# CampusSpace — Room Status Tracker

A room availability dashboard built as a student software engineering project. The app helps students, class representatives, teachers, and the DoAA/DoSAA office see which campus rooms are free, occupied, or reserved, and keep timetable information in one place.

## Features

- Role-based dashboards for Student, CR, Teacher, and DoAA/DoSAA
- Live room status board with building, room number, floor, capacity, and room type
- Timetable viewing and personal timetable overrides
- Announcements with audience targeting and unread tracking
- Class scheduling available to the DoAA/DoSAA role
- Staff-only chat and AI assistant pages
- Browser-local staff preview roles (CR, Teacher, DoAA/DoSAA) for exploring the UI without changing shared data
- Backend-controlled password login with a shared database for real student accounts

## Tech stack

- React + TypeScript
- TanStack Start / TanStack Router
- Tailwind CSS
- FastAPI + SQLAlchemy
- Alembic migrations
- PostgreSQL in deployment, SQLite for local development
- Cloudflare Workers for the frontend, Render for the backend

## Local development

You need Node.js and npm for the frontend, and Python for the backend.

### Frontend

```sh
npm install
npm run dev
```

The development server reads `VITE_API_URL` from `.env`. If it is not set, it calls `http://localhost:8000`.

### Backend

```sh
cd backend
python -m venv .venv
```

On Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

On macOS/Linux:

```sh
source .venv/bin/activate
```

Then install dependencies and start the server:

```sh
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

The API is available at `http://localhost:8000`. See `backend/.env.example` for local configuration.

## Tests and checks

Frontend:

```sh
npm run test
npm run lint
npx tsc --noEmit
```

Backend:

```sh
cd backend
python -m pytest -q
```

## Controlled demo deployment

The hosted version is a controlled demo, not a public campus rollout. Students sign in with real database password accounts. CR, Teacher and DoAA/DoSAA use browser-local preview buttons, so their demo changes are not shared with students. Public registration, OTP, magic links, and password reset are disabled.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full Render + Cloudflare deployment and account bootstrap steps.

For local development, keep the existing `.env` values. Production builds use the variables in `.env.production.example`.
