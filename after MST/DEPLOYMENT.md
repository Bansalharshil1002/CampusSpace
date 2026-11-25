# Controlled backend demo deployment

This deployment is **not** a real campus rollout. It is a hosted demo with real database accounts and password login, but no public registration and no email sign-in.

## What is deployed

| Part | Platform | Notes |
| --- | --- | --- |
| Frontend | Cloudflare Workers | Built with `VITE_API_URL` pointing to the backend |
| Backend | Render Web Service | FastAPI, built from `backend/Dockerfile` |
| Database | Render Postgres | Managed PostgreSQL |
| Email | Disabled | OTP, magic links and reset are unavailable |
| Signup | Disabled | Accounts are created manually with `app.bootstrap` |

## 1. Deploy the backend

Render Blueprints require the code to be in a Git repository. If this folder is not connected yet, push it to your GitHub/Lovable repo first; do not force-push or rewrite existing history.

1. Sign in to <https://dashboard.render.com>.
2. Click **New + → Blueprint**.
3. Connect the repository containing this `render.yaml`.
4. When prompted for the Blueprint file, select `after MST/render.yaml`. Use branch `main` (or your connected branch). The service uses `rootDir: after MST`, so the Dockerfile and Docker context resolve correctly.
5. Give the Blueprint a name, e.g. `room-status-tracker`, and click **Apply**.
6. Render creates:
   - `room-status-tracker-api` (Docker web service)
   - `room-status-tracker-db` (Postgres)
7. During setup, Render prompts for two values because they are marked `sync: false`. Set both to the expected Worker URL:
   - `FRONTEND_URL` = `https://room-status-tracker.workers.dev`
   - `CORS_ORIGINS` = `https://room-status-tracker.workers.dev`

   If Wrangler later reports a different Worker URL, send it to me and I’ll update these values and redeploy the backend.
8. Wait for the first deploy. The Docker command runs `alembic upgrade head`, then starts Uvicorn.
9. Confirm `GET https://YOUR-API-URL.onrender.com/health` returns:

```json
{ "status": "ok" }
```

If the initial deploy fails because `FRONTEND_URL` or `CORS_ORIGINS` were left empty, set them in the service’s **Environment** tab and click **Manual Deploy → Deploy latest commit**.

## 2. Create controlled accounts

Open **Shell** in the Render API service. The first account must be an admin.

```bat
set RST_ADMIN_PASSWORD=choose-a-strong-password
python -m app.bootstrap --name "DoAA Office" --email doaa@thapar.edu --password-env RST_ADMIN_PASSWORD --role admin --assign-rooms CSED-204,CSED-202 --granted-by doaa@thapar.edu
```

Then create the other accounts:

```bat
set RST_STUDENT_PASSWORD=choose-a-strong-password
python -m app.bootstrap --name "Aarav Student" --email student@thapar.edu --password-env RST_STUDENT_PASSWORD --role student

set RST_CR_PASSWORD=choose-a-strong-password
python -m app.bootstrap --name "Simran CR" --email cr@thapar.edu --password-env RST_CR_PASSWORD --role cr --assign-rooms CSED-204,CSED-202 --granted-by doaa@thapar.edu

set RST_TEACHER_PASSWORD=choose-a-strong-password
python -m app.bootstrap --name "Dr. Meera Teacher" --email teacher@thapar.edu --password-env RST_TEACHER_PASSWORD --role teacher --assign-rooms CSED-204,CSED-202 --granted-by doaa@thapar.edu

set RST_SOCIETY_PASSWORD=choose-a-strong-password
python -m app.bootstrap --name "Meera Society" --email society@thapar.edu --password-env RST_SOCIETY_PASSWORD --role society_rep --assign-rooms "Activity Space 1" --granted-by doaa@thapar.edu
```

The bootstrap command is idempotent: it creates the user if missing, updates the password and roles, and adds any requested room assignments.

## 3. Deploy the frontend

OAuth login requires approving a browser callback within a short window. For unattended deploys we use an API token instead.

1. In Cloudflare, go to **My Profile → API Tokens → Create Token**.
2. Use the **Edit Cloudflare Workers** template, or create a custom token with:
   - Account Settings: Read
   - Workers Scripts: Edit
3. Copy the token and your Account ID from **Workers & Pages → Overview**.
4. Copy `.env.deployment.local.example` to `.env.deployment.local` in the project root and fill in:

```text
CLOUDFLARE_API_TOKEN=your-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
```

This file is gitignored and is never printed by the scripts.

Verify the token:

```bat
powershell -ExecutionPolicy Bypass -File .\scripts\check-cloudflare-auth.ps1
```

Then build and deploy with the real backend URL:

```bat
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-cloudflare.ps1 -ApiUrl "https://YOUR-API-URL.onrender.com" -WorkerName "room-status-tracker"
```

To build without deploying:

```bat
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-cloudflare.ps1 -ApiUrl "https://YOUR-API-URL.onrender.com" -DryRun
```

The script sets:

```text
VITE_AUTH_MODE=password
VITE_ALLOW_EMAIL_AUTH=false
VITE_ALLOW_REGISTRATION=false
VITE_SHOW_LOCAL_DEMO=true
```

This hides OTP, magic link, forgot password and create account flows in the deployed UI. The password sign-in stays visible for real database accounts. The local demo role buttons remain available for visitors who only want to explore without changing shared data.

## 4. Smoke test

1. Open the Worker URL.
2. Confirm the controlled-demo banner is visible.
3. Sign in with the real student account.
4. Confirm the student cannot see Messages, Classes or Manage.
5. Sign out and sign in with the CR account.
6. Confirm Messages is visible and Classes is hidden.
7. Sign out and sign in with the DoAA account.
8. Confirm Classes is visible and Timetable is hidden.
9. Add a class from the Classes page and reload.
10. Confirm the class remains present.
11. Try Create account / email code tabs — they should not be visible.
12. Open the browser console — there should be no `localhost:8000` errors.

## 5. Notes and limits

- The database is shared: any change made by one visitor is visible to everyone else.
- Passwords for controlled accounts should be rotated if they are shared publicly.
- Public registration stays disabled.
- OTP, magic-link and reset-password endpoints return `503`.
- No `dev_code` or `dev_token` is returned because `ALLOW_DEV_AUTH=false`.
- Rate limiting is enabled in production at 20 auth attempts/minute/IP.
- For a real campus launch you still need official accounts, a verified email sender and a controlled admin bootstrap process.
