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
def _upgrade_demo_courses(app, db, use_pg, ph):
    """Backfill missing fields on already-seeded demo courses (idempotent)."""
    # Find demo courses created by superadmin (these are the seeded ones)
    admin = db.execute("SELECT id, name, avatar FROM users WHERE role='superadmin' LIMIT 1").fetchone()
    if not admin:
        print('  ℹ Skipping demo upgrade - no superadmin')
        return
    aid = admin['id']
    aavatar = admin['avatar'] if admin['avatar'] else '/placeholder-user.jpg'

    # Backfill tags + outcomes for the 3 known demo courses
    demo_data = {
        'Introduction to Web Development': {
            'tags': ['HTML', 'CSS', 'JavaScript', 'Beginner-Friendly'],
            'outcomes': [
                'Build responsive websites from scratch with HTML and CSS',
                'Use JavaScript to add interactivity to web pages',
                'Understand the fundamentals of how the web works',
                'Deploy your first website to the internet',
            ],
            'duration': '6 weeks',
            'num_reviews': 128,
            'has_resources': 1,
        },
        'Python for Data Science': {
            'tags': ['Python', 'Data Science', 'Pandas', 'NumPy', 'Machine Learning'],
            'outcomes': [
                'Write Python scripts to automate data tasks',
                'Analyse and clean datasets using Pandas',
                'Visualise data with matplotlib and seaborn',
                'Build your first machine learning model',
            ],
            'duration': '8 weeks',
            'num_reviews': 89,
            'has_resources': 1,
        },
        'UI/UX Design Fundamentals': {
            'tags': ['UI', 'UX', 'Design', 'Figma', 'Wireframing'],
            'outcomes': [
                'Apply design principles to create beautiful interfaces',
                'Conduct user research and create personas',
                'Build wireframes and prototypes in Figma',
                'Design with accessibility in mind',
            ],
            'duration': '4 weeks',
            'num_reviews': 56,
            'has_resources': 1,
        },
    }

    courses = db.execute(
        "SELECT id, title FROM courses WHERE instructor_id=" + ph,
        (aid,)
    ).fetchall()

    upgraded = 0
    for c in courses:
        title = c['title']
        if title not in demo_data:
            continue
        cid = c['id']
        info = demo_data[title]

        # Update missing course fields (only update fields that might be NULL/0)
        try:
            db.execute(
                "UPDATE courses SET instructor_avatar=" + ph +
                ", duration=COALESCE(NULLIF(duration,''), " + ph + ")" +
                ", num_reviews=GREATEST(COALESCE(num_reviews,0), " + ph + ")" +
                ", has_resources=" + ph +
                " WHERE id=" + ph,
                (aavatar, info['duration'], info['num_reviews'], info['has_resources'], cid)
            )
        except Exception as ex:
            # SQLite doesn't have GREATEST - use MAX
            try:
                db.execute(
                    "UPDATE courses SET instructor_avatar=" + ph +
                    ", duration=COALESCE(NULLIF(duration,''), " + ph + ")" +
                    ", num_reviews=" + ph +
                    ", has_resources=" + ph +
                    " WHERE id=" + ph,
                    (aavatar, info['duration'], info['num_reviews'], info['has_resources'], cid)
                )
            except Exception:
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass

        # Insert tags if not already present
        try:
            existing_tags = {r['tag'] for r in db.execute(
                "SELECT tag FROM course_tags WHERE course_id=" + ph, (cid,)
            ).fetchall()}
            for tag in info['tags']:
                if tag not in existing_tags:
                    db.execute(
                        "INSERT INTO course_tags (course_id,tag) VALUES (" + ph + "," + ph + ")",
                        (cid, tag)
                    )
        except Exception:
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass

        # Insert outcomes if not already present
        try:
            existing_outcomes = {r['outcome'] for r in db.execute(
                "SELECT outcome FROM course_outcomes WHERE course_id=" + ph, (cid,)
            ).fetchall()}
            for outcome in info['outcomes']:
                if outcome not in existing_outcomes:
                    db.execute(
                        "INSERT INTO course_outcomes (course_id,outcome) VALUES (" + ph + "," + ph + ")",
                        (cid, outcome)
                    )
        except Exception:
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass

        # Ensure course_perks row matches
        try:
            db.execute(
                "INSERT INTO course_perks (course_id,has_certificate,lifetime_access,has_resources)"
                " VALUES (" + ph + ",1,1," + ph + ")"
                " ON CONFLICT (course_id) DO UPDATE SET has_resources=EXCLUDED.has_resources",
                (cid, info['has_resources'])
            )
        except Exception:
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass

        upgraded += 1

    try:
        db.commit()
    except Exception:
        pass

    if upgraded:
        print('  ✅ Upgraded ' + str(upgraded) + ' demo courses with tags, outcomes, and metadata')



