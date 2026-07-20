# LearnAfrica Lite

A learning management platform built for African students. Instructors create courses, students enrol, learn, take quizzes, earn certificates.

Built on Flask (backend), React + Vite (frontend), Neon Postgres (database), Supabase Storage (files), Paystack (payments). Deployed on Render (backend) and Vercel (frontend).

---

## Table of Contents

1. [What This Is](#what-this-is)
2. [Tech Stack](#tech-stack)
3. [File Structure](#file-structure)
4. [Running Locally](#running-locally)
5. [Setting Up Neon Postgres](#setting-up-neon-postgres)
6. [Setting Up Supabase](#setting-up-supabase)
7. [Setting Up Paystack](#setting-up-paystack)
8. [Deploying the Backend to Render](#deploying-the-backend-to-render)
9. [Deploying the Frontend to Vercel](#deploying-the-frontend-to-vercel)
10. [Environment Variables Reference](#environment-variables-reference)
11. [Default Admin Login](#default-admin-login)
12. [Troubleshooting](#troubleshooting)
13. [Security Notes](#security-notes)

---

## What This Is

LearnAfrica Lite is an LMS (Learning Management System) with these features:

- **Courses** with sections and lessons (video, text, quiz, or custom React "pages")
- **Course enrolment** — free courses enrol instantly; paid courses process payment via Paystack (Ghana MoMo, bank cards, GHIPSS)
- **Progress tracking** — students can see what they've completed; auto-completion for custom pages
- **Certificates** — students who finish a course earn a downloadable certificate with a verifiable ID
- **Instructor tools** — create/edit courses, upload resources, view analytics, manage coupons, host live cohort sessions
- **Coupons** — instructors and admins can issue percentage or fixed-amount discount codes
- **Live sessions** — instructors can schedule Zoom/Meet sessions students can RSVP to
- **Custom lesson pages** — pre-built React components (e.g. "Welcome to the Course", "Learning Roadmap") that instructors can drop into any course
- **Search** — filter courses by title, description, category, instructor, tag, or course code
- **Payments** — Paystack integration with test mode, live mode, and a built-in mock mode for local dev
- **Real-time community chat** via WebSockets
- **Dark and light themes**
- **Responsive design** — usable on mobile, tablet, desktop

---

## Tech Stack

**Frontend**
- React 19 + Vite 6
- Tailwind CSS v4
- React Router v6
- Socket.IO client (WebSockets)
- Deployed on **Vercel**

**Backend**
- Python 3.11
- Flask + Flask-SocketIO
- Eventlet (for WebSocket support with gunicorn)
- psycopg2 (Postgres driver)
- Deployed on **Render**

**Database**
- **Neon Postgres** (production)
- SQLite (local dev fallback)

**File storage**
- **Supabase Storage** for course thumbnails, avatars, resources, videos

**Payments**
- **Paystack** (Ghana MoMo, cards, GHIPSS)
- Mock mode built in for local dev without Paystack account

**Auth**
- JWT tokens
- bcrypt password hashing

---

## File Structure

```
learnafrica-lite/
├── backend/                          # Python Flask API
│   ├── app/
│   │   ├── __init__.py               # Package entry, exports create_app
│   │   ├── main.py                   # All Flask routes, business logic (~290KB)
│   │   ├── database.py               # DB connection wrapper (Postgres + SQLite),
│   │   │                             #   TABLES list, MIGRATIONS list, init_db()
│   │   ├── crud.py                   # Data seeding: seed_admin, seed_demo_courses,
│   │   │                             #   seed_instructor_guide + upgrade backfill
│   │   └── payments.py               # Payment abstraction (Paystack + mock)
│   ├── wsgi.py                       # Production entry: gunicorn imports this
│   ├── run.py                        # Development entry: python run.py
│   ├── requirements.txt              # Python dependencies
│   ├── render.yaml                   # Render service config
│   └── Procfile                      # Alternate Render/Heroku config
│
├── frontend/                         # React + Vite SPA
│   ├── src/
│   │   ├── App.jsx                   # Router + route definitions
│   │   ├── main.jsx                  # ReactDOM.render entry
│   │   ├── index.css                 # Tailwind directives + custom CSS
│   │   ├── components/
│   │   │   ├── common/               # Reusable: Button, Card, Modal, RichTextEditor
│   │   │   ├── course/               # CourseCard, CourseFilters, etc.
│   │   │   ├── layout/               # Navbar, Footer, MobileProfileDrawer, ProfileDropdown
│   │   │   ├── lesson/               # DiscussionBoard, LessonSidebar
│   │   │   └── customLessons/        # ← Custom Page components live here
│   │   │       ├── HowToStudyGuide.jsx
│   │   │       ├── CourseWelcome.jsx
│   │   │       ├── LearningRoadmap.jsx
│   │   │       └── registry.js       # Maps component_key → React component
│   │   ├── pages/
│   │   │   ├── Landing/              # Public landing page
│   │   │   ├── Auth/                 # Login, Signup, Forgot Password
│   │   │   ├── Courses/              # Course catalogue, course detail
│   │   │   ├── Lessons/              # Individual lesson viewer (LessonPage.jsx)
│   │   │   ├── Instructor/           # Create/edit course, curriculum editor,
│   │   │   │                         #   analytics, coupons, preview
│   │   │   ├── Admin/                # AdminPage.jsx — admin dashboard
│   │   │   ├── Payment/              # Payment form + return callback
│   │   │   └── Student/              # Dashboard, my courses, certificate
│   │   ├── context/
│   │   │   └── AuthContext.jsx       # Global auth state + login/logout logic
│   │   ├── lib/
│   │   │   ├── api.js                # fetch wrapper w/ token handling
│   │   │   ├── money.js              # Ghana Cedi formatting (GH₵)
│   │   │   ├── useCurriculum.js      # Curriculum state hook
│   │   │   └── utils.js              # cn() classname helper + more
│   │   └── layouts/
│   │       └── MainLayout.jsx        # Navbar + <Outlet /> + Footer wrapper
│   ├── package.json                  # NPM dependencies + scripts
│   ├── vite.config.js                # Vite build config
│   ├── tailwind.config.js            # Tailwind theme
│   └── .env.example                  # Frontend env vars template
│
├── README.md                         # ← You are here
├── PAYSTACK_SETUP.md                 # Detailed Paystack integration notes
└── .gitignore
```

---

## Running Locally

### Prerequisites

Install these first:
- **Python 3.11+** — `python3 --version`
- **Node.js 20+** and **npm** — `node --version`
- **Git** — `git --version`

### Step 1 — Clone the repo

```bash
git clone https://github.com/kotoorich/learnafrica-lite.git
cd learnafrica-lite
```

### Step 2 — Backend setup

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate         # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Create your .env file
cat > .env << 'EOF'
JWT_SECRET=change-this-to-a-random-string-30-chars-plus
SECRET_KEY=another-random-string-different-from-above
ADMIN_EMAIL=admin@learnafrica.com
ADMIN_PASSWORD=Admin@LearnAfrica2024!
# Leave DATABASE_URL blank to use SQLite locally
# Leave PAYSTACK_SECRET_KEY blank to use mock payment mode
EOF

# Start the backend
python run.py
```

The backend will run on `http://localhost:5000`.

You'll see startup messages:
```
✅ Database ready
✅ Default admin created: admin@learnafrica.com
✅ Seeded 3 demo courses with sections and lessons
🚀 LearnAfrica Lite  →  http://localhost:5000
```

### Step 3 — Frontend setup

Open a **new terminal** (keep the backend running):

```bash
cd frontend

# Install NPM dependencies
npm install

# Create your .env file
cat > .env << 'EOF'
VITE_API_URL=http://localhost:5000
EOF

# Start the dev server
npm run dev
```

The frontend will run on `http://localhost:5173` (or whatever port Vite picks).

### Step 4 — Log in as admin

Open `http://localhost:5173` in your browser, click "Log In", and use:

- **Email**: `admin@learnafrica.com`
- **Password**: `Admin@LearnAfrica2024!`

You now have full admin access.

---

## Setting Up Neon Postgres

Neon is a managed Postgres provider. Free tier works fine for development and small production apps.

### Step 1 — Sign up

Go to https://console.neon.tech and sign up (GitHub or email login).

### Step 2 — Create a project

1. Click **"Create Project"**
2. Pick a name (e.g. `learnafrica`)
3. Pick the closest region to your users (e.g. **AWS us-east-1** or **Europe** for African users)
4. Click **Create**

### Step 3 — Get your connection string

1. In the Neon dashboard, click your project
2. Under **"Connection Details"** you'll see a connection string like:
   ```
   postgresql://username:password@ep-xxxxx.us-east-1.aws.neon.tech/dbname?sslmode=require
   ```
3. Copy that entire string — this is your `DATABASE_URL`

### Step 4 — Use it

Add `DATABASE_URL` to your backend `.env` file (or Render env vars in production):

```
DATABASE_URL=postgresql://username:password@ep-xxxxx.us-east-1.aws.neon.tech/dbname?sslmode=require
```

The app auto-detects Postgres via this env var. Tables are created on startup via `init_db()`.

---

## Setting Up Supabase

Supabase provides file storage for course thumbnails, avatars, and lesson resources.

### Step 1 — Sign up

Go to https://supabase.com and sign up.

### Step 2 — Create a project

1. Click **"New Project"**
2. Pick an organisation and name (e.g. `learnafrica`)
3. Set a database password (you won't use this directly — we're only using Storage)
4. Pick a region — closest to your users
5. Click **Create Project**

Wait 1-2 minutes for setup.

### Step 3 — Create a storage bucket

1. In the Supabase dashboard, click **Storage** in the left sidebar
2. Click **"New bucket"**
3. Name: `learnafrica-uploads` (lowercase, hyphenated — this is what the app defaults to). If you use a different name, you'll need to set `SUPABASE_STORAGE_BUCKET` env var explicitly to that name.
4. **Toggle "Public bucket" ON** — this lets students download resources without auth
5. Click **Save**

### Step 4 — Set bucket policies (if needed)

If uploads fail with permission errors, add these policies:
1. Storage → your `learnafrica-uploads` bucket → **Policies**
2. Click **"New policy"** → **"For full customization"**
3. Add a policy: `"Allow uploads via service key"` with target roles: `service_role`, operation: `INSERT`, USING expression: `true`
4. Add another: `"Allow public read"` with target roles: `anon`, operation: `SELECT`, USING expression: `true`

### Step 5 — Get your keys

1. Supabase dashboard → **Settings** (gear icon) → **API**
2. Copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`) → this is `SUPABASE_URL`
   - **service_role key** (long JWT under "Project API keys" — NOT the anon key) → this is `SUPABASE_SERVICE_KEY`

⚠ **Never commit the service_role key.** It has full backend access.

### Step 6 — Set env vars

Add to backend `.env` (or Render):

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...long-jwt-string
SUPABASE_STORAGE_BUCKET=learnafrica-uploads
```

### Step 7 — Verify

Log in as admin. Then hit this diagnostic endpoint in your browser (while logged in as admin):

```
https://your-backend-url.onrender.com/api/admin/storage-check
```

You should see:
```json
{
  "SUPABASE_URL": "set",
  "SUPABASE_SERVICE_KEY": "set",
  "SUPABASE_STORAGE_BUCKET": "learnafrica-uploads",
  "test_upload_ok": true,
  "test_upload_error": null
}
```

If `test_upload_ok` is `false`, the error field will tell you what's wrong (usually wrong bucket name, missing policies, or invalid service key).

---

## Setting Up Paystack

Paystack processes payments in Ghana Cedis (Ghana MoMo, cards, GHIPSS bank transfers).

The app has **three modes**:

1. **Mock mode** — no Paystack account needed. Fake payments always "succeed". Good for local dev and demos.
2. **Test mode** — real Paystack account, test API keys, test cards. No real money moves.
3. **Live mode** — real Paystack account (with KYC completed), live keys, real money.

### Mode 1: Mock (default)

**Just don't set `PAYSTACK_SECRET_KEY`.** The app auto-detects this and uses mock mode. Payments appear to succeed and enrol students, but no real transactions happen.

Perfect for:
- Local development
- Testing course flows before going live
- Demos to potential users

### Mode 2: Test Mode

**Step 1 — Sign up for Paystack**
1. Go to https://dashboard.paystack.com/#/signup
2. Sign up (Ghana address required for GHS support)
3. Complete email verification

**Step 2 — Get test keys**
1. Once logged in, look at the top-right — there's a **Live / Test** toggle. Make sure it says **TEST**.
2. Go to **Settings** → **API Keys & Webhooks**
3. Copy the **Test Secret Key** (starts with `sk_test_...`)

**Step 3 — Configure the app**

Add to backend `.env` or Render:

```
PAYSTACK_SECRET_KEY=sk_test_your_test_key_here
PAYSTACK_CALLBACK_URL=http://localhost:5173/payment/return
```

For production, use your Vercel URL:
```
PAYSTACK_CALLBACK_URL=https://your-site.vercel.app/payment/return
```

**Step 4 — Test with test cards**

Try purchasing a paid course. Use Paystack's test card:
- **Card number**: `4084 0840 8408 4081`
- **Expiry**: any future date (e.g. `12/30`)
- **CVV**: `408`
- **PIN**: `0000`
- **OTP**: `123456`

Everything should work end-to-end without real money moving.

For test Mobile Money, use phone: `0244 000 000` — any provider.

### Mode 3: Live Mode

**⚠ Only do this once you're ready to accept real money.**

**Step 1 — Complete KYC**

Live mode requires KYC (Know Your Customer) approval from Paystack. This takes 1-3 business days.

1. Paystack dashboard → **Settings** → **Compliance**
2. Submit:
   - Ghana Card (front + back) OR passport
   - Bank account details (for settlements)
   - Proof of address (utility bill, bank statement)
   - Business registration if applicable
3. Wait for approval email

**Step 2 — Switch to Live**

Once approved:
1. Top-right toggle in Paystack dashboard → switch to **LIVE**
2. Settings → **API Keys & Webhooks**
3. Copy the **Live Secret Key** (starts with `sk_live_...`)

**Step 3 — Update env vars (Render)**

⚠ Do this in Render's env vars, NOT in a `.env` file committed to git.

```
PAYSTACK_SECRET_KEY=sk_live_your_live_key_here
PAYSTACK_CALLBACK_URL=https://your-site.vercel.app/payment/return
```

Redeploy the Render service after updating.

**Step 4 — Verify with a real (small) transaction**

- Try a GH₵ 1 test purchase
- Check Paystack dashboard → **Transactions** — you should see it
- Confirm the student was enrolled

### Switching between modes safely

- To go from live back to test temporarily: just swap `PAYSTACK_SECRET_KEY` to a test key on Render and redeploy
- Test keys start with `sk_test_`, live keys with `sk_live_` — never mix them up
- Always test in test mode before going live — don't debug with real money

### Payouts to instructors

The app supports splitting payments:
- **Admin instructors**: 100% goes to platform (marked `payout_status='n/a'`)
- **Regular instructors**: configured revenue share (default 70/30 instructor/platform)
  - Instructor's cut is marked `payout_status='pending'`
  - Admin manually settles via Paystack transfer (Ghana MoMo or bank)

See `PAYSTACK_SETUP.md` (in the repo root) for the detailed payout flow.

---

## Deploying the Backend to Render

### Step 1 — Push code to GitHub

Make sure your latest code is on GitHub at `github.com/your-username/learnafrica-lite`.

### Step 2 — Create a Render account

Go to https://render.com and sign up (GitHub login recommended).

### Step 3 — Create a new Web Service

1. Render Dashboard → **New** → **Web Service**
2. Under "Source Code" → **Build and deploy from a Git repository** → **Next**
3. Connect your GitHub repo `learnafrica-lite`
4. Configure the service:

| Field | Value |
|---|---|
| **Name** | `learnafrica-backend` |
| **Region** | Frankfurt (closest to Africa) or Ohio |
| **Branch** | `main` |
| **Language** | **`Python 3`** ← don't leave as Node |
| **Root Directory** | `backend` ← critical |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT wsgi:app` |
| **Instance Type** | Free (upgrade to Starter $7/month later if free tier sleeps too much) |

### Step 4 — Add environment variables

Scroll down to **Environment Variables** and add each of these (fill in your actual values):

```
JWT_SECRET=random-30-char-string
SECRET_KEY=another-random-30-char-string
ADMIN_EMAIL=admin@learnafrica.com
ADMIN_PASSWORD=Admin@LearnAfrica2024!
DATABASE_URL=postgresql://... (from Neon)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=learnafrica-uploads
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_CALLBACK_URL=https://your-vercel-url.vercel.app/payment/return
FLASK_ENV=production
PYTHON_VERSION=3.11.9
PASS_MIN_LENGTH=8
```

### Step 5 — Advanced settings

Expand **Advanced**:
- **Auto-Deploy**: Yes
- **Health Check Path**: `/api/health`

### Step 6 — Create and deploy

Click **Create Web Service**. Render will:
1. Clone your repo
2. Run `pip install -r requirements.txt` (2-3 min)
3. Start gunicorn
4. Boot the app
5. Run health check on `/api/health`

Watch the log window. Success looks like:

```
==> Cloning from https://github.com/...
==> Running build command 'pip install -r requirements.txt'...
Successfully installed flask flask-socketio ...
==> Build successful 🎉
==> Deploying...
==> Running 'gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT wsgi:app'
✅ Database ready
✅ startup: init_db
✅ Default admin created: admin@learnafrica.com
✅ startup: seed_admin
✅ startup: seed_demo_courses
✅ startup: seed_instructor_guide
==> Your service is live 🎉
```

Note the URL Render assigns — e.g. `https://learnafrica-backend-xxxx.onrender.com`.

### Step 7 — Update Vercel to point at the new URL

See the Vercel section below.

---

## Deploying the Frontend to Vercel

### Step 1 — Create a Vercel account

Go to https://vercel.com and sign up (GitHub login recommended).

### Step 2 — Import your repo

1. Vercel Dashboard → **Add New** → **Project**
2. Import `learnafrica-lite` from GitHub
3. Configure:

| Field | Value |
|---|---|
| **Framework Preset** | Vite |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` (auto-detected) |
| **Output Directory** | `dist` (auto-detected) |
| **Install Command** | `npm install` (auto-detected) |

### Step 3 — Environment variables

Add one env var:

```
VITE_API_URL=https://learnafrica-backend-xxxx.onrender.com
```

Replace with your actual Render URL from Step 7 above.

### Step 4 — Deploy

Click **Deploy**. Vercel will:
1. Clone your repo
2. Run `npm install` (30s)
3. Run `npm run build` (30-60s)
4. Deploy to their CDN

Once done, Vercel gives you a URL like `https://learnafrica-lite-xxxx.vercel.app`.

### Step 5 — Update PAYSTACK_CALLBACK_URL on Render

Now that you know your Vercel URL, update `PAYSTACK_CALLBACK_URL` on Render:

```
PAYSTACK_CALLBACK_URL=https://learnafrica-lite-xxxx.vercel.app/payment/return
```

Redeploy Render after this change.

---

## Environment Variables Reference

### Backend (Render / local `.env`)

| Variable | Required? | Where to get it | What it does |
|---|---|---|---|
| `JWT_SECRET` | ✅ Yes | Any random 30+ char string | Signs JWT auth tokens |
| `SECRET_KEY` | ✅ Yes | Any random 30+ char string, different from JWT_SECRET | Flask session signing |
| `ADMIN_EMAIL` | ✅ Yes | You choose (e.g. `admin@learnafrica.com`) | First admin account email |
| `ADMIN_PASSWORD` | ✅ Yes | You choose (strong password) | First admin account password |
| `DATABASE_URL` | ✅ Yes for prod | Neon dashboard | Postgres connection string. If not set, uses SQLite locally |
| `SUPABASE_URL` | Recommended | Supabase → Settings → API | File uploads. Without this, uploads try to save to disk (fails on Render) |
| `SUPABASE_SERVICE_KEY` | Recommended | Supabase → Settings → API → service_role | Auth for Supabase uploads |
| `SUPABASE_STORAGE_BUCKET` | Recommended | You choose — must match your bucket name | Bucket for uploaded files (default `learnafrica-uploads`) |
| `PAYSTACK_SECRET_KEY` | Optional | Paystack → Settings → API Keys | Enables real payments. Not set → mock mode |
| `PAYSTACK_CALLBACK_URL` | Only if using Paystack | Your Vercel URL + `/payment/return` | Where Paystack redirects users after payment |
| `FLASK_ENV` | Optional | `production` or `development` | Flask environment |
| `PYTHON_VERSION` | Only on Render | `3.11.9` | Which Python version Render uses |
| `PASS_MIN_LENGTH` | Optional | `8` | Minimum password length for signups |
| `FORCE_SEED_GUIDE` | Optional | `1` | Force re-seed the instructor guide on startup |

### Frontend (Vercel / local `.env`)

| Variable | Required? | Value | What it does |
|---|---|---|---|
| `VITE_API_URL` | ✅ Yes | Your Render URL | Where the frontend sends API requests |

---

## Default Admin Login

On first startup, if no admin exists, one is auto-created with the credentials in `ADMIN_EMAIL` and `ADMIN_PASSWORD`:

- **Email**: `admin@learnafrica.com`
- **Password**: `Admin@LearnAfrica2024!`

⚠ Change this password immediately after first login in production. Go to Settings → Change Password.

To reset the admin password if lost:
1. Change `ADMIN_PASSWORD` in Render env vars
2. Delete the admin user from Postgres: connect to Neon SQL editor, run `DELETE FROM users WHERE email='admin@learnafrica.com';`
3. Redeploy — the admin gets recreated with the new password

---

## Troubleshooting

### "Login failed" or "Failed to fetch"

- Check the browser console (F12) for the real error
- Verify `VITE_API_URL` on Vercel points to your live Render URL
- Verify the Render service is actually running (`/api/health` should return `{"status":"ok"}`)

### Backend deploys but `/api/health` returns 500

- Check Render logs. Look for `psycopg2.errors...` — usually a missing column or table
- Verify `DATABASE_URL` is set correctly on Render
- The app auto-migrates on startup via `init_db()`. If migrations fail, you'll see the error in logs

### Uploads fail with "Local upload failed" / "No such file or directory"

- This means Supabase upload returned an error and the app fell back to local disk (which doesn't work on Render)
- Log in as admin, hit `/api/admin/storage-check` to see what's wrong
- Common causes:
  - `SUPABASE_SERVICE_KEY` env var missing on Render
  - `SUPABASE_STORAGE_BUCKET` name doesn't match your actual bucket
  - Bucket isn't set to public
  - Bucket policies block uploads from service_role

### "psycopg2.errors.UndefinedTable: relation X does not exist"

- Means `init_db()` didn't run or a specific table failed to create
- Ensure `wsgi.py` calls `init_db(flask_app)` on startup (it should — check the file)
- Force a re-deploy on Render → check the log for `✅ startup: init_db`
- If a specific new table is missing, the affected endpoints have a `_ensure_new_tables()` self-heal that creates it on first hit

### GitHub 403 when Render tries to clone

- Render's GitHub authorization expired or lost access to the repo
- Fix: Render Dashboard → your service → Settings → Repository → Reconnect
- Or: https://github.com/settings/installations → find Render → Configure → grant repo access
- If a former teammate's credential is still authorized, disconnect it under the "Credentials" dropdown when reconnecting

### Render build fails with "Could not open requirements file"

- Root Directory isn't set to `backend`
- Fix: Render → Settings → Root Directory → type `backend` → Save → Manual Deploy

### Render deploy says "Exited with status 1 because of an internal system error"

- This is Render's infrastructure, not your code
- Options:
  1. Wait 15 min and retry
  2. Check https://status.render.com for incidents
  3. Contact Render support with the deploy ID

### Uploads work but files 404 when students try to download

- Bucket isn't public
- Fix in Supabase: Storage → your bucket → Settings → toggle "Public bucket" ON

### "Course not found" after creating a course

- Cache issue. Hard refresh (Ctrl+Shift+R)
- If persistent: check that the course got saved. Neon SQL editor: `SELECT id, title FROM courses ORDER BY created_at DESC LIMIT 5;`

### Custom Page lesson shows blank

- Browser is caching old JavaScript that doesn't know about custom pages
- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- If it says "This custom page is no longer available", the component_key doesn't match a registered component. Edit the lesson and pick a component from the dropdown

### Payments fail / student not enrolled after successful payment

- Check `PAYSTACK_CALLBACK_URL` on Render matches your Vercel URL exactly
- Check Paystack dashboard → Transactions to see if the payment actually completed
- If test mode: make sure you used a Paystack test card (see Paystack section)

---

## Security Notes

- **Never commit `.env` files.** They're in `.gitignore` for a reason.
- Rotate `JWT_SECRET`, `SUPABASE_SERVICE_KEY`, `PAYSTACK_SECRET_KEY` if you suspect any leak
- Rotating `JWT_SECRET` invalidates all existing user sessions (they'll need to log in again)
- The `service_role` key has full backend access to Supabase — treat it like a password
- Live Paystack keys can move real money — protect them accordingly
- All passwords are bcrypt-hashed before storage
- All API endpoints requiring auth use `@token_required` decorator
- CORS is restricted to specific origins in production

---

## Contributing / Support

- Bugs / feature requests: open an issue on GitHub
- For deployment help: check the Troubleshooting section above first
- Contact: `admin@learnafrica.com`

---

Built with care for African students. 🌍
