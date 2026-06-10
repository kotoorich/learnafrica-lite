# LearnAfrica Lite — Learning Management System

A full-stack LMS for African learners with courses, quizzes, certificates, time tracking, payments, and payouts.

**Stack:**
- **Frontend:** React 19 + Vite 6 + Tailwind v4 (deploys to Vercel)
- **Backend:** Flask + Flask-SocketIO + JWT (deploys to Render)
- **Database:** Neon PostgreSQL (production) / SQLite (local development) — *same code, auto-detected*
- **File storage:** Supabase Storage (for video thumbnails, resources, avatars)
- **Payments:** Paystack-ready abstraction (currently in stub mode until you wire Paystack)

---

## Table of Contents

1. [Repository layout](#repository-layout)
2. [Local development — first time setup](#local-development--first-time-setup)
3. [Local development — daily workflow](#local-development--daily-workflow)
4. [Default credentials](#default-credentials)
5. [Deployment — Backend on Render](#deployment--backend-on-render)
6. [Deployment — Frontend on Vercel](#deployment--frontend-on-vercel)
7. [Environment variables reference](#environment-variables-reference)
8. [Database setup (Neon)](#database-setup-neon)
9. [File storage setup (Supabase)](#file-storage-setup-supabase)
10. [Activating Paystack later](#activating-paystack-later)
11. [Feature toggles & defaults](#feature-toggles--defaults)
12. [Troubleshooting](#troubleshooting)

---

## Repository layout

```
learnafrica-prod/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # All routes
│   │   ├── database.py          # DB connection, schema, migrations
│   │   ├── crud.py              # Seed data + helpers
│   │   ├── models.py            # Domain logic (scoring, certificates)
│   │   ├── payments.py          # Payment provider abstraction (Paystack-ready)
│   │   ├── schema.py            # Field validation
│   │   └── security.py          # JWT auth + role decorators
│   ├── instance/                # Local SQLite database (auto-created, gitignored)
│   ├── requirements.txt
│   ├── wsgi.py                  # Entrypoint
│   ├── run.py                   # Dev runner
│   ├── Procfile                 # For Render
│   └── render.yaml
└── frontend/
    ├── src/
    │   ├── App.jsx              # Routes
    │   ├── main.jsx
    │   ├── components/          # Reusable UI components
    │   │   └── common/
    │   │       ├── RichTextEditor.jsx    # Text-lesson editor
    │   │       ├── TimePicker.jsx        # Watch-style time input
    │   │       └── PaymentMethodForm.jsx # Momo / bank form
    │   ├── pages/
    │   │   ├── Landing/
    │   │   ├── Auth/
    │   │   ├── Courses/
    │   │   ├── Lessons/
    │   │   ├── Quiz/
    │   │   ├── Dashboard/
    │   │   ├── Instructor/
    │   │   ├── Admin/
    │   │   ├── Profile/
    │   │   └── Receipts/        # Transaction history page
    │   ├── context/             # Auth + Theme contexts
    │   ├── layouts/             # Page layouts
    │   └── lib/                 # Helpers (api, utils)
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── .env.example
```

---

## Local development — first time setup

### Prerequisites

- **Python 3.11+** (verify: `python3 --version`)
- **Node.js 18+** (verify: `node --version`)
- **Git**

### Step 1 — Clone

```bash
git clone <your-repo-url> learnafrica-prod
cd learnafrica-prod
```

### Step 2 — Backend setup

```bash
cd backend

# Create + activate a virtual environment
python3 -m venv venv
source venv/bin/activate   # macOS/Linux
# or on Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Step 3 — Backend `.env` for local dev

Create `backend/.env`:

```env
# Required
JWT_SECRET=any-random-string-here-just-for-local-dev
SECRET_KEY=another-random-string-for-local-dev
ADMIN_EMAIL=admin@learnafrica.com
ADMIN_PASSWORD=Admin@LearnAfrica2024!

# Optional — leave UNSET to use local SQLite (recommended for dev)
# DATABASE_URL=postgres://...

# Optional — file uploads (only set if you want to test uploads locally)
# SUPABASE_URL=https://yourproject.supabase.co
# SUPABASE_SERVICE_KEY=eyJ...
# SUPABASE_STORAGE_BUCKET=learnafrica-files

# Optional — password rules
PASS_MIN_LENGTH=8

# Optional — Paystack (leave UNSET for stub mode)
# PAYSTACK_SECRET_KEY=sk_test_xxx
```

> **Important:** Don't set `DATABASE_URL` locally unless you specifically want to point at a remote Postgres. With it unset, the backend automatically uses SQLite at `backend/instance/learnafrica.db`.

### Step 4 — Frontend setup

```bash
cd ../frontend
npm install
```

### Step 5 — Frontend `.env` for local dev

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

### Step 6 — Run both servers

In one terminal (backend):

```bash
cd backend
source venv/bin/activate
python wsgi.py
```

Backend runs at **http://localhost:5000**. On first run it:
- Creates `backend/instance/learnafrica.db` (SQLite)
- Runs all CREATE TABLE statements
- Runs all migrations (adds new columns to existing tables if needed)
- Seeds the default admin account
- Seeds demo courses
- Seeds the instructor guide

You'll see:
```
✅ Database ready
✅ Default admin created: admin@learnafrica.com
```

In another terminal (frontend):

```bash
cd frontend
npm run dev
```

Frontend runs at **http://localhost:5173**.

### Step 7 — Log in

Go to **http://localhost:5173/login** and sign in with:

- **Email:** `admin@learnafrica.com`
- **Password:** `Admin@LearnAfrica2024!`

---

## Local development — daily workflow

```bash
# Terminal 1 — backend
cd backend
source venv/bin/activate
python wsgi.py

# Terminal 2 — frontend
cd frontend
npm run dev
```

To clear the local database and start fresh:

```bash
rm backend/instance/learnafrica.db
python backend/wsgi.py   # creates a new one with fresh seeds
```

To inspect the local DB:

```bash
sqlite3 backend/instance/learnafrica.db

# Useful queries:
.tables
.schema transactions
.schema time_tracking
SELECT * FROM users;
SELECT id, title, min_time_seconds, enforce_min_time FROM courses;
.exit
```

---

## Default credentials

| Environment | Email | Password |
|---|---|---|
| **Local** | `admin@learnafrica.com` | `Admin@LearnAfrica2024!` |
| **Production** | Set via `ADMIN_EMAIL` env var | Set via `ADMIN_PASSWORD` env var |

You can change the local default by editing `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `backend/.env` before the first run. After the admin account is created, those env vars are only checked on every startup to ensure the admin user exists — they don't overwrite an existing password.

---

## Deployment — Backend on Render

### Step 1 — Create the database

See [Database setup (Neon)](#database-setup-neon) below. Copy your Neon connection string.

### Step 2 — Create a new Web Service on Render

1. Go to https://dashboard.render.com → **New +** → **Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Name:** `learnafrica-backend` (or whatever you prefer)
   - **Region:** Frankfurt (closest to most African users) or Oregon
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn --worker-class eventlet -w 1 wsgi:app`
   - **Plan:** Free or Starter ($7/mo for no sleep)

### Step 3 — Set environment variables

In the Render dashboard for your service → **Environment** → add these:

| Key | Value | Notes |
|---|---|---|
| `JWT_SECRET` | (random 32+ char string) | Use `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `SECRET_KEY` | (random 32+ char string) | Same as above |
| `ADMIN_EMAIL` | your admin email | |
| `ADMIN_PASSWORD` | strong password | |
| `DATABASE_URL` | from Neon dashboard | See [Database setup](#database-setup-neon) |
| `SUPABASE_URL` | from Supabase | If using file uploads |
| `SUPABASE_SERVICE_KEY` | from Supabase | If using file uploads |
| `SUPABASE_STORAGE_BUCKET` | `learnafrica-files` (or your bucket) | If using file uploads |
| `PASS_MIN_LENGTH` | `8` | Optional, default 8 |
| `PAYSTACK_SECRET_KEY` | (leave unset for now) | Set later when activating Paystack |

### Step 4 — Deploy

Click **Create Web Service**. Render will:
- Pull your code
- Install dependencies
- Start the server
- Run migrations (idempotent — safe to re-run on every deploy)
- Seed admin + demo data if not yet present

Your backend will be live at `https://learnafrica-backend.onrender.com` (or whatever Render assigns).

### Step 5 — Keep the free dyno warm (optional)

Render's free tier spins down after 15 min idle. To keep it always-on:

1. Sign up at https://uptimerobot.com (free)
2. Add a monitor: HTTP(s), URL = `https://your-backend.onrender.com/api/keepalive`, interval = 5 minutes

This also keeps Neon's free tier from auto-suspending.

---

## Deployment — Frontend on Vercel

### Step 1 — Push your repo to GitHub if you haven't

### Step 2 — Create a new project on Vercel

1. Go to https://vercel.com → **Add New** → **Project**
2. Import your GitHub repository
3. Configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (auto-detected)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

### Step 3 — Set environment variables

In Vercel project settings → **Environment Variables**:

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://your-backend.onrender.com` (your Render URL) |

Apply to: Production, Preview, Development.

### Step 4 — Deploy

Click **Deploy**. Vercel will build and serve your frontend.

Your app is live at `https://<your-project>.vercel.app`.

### Step 5 — Custom domain (optional)

In Vercel project → **Settings** → **Domains** → add your custom domain. Follow Vercel's DNS instructions.

---

## Environment variables reference

### Backend

| Variable | Required? | Local default | Production | Description |
|---|---|---|---|---|
| `JWT_SECRET` | ✅ Yes | any string | strong random | Signs JWT tokens |
| `SECRET_KEY` | ✅ Yes | any string | strong random | Flask session signing |
| `ADMIN_EMAIL` | ✅ Yes | `admin@learnafrica.com` | your choice | Seeded on first run |
| `ADMIN_PASSWORD` | ✅ Yes | `Admin@LearnAfrica2024!` | strong | Seeded on first run |
| `DATABASE_URL` | ❌ No (local) ✅ Yes (prod) | UNSET → uses SQLite | Neon Postgres URL | DB connection |
| `DATABASE_PATH` | ❌ No | `instance/learnafrica.db` | n/a | SQLite file location |
| `PASS_MIN_LENGTH` | ❌ No | `8` | `8` | Minimum password length |
| `SUPABASE_URL` | ❌ No | unset | set if using uploads | File storage |
| `SUPABASE_SERVICE_KEY` | ❌ No | unset | set if using uploads | File storage auth |
| `SUPABASE_STORAGE_BUCKET` | ❌ No | unset | bucket name | File storage bucket |
| `PAYSTACK_SECRET_KEY` | ❌ No | unset | unset (until ready) | Activates real Paystack |
| `FORCE_SEED_GUIDE` | ❌ No | unset | unset | Force re-seed instructor guide |

### Frontend

| Variable | Required? | Local | Production | Description |
|---|---|---|---|---|
| `VITE_API_URL` | ✅ Yes | `http://localhost:5000` | `https://your-backend.onrender.com` | Backend URL |

---

## Database setup (Neon)

### Create a Neon database

1. Sign up at https://neon.tech (free tier is generous)
2. Create a new project
3. Once created, go to **Connection Details** → copy the connection string. It looks like:
   ```
   postgresql://user:pass@ep-xyz-123.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Paste this into Render as `DATABASE_URL`

### Migrations — automatic

You **do not** need to run migrations manually. The backend's `init_db()` runs every time the server starts. It:

- Creates any missing tables (`IF NOT EXISTS`)
- Adds any missing columns to existing tables (`ADD COLUMN IF NOT EXISTS`)
- Idempotent: safe to re-run on every deploy

### What gets created

Tables: `users`, `courses`, `lessons`, `lesson_resources`, `section_lessons`, `curriculum_sections`, `course_tags`, `course_outcomes`, `course_perks`, `course_resources`, `quizzes`, `quiz_questions`, `enrollments`, `progress`, `certificates`, `reviews`, `discussions`, `notifications`, `instructor_applications`, `instructor_guide`, `platform_config`, `payments`, **`transactions`** (NEW), **`time_tracking`** (NEW).

New columns added by recent migrations:
- `users.payment_method`, `users.payment_details`, `users.payment_country`
- `courses.min_time_seconds`, `courses.enforce_min_time`
- `lessons.text_content`
- `quizzes.duration_seconds`

---

## File storage setup (Supabase)

Used for video thumbnails, lesson resources, user avatars, course thumbnails.

### Step 1 — Create Supabase project

1. https://supabase.com → New Project (free tier)
2. Note your project URL

### Step 2 — Create a storage bucket

1. In Supabase dashboard → **Storage** → **New bucket**
2. Name: `learnafrica-files`
3. **Public bucket: YES** (so files can be served directly via URL)

### Step 3 — Get the service key

1. Settings → API → copy the `service_role` key (NOT `anon`)
2. Add to Render env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_STORAGE_BUCKET=learnafrica-files`

> File uploads work locally without Supabase configured — they'll just fail gracefully and prompt to set it up.

---

## Activating Paystack later

The payment system is already wired with a clean abstraction. When you're ready to accept real payments:

### Step 1 — Get Paystack keys

1. Sign up at https://paystack.com
2. Dashboard → Settings → API Keys & Webhooks
3. Copy your **Secret Key** (starts with `sk_live_` or `sk_test_`)

### Step 2 — Add to Render

Render env variables → add:

```
PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxx
```

That's it. The backend automatically detects this and switches from "stub" to "paystack" provider.

### Step 3 — Wire the actual API calls

In `backend/app/payments.py`, three stub functions need real implementations:

```python
def _paystack_initialize(user, course, amount, currency, txn_id):
    # POST https://api.paystack.co/transaction/initialize
    # ...

def _paystack_verify(reference):
    # GET https://api.paystack.co/transaction/verify/{reference}
    # ...

def _paystack_transfer(instructor, amount, currency, txn_id):
    # POST /transferrecipient + /transfer
    # ...
```

Each function has clear TODO comments showing exactly what Paystack endpoints to call and what to return. Until these are implemented, transactions sit as `pending` and admins can manually mark them `success` via the admin Receipts tab.

### Step 4 — Add a webhook (recommended)

Paystack sends webhooks when payments succeed. Create an endpoint like `/api/payments/webhook` that calls `verify_payment()` and updates the transaction status.

---

## Feature toggles & defaults

### Time enforcement

- **Default:** OFF for new courses
- **Set by:** Instructor in Create/Edit Course page (basics tab)
- **Effect when ON:** Student must spend ≥ `min_time_seconds` on the course before the final quiz unlocks

### Quiz duration

- **Default:** OFF (no time limit) per quiz
- **Set by:** Instructor in Curriculum editor when creating a quiz
- **Effect when ON:** Quiz auto-submits when timer reaches zero

### Revenue split

- **Default:** 50% instructor / 50% platform
- **Set by:** Admin in Admin Panel → Settings tab
- **Effect:** Applied automatically to every paid course purchase

### Payment method required for instructors

- **Default:** Required at signup (new instructors)
- **Existing instructors:** Banner on dashboard prompts them to add it; not blocking

---

## Troubleshooting

### Backend won't start locally — "ModuleNotFoundError"

Make sure your virtual env is activated and dependencies are installed:

```bash
source backend/venv/bin/activate
pip install -r backend/requirements.txt
```

### "Database is locked" on SQLite

Another Python process is holding the DB. Kill all `python wsgi.py` processes:

```bash
pkill -f "python wsgi.py"
```

### Login returns 401 with correct password

Your local DB might be from before the `PASS_MIN_LENGTH` change. Reset:

```bash
rm backend/instance/learnafrica.db
python backend/wsgi.py
```

The admin will be re-seeded with the password from `ADMIN_PASSWORD`.

### Frontend says "Failed to fetch" / CORS error

Check that `VITE_API_URL` in `frontend/.env` points to the correct backend. After changing `.env`, restart Vite (`npm run dev` again).

### Time-tracking timer doesn't appear in lesson player

The timer pill only appears when:
1. The instructor enabled **Enforce minimum learning time** for that course
2. Minimum time is > 0
3. The student is logged in

Check the course in the instructor edit page → basics tab.

### Final quiz blocks with "More learning time needed" even after spending enough time

The frontend sends a heartbeat every 30s while the lesson page is open and the tab is in focus. If you've had the tab in the background, less time accumulated than the wall-clock might suggest. Wait a few more seconds and try again.

### Render deployment fails with "ALTER TABLE ... already exists"

Migrations use `IF NOT EXISTS` on Postgres so this shouldn't happen. If it does, check Render logs for the exact SQL and confirm you're on the latest `backend/app/database.py`.

### "Transaction not found" when verifying

Make sure you're using the receipt ID (format `LA-RCPT-XXXX-XXXX`) — not the transaction UUID. The receipt ID is shown on the user's Receipts page.

### Existing instructor has no payment method

They'll see a yellow banner on their dashboard. Click "Add payout method" → goes to Profile → fills in momo or bank → done. No data loss.

### Local DB missing new columns after pulling code

The migrations run automatically on startup. If a column is still missing:

```bash
# Stop the backend, then:
rm backend/instance/learnafrica.db
python backend/wsgi.py
```

This recreates the DB from scratch. You'll lose local test data but get the latest schema.

### Production DB missing new columns after deploy

Migrations run on every startup. Check Render logs for any `⚠ Migration skipped` lines — they indicate which migrations didn't apply and why.

---

## Development tips

### Add a new admin user

The seeded admin uses `ADMIN_EMAIL` and `ADMIN_PASSWORD`. To add another admin:

1. Sign up normally as a student
2. Login as the existing admin
3. Go to Admin → Students → find the user → promote to admin

### Add a new instructor

1. Sign up as an instructor (will require payment method now)
2. Admin must approve the application: Admin → Applications → Approve

### Reset the seeded demo courses

Demo courses are seeded once on first run. To re-seed:

```bash
# Set FORCE_RESEED=1 in env, then start the backend once. Then remove the env var.
```

Or delete them manually from Admin → Courses.

### View backend logs

- **Local:** logs print directly to your terminal where `python wsgi.py` is running
- **Render:** Dashboard → your service → **Logs** tab

### Run frontend in production-build mode locally

```bash
cd frontend
npm run build
npm run preview
```

Preview runs the production build at `http://localhost:4173`.

---

## What's new in this version (changelog)

### Features added
- **Text-only lessons** with rich text editor (bold, italic, headings, lists, alignment, links)
- **Time tracking** — student time on a course accumulates across sessions
- **Minimum time gate** before final quiz (opt-in per course by instructor)
- **Watch-style time picker** for course min-time AND per-quiz duration (hours + minutes wheels)
- **Payment method on profile** (mobile money or bank, multi-country)
- **Required payment method on instructor signup**
- **Receipts / transaction history page** with filters and search
- **Admin: verify transaction by receipt ID** with status update
- **Admin: revenue-split settings** (instructor vs platform percentage)
- **Payment provider abstraction** — Paystack-ready, drop-in replacement of stub functions when you're ready

### Bug fixes
- Fixed SQLite migration runner silently skipping `ADD COLUMN IF NOT EXISTS` (this was a latent bug — many existing migrations were silently failing on local dev)
- Idempotent migrations work on both Postgres and SQLite identically

---

## License & support

This codebase is built specifically for LearnAfrica. For issues or questions, contact the development team.

**Default admin credentials must be changed in production.** Do not deploy with default passwords.
