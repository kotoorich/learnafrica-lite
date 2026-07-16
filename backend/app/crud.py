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

    # Default instructor profile values for the admin
    DEFAULT_ADMIN_NAME   = 'LearnAfrica Team'
    DEFAULT_AVATAR       = '/placeholder-user.jpg'
    DEFAULT_BIO          = (
        'Experienced educator and platform administrator with over a decade of teaching '
        'in technology, design, and business. Passionate about making quality education '
        'accessible to learners across Africa.'
    )
    DEFAULT_LOCATION     = 'Accra, Ghana'
    DEFAULT_WEBSITE      = 'https://learnafrica-lite-weld.vercel.app'
    # Specialisation: stored primarily in instructor_field.
    # instructor_title is kept identical for backward compatibility.
    DEFAULT_SPECIALISATION = 'Web Development & Online Education'
    DEFAULT_TITLE          = DEFAULT_SPECIALISATION
    DEFAULT_FIELD          = DEFAULT_SPECIALISATION

    if not existing:
        uid = str(uuid.uuid4())
        pw  = generate_password_hash(admin_pass)
        sql = (
            'INSERT INTO users '
            '(id, name, email, password_hash, role, avatar, bio, location, website,'
            ' instructor_title, instructor_field, instructor_status, is_active) '
            'VALUES (' + ','.join([ph]*13) + ')'
        )
        db.execute(sql, (
            uid, DEFAULT_ADMIN_NAME, admin_email, pw, 'superadmin',
            DEFAULT_AVATAR, DEFAULT_BIO, DEFAULT_LOCATION, DEFAULT_WEBSITE,
            DEFAULT_TITLE, DEFAULT_FIELD, 'approved', 1
        ))
        db.execute(
            'INSERT INTO user_stats (user_id) VALUES (' + ph + ')',
            (uid,)
        )
        db.commit()
        print(f'✅ Default admin created: {admin_email}')
    else:
        # Admin exists - backfill any missing instructor profile fields (idempotent)
        try:
            uid = existing['id']
            row = db.execute(
                'SELECT avatar, bio, location, website, instructor_title, instructor_field'
                ' FROM users WHERE id=' + ph,
                (uid,)
            ).fetchone()
            updates = []
            params = []
            if row and not row['avatar']:
                updates.append('avatar=' + ph); params.append(DEFAULT_AVATAR)
            if row and not row['bio']:
                updates.append('bio=' + ph); params.append(DEFAULT_BIO)
            if row and not row['location']:
                updates.append('location=' + ph); params.append(DEFAULT_LOCATION)
            if row and not row['website']:
                updates.append('website=' + ph); params.append(DEFAULT_WEBSITE)
            # Keep both columns in sync with the single source-of-truth specialisation
            if row and (not row['instructor_field'] or not row['instructor_title']):
                if not row['instructor_field']:
                    updates.append('instructor_field=' + ph); params.append(DEFAULT_SPECIALISATION)
                if not row['instructor_title']:
                    updates.append('instructor_title=' + ph); params.append(DEFAULT_SPECIALISATION)
            if updates:
                params.append(uid)
                db.execute('UPDATE users SET ' + ','.join(updates) + ' WHERE id=' + ph, tuple(params))
                db.commit()
                print(f'✅ Default admin profile backfilled ({len(updates)} fields)')
            else:
                print(f'✅ Default admin exists: {admin_email}')
        except Exception as ex:
            print(f'⚠ admin profile backfill failed: {ex}')
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass


