# Running this project on your PC

## 1. Install Node.js (once)

Go to https://nodejs.org and download the **LTS** version, then install it with the
default options. Node.js includes `npm`, the command that installs the libraries
this site needs.

To check it worked, open **Command Prompt** (press the Windows key, type `cmd`,
hit Enter) and run:

```bat
node --version
npm --version
```

Both should print a number.

## 2. Unzip the project

Unzip `room-status-tracker.zip` somewhere easy to reach, for example your
Documents folder. You should end up with a folder called `room-status-tracker`
that contains `package.json`.

## 3. Install the libraries

In Command Prompt:

```bat
cd %USERPROFILE%\Documents\room-status-tracker
npm install
```

This takes a few minutes the first time.

## 4. Start the site

```bat
npm run dev
```

The window will print an address such as `http://localhost:8080`. Open that
address in your browser — that is your live site.

To stop it, press `Ctrl+C` in the window.

## 5. Check the code

```bat
npm test        "run the automated tests"
npm run lint    "check code style"
npm run build   "make sure everything still compiles"
```

`npm test` runs 43 checks. Thirty-four of them (domain rules, status rules,
timetable parsing and occupancy, PDF/photo timetable text, announcements,
messaging, demo accounts and the room assistant) run anywhere. The nine sign-in
and permission checks need a private server key that only exists in the hosted
project, so on your PC they report as skipped — that is expected, not a failure.

## 6. Backend for real accounts (optional — demo works without it)

Demo accounts never touch the backend. Real sign-in, and every change made by a
real account, needs the FastAPI server in `backend/`.

Install Python 3.11+ once from https://www.python.org (tick **Add Python to
PATH**), then in Command Prompt:

```bat
cd %USERPROFILE%\Documents\room-status-tracker\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Leave that window running. Check http://localhost:8000/docs — the API docs
should load. The first start creates `room_status.db` and seeds rooms, the
campus timetable, classes, announcements, chat messages, and the demo accounts.

In the project `.env` (next to `package.json`) make sure this line exists:

```
VITE_API_URL=http://localhost:8000
```

Then start the site in a second Command Prompt with `npm run dev`. The React app
keeps a local cache so pages stay fast, but for real accounts the server is the
source of truth: timetable, announcements, classes, chat and room status all go
through it, and the server re-checks every permission. If a request is rejected
the page reloads that data from the server instead of showing the rejected
change.

For PostgreSQL in deployment, set `DATABASE_URL` and run `alembic upgrade head`
from `backend/`. See `backend/README.md` for every endpoint.

## 7. Email + password sign-in (one-time setup)

The app now uses a normal **college email + password** login. There are no
6-digit codes.

To let new accounts sign in immediately after creating them:

1. Open your Supabase project dashboard → **Authentication → Providers → Email**.
2. Turn **Confirm email** off and save.

If you leave it on, a new account must confirm its email once before signing in
— the app tells the user when that happens.

### Give yourself the DoAA/DoSAA dashboard

The first account created on a brand-new database becomes DoAA/DoSAA
automatically. On an existing database, promote your account once from the
Supabase **SQL Editor**:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where email = 'your.email@thapar.edu'
on conflict do nothing;
```

Replace the email, run it, then sign out and back in. DoAA/DoSAA is the internal
name for the admin role and is what unlocks the full Manage page.

### If your old account has no password

Accounts created earlier with a link/code may not have a password. On the sign-in
page, use **Forgot password?** once, open the reset email, and set a password on
the Account page. After that, sign in normally.

## 7. Demo accounts (no DoAA/DoSAA needed)

The sign-in page has a **Demo accounts** panel. Press **Use**, or type the email
and password exactly as shown. Each account previews a different dashboard:

