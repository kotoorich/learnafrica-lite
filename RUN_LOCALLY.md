replace the run.py with the whole code. first open the run.py first and see how it is before you replace

"""
run.py — Development server entry point.

Run this file locally during development:
  python run.py
"""
import os
from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.database import init_db, get_db
from app.crud import seed_admin, seed_demo_courses

# Create the app (this also assigns the module-level `socketio`)
flask_app = create_app()

# Import socketio AFTER create_app() so we get the real instance, not None
from app import main as app_main

# Initialise database and seed data
with flask_app.app_context():
    init_db(flask_app)
    db = get_db()
    seed_admin(flask_app, db)
    seed_demo_courses(flask_app, db)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"""
============================================================
🚀 LearnAfrica Lite  →  http://localhost:{port}
============================================================
📖 API Docs: http://localhost:{port}/api/health
============================================================
""")
    app_main.socketio.run(
        flask_app,
        host='0.0.0.0',
        port=port,
        debug=True,
        allow_unsafe_werkzeug=True
    )





    


# Running LearnAfrica Lite locally

You need two terminals open at the same time — one for the backend, one for the frontend.

---

## Prerequisites

Install these on your computer if you don't have them:

| Tool | Check version | Install |
|------|---------------|---------|
| **Python 3.11** | `python --version` | https://www.python.org/downloads/ |
| **Node.js 18+** | `node --version` | https://nodejs.org/ |
| **Git** | `git --version` | https://git-scm.com/downloads |

---

## Step 1 — Get the code

```bash
# If you don't have it yet
git clone https://github.com/YOUR-USERNAME/learnafrica-lite.git
cd learnafrica-lite

# Or if you already have it, just open the folder
cd learnafrica-lite
```

You should see two folders inside: `backend/` and `frontend/`.

---

## Step 2 — Start the backend (Terminal 1)

```bash
cd backend

# 1. Create a Python virtual environment (only first time)
python -m venv venv

# 2. Activate it
# Windows (Command Prompt):
venv\Scripts\activate
# Windows (PowerShell):
venv\Scripts\Activate.ps1
# Mac/Linux:
source venv/bin/activate

# 3. Install dependencies (only first time, ~2 minutes)
pip install -r requirements.txt

# 4. Create .env file (only first time)
# Windows:
copy .env.example .env
# Mac/Linux:
cp .env.example .env

# 5. Start the backend
python run.py
```

You should see:

```
============================================================
🚀 LearnAfrica Lite  →  http://localhost:5000
============================================================
📖 API Docs: http://localhost:5000/api/health
============================================================
```

**Leave this terminal running.** Don't close it.

The backend uses **SQLite** locally (a file called `learnafrica.db`) — no Postgres needed for development. The database will be created automatically on first run, with the admin user and 3 demo courses seeded.

---

## Step 3 — Start the frontend (Terminal 2)

Open a **new terminal window** (keep Terminal 1 running).

```bash
cd frontend

# 1. Install dependencies (only first time, ~1-2 minutes)
npm install

# 2. Create .env.local file (only first time)
# Windows:
echo VITE_API_URL=http://localhost:5000 > .env.local
# Mac/Linux:
echo "VITE_API_URL=http://localhost:5000" > .env.local

# 3. Start the dev server
npm run dev
```

You should see:

```
VITE v6.x.x  ready in 543 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

---

## Step 4 — Open it in your browser

Go to **http://localhost:5173**

Sign in with the default admin account:
- Email: `admin@learnafrica.com` (or whatever you set as `ADMIN_EMAIL` in `.env`)
- Password: `Admin@LearnAfrica2024!`

You should see the 3 demo courses already seeded.

---

## Common issues

**"python: command not found"** → Try `python3` instead of `python`.

**"npm: command not found"** → Install Node.js from nodejs.org.

**Port 5000 already in use (Mac)** → On macOS, port 5000 is used by AirPlay. Either:
- Change the port: `PORT=5050 python run.py` (then update `.env.local` to match)
- Or disable AirPlay: System Settings → AirDrop & Handoff → AirPlay Receiver off

**Port 5173 already in use** → Vite will auto-pick the next free port (5174, 5175...). Look at the actual URL Vite prints.

**Backend says "ModuleNotFoundError"** → You forgot to activate the venv. Run the activation command from Step 2 again.

**Frontend shows "Network Error" / 500** → Make sure backend is running in Terminal 1, AND the `VITE_API_URL` in `.env.local` matches the port your backend is on (default 5000).

**Database errors** → Delete the `backend/learnafrica.db` file and re-run `python run.py` to recreate it from scratch.

---

## Next time you want to run it

You don't need to repeat the "first time" steps. Just:

**Terminal 1:**
```bash
cd backend
source venv/bin/activate    # Mac/Linux
# venv\Scripts\activate     # Windows
python run.py
```

**Terminal 2:**
```bash
cd frontend
npm run dev
```

Then open http://localhost:5173.

---

## Stopping the servers

In each terminal, press **Ctrl+C**.

---

## What's running locally vs production

| | Local | Production |
|--|-------|------------|
| Backend | `python run.py` on port 5000 | Render + gunicorn |
| Frontend | `npm run dev` on port 5173 | Vercel |
| Database | SQLite (`learnafrica.db` file) | Neon Postgres |
| File storage | Local filesystem (`backend/uploads/`) | Supabase Storage |
| WebSockets | Flask-SocketIO on same port | Same on Render |
