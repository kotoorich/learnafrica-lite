# LearnAfrica Lite — Complete Deployment Guide

> **You are a beginner. This guide explains every single step.  
> Do not skip any step. Follow them exactly in order.**

---

## What You Are Deploying

LearnAfrica Lite is a full-stack online learning platform. It has two parts:

| Part | Technology | Deployed To |
|------|-----------|-------------|
| **Frontend** | React (the website) | Vercel |
| **Backend** | Flask Python API | Render |
| **Database** | PostgreSQL | Neon |
| **File Storage** | Images, thumbnails, uploads | Supabase Storage |
| **Code** | All source files | GitHub |

---

## Project Structure

```
learnafrica-prod/              ← This is your project root. Push this whole folder to GitHub.
│
├── frontend/                  ← The React website
│   ├── src/                   ← All React source code
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── vercel.json            ← Tells Vercel how to host this
│   └── .env.example           ← Copy this to .env.local for local dev
│
├── backend/                   ← The Python API server
│   ├── app/                   ← Application package
│   │   ├── __init__.py
│   │   ├── main.py            ← All API routes (79 endpoints)
│   │   ├── database.py        ← Database connection (Neon + SQLite)
│   │   ├── models.py          ← Data helpers (courses, certs, quizzes)
│   │   ├── schema.py          ← Request validation
│   │   ├── security.py        ← JWT auth + decorators
│   │   └── crud.py            ← Shared utilities
│   ├── run.py                 ← Start server locally: python run.py
│   ├── wsgi.py                ← Production entry point for Render
│   ├── requirements.txt       ← Python packages
│   ├── Procfile               ← Tells Render how to start the server
│   ├── render.yaml            ← Render configuration
│   └── .env.example           ← Copy to .env for local dev
│
├── .gitignore                 ← Files git will NOT commit (secrets, node_modules, etc.)
└── README.md                  ← This file
```

> **Important:** Both `frontend/` and `backend/` are inside the **same GitHub repository**.
> When deploying, you tell each platform (Vercel and Render) which subfolder to use.

---

## Step 0 — Install Required Software

Before anything else, install these on your computer:

### Git
- Go to: **git-scm.com/downloads**
- Download and install for your operating system
- Verify: open Terminal/Command Prompt and type `git --version`
- You should see something like: `git version 2.43.0`

### Node.js
- Go to: **nodejs.org**
- Download the **LTS** version (the green button)
- Install it
- Verify: type `node --version` → should show `v20.x.x` or similar

### Python
- Go to: **python.org/downloads**
- Download Python 3.11 or newer
- Install it — **on Windows, tick "Add Python to PATH"**
- Verify: type `python --version` → should show `Python 3.11.x`

---

## Step 1 — Create All Your Accounts

Create free accounts on each of these services. Use the same email for all of them to keep things simple.

### 1.1 GitHub
- Go to: **github.com**
- Click "Sign up"
- Choose a username, enter your email, create a password
- Verify your email address

### 1.2 Neon (PostgreSQL Database)
- Go to: **neon.tech**
- Click "Sign up" → sign up with your GitHub account (easiest)
- You do not need to create a project yet — we will do that in Step 3

### 1.3 Supabase (File Storage)
- Go to: **supabase.com**
- Click "Start your project" → sign up with your GitHub account
- You do not need to create a project yet — we will do that in Step 4

### 1.4 Render (Backend Hosting)
- Go to: **render.com**
- Click "Get Started for Free" → sign up with your GitHub account
- No setup needed yet

### 1.5 Vercel (Frontend Hosting)
- Go to: **vercel.com**
- Click "Sign Up" → sign up with your GitHub account
- No setup needed yet

---

## Step 2 — Push Your Code to GitHub

### 2.1 Extract the Project

Unzip the file `learnafrica-production.zip`.
You will see a folder called `learnafrica-prod` with `frontend/` and `backend/` inside it.

### 2.2 Create a New GitHub Repository

1. Go to **github.com** and sign in
2. Click the **"+"** icon in the top-right corner
3. Click **"New repository"**
4. Fill in:
   - Repository name: `learnafrica-lite`
   - Description: `LearnAfrica LMS Platform`
   - Set to **Private** (recommended — your secrets will be in deployment settings)
   - **Do NOT tick** "Add a README file"
   - **Do NOT tick** "Add .gitignore"
5. Click **"Create repository"**
6. You will see a page with setup commands — keep this tab open