| Role       | Email                | Password     | Sees                                                                 |
| ---------- | -------------------- | ------------ | -------------------------------------------------------------------- |
| Student    | `student@thapar.edu` | `student123` | Rooms, own timetable upload, announcements, AI (no Messages/Classes) |
| CR         | `cr@thapar.edu`      | `cr123`      | Student view + CSED-204/202 room updates and class changes           |
| Teacher    | `teacher@thapar.edu` | `teacher123` | Student view + CSED-204/101/LT-301 updates and class changes         |
| DoAA/DoSAA | `doaa@thapar.edu`    | `doaa123`    | Full board + every room, lab and activity space                      |

Demo accounts are **local only**. They do not need Supabase, do not change the
shared database, and status updates made in a demo stay in that browser. Demo
mode is seeded with 21 rooms, a full weekly timetable and sample messages, so
every feature works offline. Room occupancy follows the timetable automatically;
a CR or teacher can move or cancel a class, and an announcement is posted for
everyone.

Students can open **Timetable → Upload your timetable** and choose a PDF, PNG or
JPG. The timetable is read in the browser and the room board follows those
classes. Photos use OCR, which needs internet the first time to download the
engine; PDFs with selectable text work offline. Student accounts no longer see
the **Messages** or **Classes** tabs, and those pages are staff-only.

The Manage page is hidden in demo mode; use a real DoAA/DoSAA account for that.
Press **Exit demo** in the header to switch roles.

## Which files are which

| Folder / file                                 | What it holds                                               |
| --------------------------------------------- | ----------------------------------------------------------- |
| `src/routes/index.tsx`                        | Role-aware dashboard (Student / CR / Teacher / DoAA-DoSAA)  |
| `src/routes/auth.tsx`                         | The sign-in and create-account page (email + password)      |
| `src/routes/_authenticated/timetable.tsx`     | Weekly timetable, class moves/cancels and live occupancy    |
| `src/routes/_authenticated/announcements.tsx` | Noticeboard and announcement composer                       |
| `src/routes/_authenticated/assistant.tsx`     | Campus AI: free rooms for any day and time slot             |
| `src/routes/_authenticated/classes.tsx`       | DoAA/DoSAA only: add a class (building, room, floor)        |
| `src/routes/_authenticated/chat.tsx`          | Staff messaging portal: group rooms and direct messages     |
| `src/routes/_authenticated/account.tsx`       | Roles and password                                          |
| `src/routes/_authenticated/manage.tsx`        | The Manage page (signed in)                                 |
| `src/lib/timetable.ts`                        | CSV/ICS/PDF text parsing and live-class rules               |
| `src/lib/timetable-import.ts`                 | Reads PDFs and runs in-browser OCR for timetable photos     |
| `src/lib/occupancy.ts`                        | Turns the weekly timetable into live room status            |
| `src/lib/announcements.ts`                    | Announcement storage and automatic schedule notices         |
| `src/lib/assistant.ts`                        | Day/time parsing and free-room answers                      |
| `src/lib/chat.ts`                             | Message channels, permissions and direct messages           |
| `src/lib/demo.ts`                             | Local-only demo sign-in and seeded campus data              |
| `src/components/`                             | Room cards, status badges, header, dialogs                  |
| `src/hooks/use-auth.tsx`                      | Who is signed in and what role they have                    |
| `src/lib/auth-domain.ts`                      | The `@thapar.edu` sign-in rule                              |
| `src/lib/status.ts`                           | Status names, colours, which ones are allowed               |
| `src/integrations/supabase/`                  | Connections to the database and sign-in                     |
| `drizzle/`                                    | Database shape and the recorded changes                     |
| `supabase/config.toml`                        | Database settings                                           |
| `.env`                                        | The database address and its public key — already filled in |

## Notes

- `.env` already points at the hosted database, so the site on your PC reads and
  writes the same room data as the preview.
- If you move the project elsewhere, keep `.env` next to `package.json`.
- Never post the contents of `.env` publicly. It holds only the public key, but
  it is good practice.
- To put this on GitHub: create an empty repository there, then run the two
  `git` commands GitHub shows you, from inside this folder.
