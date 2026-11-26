# Controlled hybrid demo deployment

This deployment is a presentation demo, not a public campus rollout.

- **Students:** sign in with real database password accounts created by the project team.
- **CR / Teacher / DoAA/DoSAA:** use browser-local preview buttons on the sign-in page. Their changes stay in that browser and are never written to the shared database.
- **No official email accounts, no public registration, no OTP sign-in, and no magic links.**
- **Password reset uses a six-digit email code sent through Resend. Live delivery to student addresses requires a verified non-official sender domain; no such domain is available in this environment.**
- **No Society Representative dashboard or demo role** is included because that dashboard was not built.

## What is deployed

| Part | Platform | Notes |
| --- | --- | --- |
| Frontend | Cloudflare Workers | Built with `VITE_API_URL` pointing to the backend |
| Backend | Render Web Service | FastAPI, built from `backend/Dockerfile` |
| Database | Render Postgres | Managed PostgreSQL |
| Student login | Real database accounts | Password-only, manually bootstrapped |
| Staff preview roles | Browser-local only | CR, Teacher, DoAA/DoSAA; not saved to the database |
| Email | Resend | Six-digit password-reset codes only; email sign-in stays disabled |
| Signup | Disabled | Accounts are created manually with `app.bootstrap` |

### Current deployment status

- Frontend: `https://room-status-tracker.ssingh38-be24.workers.dev` (password-reset UI deployed).
- Backend: `https://room-status-tracker-api.onrender.com`, live on commit `322380d`.
- Render environment: `EMAIL_BACKEND=resend`, `RESEND_API_KEY` set, `ALLOW_PASSWORD_RESET=true`, `ALLOW_EMAIL_AUTH=false`, `ALLOW_DEV_AUTH=false`, `ALLOW_PUBLIC_REGISTRATION=false`.
- Sender: `EMAIL_FROM` is temporarily `Room Status Tracker <onboarding@resend.dev>`. Resend only permits this testing sender to deliver to the account owner, so **reset codes are not delivered to `@thapar.edu` recipients yet**. Replace it with a verified non-official domain before claiming the reset flow is live.

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
7. During setup, Render prompts for values marked `sync: false`:
   - `FRONTEND_URL` = the final Worker URL printed by Wrangler
   - `CORS_ORIGINS` = the same final Worker URL
   - `RESEND_API_KEY` = your Resend API key
   - `EMAIL_FROM` = a verified sender such as `Room Status Tracker <no-reply@your-verified-domain.com>`

   In the service **Environment** tab also confirm `ALLOW_PASSWORD_RESET=true`, `ALLOW_EMAIL_AUTH=false` and `EMAIL_BACKEND=resend`. `render.yaml` sets these during a Blueprint sync; if you deployed before the password-reset update, add them manually and click **Save, rebuild, and deploy**.

   For this deployment the Cloudflare account already has the `ssingh38-be24` workers.dev subdomain, so the Worker URL is `https://room-status-tracker.ssingh38-be24.workers.dev`. Use that URL for both values. If your account uses a different subdomain, update these values in the service’s **Environment** tab and click **Save, rebuild, and deploy**.
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
VITE_ALLOW_PASSWORD_RESET=true
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

This hides OTP sign-in, magic-link sign-in and create account flows in the deployed UI. The “Forgot password?” button stays visible for real student accounts and opens the email-code reset form. Staff preview buttons stay available for presentation-only exploration, and their changes remain in that browser.

## 4. Smoke test

1. Open the Worker URL.
2. Confirm the controlled-demo banner is visible.
3. Confirm the sign-in page shows **Staff preview roles** with CR, Teacher and DoAA/DoSAA buttons only.
4. Confirm there is no student preview button and no Society Representative preview button.
5. Try **Create account** / email-code sign-in tabs — they should not be visible.
6. Confirm **Forgot password?** is visible beside the password field.
7. Enter a real student email and click **Forgot password?**; confirm the generic success message appears and the reset form opens.
   - With the current testing sender, the response is generic but Resend rejects delivery to the student address. Steps 8–10 cannot be completed live until `EMAIL_FROM` uses a verified domain.
8. Read the six-digit code from the Resend email, enter it with a new password and matching confirm password, then submit.
9. Confirm the old password fails and the new password signs in successfully.
10. Confirm reusing the same code fails.
11. Sign in with a real student account.
12. Confirm the student cannot see **Messages**, **Classes** or **Manage**.
13. Confirm room cards and room details do not show “Updated” / “Last updated”.
14. Sign out, then enter each staff preview from the sign-in page:
   - CR: **Messages** visible, **Classes** hidden.
   - Teacher: **Messages** visible, **Classes** hidden.
   - DoAA/DoSAA: **Classes** visible, **Timetable** hidden, **Manage** available.
15. In DoAA/DoSAA preview, open **Classes** and add a class using building, room number and floor number.
16. Open the site in a separate browser/profile with the real student account and confirm the added class is **not** present. This proves staff demo changes are browser-local.
17. In the staff preview browser, make a room status change and confirm the same change is absent in the student browser.
18. Open the browser console — there should be no `localhost:8000` errors.
19. Check `/health` on the Render backend URL returns `{ "status": "ok" }`.

## 5. Notes and limits

- Only real student accounts write to the shared database, and student access is read-only for room status.
- Staff previews use browser-local data; their changes are never shared with students.
- Public registration stays disabled.
- OTP and magic-link sign-in endpoints return `503`.
- Password-reset endpoints are enabled only when `ALLOW_PASSWORD_RESET=true` and Resend is configured; otherwise they return `403` or `503`.
- Email delivery failures are logged but still return the same generic confirmation, so the endpoint cannot be used to enumerate accounts.
- Codes expire after 15 minutes, are hashed in the database and become single-use after a successful reset.
- To activate live reset delivery, add a non-official domain you control to Resend, add its DNS records, set `EMAIL_FROM` to an address on that verified domain, and redeploy the backend. `onboarding@resend.dev` is only for sending to the Resend account owner.
- No `dev_code` or `dev_token` is returned in production because `ALLOW_DEV_AUTH=false`.
- Rate limiting is enabled in production at 20 auth attempts/minute/IP.
- No official email sender or official staff/student email accounts are used.
- For a real campus launch you would still need verified institutional accounts, a controlled admin bootstrap process and a shared staff data model.
