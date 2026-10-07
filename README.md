# LearnAfrica Lite

A learning management system (LMS) built for African learners — courses, lessons,
quizzes, certificates, payments, payouts, live sessions, and a real-time community.

- **Frontend:** React 19 + Vite + Tailwind CSS v4 → deployed on **Vercel**
- **Backend:** Flask + Flask-SocketIO + JWT → deployed on **Render**
- **Database:** **Supabase Postgres** (production) / SQLite (local dev) — auto-detected
- **File storage:** **Supabase Storage** (thumbnails, avatars, resources, videos)
- **Payments:** **Paystack** (Ghana MoMo, cards, GHIPSS) with a mock mode for local dev
- **Email OTP:** **SendPulse** (optional signup verification)

> This is the single, complete README. It replaces every other README/guide file in
> the repo — see [Cleaning up the old READMEs](#cleaning-up-the-old-readmes) for the
> list of files you can delete once you have this one in place.

---

## Table of contents

1. [What this app does](#what-this-app-does)
2. [Tech stack](#tech-stack)
3. [Repository layout](#repository-layout)
4. [Run it locally (step by step)](#run-it-locally-step-by-step)
5. [Default admin login](#default-admin-login)
6. [Environment variables reference](#environment-variables-reference)
7. [Production setup — part 1: Supabase](#production-setup--part-1-supabase)
8. [Production setup — part 2: SendPulse (email OTP)](#production-setup--part-2-sendpulse-email-otp)
9. [Production setup — part 3: Paystack (payments)](#production-setup--part-3-paystack-payments)
10. [Deploy the backend to Render](#deploy-the-backend-to-render)
11. [Deploy the frontend to Vercel](#deploy-the-frontend-to-vercel)
12. [Turning features on in the admin panel](#turning-features-on-in-the-admin-panel)
13. [Database backup & restore](#database-backup--restore)
14. [Security notes](#security-notes)
15. [Troubleshooting](#troubleshooting)
16. [Cleaning up the old READMEs](#cleaning-up-the-old-readmes)

---

## What this app does

- **Courses** made of sections and lessons. A lesson is one of: **video**, **text**,
  **quiz**, or a **custom React page**.
- **Enrolment** — free courses enrol instantly; paid courses go through Paystack.
- **Progress tracking** and a student dashboard.
- **Quizzes** with a pass score; a course's final exam can issue a **certificate**.
  The instructor decides, per quiz, how many **attempts** a student gets (0 = unlimited).
- **Certificates** — verifiable, downloadable, per course.
- **Instructor tools** — create/edit courses with a curriculum builder, upload
  resources and videos, view analytics, manage coupons, host live sessions.
- **Coupons** — percentage or fixed-amount discount codes, with optional usage limits.
- **Live sessions** — instructors schedule Zoom/Meet sessions; students RSVP.
- **Custom lesson pages** — pre-built React components (e.g. interactive C++ lessons,
  "Course Welcome", "Learning Roadmap", "How to Study") an instructor can drop into
  any course. See `frontend/src/components/customLessons/`.
- **Search & filters** — by title, description, category, instructor, tag, course code.
- **Community chat** over WebSockets, plus per-lesson discussion boards.
- **Email OTP verification** (optional) via SendPulse, toggled from the admin panel.
- **Payments & payouts** — revenue split between platform and instructor, with manual
  and automatic payout flows.
- **Database backup & restore** from the admin panel (JSON export/import).
- **Dark and light themes**, responsive on mobile/tablet/desktop.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, React Router v6, Socket.IO client, Recharts, Radix UI, lucide-react |
| Backend | Python 3.11, Flask 3.1, Flask-SocketIO 5.x, Flask-CORS, PyJWT, Werkzeug, Eventlet |
| Database driver | psycopg2-binary (Postgres), built-in sqlite3 (dev) |
| Production server | gunicorn with the **eventlet** worker (see the pin warning below) |
| Database | Supabase Postgres (prod) / SQLite (dev) |
| File storage | Supabase Storage |
| Payments | Paystack |
| Email | SendPulse |

> ⚠ **Do not upgrade gunicorn past 23.x.** gunicorn 26 removed the built-in eventlet
> worker (`--worker-class eventlet`), which is exactly what `render.yaml` and the
> Procfile start the app with. Migrating off eventlet (to gevent or a threaded
> worker) is a separate project — do that first if you ever want a newer gunicorn.

---

## Repository layout

```
learnafrica-lite/
├── backend/                          # Flask API (deploys to Render)
│   ├── app/
│   │   ├── __init__.py               # Exports create_app
│   │   ├── main.py                   # All routes + business logic (large)
│   │   ├── database.py               # Postgres/SQLite wrapper, TABLES, MIGRATIONS, init_db()
│   │   ├── crud.py                   # Seeding: admin, demo courses, instructor guide
│   │   ├── models.py                 # Domain logic (scoring, certificates)
│   │   ├── payments.py               # Payment abstraction (Paystack + mock)
│   │   ├── schema.py                 # Field validation
│   │   ├── security.py               # JWT auth + role decorators
│   │   └── sanitize.py               # Server-side HTML sanitising
│   ├── instance/                     # Local SQLite DB + uploads (gitignored, dev only)
│   ├── wsgi.py                       # Production entry (gunicorn imports this)
│   ├── run.py                        # Development entry (python run.py)
│   ├── requirements.txt
│   ├── render.yaml                   # Render blueprint
│   ├── Procfile                      # Alternate start command
│   ├── env.example                   # Local env template → copy to .env
│   └── test_sendpulse.py             # Standalone SendPulse credential tester
│
├── frontend/                         # React SPA (deploys to Vercel)
│   ├── src/
│   │   ├── main.jsx                  # Entry
│   │   ├── App.jsx                   # Routes + route guards
│   │   ├── index.css                 # Tailwind + global styles
│   │   ├── components/
│   │   │   ├── common/               # Button, Card, Modal, RichTextEditor, TimePicker…
│   │   │   ├── course/               # CourseCard, filters…
│   │   │   ├── customLessons/        # Custom Page lessons + registry.js
│   │   │   ├── dashboard/            # Dashboard widgets
│   │   │   ├── layout/               # Navbar, Footer, ProfileDropdown, drawers…
│   │   │   ├── lesson/               # Discussion board, lesson sidebar…
│   │   │   └── quiz/                 # Quiz question renderer
│   │   ├── context/                  # AuthContext (JWT + socket), ThemeContext
│   │   ├── layouts/                  # Main, Dashboard, Instructor, Auth layouts
│   │   ├── lib/                      # api.js, money.js, sanitizeHtml.js, payoutDetails.js…
│   │   └── pages/
│   │       ├── Admin/                # AdminPage.jsx (dashboard, settings, user mgmt)
│   │       ├── Auth/                 # Login, Signup, ForgotPassword, EmailVerification, InstructorOnboarding
│   │       ├── Certificate/          # CertificatePage.jsx
│   │       ├── Courses/              # CoursesPage.jsx, CourseDetailPage.jsx
│   │       ├── Dashboard/            # StudentDashboard.jsx
│   │       ├── Instructor/           # Create/Edit course, CurriculumSection, Analytics, Coupons, Preview
│   │       ├── Landing/              # LandingPage.jsx
│   │       ├── Leaderboard/          # LeaderboardPage.jsx
│   │       ├── Lessons/              # LessonPage.jsx
│   │       ├── Payment/              # PaymentPage.jsx, PaymentReturnPage.jsx
│   │       ├── Profile/              # ProfilePage.jsx
│   │       ├── Quiz/                 # QuizPage.jsx, QuizResultsPage.jsx
│   │       ├── Receipts/             # ReceiptsPage.jsx
│   │       └── Settings/             # SettingsPage.jsx
│   ├── public/                       # Static assets (logos, hero images)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js                # Build config + dev proxy (/api, /socket.io, /uploads)
│   └── vercel.json                   # SPA rewrites + asset caching
│
├── README.md                         # ← this file
└── .gitignore
```

---

## Run it locally (step by step)

No cloud accounts are needed to run the app locally. Local dev uses **SQLite** and
**mock payments**, so you can click through the whole product offline.

### Prerequisites

| Tool | Version | Check |
|---|---|---|
| Python | 3.11+ | `python3 --version` |
| Node.js | 18+ (20+ recommended) | `node --version` |
| npm | bundled with Node | `npm --version` |
| Git | any | `git --version` |

### Step 1 — Get the code

```bash
git clone https://github.com/kotoorich/learnafrica-lite.git
cd learnafrica-lite
```

You should see `backend/` and `frontend/` side by side.

### Step 2 — Backend: create a virtual environment

```bash
cd backend

python3 -m venv venv
source venv/bin/activate          # macOS / Linux
# venv\Scripts\activate           # Windows (Command Prompt)
# venv\Scripts\Activate.ps1       # Windows (PowerShell)

pip install -r requirements.txt
```

### Step 3 — Backend: create `backend/.env`

```bash
cp env.example .env
```

Now open `backend/.env` and set at least the secrets. For local dev you can leave
the database and Paystack blank — the app falls back to SQLite and mock payments.

```env
# Required locally (any random strings are fine for dev)
SECRET_KEY=change-me-to-a-long-random-string

# Comma-separated list of allowed frontend origins
ALLOWED_ORIGINS=http://localhost:5173

# Leave EVERYTHING below blank for local development:
PAYSTACK_SECRET_KEY=
DATABASE_URL=
SENDPULSE_CLIENT_ID=
SENDPULSE_CLIENT_SECRET=
SENDPULSE_SENDER_EMAIL=
```

> **How the database is chosen:** if `DATABASE_URL` starts with `postgres`, the app
> uses Postgres. If it is empty, the app uses a SQLite file at
> `backend/instance/learnafrica.db`. Nothing else to configure.
>
> **How payments are chosen:** if `PAYSTACK_SECRET_KEY` is empty, the app uses mock
> mode (every purchase "succeeds" for free) — but only when `FLASK_ENV` is *not*
> `production`. In production the app **refuses to start** without a Paystack key,
> so a missing key can never silently give away free courses.

### Step 4 — Backend: run it

```bash
python run.py
```

On first run the backend creates the SQLite file, builds every table, runs
migrations, and seeds the admin account, 3 demo courses, and the instructor guide.
You will see:

```
============================================================
🚀 LearnAfrica Lite  →  http://localhost:5000
============================================================
📖 API Docs: http://localhost:5000/api/health
============================================================
✅ Database ready
✅ Default admin created: admin@learnafrica.com
✅ Seeded 3 demo courses with sections and lessons
```

Leave this terminal running. Health check: <http://localhost:5000/api/health>.

### Step 5 — Frontend: install and configure

Open a **second terminal**:

```bash
cd frontend
npm install

# Create the local env file
echo "VITE_API_URL=http://localhost:5000" > .env.local
```

`VITE_API_URL` tells the app where the backend is. Vite also *proxies*
`/api`, `/socket.io`, and `/uploads` to this URL (see `vite.config.js`), so the
value can be either `http://localhost:5000` or left empty — both work locally.

### Step 6 — Frontend: run it

```bash
npm run dev
```

Vite prints the local URL, normally <http://localhost:5173>.

### Step 7 — Log in

Open <http://localhost:5173> and sign in with the default admin (below). You
should already see the 3 seeded demo courses.

### Daily workflow (after first-time setup)

```bash
# Terminal 1
cd backend && source venv/bin/activate && python run.py

# Terminal 2
cd frontend && npm run dev
```

**Reset the local database** (fresh seeds, deletes all local data):

```bash
rm backend/instance/learnafrica.db
python backend/run.py
```

**Inspect the local DB** (optional):

```bash
sqlite3 backend/instance/learnafrica.db
.tables
SELECT id, name, email, role FROM users;
.exit
```

**Build the frontend for production locally** (sanity check):

```bash
cd frontend && npm run build      # outputs frontend/dist/
```

---

## Default admin login

| Environment | Email | Password | How it is set |
|---|---|---|---|
| Local | `admin@learnafrica.com` | `Admin@LearnAfrica2024!` | Built-in dev defaults |
| Production | you choose | you choose | `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars |

The admin account is created on first startup only if no admin exists. Changing
`ADMIN_PASSWORD` later does **not** overwrite an existing password.

**Reset a lost admin password:** update `ADMIN_PASSWORD` in the environment, delete
the admin row from the database (`DELETE FROM users WHERE email='admin@learnafrica.com';`
— in the Supabase SQL Editor), then restart the service. The admin is recreated
with the new password.

---

## Environment variables reference

### Backend

| Variable | Required | Local default | Description |
|---|---|---|---|
| `SECRET_KEY` | ✅ prod | dev fallback | Flask + JWT signing secret. In production the app **refuses to start** without it. |
| `JWT_SECRET` | optional | = `SECRET_KEY` | Override if you want a different token signing key. |
| `JWT_EXPIRATION_HOURS` | optional | `24` | Login token lifetime in hours. |
| `FLASK_ENV` | ✅ prod | unset | Set to `production` on Render. Enables the startup secret/payment checks. |
| `ALLOWED_ORIGINS` | ✅ prod | localhost list | Comma-separated frontend origins allowed by CORS (your Vercel URL). |
| `ADMIN_EMAIL` | ✅ prod | `admin@learnafrica.com` | Seeded admin email. |
| `ADMIN_PASSWORD` | ✅ prod | `Admin@LearnAfrica2024!` | Seeded admin password. |
| `DATABASE_URL` | ✅ prod | unset → SQLite | Supabase Postgres connection string. |
| `DATABASE_PATH` | optional | `backend/instance/learnafrica.db` | SQLite file location (dev). |
| `PASS_MIN_LENGTH` | optional | `8` | Minimum signup password length. |
| `QUIZ_PASS_SCORE` | optional | `70` | Default quiz pass percentage. |
| `MAX_CONTENT_LENGTH` | optional | `100 MB` | Max request body size (bytes). |
| `SUPABASE_URL` | ✅ prod | unset | Supabase project URL (file uploads). |
| `SUPABASE_SERVICE_KEY` | ✅ prod | unset | Supabase `service_role` key (server-side only). |
| `SUPABASE_STORAGE_BUCKET` | ✅ prod | `learnafrica-uploads` | Bucket name for uploads. |
| `PAYSTACK_SECRET_KEY` | ✅ prod | unset → mock (dev) | Paystack secret key. Required in production. |
| `PAYSTACK_CALLBACK_URL` | with Paystack | unset | Where Paystack returns the user, e.g. `https://your-site.vercel.app/payment/return`. |
| `SENDPULSE_CLIENT_ID` | optional | unset | SendPulse API ID (email OTP). |
| `SENDPULSE_CLIENT_SECRET` | optional | unset | SendPulse API secret. |
| `SENDPULSE_SENDER_EMAIL` | optional | unset | A sender address verified in SendPulse. |
| `SENDPULSE_SENDER_NAME` | optional | `LearnAfrica` | Display name on OTP emails. |
| `FORCE_SEED_GUIDE` | optional | unset | Set to `1` to re-seed the instructor guide. |
| `PORT` | set by host | `5000` | Port the server binds to (Render sets this). |

### Frontend

| Variable | Required | Local | Production | Description |
|---|---|---|---|---|
| `VITE_API_URL` | ✅ prod | `http://localhost:5000` | your Render URL | Backend base URL. |

> Supabase is called from the **backend only**, so the frontend does **not** need
> `VITE_SUPABASE_*` variables. Never expose the Supabase service key to the browser.

---

## Production setup — part 1: Supabase

Supabase provides **two** things for this app: the **Postgres database** and the
**file storage**. You can do both in one project.

### 1.1 Create the project

1. Sign up at <https://supabase.com> and click **New project**.
2. Choose an organisation, a name (e.g. `learnafrica`), and a strong **database
   password** (save it — you will need it for the connection string).
3. Pick the region closest to your users.
4. Wait 1–2 minutes for provisioning.

### 1.2 Get the database connection string

1. In the project, click **Connect** (top bar) or go to **Settings → Database**.
2. Copy the **Connection pooling** URI (recommended) or the direct connection URI.
   It looks like:

   ```
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```

3. This entire string is your `DATABASE_URL`.

> **Pooler vs direct:** Render holds one connection per request and closes it
> quickly, so the **pooler** URI (port `6543`) is the safer choice. Use the direct
> URI (port `5432`) only if you know you need it. Either works — just paste the
> whole string as `DATABASE_URL`.
>
> **SSL:** the Supabase URI already implies SSL. psycopg2 uses it automatically.
> If you build your own string, add `?sslmode=require`.

### 1.3 Create the storage bucket

1. Left sidebar → **Storage** → **New bucket**.
2. Name it `learnafrica-uploads` (lowercase, hyphenated). If you use a different
   name, set `SUPABASE_STORAGE_BUCKET` to match.
3. Toggle **Public bucket** ON — students must be able to download resources
   without logging in.
4. Save.

### 1.4 Add bucket policies (only if uploads fail)

The backend uses the `service_role` key, which normally bypasses policies. If
uploads still fail with a permissions error, add:

1. Storage → your bucket → **Policies** → **New policy** → **For full customization**.
2. Policy A: roles `service_role`, operation `INSERT`, `USING` expression `true`.
3. Policy B: roles `anon`, operation `SELECT`, `USING` expression `true`.

### 1.5 Get the API keys

1. **Settings → API**.
2. Copy:
   - **Project URL** → `SUPABASE_URL` (looks like `https://xxxxx.supabase.co`)
   - **`service_role` key** → `SUPABASE_SERVICE_KEY` (the long JWT — **not** `anon`)

⚠ The `service_role` key bypasses all row-level security. It goes on the backend
only — never in frontend code, never in a `VITE_` variable, never committed.

### 1.6 Verify storage later

After the backend is deployed, log in as admin and open:

```
https://your-backend.onrender.com/api/admin/storage-check
```

Expected:

```json
{
  "SUPABASE_URL": "set",
  "SUPABASE_SERVICE_KEY": "set",
  "SUPABASE_STORAGE_BUCKET": "learnafrica-uploads",
  "test_upload_ok": true,
  "test_upload_error": null
}
```

If `test_upload_ok` is `false`, the `test_upload_error` field names the cause
(wrong bucket, missing policy, wrong key).

### 1.7 Supabase free-tier limits

1 GB storage, 2 GB bandwidth/month, 50 MB per file by default. Plenty to start.
Check usage under **Reports**. Pro is ~$25/month for 100 GB storage.

---

## Production setup — part 2: SendPulse (email OTP)

Optional. Skip this if you want users to sign up without email verification
(the admin panel toggles it).

### 2.1 Create the account

1. Sign up at <https://sendpulse.com> (free plan is fine, no card needed).

### 2.2 Verify a sender address

1. **Settings → Senders** → add the address you will send from, e.g.
   `noreply@yourdomain.com`. (Gmail addresses won't work — you need a domain you
   control.)
2. SendPulse emails a confirmation link — click it.
3. Recommended: add the **SPF**, **DKIM**, and **DMARC** DNS records SendPulse
   shows you (`Settings → SMTP → DNS settings`) to keep mail out of spam.

### 2.3 Get the API credentials

1. Account menu → **Account Settings → API**.
2. Copy the **ID** → `SENDPULSE_CLIENT_ID` and **Secret** → `SENDPULSE_CLIENT_SECRET`.

### 2.4 Test the credentials (from the `backend` folder)

```bash
pip install python-dotenv requests
python test_sendpulse.py                    # checks the keys only
python test_sendpulse.py you@example.com    # sends a real test email
```

### 2.5 Turn it on

Set the four `SENDPULSE_*` variables on Render, redeploy, then enable it in the
admin panel (see [Turning features on](#turning-features-on-in-the-admin-panel)).
Codes are 6 digits, expire in **15 minutes**, are stored hashed, and the send/
verify endpoints are rate-limited.

> **Graceful fallback:** if OTP mode is on but SendPulse is misconfigured, signup
> falls back to logging the user in with a warning in the logs, so nobody gets
> locked out. Test before relying on it in production.

---

## Production setup — part 3: Paystack (payments)

Three modes: **mock** (default, free, dev only), **test** (real account, test
keys, no real money), **live** (real money, needs KYC).

### Mode 1 — Mock (default)

Leave `PAYSTACK_SECRET_KEY` unset. Purchases appear to succeed and enrol the
student, with no real transaction. Works only outside production.

### Mode 2 — Test

1. Sign up at <https://dashboard.paystack.com/#/signup> (Ghana details for GHS).
2. Top-right toggle → **TEST**.
3. **Settings → API Keys & Webhooks** → copy the **Test Secret Key** (`sk_test_…`).
4. Set on the backend:
   ```env
   PAYSTACK_SECRET_KEY=sk_test_your_test_key
   PAYSTACK_CALLBACK_URL=http://localhost:5173/payment/return
   ```
5. Buy a paid course with Paystack's test card:
   - Number `4084 0840 8408 4081`, expiry any future date, CVV `408`, PIN `0000`, OTP `123456`.
   - Test Mobile Money: any Ghana number, e.g. `0244 000 000`.

### Mode 3 — Live

1. Complete **KYC** (Settings → Compliance): Ghana Card/passport, bank details,
   proof of address. Approval takes 1–3 business days.
2. Toggle to **LIVE**, copy the **Live Secret Key** (`sk_live_…`).
3. Set `PAYSTACK_SECRET_KEY` (live) and the production `PAYSTACK_CALLBACK_URL`
   on Render — **not** in a committed file. Redeploy.
4. Test with a small real transaction and confirm enrolment.

> Never mix test and live keys. `sk_test_` never moves money; `sk_live_` does.
> Keep the webhook URL configured in the Paystack dashboard pointing at
> `https://your-backend.onrender.com/api/payments/paystack/webhook`.

### Payouts to instructors

Payments are split by a configurable revenue share (default 50/50, editable by
the admin). Admin-owned courses pay 100% to the platform. Instructor earnings are
tracked and settled by the admin from the Admin Panel → Payouts.

---

## Deploy the backend to Render

### 10.1 Push your code to GitHub

Make sure the latest code is on `main` of your GitHub repo.

### 10.2 Create the Web Service

1. <https://dashboard.render.com> → **New +** → **Web Service**.
2. Connect the GitHub repo.
3. Configure:

| Field | Value |
|---|---|
| **Name** | `learnafrica-backend` |
| **Region** | Frankfurt (closest to most of Africa) or Ohio |
| **Branch** | `main` |
| **Root Directory** | `backend` ← **most common mistake: must be set** |
| **Language / Runtime** | **Python 3** |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT wsgi:app` |
| **Health Check Path** | `/api/health` |
| **Instance Type** | Free to start; upgrade if cold starts bother you |

> `render.yaml` in `backend/` already encodes this service, so you can also deploy
> with **New + → Blueprint** and let Render read it.

### 10.3 Environment variables

Render dashboard → your service → **Environment** → add:

```
FLASK_ENV=production
PYTHON_VERSION=3.11.9

SECRET_KEY=<random 32+ chars>
JWT_SECRET=<random 32+ chars>
ADMIN_EMAIL=you@yourdomain.com
ADMIN_PASSWORD=<strong password>

DATABASE_URL=<Supabase connection string>
SUPABASE_URL=<https://xxxxx.supabase.co>
SUPABASE_SERVICE_KEY=<service_role JWT>
SUPABASE_STORAGE_BUCKET=learnafrica-uploads

PAYSTACK_SECRET_KEY=<sk_test_… or sk_live_…>
PAYSTACK_CALLBACK_URL=https://<your-site>.vercel.app/payment/return

ALLOWED_ORIGINS=https://<your-site>.vercel.app

# Optional (only if using email OTP)
SENDPULSE_CLIENT_ID=<…>
SENDPULSE_CLIENT_SECRET=<…>
SENDPULSE_SENDER_EMAIL=<verified sender>
SENDPULSE_SENDER_NAME=LearnAfrica
```

Generate strong secrets with:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 10.4 Deploy and read the logs

Click **Create Web Service**. Render installs dependencies, then boots gunicorn.
A healthy deploy ends with:

```
==> Build successful 🎉
==> Running 'gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT wsgi:app'
✅ Database ready
✅ startup: init_db
✅ Default admin created: admin@learnafrica.com
✅ startup: seed_demo_courses
✅ startup: seed_instructor_guide
==> Your service is live 🎉
```

Note the URL, e.g. `https://learnafrica-backend-xxxx.onrender.com`, and confirm
`https://…/api/health` returns `{"status":"ok", ...}`.

### 10.5 Keep the free instance awake (optional)

Render's free tier sleeps after 15 minutes idle and Supabase's free tier can pause.
Use a free uptime monitor (e.g. <https://uptimerobot.com>) to ping every 5 minutes:

```
https://your-backend.onrender.com/api/keepalive
```

`/api/keepalive` is a tiny endpoint that also touches the database to keep it warm.

---

## Deploy the frontend to Vercel

1. <https://vercel.com> → **Add New → Project** → import the GitHub repo.
2. Configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (auto-detected)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. **Environment Variables** (Production + Preview + Development):
   ```
   VITE_API_URL=https://your-backend.onrender.com
   ```
4. **Deploy.** Your app is live at `https://<project>.vercel.app`.

### Connect the two ends (important)

After the frontend URL is known, go back to Render and make sure these match it
exactly (redeploy after changing):

- `PAYSTACK_CALLBACK_URL=https://<project>.vercel.app/payment/return`
- `ALLOWED_ORIGINS=https://<project>.vercel.app`

If CORS or the payment redirect misbehaves, it is almost always one of these two
not matching the real Vercel URL.

---

## Turning features on in the admin panel

After you log in as admin:

1. **Signup verification** — Admin Panel → Settings → **Signup Verification** →
   choose **Email OTP verification (SendPulse)** (or No verification). Takes effect
   immediately, no redeploy.
2. **Revenue split / payouts** — Admin Panel → revenue and payouts sections.
3. **Instructor guide, footer, homepage content** — Admin Panel → content settings.
4. **Storage** — open `/api/admin/storage-check` (admin login) to confirm Supabase
   uploads work.

---

## Database backup & restore

Both live in **Admin Panel → Settings → Database Backup**.

### What gets backed up

A single JSON file with every row of every table: users, stats, courses, sections,
lessons, resources, quizzes + questions, enrolments, progress, time tracking,
transactions, payments, coupons, live sessions, reviews, discussions, notifications,
certificates, badges, platform settings, and more.

### What does NOT get backed up

**The uploaded files themselves.** The database stores their URLs; the files live
in Supabase Storage. To back up files, export them from Supabase → Storage. As long
as the bucket still holds them, restoring the DB keeps every link working.

### Export

1. Admin Panel → Settings → **Database Backup** → **Download full backup**.
2. You get `learnafrica-backup-YYYY-MM-DD.json` (signature `LEARNAFRICA_BACKUP_V1`).

### Restore (destructive)

1. **Take a fresh backup first**, as insurance.
2. Choose the backup file → **Continue with restore…**
3. Type `CONFIRM` and re-enter your admin password.
4. **Restore now (destructive).** Wait 10–60 s.
5. Log out and back in.

Under the hood the server saves a pre-restore snapshot to `/tmp` on the Render
container, deletes all rows in dependency order, reinserts from the backup, and
returns the inserted row count. The pre-restore snapshot is your safety net if a
restore fails partway.

> Backups contain bcrypt password hashes and personal data — treat them like
> credentials. Store at least two copies in separate places, and never commit them.

---

## Security notes

- **Never commit secrets.** `.env` files are gitignored. All secrets live in the
  Render/Vercel dashboards.
- **`SECRET_KEY` is mandatory in production.** The app refuses to start without it,
  so tokens can't be forged.
- **`PAYSTACK_SECRET_KEY` is mandatory in production.** The app refuses to run
  payments in mock mode in production, so free/forged purchases can't happen.
- **`service_role` key is backend-only.** Exposing it gives full database access.
  If it leaks, rotate it in Supabase → Settings → API and update Render.
- **Rotating `JWT_SECRET` / `SECRET_KEY`** logs everyone out — expected.
- Sessions are re-validated against the database on every request, so role changes,
  suspensions, and deletions take effect immediately (not after token expiry).
- Passwords are hashed (Werkzeug); lesson HTML is sanitised on both server and
  client; quiz answer keys are only returned after a pass, and each quiz enforces
  the instructor-set attempt limit.
- Rate limiting is in-process, which is safe **only because** Render runs a single
  worker (`-w 1`). If you ever scale to multiple workers or instances, move the
  limiter to a shared store (Redis).

---

## Troubleshooting

### Local

| Symptom | Cause / fix |
|---|---|
| `python: command not found` | Use `python3`. |
| `ModuleNotFoundError` on the backend | The venv isn't active — re-run the `source venv/bin/activate` step. |
| Port 5000 already in use (macOS) | AirPlay uses 5000. Run `PORT=5050 python run.py` and update `VITE_API_URL`. |
| Port 5173 in use | Vite auto-picks 5174/5175 — use the URL it prints. |
| Frontend "Network Error" / 500 | Backend not running, or `VITE_API_URL` doesn't match its port. |
| Database errors locally | Delete `backend/instance/learnafrica.db` and re-run to rebuild. |

### Backend deploy (Render)

| Symptom | Cause / fix |
|---|---|
| `Could not open requirements file` | Root Directory isn't `backend`. Set it and redeploy. |
| `SECRET_KEY ... refusing to start` | Set `SECRET_KEY`/`JWT_SECRET` and `FLASK_ENV=production`. |
| `PAYSTACK_SECRET_KEY is not set` in production | Add a Paystack key (test is fine) or the app won't boot in production. |
| `/api/health` returns `degraded` / 500 | Usually `DATABASE_URL` wrong or unreachable — recheck the copy/paste. |
| `relation "…" does not exist` | `init_db()` didn't finish. Check logs for `✅ startup: init_db`; redeploy. |
| GitHub 403 on clone | Render lost repo access → service Settings → Repository → Reconnect. |
| Cold-start slowness | Free tier sleeps; add an UptimeRobot ping to `/api/keepalive`. |

### Uploads (Supabase)

| Symptom | Cause / fix |
|---|---|
| `SUPABASE_URL/SERVICE_KEY/BUCKET env var not set` | Add the variables on Render and redeploy. |
| `new row violates row-level security policy` (403) | Add the INSERT policy (see [1.4](#14-add-bucket-policies-only-if-uploads-fail)). |
| `Invalid JWT` / `Unauthorized` (401) | Wrong/expired service key, or you used the anon key. Re-copy the `service_role` JWT. |
| Upload "succeeds" but downloads 401/403 | Bucket isn't **Public** — toggle it on. |
| `Local upload failed: No such file or directory` | A symptom: Supabase failed and the app tried the ephemeral Render disk. Hit `/api/admin/storage-check` for the real error. |

### Payments (Paystack)

| Symptom | Cause / fix |
|---|---|
| Paid course enrols without charging | You're in mock mode (`PAYSTACK_SECRET_KEY` unset) — fine in dev, impossible in production. |
| Student not enrolled after paying | `PAYSTACK_CALLBACK_URL` doesn't match your exact Vercel URL. Fix and redeploy. |
| Webhook not received | Set the webhook URL in Paystack to `https://your-backend/api/payments/paystack/webhook`. |

### Email OTP (SendPulse)

| Symptom | Cause / fix |
|---|---|
| Users log in without a code | OTP mode is off in the admin panel, or `SENDPULSE_*` vars are unset. |
| `SendPulse auth failed: 401` | Wrong ID/secret — re-copy from SendPulse → Account → API. |
| Email never arrives | Check spam, then the sender verification and SendPulse credit balance. |

### Frontend (Vercel)

| Symptom | Cause / fix |
|---|---|
| Blank page after a route | `vercel.json` rewrites handle this — confirm it's present. |
| API calls blocked (CORS) | `ALLOWED_ORIGINS` on Render must include the exact Vercel origin. |
| Stale content after deploy | Hard refresh (`Ctrl/Cmd+Shift+R`). |

---

## Cleaning up the old READMEs

Once this `README.md` is in place you can safely delete the scattered docs. They are
either superseded by this file or contain stale guidance.

**Safe to delete:**

```
README_1.md                       # older full README (Neon-based, duplicate)
READMES/README_ME.md              # another duplicate README
READMES/SENDPULSE_SETUP.md        # superseded by "part 2: SendPulse" above
READMES/SUPABASE_STORAGE_GUIDE.md # superseded by "part 1: Supabase" above
READMES/DATABASE_BACKUP_GUIDE.md  # superseded by "Database backup & restore" above
backend/SETUP_SENDPULSE.md        # duplicate SendPulse setup
frontend/README.md                # thin duplicate of the frontend section above
RUN_LOCALLY.md                    # stray notes + a code snippet (not a real guide)
```

…which leaves exactly one `README.md`. You may keep this repo's `AGENTS.md`
(agent/maintainer notes) — it isn't user documentation.

**Why this file is safe to be the only one:** it covers the stack, the layout, the
full local walkthrough, every environment variable, Supabase (database **and**
storage), SendPulse, Paystack, both deployments, admin toggles, backups, security,
and troubleshooting — all updated to your current code and your **Supabase** setup
(not Neon).

---

Built for African learners. 🌍
