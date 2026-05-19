"""
crud.py — Shared utility functions used across multiple routes.

"CRUD" stands for Create, Read, Update, Delete — the core database operations.
These helpers are called by routes in main.py to avoid repeating logic.

Contains:
  - Revenue split helper
  - Notification helpers (push + create)
  - Supabase Storage upload helper
  - Admin seeding
  - Course seeding (demo data)
"""
import os, uuid, json
from datetime import datetime


# ── Revenue helpers ───────────────────────────────────────────────────────────
def get_revenue_split(db):
    """
    Return the current instructor/admin revenue split percentages.
    Defaults to 50/50 if not configured.
    Returns: (instructor_pct: float, admin_pct: float)
    """
    rows = db.execute(
        "SELECT key, value FROM platform_config WHERE key IN ('instructor_share','admin_share')"
    ).fetchall()
    cfg = {r['key']: float(r['value']) for r in rows}
    instructor_pct = cfg.get('instructor_share', 50.0)
    admin_pct      = cfg.get('admin_share',      50.0)
    return instructor_pct, admin_pct


# ── Notification helpers ──────────────────────────────────────────────────────
def create_notification(db, user_id: str, ntype: str, title: str,
                         message: str, internal_id: str = None,
                         use_postgres: bool = False) -> dict:
    """
    Create a notification record in the database.
    Returns the notification as a dict (for pushing via WebSocket).
    """
    nid  = internal_id or str(uuid.uuid4())
    ph   = '%s' if use_postgres else '?'
    now  = datetime.now().isoformat()
    notif = {
        'id':         nid,
        'type':       ntype,
        'title':      title,
        'message':    message,
        'read':       False,
        'time':       datetime.now().strftime('%H:%M'),
        'date':       datetime.now().strftime('%Y-%m-%d'),
        'created_at': now,
    }
    try:
        db.execute(
            'INSERT INTO user_notifications'
            ' (id, user_id, type, title, message, data, read, created_at)'
            ' VALUES (' + ','.join([ph]*8) + ')',
            (nid, user_id, ntype, title, message, json.dumps(notif), False, now)
        )
        db.commit()
    except Exception:
        pass
    return notif


def push_notification(socketio, user_id: str, notif: dict) -> None:
    """
    Send a notification to a specific user via WebSocket in real time.
    The user must be in the room 'user_{user_id}' (joined on connect).
    """
    try:
        socketio.emit('new_notification', notif, room=f'user_{user_id}')
    except Exception:
        pass


# ── Supabase Storage upload ───────────────────────────────────────────────────
def upload_to_supabase(file_bytes: bytes, filename: str,
                        content_type: str = 'image/jpeg') -> str | None:
    """
    Upload a file to Supabase Storage.
    Returns the public URL on success, or None if Supabase is not configured
    (falls back to local storage in development).

    Environment variables needed:
      SUPABASE_URL           — your project URL
      SUPABASE_SERVICE_KEY   — service role key (secret, backend only)
      SUPABASE_STORAGE_BUCKET — bucket name (default: learnafrica-uploads)
    """
    supabase_url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    service_key  = os.environ.get('SUPABASE_SERVICE_KEY', '')
    bucket       = os.environ.get('SUPABASE_STORAGE_BUCKET', 'learnafrica-uploads')

    if not supabase_url or not service_key:
        return None  # Not configured — caller will use local storage

    try:
        import requests
        headers = {
            'Authorization': f'Bearer {service_key}',
            'Content-Type':  content_type,
            'x-upsert':      'true',
        }
        upload_url = f'{supabase_url}/storage/v1/object/{bucket}/{filename}'
        r = requests.put(upload_url, headers=headers, data=file_bytes, timeout=30)
        if r.status_code in (200, 201):
            return f'{supabase_url}/storage/v1/object/public/{bucket}/{filename}'
        return None
    except Exception:
        return None


