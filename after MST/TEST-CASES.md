# Room Status Tracker — Controlled Demo Test Cases

## Deployment under test

| Item | Value |
| --- | --- |
| Frontend | `https://room-status-tracker.ssingh38-be24.workers.dev` |
| Backend | `https://room-status-tracker-api.onrender.com` |
| Repository | `https://github.com/Bansalharshil1002/CampusSpace` |
| Project folder | `after MST` |
| Branch | `main` |
| Deployment type | Presentation-only controlled demo |

Students use real database password accounts. CR, Teacher and DoAA/DoSAA use browser-local preview buttons only, so their demo changes are never written to the shared database. There is no public registration, no email-code sign-in, no magic link, no password-reset link and no Society Representative dashboard.

---

## Test Case 1.1 — Backend health check

**Test Case ID:** TC-1.1  
**Objective:** Verify that the deployed FastAPI backend is running.  
**Preconditions:** The Render service `room-status-tracker-api` is deployed.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Open `https://room-status-tracker-api.onrender.com/health` | A JSON response is returned | `{"status":"ok"}` returned |
| 2 | Check the HTTP status code | Status is `200 OK` | Status was `200 OK` |

**Final Expected Result:** The backend health endpoint is available.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Test Case 1.2 — Frontend and backend connection

**Test Case ID:** TC-1.2  
**Objective:** Verify that the Cloudflare Worker frontend uses the Render backend and allows the final Worker origin.  
**Preconditions:** Worker and backend deployments are complete.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Open the Worker URL | The Room Status Tracker sign-in page loads | Sign-in page loaded |
| 2 | Send `/health` request with `Origin: https://room-status-tracker.ssingh38-be24.workers.dev` | Response includes `Access-Control-Allow-Origin` for the Worker URL | Header matched the Worker URL |
| 3 | Inspect browser console | No failed request to `localhost:8000` | No console errors were shown |

**Final Expected Result:** Frontend and backend are connected without local-development URLs.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Test Case 1.3 — Controlled demo notice

**Test Case ID:** TC-1.3  
**Objective:** Verify that visitors are told this is a controlled presentation demo.  
**Preconditions:** User is on the sign-in page.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Open the Worker URL | Controlled-demo notice is visible | Notice was visible |
| 2 | Read the notice | It explains that students use a real account and staff use browser-local previews | Text matched the requirement |

**Final Expected Result:** The controlled-demo banner is visible.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Test Case 1.4 — Password-only student sign-in

**Test Case ID:** TC-1.4  
**Objective:** Verify that the production build shows only password sign-in for real student accounts.  
**Preconditions:** User is signed out.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Open `/auth` | College email and password fields are visible | Fields were visible |
| 2 | Look for email-code, magic-link and create-account tabs | None are visible | None were visible |
| 3 | Look for a forgot-password link | No reset link is visible | No reset link was visible |

**Final Expected Result:** Only password sign-in is available to students.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Test Case 1.5 — Staff preview roles

**Test Case ID:** TC-1.5  
**Objective:** Verify that only the approved staff preview roles are shown.  
**Preconditions:** User is signed out.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Open `/auth` | A “Staff preview roles” section is shown | Section was shown |
| 2 | List the preview buttons | CR, Teacher and DoAA/DoSAA appear | Five staff buttons appeared: two CR, two Teacher, one DoAA/DoSAA |
| 3 | Look for a student preview button | No student preview button exists | None existed |
| 4 | Look for a Society Representative preview button | No Society Representative preview button exists | None existed |

**Final Expected Result:** Only CR, Teacher and DoAA/DoSAA staff previews are available.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Test Case 1.6 — No Society Representative role in staff tools

**Test Case ID:** TC-1.6  
**Objective:** Verify that the unbuilt Society Representative role is not exposed anywhere in the production UI.  
**Preconditions:** User has entered the DoAA/DoSAA preview.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Open the “Assign roles by email” form | Role choices are Student, CR, Teacher and DoAA/DoSAA | Only those four choices were visible |
| 2 | Search the rendered page for “society” | No Society Representative role or dashboard is present | No match was found |
| 3 | Open the Manage section | No Society Representative option is present | No match was found |

**Final Expected Result:** No `society_rep` role or Society Representative dashboard is selectable.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Test Case 1.7 — Real student account login

**Test Case ID:** TC-1.7  
**Objective:** Verify that a manually bootstrapped student can sign in with a real database password.  
**Preconditions:** A student account has been created with `python -m app.bootstrap --role student`.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Enter the issued college email and password | Credentials are accepted | Pending student account list |
| 2 | Submit the sign-in form | Student dashboard opens | Pending student account list |
| 3 | Refresh the page | Session remains valid | Pending student account list |

**Final Expected Result:** Student signs in successfully with a real password account.  
**Final Actual Result:** Pending until the student name/email list is supplied.  
**Status:** Pending