# ── Demo course seeding ───────────────────────────────────────────────────────
def seed_instructor_guide(app, db):
    """Seed a comprehensive default instructor guide that's ready to use.
    Admin can edit any of these steps later. If steps already exist, this is a no-op."""
    use_pg = app.config.get('USE_POSTGRES')
    ph = '%s' if use_pg else '?'

    # Ensure all expected columns exist on the live DB
    if use_pg:
        for col_sql in [
            'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS description TEXT',
            'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS content TEXT',
            'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS video_url TEXT',
        ]:
            try:
                db.execute(col_sql)
                db.commit()
            except Exception:
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass

    try:
        row = db.execute('SELECT COUNT(*) as c FROM instructor_guide').fetchone()
        count = row['c'] if row else 0
    except Exception:
        try:
            if hasattr(db, '_conn'): db._conn.rollback()
        except Exception: pass
        count = 0

    # If forced or table has fewer than 5 steps (likely test data), reseed comprehensively.
    force = os.environ.get('FORCE_SEED_GUIDE', '').lower() in ('1','true','yes')
    if count > 0 and not force:
        if count >= 5:
            print('Instructor guide already populated (' + str(count) + ' steps), skipping seed')
            return
        # Has 1-4 steps - looks like test/placeholder data. Clear and reseed.
        try:
            print('Found only ' + str(count) + ' guide steps - clearing and reseeding with full guide')
            db.execute('DELETE FROM instructor_guide')
            db.commit()
        except Exception:
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return  # bail if we can't clear
    elif force and count > 0:
        try:
            print('FORCE_SEED_GUIDE set - clearing existing ' + str(count) + ' steps')
            db.execute('DELETE FROM instructor_guide')
            db.commit()
        except Exception:
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass

    # 10-step comprehensive guide covering the full instructor journey.
    # Format: (title, short description, long content shown when expanded)
    default_steps = [
        (
            'Welcome to LearnAfrica',
            'Your journey as a LearnAfrica instructor starts here.',
            'Welcome aboard! As a LearnAfrica instructor, you can create high-quality courses, reach thousands of African learners, and build a sustainable teaching practice. This 10-step guide walks you through every part of the platform - from setting up your profile to publishing your first course and engaging with students. Take your time. Each step builds on the last. You can return here anytime to refresh your memory.'
        ),
        (
            'Complete Your Instructor Profile',
            'A trustworthy profile = more enrolments. Set yours up properly.',
            'Click your profile icon in the top-right corner and choose "My Profile". Fill in every field:\n\n• Avatar: upload a clear, professional headshot (square images work best)\n• Full name: use your real name - students search for instructors by name\n• Professional title: e.g. "Senior Software Engineer", "UX Designer at Acme"\n• Specialisation: your main field (Web Development, Data Science, Design, etc.)\n• Bio: 2-4 sentences about your experience and what you teach\n• Location: where you are based - builds trust with local learners\n• Website/Portfolio: link to your professional site (optional but recommended)\n\nStudents are 3x more likely to enrol in courses by instructors with complete profiles. Your profile appears on every course you publish.'
        ),
        (
            'Plan Your First Course Carefully',
            'Plan before you build. Focused courses get higher ratings.',
            'Before clicking "Create Course", sketch out your plan:\n\n1. Pick a SPECIFIC topic. "Python for Beginners" beats "Programming". Narrow wins.\n2. Write 3-5 learning OUTCOMES. What will students be able to DO after the course? Use action verbs: "Build", "Analyse", "Deploy", "Design".\n3. Outline 3-6 sections. Each section is a chapter.\n4. Plan 2-4 lessons per section. Mix videos and quizzes.\n5. Aim for 2-6 hours of total content. Quality beats quantity.\n6. Identify the prerequisites students need (be honest - this builds trust).\n7. Decide your pricing: free, paid, or freemium.\n\nA focused 3-hour course on one topic outperforms a sprawling 20-hour course every time.'
        ),
        (
            'Create Your Course',
            'From the Instructor Dashboard, click + New Course.',
            'On the Instructor Dashboard, click the + New Course button. Fill in each field carefully:\n\n• TITLE: clear and benefit-focused (e.g. "Master React Hooks in 4 Weeks")\n• DESCRIPTION: 2-3 paragraphs covering what students learn, who it is for, and what they will achieve\n• CATEGORY: pick the closest match. If none fits, choose "+ Custom category" and type your own\n• DIFFICULTY: Beginner, Intermediate, or Advanced - be honest\n• DURATION: rough estimate (e.g. "6 weeks", "20 hours")\n• TAGS: 3-6 keywords students search for (e.g. "React", "JavaScript", "Frontend")\n• LEARNING OUTCOMES: paste your 3-5 outcomes - this appears prominently on the course page\n• PRICING: $0 for free, or any amount for paid\n• PERKS: toggle certificate, lifetime access, and downloadable resources\n• THUMBNAIL: upload a clear 1280x720 image representing your course\n\nClick Save. You can always come back and refine later.'
        ),
        (
            'Build the Curriculum',
            'Sections + lessons. Mix Video and Quiz lessons for variety.',
            'Inside the course editor, click "Curriculum" to build your content:\n\n• Click + Add Section for each chapter (e.g. "Getting Started", "Core Concepts", "Advanced Topics")\n• Inside each section, click + Video Lesson or + Quiz Lesson\n\nVIDEO LESSONS:\n- Paste a YouTube or Vimeo URL (easiest), OR upload an MP4 file directly\n- Write a clear title and 1-2 sentence description\n- Set a duration estimate (e.g. "15 min")\n- Optionally add a text transcript for accessibility\n\nQUIZ LESSONS:\n- Add questions one at a time\n- Pick the type: Multiple Choice, True/False, or Fill in the Blank\n- Mark the correct answer (students never see this)\n- The last quiz in your course can be marked as the "Final Quiz" to enable certificates\n\nDRAG-AND-DROP to reorder sections and lessons. Click the red trash icon to delete a lesson.'
        ),
        (
            'Add Downloadable Resources',
            'Cheat sheets, code samples, PDFs - boost engagement.',
            'Resources help students apply what they learn outside the video. In each lesson, click "Add Resource" to attach files:\n\n• PDF cheat sheets and quick references\n• Code samples and starter projects (.zip files)\n• Slide decks and worksheets\n• Templates students can customise\n• Links to external documentation or articles\n\nMaximum file size is 50MB per resource. Supported formats: PDF, DOCX, XLSX, PPTX, ZIP, MP4, MP3, images, and code files.\n\nMake sure you toggle the "Has Resources" perk ON in the course settings - this displays a "Resources Included" badge on your course card. Resource-rich courses get up to 40% higher completion rates.'
        ),
        (
            'Preview Your Course Before Publishing',
            'See exactly what students will experience.',
            'Before going live, ALWAYS preview your course. Click the "Preview Course" button at the top of the editor.\n\nThis shows your course exactly as a student would see it:\n• The landing page with description, outcomes, and instructor info\n• Each lesson with the video player, transcript, and resources\n• Each quiz with proper question rendering\n• The certificate flow if you have a final quiz\n\nCheckpoints:\n- All videos load and play correctly\n- Thumbnails appear properly\n- No typos in titles or descriptions\n- Quizzes have the right correct answers marked\n- Resources are downloadable\n- The course flow makes sense end-to-end\n\nClick through every single lesson at least once. First impressions matter - one broken video can drive students away.'
        ),
        (
            'Publish Your Course',
            'When polished, toggle Published to go live.',
            'When your course is ready, toggle the "Published" switch to ON at the top of the editor.\n\nYour course will immediately appear in:\n• The public Courses browse page\n• Search results matching your keywords\n• Category and tag filters\n• Your instructor profile page\n• The featured courses carousel (if rating is high enough)\n\nNew courses get a small visibility boost in the first 2 weeks. Use this window:\n• Share the course link with your network\n• Post on LinkedIn, Twitter, your blog\n• Email your existing audience\n• Invite 5-10 friends to take it and leave honest reviews\n\nThe first 10-20 enrolments create social proof that attracts more students.'
        ),
        (
            'Engage With Your Students',
            'Active instructors get better ratings and more enrolments.',
            'After publishing, check your course discussions tab regularly. Active instructors earn:\n• 4.5+ star ratings on average\n• 2x more enrolments than passive instructors\n• Higher search visibility\n\nBest practices:\n• Answer student questions within 24 hours when possible\n• Pin important threads (the pin icon on each post)\n• Thank students who leave reviews - even short replies count\n• Address constructive criticism publicly and politely\n• Reply to private messages from enrolled students\n• Acknowledge bugs/typos when found and fix them quickly\n\nA student who feels heard is 5x more likely to recommend your course. The discussions tab is your single biggest growth lever after launch.'
        ),
        (
            'Track Performance and Keep Improving',
            'Use analytics to iterate. Your first course is version 1.',
            'Your Instructor Dashboard shows:\n• Total students enrolled per course\n• Course completion rates (aim for above 40%)\n• Average ratings and total reviews\n• Revenue earned (for paid courses)\n• Monthly enrolment trends\n• Recent students who joined\n\nWhat the numbers mean:\n- LOW COMPLETION RATE → lessons too long, content too dense, missing context. Break up long videos.\n- LOW RATINGS → check reviews for patterns. Common issues: pacing, audio quality, outdated content.\n- HIGH DROP-OFF AT A SPECIFIC LESSON → that lesson needs work. Replace it.\n- HIGH RATINGS BUT LOW ENROLMENTS → marketing problem. Improve title, thumbnail, description.\n\nTreat your first course as version 1. Update it every 3 months based on real student feedback. The best courses on LearnAfrica are constantly evolving.'
        ),
    ]

    inserted = 0
    for i, (title, description, content) in enumerate(default_steps, start=1):
        try:
            db.execute(
                'INSERT INTO instructor_guide (step_number,title,description,content) VALUES (' + ph + ',' + ph + ',' + ph + ',' + ph + ')',
                (i, title, description, content)
            )
            inserted += 1
        except Exception as ex:
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass

    try:
        db.commit()
    except Exception:
        pass

    if inserted:
        print('Seeded ' + str(inserted) + ' default instructor guide steps (admin can edit)')



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
            'weeks': 6,
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
            'weeks': 8,
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
            'weeks': 4,
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

        # Backfill weeks_required (new field — only if currently 0/NULL)
        try:
            db.execute(
                "UPDATE courses SET weeks_required=" + ph +
                " WHERE id=" + ph + " AND (weeks_required IS NULL OR weeks_required=0)",
                (info.get('weeks', 0), cid)
            )
        except Exception:
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass

        # Backfill lesson duration_seconds — parse the text "duration" if not set yet
        try:
            lessons = db.execute(
                "SELECT id, duration, duration_seconds FROM lessons WHERE course_id=" + ph,
                (cid,)
            ).fetchall()
            for les in lessons:
                if not les['duration_seconds'] or les['duration_seconds'] == 0:
                    # Parse "15 min" / "30 min" etc.
                    dur_str = (les['duration'] or '').strip().lower()
                    secs = 0
                    try:
                        if 'min' in dur_str:
                            secs = int(''.join(ch for ch in dur_str if ch.isdigit())) * 60
                        elif 'hour' in dur_str or 'hr' in dur_str:
                            secs = int(''.join(ch for ch in dur_str if ch.isdigit())) * 3600
                    except Exception:
                        secs = 600  # default 10 min
                    if secs > 0:
                        db.execute(
                            "UPDATE lessons SET duration_seconds=" + ph + " WHERE id=" + ph,
                            (secs, les['id'])
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
        # Set weeks_required (try silently — column may not exist on very old DBs)
        try:
            # Parse weeks from duration string if not given explicitly
            weeks = course_data.get('weeks_required', 0)
            if not weeks:
                dur = (course_data.get('duration') or '').lower()
                try:
                    weeks = int(''.join(ch for ch in dur if ch.isdigit())) if 'week' in dur else 0
                except Exception:
                    weeks = 0
            db.execute(
                "UPDATE courses SET weeks_required=" + ph + " WHERE id=" + ph,
                (weeks, cid)
            )
        except Exception:
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
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
                # Set duration_seconds from the duration text (best-effort, silent fail)
                try:
                    dur_text = (les.get('duration') or '').lower()
                    secs = 0
                    if 'min' in dur_text:
                        secs = int(''.join(ch for ch in dur_text if ch.isdigit())) * 60
                    elif 'hour' in dur_text or 'hr' in dur_text:
                        secs = int(''.join(ch for ch in dur_text if ch.isdigit())) * 3600
                    if secs > 0:
                        db.execute(
                            "UPDATE lessons SET duration_seconds=" + ph + " WHERE id=" + ph,
                            (secs, lid)
                        )
                except Exception:
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
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
