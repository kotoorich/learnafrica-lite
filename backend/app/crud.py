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
    """Seed demo courses with sections, lessons and a quiz if DB is empty."""
    use_pg = app.config.get('USE_POSTGRES')
    ph = '%s' if use_pg else '?'

    count = db.execute('SELECT COUNT(*) as c FROM courses').fetchone()
    if count and count['c'] > 0:
        print('📚 Courses already exist, skipping seed')
        return

    admin = db.execute(
        "SELECT id, name FROM users WHERE role='superadmin' LIMIT 1"
    ).fetchone()
    if not admin:
        return

    aid = admin['id']
    aname = admin['name']

    courses = [
        dict(title='Introduction to Web Development',
             description='Learn HTML, CSS, and JavaScript from scratch. Build real websites step by step.',
             category='Web Development', difficulty='Beginner',
             price=0, is_free=1, has_certificate=1, rating=4.8,
             sections=[
                 dict(title='Getting Started', lessons=[
                     dict(title='What is Web Development?', type='video',
                          video_url='https://www.youtube.com/watch?v=ysEN5RaKOlA',
                          duration='10 min', description='Overview of how the web works.'),
                     dict(title='Setting Up Your Environment', type='video',
                          video_url='https://www.youtube.com/watch?v=ysEN5RaKOlA',
                          duration='15 min', description='Install VS Code and set up your workspace.'),
                 ]),
                 dict(title='HTML Basics', lessons=[
                     dict(title='HTML Structure', type='video',
                          video_url='https://www.youtube.com/watch?v=ysEN5RaKOlA',
                          duration='20 min', description='Learn the building blocks of every webpage.'),
                     dict(title='HTML Quiz', type='quiz', duration='10 min',
                          description='Test your HTML knowledge.', is_final=1,
                          questions=[
                              dict(text='What does HTML stand for?', type='mcq',
                                   options=['HyperText Markup Language','HighText Machine Language','HyperTool Multi Language','None of these'],
                                   correct=0),
                              dict(text='Which tag creates a paragraph?', type='mcq',
                                   options=['<p>','<para>','<text>','<pg>'], correct=0),
                          ]),
                 ]),
             ]),
        dict(title='Python for Data Science',
             description='Master Python for data analysis, visualisation, and machine learning from scratch.',
             category='Data Science', difficulty='Intermediate',
             price=29.99, is_free=0, has_certificate=1, rating=4.7,
             sections=[
                 dict(title='Python Fundamentals', lessons=[
                     dict(title='Variables and Data Types', type='video',
                          video_url='https://www.youtube.com/watch?v=rfscVS0vtbw',
                          duration='25 min', description='Learn Python basics.'),
                     dict(title='Lists and Dictionaries', type='video',
                          video_url='https://www.youtube.com/watch?v=rfscVS0vtbw',
                          duration='30 min', description='Working with Python collections.'),
                 ]),
                 dict(title='Data Analysis', lessons=[
                     dict(title='Introduction to Pandas', type='video',
                          video_url='https://www.youtube.com/watch?v=rfscVS0vtbw',
                          duration='35 min', description='Analyse data with Pandas.'),
                     dict(title='Final Assessment', type='quiz', duration='15 min',
                          description='Test your Python knowledge.', is_final=1,
                          questions=[
                              dict(text='Which library is used for data analysis in Python?', type='mcq',
                                   options=['Pandas','NumPy','Matplotlib','All of above'], correct=0),
                              dict(text='Python is a compiled language.', type='true_false',
                                   options=['True','False'], correct=1),
                          ]),
                 ]),
             ]),
        dict(title='UI/UX Design Fundamentals',
             description='Learn the principles of great user interface and experience design.',
             category='Design', difficulty='Beginner',
             price=19.99, is_free=0, has_certificate=1, rating=4.6,
             sections=[
                 dict(title='Design Principles', lessons=[
                     dict(title='Introduction to UI Design', type='video',
                          video_url='https://www.youtube.com/watch?v=c9Wg6Cb_YlU',
                          duration='20 min', description='What is UI/UX design?'),
                     dict(title='Colour Theory', type='video',
                          video_url='https://www.youtube.com/watch?v=c9Wg6Cb_YlU',
                          duration='25 min', description='Using colour effectively.'),
                 ]),
                 dict(title='UX Research', lessons=[
                     dict(title='User Research Methods', type='video',
                          video_url='https://www.youtube.com/watch?v=c9Wg6Cb_YlU',
                          duration='30 min', description='How to understand your users.'),
                     dict(title='Design Quiz', type='quiz', duration='10 min',
                          description='Test your design knowledge.', is_final=1,
                          questions=[
                              dict(text='UX stands for?', type='mcq',
                                   options=['User Experience','User Extension','Unix Experience','User Exit'],
                                   correct=0),
                              dict(text='Colour contrast is important for accessibility.', type='true_false',
                                   options=['True','False'], correct=0),
                          ]),
                 ]),
             ]),
    ]

    for course_data in courses:
        cid = str(uuid.uuid4())
        db.execute(
            'INSERT INTO courses (id,title,description,instructor_id,instructor_name,'
            'category,difficulty,price,is_free,has_certificate,has_lifetime_access,'
            'rating,thumbnail,is_published) VALUES (' + ','.join([ph]*14) + ')',
            (cid, course_data['title'], course_data['description'], aid, aname,
             course_data['category'], course_data['difficulty'], course_data['price'],
             course_data['is_free'], course_data['has_certificate'], 1,
             course_data['rating'], '/placeholder.jpg', 1)
        )
        # Perks
        db.execute(
            'INSERT INTO course_perks (course_id,has_certificate,lifetime_access,has_resources)'
            ' VALUES (' + ','.join([ph]*4) + ')',
            (cid, course_data['has_certificate'], 1, 0)
        )
        # Sections and lessons
        for si, sec in enumerate(course_data.get('sections', [])):
            sid = str(uuid.uuid4())
            db.execute(
                'INSERT INTO curriculum_sections (id,course_id,title,"order") VALUES (' + ','.join([ph]*4) + ')',
                (sid, cid, sec['title'], si)
            )
            for li, les in enumerate(sec.get('lessons', [])):
                lid = str(uuid.uuid4())
                is_final = int(les.get('is_final', 0))
                db.execute(
                    'INSERT INTO lessons (id,course_id,title,description,duration,video_url,type,is_final,"order")'
                    ' VALUES (' + ','.join([ph]*9) + ')',
                    (lid, cid, les['title'], les.get('description',''),
                     les.get('duration','20 min'), les.get('video_url',''),
                     les['type'], is_final, li)
                )
                db.execute(
                    'INSERT INTO section_lessons (section_id,lesson_id,"order") VALUES (' + ','.join([ph]*3) + ')',
                    (sid, lid, li)
                )
                # Quiz questions
                if les['type'] == 'quiz' and les.get('questions'):
                    qzid = str(uuid.uuid4())
                    db.execute(
                        'INSERT INTO quizzes (id,course_id,lesson_id,title,duration) VALUES (' + ','.join([ph]*5) + ')',
                        (qzid, cid, lid, les['title'], '10')
                    )
                    for qi, q in enumerate(les['questions']):
                        db.execute(
                            'INSERT INTO quiz_questions (id,quiz_id,question_text,options,correct_answer,question_type,"order")'
                            ' VALUES (' + ','.join([ph]*7) + ')',
                            (str(uuid.uuid4()), qzid, q['text'],
                             json.dumps(q['options']), q['correct'],
                             q.get('type','mcq'), qi)
                        )
        db.commit()
        print(f'  ✅ Seeded: {course_data["title"]}')
    print(f'✅ Seeded {len(courses)} demo courses with sections and lessons')