### 2.3 Push Your Code

Open Terminal (Mac/Linux) or Command Prompt (Windows).
Navigate to the unzipped folder:

```bash
# Navigate to your project folder
# Replace the path with where you unzipped the file
cd C:\Users\YourName\Downloads\learnafrica-prod      # Windows
# OR
cd ~/Downloads/learnafrica-prod                       # Mac/Linux

# Initialise git
git init

# Add all files
git add .

# Create the first commit
git commit -m "Initial commit — LearnAfrica Lite"

# Set the branch name to 'main'
git branch -M main

# Connect to your GitHub repository
# REPLACE 'YOUR_USERNAME' with your actual GitHub username
git remote add origin https://github.com/YOUR_USERNAME/learnafrica-lite.git

# Push to GitHub
git push -u origin main
```

**What to expect:** You will be asked for your GitHub username and password.
For the password, use a **Personal Access Token** (not your account password):
1. Go to github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token → tick "repo" → Generate token
3. Copy the token and use it as your password

After the push finishes, refresh your GitHub page — you should see all your files.

---

## Step 3 — Set Up Neon Database

### 3.1 Create a Project

1. Go to **console.neon.tech** and sign in
2. Click **"New Project"**
3. Project name: `learnafrica`
4. Database name: `learnafrica`
5. Region: choose the one closest to you (Europe West for Africa/Europe)
6. Click **"Create Project"**

### 3.2 Get Your Connection String

After the project is created, you will see a page with connection details.

1. Click **"Connect"** or find the "Connection string" section
2. Make sure **"Connection string"** is selected (not individual parameters)
3. The string looks like this:
   ```
   postgresql://username:password@ep-xxx-xxx.eu-west-2.aws.neon.tech/learnafrica?sslmode=require
   ```
4. **Copy this entire string** — you will need it later

> **What is this?** This string tells your backend how to connect to the database.
> It contains the hostname, username, and password all in one line.
> Keep it secret — treat it like a password.

---

## Step 4 — Set Up Supabase Storage

### 4.1 Create a Project

1. Go to **supabase.com** and sign in
2. Click **"New project"**
3. Project name: `learnafrica`
4. Database password: create a strong password and save it somewhere
5. Region: choose the one closest to you
6. Click **"Create new project"**
7. Wait about 2 minutes while it sets up

### 4.2 Create a Storage Bucket

1. In the left sidebar, click **"Storage"**
2. Click **"New bucket"**
3. Bucket name: `learnafrica-uploads`
4. **Enable "Public bucket"** — this lets uploaded images be shown to users
5. Click **"Create bucket"**

### 4.3 Get Your API Keys

1. In the left sidebar, click **"Settings"** (gear icon)
2. Click **"API"**
3. You need three values:

   | What | Where to find it | Used in |
   |------|-----------------|---------|
   | **Project URL** | "Project URL" field | Render + Vercel |
   | **anon / public key** | Under "Project API keys" | Vercel only |
   | **service_role key** | Under "Project API keys" (click "Reveal") | Render only |

4. Write these down in a text file temporarily