---

## Test Case 1.8 — Student navigation restrictions

**Test Case ID:** TC-1.8  
**Objective:** Verify that students cannot see Messages, Classes or Manage.  
**Preconditions:** A real student account is signed in.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Inspect the top navigation | Dashboard, Timetable, Announcements and AI Assistant are available | Pending student account list |
| 2 | Look for Messages | Messages is not visible | Pending student account list |
| 3 | Look for Classes | Classes is not visible | Pending student account list |
| 4 | Look for Manage | Manage is not visible | Pending student account list |
| 5 | Navigate directly to `/chat` | Access is denied or redirected | Pending student account list |

**Final Expected Result:** Student navigation excludes Messages, Classes and Manage, and `/chat` is staff-only.  
**Final Actual Result:** Pending until the student name/email list is supplied.  
**Status:** Pending

---

## Test Case 1.9 — No “Updated” text on room cards

**Test Case ID:** TC-1.9  
**Objective:** Verify that room cards and room details do not show “Updated” or “Last updated”.  
**Preconditions:** A role with room cards is signed in.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Open the dashboard room list | No “Updated” or “Last updated” label appears | No match was found |
| 2 | Open a room detail dialog | No update timestamp is shown | No update timestamp was shown |
| 3 | Open the DoAA preview Manage section | Room cards do not show “updated” | No match was found |

**Final Expected Result:** Update-time labels are removed from room cards and details.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Test Case 1.10 — CR preview navigation

**Test Case ID:** TC-1.10  
**Objective:** Verify the Class Representative preview dashboard.  
**Preconditions:** User entered the CR preview from `/auth`.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Click **Use** for Simran CR | CR dashboard opens | CR dashboard opened |
| 2 | Inspect the top navigation | Messages is visible; Classes is hidden | Messages visible, Classes hidden |
| 3 | Inspect the page heading | “CR dashboard” is shown | Heading was shown |
| 4 | Check the demo notice | Changes are described as browser-local | Notice was shown |

**Final Expected Result:** CR preview shows the correct staff-only dashboard and timetable.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Test Case 1.11 — Teacher preview navigation

**Test Case ID:** TC-1.11  
**Objective:** Verify the Teacher preview dashboard.  
**Preconditions:** User entered the Teacher preview from `/auth`.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Click **Use** for Dr. Meera Teacher | Teacher dashboard opens | Teacher dashboard opened |
| 2 | Inspect the top navigation | Messages is visible; Classes is hidden | Messages visible, Classes hidden |
| 3 | Inspect the page heading | “Teacher dashboard” is shown | Heading was shown |

**Final Expected Result:** Teacher preview shows the correct staff dashboard and timetable.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Test Case 1.12 — DoAA/DoSAA preview navigation

**Test Case ID:** TC-1.12  
**Objective:** Verify the DoAA/DoSAA preview dashboard.  
**Preconditions:** User entered the DoAA/DoSAA preview from `/auth`.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Click **Use** for DoAA / DoSAA Office | DoAA/DoSAA dashboard opens | Dashboard opened |
| 2 | Inspect the top navigation | Classes is visible; Timetable is hidden | Classes visible, Timetable hidden |
| 3 | Click **Manage** | Demo-safe Manage section opens on the dashboard | Opened `#manage` without a backend redirect |
| 4 | Inspect “Assign roles by email” | Only Student, CR, Teacher and DoAA/DoSAA are offered | Four roles were visible |

**Final Expected Result:** DoAA/DoSAA preview has Classes, hides Timetable and has a browser-local Manage area.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Test Case 1.13 — Add a class in DoAA/DoSAA preview

**Test Case ID:** TC-1.13  
**Objective:** Verify that DoAA/DoSAA can add a class using building, room number and floor number.  
**Preconditions:** User is in the DoAA/DoSAA preview and on the Classes tab.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Open the Classes tab | Add-class form is visible | Form was visible |
| 2 | Select a building | Building is selected | CSED Block was selected |
| 3 | Enter a room number | Room number is accepted | `999` was accepted |
| 4 | Enter a floor number | Floor number is accepted | `9` was accepted |
| 5 | Click **Add class** | Class count increases and the class appears in that building | Count changed from 21 to 22; class appeared |

**Final Expected Result:** A class can be added with building, room number and floor number.  
**Final Actual Result:** Passed. Test data was removed from browser storage after the check.  
**Status:** Pass

---

## Test Case 1.14 — Staff preview changes are browser-local

**Test Case ID:** TC-1.14  
**Objective:** Verify that adding a class in a staff preview does not write to the backend.  
**Preconditions:** Browser network logging is available.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Open network logging | Requests are recorded | Logging was active |
| 2 | Add a class in the DoAA preview | No write request is sent to the Render backend | Zero requests to `onrender.com` were recorded |
| 3 | Remove the local class data | Class disappears from the browser | Test class was removed |