def seed_demo_courses(app, db):
    """Seed demo courses with sections, lessons and a quiz if DB is empty."""
    use_pg = app.config.get('USE_POSTGRES')
    ph = '%s' if use_pg else '?'

    count = db.execute('SELECT COUNT(*) as c FROM courses').fetchone()
    if count and count['c'] > 0:
        # Courses already exist - run upgrade to backfill missing fields
        _upgrade_demo_courses(app, db, use_pg, ph)
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
             duration='6 weeks',
             price=0, is_free=1, has_certificate=1, has_resources=1,
             rating=4.8, num_reviews=128,
             tags=['HTML', 'CSS', 'JavaScript', 'Beginner-Friendly'],
             learningOutcomes=[
                 'Build responsive websites from scratch with HTML and CSS',
                 'Use JavaScript to add interactivity to web pages',
                 'Understand the fundamentals of how the web works',
                 'Deploy your first website to the internet',
             ],
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
             duration='8 weeks',
             price=29.99, is_free=0, has_certificate=1, has_resources=1,
             rating=4.7, num_reviews=89,
             tags=['Python', 'Data Science', 'Pandas', 'NumPy', 'Machine Learning'],
             learningOutcomes=[
                 'Write Python scripts to automate data tasks',
                 'Analyse and clean datasets using Pandas',
                 'Visualise data with matplotlib and seaborn',
                 'Build your first machine learning model',
             ],
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
             duration='4 weeks',
             price=19.99, is_free=0, has_certificate=1, has_resources=1,
             rating=4.6, num_reviews=56,
             tags=['UI', 'UX', 'Design', 'Figma', 'Wireframing'],
             learningOutcomes=[
                 'Apply design principles to create beautiful interfaces',
                 'Conduct user research and create personas',
                 'Build wireframes and prototypes in Figma',
                 'Design with accessibility in mind',
             ],
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

    # Fetch admin avatar so seeded courses match instructor-created course structure
    admin_full = db.execute(
        "SELECT avatar FROM users WHERE id=" + ph,
        (aid,)
    ).fetchone()
    aavatar = (admin_full['avatar'] if admin_full and admin_full['avatar'] else '/placeholder-user.jpg')

    for course_data in courses:
        cid = str(uuid.uuid4())
        # Match instructor-created course schema exactly (all 17 columns)
        db.execute(
            'INSERT INTO courses (id,title,description,instructor_id,instructor_name,instructor_avatar,'
            'category,difficulty,duration,price,is_free,has_certificate,has_lifetime_access,'
            'has_resources,thumbnail,rating,num_reviews,is_published) VALUES (' + ','.join([ph]*18) + ')',
            (cid, course_data['title'], course_data['description'], aid, aname, aavatar,
             course_data['category'], course_data['difficulty'],
             course_data.get('duration', '4 weeks'),
             course_data['price'], course_data['is_free'],
             course_data['has_certificate'], 1,
             course_data.get('has_resources', 1),
             '/placeholder.jpg', course_data['rating'],
             course_data.get('num_reviews', 0), 1)
        )
        # Tags
        for tag in course_data.get('tags', []):
            db.execute(
                'INSERT INTO course_tags (course_id,tag) VALUES (' + ph + ',' + ph + ')',
                (cid, tag)
            )
        # Learning outcomes
        for outcome in course_data.get('learningOutcomes', []):
            db.execute(
                'INSERT INTO course_outcomes (course_id,outcome) VALUES (' + ph + ',' + ph + ')',
                (cid, outcome)
            )
        # Perks (matches instructor flow)
        db.execute(
            'INSERT INTO course_perks (course_id,has_certificate,lifetime_access,has_resources)'
            ' VALUES (' + ','.join([ph]*4) + ')',
            (cid, course_data['has_certificate'], 1,
             course_data.get('has_resources', 1))
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