> **Security note:**
> - `anon key` — safe to use in the frontend (it's designed to be public)
> - `service_role key` — **SECRET**. Only use in the backend. Never in frontend.

---

## Step 5 — Deploy Backend to Render

### 5.1 Create a New Web Service

1. Go to **render.com** and sign in
2. Click **"New +"** → **"Web Service"**
3. Click **"Connect account"** next to GitHub if not already connected
4. Find your `learnafrica-lite` repository and click **"Connect"**

### 5.2 Configure the Service

Fill in these settings:

| Field | Value |
|-------|-------|
| Name | `learnafrica-backend` |
| Region | Same region you chose for Neon |
| Root Directory | `backend` |
| Runtime | `Python 3` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn --worker-class geventwebsocket.gunicorn.workers.GeventWebSocketWorker --workers 1 --bind 0.0.0.0:$PORT wsgi:app` |

> **What is "Root Directory"?** It tells Render to look inside the `backend` folder,
> not the root of your repository. This is very important.

### 5.3 Add Environment Variables

Scroll down to **"Environment Variables"** and click **"Add Environment Variable"** for each one:

| Key | Value | Notes |
|-----|-------|-------|
| `FLASK_ENV` | `production` | Exactly as shown |
| `SECRET_KEY` | Generate a random string | See below |
| `JWT_SECRET` | Generate a different random string | See below |
| `DATABASE_URL` | Your Neon connection string | From Step 3.2 |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` | Update after Step 6 |
| `SUPABASE_URL` | Your Supabase Project URL | From Step 4.3 |
| `SUPABASE_SERVICE_KEY` | Your Supabase service_role key | From Step 4.3 |
| `SUPABASE_STORAGE_BUCKET` | `learnafrica-uploads` | Exactly as shown |
| `ADMIN_EMAIL` | Your admin email | You will use this to log in |
| `ADMIN_PASSWORD` | A strong password | At least 8 chars, 1 number, 1 uppercase |

**How to generate a SECRET_KEY:**
Open Terminal/Command Prompt and run:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```
Copy the output (a long string of random letters and numbers).
Run it twice — once for `SECRET_KEY` and once for `JWT_SECRET`.

For `ALLOWED_ORIGINS`, temporarily set it to `*` (asterisk) for now.
You will update it with your real Vercel URL after Step 6.

### 5.4 Deploy

1. Click **"Create Web Service"**
2. Render will start building your app — this takes 3–5 minutes
3. Click the **"Logs"** tab to watch the progress
4. Look for these lines which confirm it worked:
   ```
   ✅ Database ready
   ✅ Default admin created: your-email@example.com
   ```
5. Once deployed, Render shows a URL at the top like:
   `https://learnafrica-backend.onrender.com`

**Copy this URL** — you need it for the next step.

**Test your backend:** Open your browser and go to:
`https://learnafrica-backend.onrender.com/api/health`

You should see: `{"status": "ok", "database": "connected"}`

If you see an error, check the Render logs for details.

---

## Step 6 — Deploy Frontend to Vercel

### 6.1 Import Your Project

1. Go to **vercel.com** and sign in
2. Click **"Add New..."** → **"Project"**
3. Find your `learnafrica-lite` repository and click **"Import"**

### 6.2 Configure the Build

| Field | Value |
|-------|-------|
| Framework Preset | Vite (auto-detected) |
| Root Directory | Click "Edit" → type `frontend` |
| Build Command | `npm run build` (auto-filled) |
| Output Directory | `dist` (auto-filled) |

> **Important:** Set Root Directory to `frontend` — just like you set it to `backend` in Render.

### 6.3 Add Environment Variables

Before clicking Deploy, click **"Environment Variables"** and add:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | Your Render URL from Step 5.4 (no trailing slash) |
| `VITE_SUPABASE_URL` | Your Supabase Project URL from Step 4.3 |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key from Step 4.3 |

**Example:**
```
VITE_API_URL = https://learnafrica-backend.onrender.com
VITE_SUPABASE_URL = https://abcdefghij.supabase.co
VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 6.4 Deploy

1. Click **"Deploy"**
2. Vercel installs dependencies, builds the React app, and deploys (~2 minutes)
3. When done, click your deployment URL:
   `https://learnafrica-lite.vercel.app`
4. **Copy this URL**

---

## Step 7 — Final Configuration

### 7.1 Update CORS in Render

Now that you have your Vercel URL, you need to tell the backend to allow requests from it:

1. Go to **render.com** → your `learnafrica-backend` service
2. Click **"Environment"**
3. Find `ALLOWED_ORIGINS`
4. Change the value to your Vercel URL:
   ```
   https://learnafrica-lite.vercel.app
   ```
5. Click **"Save Changes"**
6. Render will automatically redeploy

### 7.2 Verify Everything Works

Open your Vercel URL and test these things in order:

**Basic loading:**
- [ ] The homepage loads with the LearnAfrica logo
- [ ] The dark/light mode toggle works
- [ ] No red errors in the browser (press F12 → Console tab to check)

**Authentication:**
- [ ] Click "Sign Up" → create a student account → you are logged in
- [ ] Log out → Log in again with the same credentials

**Admin:**
- [ ] Log in with your `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- [ ] Go to `/admin` — the admin panel loads

**Instructor:**
- [ ] Sign up as an instructor → approve them in the admin panel
- [ ] Log in as instructor → create a course → upload a thumbnail
- [ ] The thumbnail URL should start with your Supabase URL

**Student learning:**
- [ ] Log in as student → enroll in a course
- [ ] Open a lesson → video loads
- [ ] Mark a lesson complete → progress bar updates

---

## Step 8 — Deploying Future Updates

Every time you make a change and want it live:

```bash
# From inside your learnafrica-prod folder:
git add .
git commit -m "Describe what you changed"
git push
```

Both Vercel and Render watch your GitHub repository.
They automatically redeploy within 2–3 minutes of every push.
No manual steps needed.

---

## Troubleshooting

### "Failed to fetch" or blank page on the frontend

**Cause:** The frontend cannot reach the backend.

**Fix:**
1. Open your browser console (F12 → Console)
2. Look for error messages like "net::ERR_CONNECTION_REFUSED"
3. Check `VITE_API_URL` in Vercel is set to your exact Render URL
4. Check your Render service is running (not sleeping)
5. Test your backend directly: `https://your-backend.onrender.com/api/health`

---

### "CORS error" in browser console

**Cause:** The backend is rejecting requests from your frontend URL.

**Fix:**
1. Go to Render → your service → Environment
2. Check `ALLOWED_ORIGINS` is set to your exact Vercel URL
3. No trailing slash: `https://app.vercel.app` ✅ not `https://app.vercel.app/` ❌
4. Save and wait for Render to redeploy

---

### "Internal Server Error" (500) from the backend

**Cause:** Something crashed in the Python code.

**Fix:**
1. Go to Render → your service → Logs
2. Look for red error messages
3. Common causes:
   - `DATABASE_URL` is wrong or missing → check your Neon connection string
   - A Python package failed to install → check the build logs

---

### "Build failed" on Vercel

**Cause:** The React app failed to compile.

**Fix:**
1. Go to Vercel → your project → Deployments → click the failed deployment
2. Read the error in the build log
3. Common causes:
   - Root Directory not set to `frontend`
   - Missing `VITE_API_URL` environment variable
   - Node.js version mismatch (set to 20.x in Vercel Settings → General)

---

### Render service is slow (30–60 second first load)

**Cause:** Render's free tier spins down inactive services after 15 minutes.
The first request after sleeping wakes it up, which takes about 30 seconds.

**Fix:** This is normal behaviour on the free tier. Either:
- Accept it (it only happens after inactivity)
- Upgrade to a paid Render plan ($7/month) which keeps the service always running

---

### Data was lost after a Render redeploy

**Cause:** This should NOT happen with Neon — all your data is stored in Neon's cloud,
not on Render's servers. If data was lost, check:

**Fix:**
1. Confirm `DATABASE_URL` in Render points to your Neon database
2. Log in to Neon and check if the tables exist (Tables section in the dashboard)
3. If tables are missing, restarting your Render service should re-create them

---

### Images not uploading in production

**Cause:** Supabase Storage is not configured correctly.

**Fix:**
1. Check `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set in Render
2. Go to Supabase → Storage → confirm `learnafrica-uploads` bucket exists
3. Confirm the bucket is set to **Public**
4. Check the Render logs for error messages when you try to upload

---

## Environment Variables Quick Reference

### Render (Backend)

| Variable | Example Value | Description |
|----------|--------------|-------------|
| `FLASK_ENV` | `production` | Required |
| `SECRET_KEY` | `a3f8b2c9...` (64-char random) | Flask security |
| `JWT_SECRET` | `d9e1f4a2...` (64-char random) | JWT token signing |
| `DATABASE_URL` | `postgresql://...neon.tech/...` | Neon connection string |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` | Your Vercel URL |
| `SUPABASE_URL` | `https://xxx.supabase.co` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | `eyJ...` | **SECRET** — Supabase service key |
| `SUPABASE_STORAGE_BUCKET` | `learnafrica-uploads` | Storage bucket name |
| `ADMIN_EMAIL` | `admin@yourdomain.com` | Admin login email |
| `ADMIN_PASSWORD` | `MyPass123!` | Admin login password |

### Vercel (Frontend)

| Variable | Example Value | Description |
|----------|--------------|-------------|
| `VITE_API_URL` | `https://learnafrica-backend.onrender.com` | Render backend URL |
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Supabase public anon key |

> **Security rule:** Variables with `VITE_` prefix are visible to everyone in the browser.
> Never put secret keys (SERVICE_KEY, SECRET_KEY, DATABASE_URL) with `VITE_` prefix.

---

## Local Development Quick Reference

**Start backend:**
```bash
cd backend
pip install -r requirements.txt    # first time only
cp .env.example .env               # first time only, then edit .env
python run.py
```

**Start frontend:**
```bash
cd frontend
npm install                         # first time only
cp .env.example .env.local          # first time only
npm run dev
```

Both should be running at the same time.
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5000`