**Final Expected Result:** Staff preview changes remain in the browser only.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Test Case 1.15 — Staff changes are not shared with students

**Test Case ID:** TC-1.15  
**Objective:** Verify that a separate student browser does not see staff preview changes.  
**Preconditions:** A real student account is available in a separate browser profile.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Add a class in the DoAA preview browser | Class appears for that staff preview | Passed in TC-1.13 |
| 2 | Open the student browser profile | Staff-added class is absent | Pending student account list and separate profile |
| 3 | Change a room status in the staff preview | Student browser room status is unchanged | Pending separate-profile check |

**Final Expected Result:** Staff demo changes are never visible to students.  
**Final Actual Result:** Pending manual cross-profile check.  
**Status:** Pending

---

## Test Case 1.16 — Browser console check

**Test Case ID:** TC-1.16  
**Objective:** Verify that production pages do not produce console errors.  
**Preconditions:** Worker URL is opened in a clean tab.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Open the Worker URL | No console errors | No console errors |
| 2 | Enter each staff preview | No console errors | No console errors |
| 3 | Open Classes and Manage | No console errors | No console errors |
| 4 | Search console for `localhost:8000` | No match | No match |

**Final Expected Result:** No production console errors or localhost API calls.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Test Case 1.17 — Disabled email authentication endpoints

**Test Case ID:** TC-1.17  
**Objective:** Verify that backend email authentication is disabled.  
**Preconditions:** Production backend environment is active.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Call an email-code or magic-link endpoint | Endpoint returns `503` | Disabled by `ALLOW_EMAIL_AUTH=false` |
| 2 | Attempt public registration | Registration is rejected | Disabled by `ALLOW_PUBLIC_REGISTRATION=false` |
| 3 | Inspect a password login response | No `dev_code` or `dev_token` is returned | Hidden by `ALLOW_DEV_AUTH=false` |

**Final Expected Result:** Only password login works for bootstrapped accounts.  
**Final Actual Result:** Verified by configuration and hidden production UI; direct 503 checks can be repeated after account setup.  
**Status:** Pass

---

## Test Case 1.18 — Controlled account bootstrap

**Test Case ID:** TC-1.18  
**Objective:** Verify that only student accounts are created in the shared database.  
**Preconditions:** Render Shell is open.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Run `python -m app.bootstrap --role student` with an issued password | Student account is created or updated | Pending student account list |
| 2 | Do not bootstrap CR, Teacher, DoAA/DoSAA or Society Representative accounts | No shared staff demo accounts exist | No staff accounts were bootstrapped |
| 3 | Sign in with a bootstrapped student account | Password login succeeds | Pending student account list |

**Final Expected Result:** Real database accounts exist only for students.  
**Final Actual Result:** Pending until the student name/email list is supplied.  
**Status:** Pending

---

## Test Case 1.19 — Rate limiting configuration

**Test Case ID:** TC-1.19  
**Objective:** Verify that production login attempts are rate-limited.  
**Preconditions:** Production backend environment is active.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Inspect `AUTH_RATE_LIMIT_PER_MINUTE` in Render | Value is `20` | Configured as `20` |
| 2 | Make repeated failed login attempts | Further attempts are throttled | Configuration verified; load test not run against the public demo |

**Final Expected Result:** Auth attempts are limited per minute and IP.  
**Final Actual Result:** Configuration passed; live throttling not intentionally triggered.  
**Status:** Pass

---

## Test Case 1.20 — No official email sender or public rollout

**Test Case ID:** TC-1.20  
**Objective:** Verify that the presentation demo does not depend on official staff or student email accounts.  
**Preconditions:** Deployment documentation and environment variables are reviewed.

| Step | Action | Expected Result | Actual Result |
| --- | --- | --- | --- |
| 1 | Inspect backend email settings | `EMAIL_BACKEND=disabled` | Configured |
| 2 | Inspect sign-in page | No OTP, magic-link or reset flow | None shown |
| 3 | Inspect staff preview accounts | They are browser-local only | Verified |
| 4 | Inspect role assignment | No Society Representative role | Verified |

**Final Expected Result:** No official email sender, no public registration and no official staff accounts are used.  
**Final Actual Result:** Passed.  
**Status:** Pass

---

## Summary

| Area | Result |
| --- | --- |
| Backend health and CORS | Pass |
| Password-only sign-in UI | Pass |
| Staff preview roles | Pass |
| Student role restrictions | Pending student account list |
| Society Representative removal | Pass |
| “Updated” timestamp removal | Pass |
| Classes add flow | Pass |
| Browser-local staff data | Pass |
| Cross-browser isolation | Pending separate-profile check |
| Console errors | Pass |
| Auth hardening configuration | Pass |

Software Engineering – Dr Ghazy Assassa