# ── Admin seeding ─────────────────────────────────────────────────────────────
def seed_admin(app, db):
    """
    Create the default admin account if it doesn't already exist.
    Email and password come from environment variables so they are never
    hardcoded in the source code.
    """
    from werkzeug.security import generate_password_hash
    use_pg = app.config.get('USE_POSTGRES')
    ph     = '%s' if use_pg else '?'

    admin_email = os.environ.get('ADMIN_EMAIL', 'admin@learnafrica.com')
    admin_pass  = os.environ.get('ADMIN_PASSWORD', 'Admin@LearnAfrica2024!')

    existing = db.execute(
        'SELECT id FROM users WHERE email=' + ph, (admin_email,)
    ).fetchone()

    if not existing:
        uid = str(uuid.uuid4())
        pw  = generate_password_hash(admin_pass)
        sql = (
            'INSERT INTO users '
            '(id, name, email, password_hash, role, instructor_status, is_active) '
            'VALUES (' + ','.join([ph]*7) + ')'
        )
        db.execute(sql, (uid, 'Admin', admin_email, pw, 'superadmin', 'approved', 1))
        # Insert OR IGNORE handles both Postgres and SQLite via the adapter
        db.execute(
            'INSERT INTO user_stats (user_id) VALUES (' + ph + ')',
            (uid,)
        )
        db.commit()
        print(f'✅ Default admin created: {admin_email}')
    else:
        print(f'✅ Default admin exists: {admin_email}')


# ── Demo course seeding ───────────────────────────────────────────────────────
def seed_demo_courses(app, db):
    """
    Insert sample courses if the database is empty.
    Only runs in development or on first deploy.
    """
    use_pg = app.config.get('USE_POSTGRES')
    ph     = '%s' if use_pg else '?'

    count = db.execute('SELECT COUNT(*) as c FROM courses').fetchone()
    if count and count['c'] > 0:
        print('📚 Courses already exist, skipping seed')
        return

    # Find the admin user to be the instructor
    admin = db.execute(
        f"SELECT id, name FROM users WHERE role='superadmin' LIMIT 1"
    ).fetchone()
    if not admin:
        return

    sample_courses = [
        {
            'title': 'Introduction to Web Development',
            'description': 'Learn HTML, CSS, and JavaScript from scratch. Perfect for beginners who want to build websites.',
            'category': 'Web Development',
            'difficulty': 'Beginner',
            'price': 0,
            'is_free': 1,
            'has_certificate': 1,
            'rating': 4.8,
        },
        {
            'title': 'Python for Data Science',
            'description': 'Master Python programming for data analysis, visualisation, and machine learning.',
            'category': 'Data Science',
            'difficulty': 'Intermediate',
            'price': 29.99,
            'is_free': 0,
            'has_certificate': 1,
            'rating': 4.7,
        },
        {
            'title': 'UI/UX Design Fundamentals',
            'description': 'Learn the principles of great user interface and user experience design.',
            'category': 'Design',
            'difficulty': 'Beginner',
            'price': 19.99,
            'is_free': 0,
            'has_certificate': 1,
            'rating': 4.6,
        },
    ]

    for course_data in sample_courses:
        cid = str(uuid.uuid4())
        placeholders = ','.join([ph] * 14)
        sql = (
            'INSERT INTO courses '
            '(id, title, description, instructor_id, instructor_name, '
            'category, difficulty, price, is_free, has_certificate, '
            'has_lifetime_access, rating, thumbnail, is_published) '
            'VALUES (' + placeholders + ')'
        )
        db.execute(sql, (
            cid,
            course_data['title'],
            course_data['description'],
            admin['id'],
            admin['name'],
            course_data['category'],
            course_data['difficulty'],
            course_data['price'],
            course_data['is_free'],
            course_data['has_certificate'],
            1,
            course_data['rating'],
            '/placeholder.jpg',
            1,
        ))
    db.commit()
    print(f'✅ Seeded {len(sample_courses)} demo courses')
