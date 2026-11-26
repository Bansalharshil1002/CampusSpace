# Controlled hybrid demo deployment

This deployment is a presentation demo, not a public campus rollout.

- **Students:** sign in with real database password accounts created by the project team.
- **CR / Teacher / DoAA/DoSAA:** use browser-local preview buttons on the sign-in page. Their changes stay in that browser and are never written to the shared database.
- **No official email accounts, no public registration, no OTP, no magic links, and no password-reset links.**
- **No Society Representative dashboard or demo role** is included because that dashboard was not built.

## What is deployed

| Part | Platform | Notes |
| --- | --- | --- |
| Frontend | Cloudflare Workers | Built with `VITE_API_URL` pointing to the backend |
| Backend | Render Web Service | FastAPI, built from `backend/Dockerfile` |
| Database | Render Postgres | Managed PostgreSQL |
| Student login | Real database accounts | Password-only, manually bootstrapped |
| Staff preview roles | Browser-local only | CR, Teacher, DoAA/DoSAA; not saved to the database |
| Email | Disabled | OTP, magic links and reset are unavailable |
| Signup | Disabled | Accounts are created manually with `app.bootstrap` |

## 1. Deploy the backend

Render Blueprints require the code to be in a Git repository. The project is committed under the `after MST/` folder on branch `main`.

1. Sign in to <https://dashboard.render.com>.
2. Click **New + → Blueprint**.
3. Connect the repository `Bansalharshil1002/CampusSpace`.
4. When prompted for the Blueprint file, select **`after MST/render.yaml`** — not a root-level file. Use branch `main`. The service uses `rootDir: after MST`, so the Dockerfile and Docker context resolve correctly.
5. Give the Blueprint a name, e.g. `room-status-tracker`, and click **Apply**.
6. Render creates:
   - `room-status-tracker-api` (Docker web service)
   - `room-status-tracker-db` (Postgres)
7. During setup, Render prompts for two values because they are marked `sync: false`. Set both to the expected Worker URL:
   - `FRONTEND_URL` = `https://room-status-tracker.workers.dev`
   - `CORS_ORIGINS` = `https://room-status-tracker.workers.dev`

   If Wrangler later reports a different Worker URL, update these values in the service’s **Environment** tab and click **Manual Deploy → Deploy latest commit**.
8. Wait for the first deploy. The Docker command runs `alembic upgrade head`, then starts Uvicorn.
9. Confirm `GET https://YOUR-API-URL.onrender.com/health` returns:

```json
{ "status": "ok" }
```

If the initial deploy fails because `FRONTEND_URL` or `CORS_ORIGINS` were left empty, set them in the **Environment** tab and redeploy the latest commit.

## 2. Create real student accounts only

Open **Shell** in the Render API service and create only the student accounts that should be able to sign in for real.

```sh
export RST_STUDENT1_PASSWORD='choose-a-strong-password'
python -m app.bootstrap --name "Student One" --email student1@thapar.edu --password-env RST_STUDENT1_PASSWORD --role student

export RST_STUDENT2_PASSWORD='choose-a-strong-password'
python -m app.bootstrap --name "Student Two" --email student2@thapar.edu --password-env RST_STUDENT2_PASSWORD --role student
```

Replace the names, emails and passwords with the accounts you want to distribute. Give each password to the student privately.

Do **not** bootstrap these database accounts for the demo:

- `doaa@thapar.edu`
- `cr@thapar.edu` / `cr2@thapar.edu`
- `teacher@thapar.edu` / `teacher2@thapar.edu`
- `society@thapar.edu` or any `society_rep` account

Staff roles are browser-local previews. Creating them in the database would share staff demo changes with everyone and defeat the presentation-only setup.

The bootstrap command is idempotent: it creates the user if missing, updates the password and roles, and adds any requested room assignments. The first registered user does not automatically become an admin.

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

This file is gitignored and is never printed by the scripts. Because the token was shared in chat earlier, rotate it after deployment and store only the replacement in this local file.

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

The script sets these build-time values:

```text
VITE_API_URL=https://YOUR-API-URL.onrender.com
VITE_AUTH_MODE=password
VITE_ALLOW_EMAIL_AUTH=false
VITE_ALLOW_REGISTRATION=false
VITE_SHOW_LOCAL_DEMO=true
VITE_DEMO_ROLES=cr,teacher,admin
VITE_DEPLOYMENT_MODE=controlled-demo
```

`VITE_DEMO_ROLES=cr,teacher,admin` is the important hybrid setting:

- `cr` = Class Representative preview
- `teacher` = Teacher preview
- `admin` = DoAA/DoSAA preview
- `student` is intentionally absent, so there is **no student demo button**
- `society_rep` is absent, so there is **no Society Representative preview**

This hides OTP, magic link, forgot password and create account flows in the deployed UI. The password sign-in stays visible for real student accounts. Staff preview buttons stay available for presentation-only exploration, and their changes remain in that browser.

## 4. Smoke test

1. Open the Worker URL.
2. Confirm the controlled-demo banner is visible.
3. Confirm the sign-in page shows **Staff preview roles** with CR, Teacher and DoAA/DoSAA buttons only.
4. Confirm there is no student preview button and no Society Representative preview button.
5. Try **Create account** / email-code tabs — they should not be visible.
6. Sign in with a real student account.
7. Confirm the student cannot see **Messages**, **Classes** or **Manage**.
8. Confirm room cards and room details do not show “Updated” / “Last updated”.
9. Sign out, then enter each staff preview from the sign-in page:
   - CR: **Messages** visible, **Classes** hidden.
   - Teacher: **Messages** visible, **Classes** hidden.
   - DoAA/DoSAA: **Classes** visible, **Timetable** hidden, **Manage** available.
10. In DoAA/DoSAA preview, open **Classes** and add a class using building, room number and floor number.
11. Open the site in a separate browser/profile with the real student account and confirm the added class is **not** present. This proves staff demo changes are browser-local.
12. In the staff preview browser, make a room status change and confirm the same change is absent in the student browser.
13. Open the browser console — there should be no `localhost:8000` errors.
14. Check `/health` on the Render backend URL returns `{ "status": "ok" }`.

## 5. Notes and limits

- Only real student accounts write to the shared database, and student access is read-only for room status.
- Staff previews use browser-local data; their changes are never shared with students.
- Public registration stays disabled.
- OTP, magic-link and reset-password endpoints return `503`.
- No `dev_code` or `dev_token` is returned because `ALLOW_DEV_AUTH=false`.
- Rate limiting is enabled in production at 20 auth attempts/minute/IP.
- No official email sender or official staff/student email accounts are used.
- For a real campus launch you would still need verified institutional accounts, a controlled admin bootstrap process and a shared staff data model.
