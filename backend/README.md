# LearnAfrica Lite — Backend

Flask API server. Handles all authentication, course data, quizzes, certificates, and file uploads.

## File Structure

```
backend/
├── app/                    ← Python package (the actual application)
│   ├── __init__.py         ← Package entry point (exports create_app)
│   ├── main.py             ← App factory + ALL 79 API routes
│   ├── database.py         ← Database connection (Neon Postgres + SQLite fallback)
│   ├── models.py           ← Data model helpers (courses, certificates, quizzes)
│   ├── schema.py           ← Request validation + response builders
│   ├── security.py         ← JWT tokens + auth decorators
│   └── crud.py             ← Shared utilities (notifications, uploads, seeding)
├── run.py                  ← Development server (python run.py)
├── wsgi.py                 ← Production entry point (used by gunicorn)
├── requirements.txt        ← Python dependencies
├── Procfile                ← Tells Render how to start the server
├── render.yaml             ← Render deployment configuration
└── .env.example            ← Environment variable template
```

## Local Development

**Step 1 — Install Python dependencies**
```bash
cd backend
pip install -r requirements.txt
```

**Step 2 — Create your .env file**
```bash
cp .env.example .env
```
Open `.env` in your editor. For local development, you only need to set:
```
FLASK_ENV=development
SECRET_KEY=any-random-string-here
JWT_SECRET=another-random-string-here
```
Leave `DATABASE_URL` empty — it will use SQLite automatically.

**Step 3 — Start the server**
```bash
python run.py
```
The API is now running at `http://localhost:5000`

**Test it works:**
Open your browser and go to `http://localhost:5000/api/health`
You should see: `{"status": "ok", "database": "connected"}`

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/signup | Create account |
| POST | /api/auth/login | Log in |
| GET | /api/auth/verify | Check token |
| GET | /api/courses | List all courses |
| GET | /api/courses/:id | Get single course |
| POST | /api/courses/:id/enroll | Enroll in course |
| GET | /api/instructor/courses | Instructor's courses |
| POST | /api/instructor/courses | Create course |
| PUT | /api/instructor/courses/:id | Update course |
| GET | /api/admin/stats | Platform statistics |
| GET | /api/health | Health check |

