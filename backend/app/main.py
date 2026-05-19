"""
main.py — Flask application factory.

This file:
  1. Creates the Flask app and configures it from environment variables
  2. Sets up CORS (Cross-Origin Resource Sharing) so the frontend can call the API
  3. Sets up Flask-SocketIO for real-time features (notifications, comments)
  4. Registers the database teardown hook
  5. Contains ALL API route handlers

Import structure:
  database.py  → get_db(), init_db(), close_db()
  security.py  → token_required, admin_required, instructor_required,
                 generate_token, decode_token
  schema.py    → full_user(), settings_dict(), upsert_settings(),
                 validate_signup(), allowed_image()
  crud.py      → get_revenue_split(), create_notification(), push_notification(),
                 upload_to_supabase(), seed_admin(), seed_demo_courses()
  models.py    → get_course_sections(), score_quiz(), get_or_issue_certificate(),
                 get_instructor_stats()
"""
import os, json, uuid
from datetime import datetime, timedelta
from functools import wraps
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from flask import Flask, request, jsonify, g, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from threading import Lock
import jwt

from .database  import get_db, close_db, init_db
from .security  import (token_required, admin_required, instructor_required,
                         generate_token, decode_token, _get_token)
from .schema    import (full_user, settings_dict, upsert_settings,
                         validate_signup, allowed_image, allowed_file,
                         COURSE_CATEGORIES)
from .crud      import (get_revenue_split, create_notification, push_notification,
                         upload_to_supabase, seed_admin, seed_demo_courses)
from .models    import (get_course_sections, score_quiz, get_or_issue_certificate,
                         get_instructor_stats, get_user_enrolled_courses)

# ── Globals (set inside create_app) ──────────────────────────────────────────
socketio = None

def create_app() -> Flask:
    """
    Application factory.
    Call this to get a configured Flask app instance.
    Used by both the development server (app.py) and gunicorn (wsgi.py).
    """
    global socketio

    app = Flask(__name__)

    # ── Configuration ─────────────────────────────────────────────────────────
    app.config['SECRET_KEY']           = os.environ.get('SECRET_KEY', 'dev-secret-CHANGE-IN-PRODUCTION')
    app.config['JWT_SECRET']           = os.environ.get('JWT_SECRET', app.config['SECRET_KEY'])
    app.config['JWT_EXPIRATION_HOURS'] = int(os.environ.get('JWT_EXPIRATION_HOURS', 24))
    app.config['DATABASE_URL']         = os.environ.get('DATABASE_URL', '')
    app.config['USE_POSTGRES']         = app.config['DATABASE_URL'].startswith('postgres')
    app.config['DATABASE']             = os.environ.get('DATABASE_PATH',
        os.path.join(os.path.dirname(os.path.dirname(__file__)), 'instance', 'learnafrica.db'))
    app.config['PASS_MIN_LENGTH']      = int(os.environ.get('PASS_MIN_LENGTH', 6))
    app.config['QUIZ_PASS_SCORE']      = int(os.environ.get('QUIZ_PASS_SCORE', 70))
    app.config['MAX_CONTENT_LENGTH']   = 600 * 1024 * 1024  # 600MB

    # Local file upload folder (dev only — production uses Supabase)
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'instance', 'uploads')
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    if not app.config['USE_POSTGRES']:
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Allow your Vercel frontend URL. Set ALLOWED_ORIGINS in environment.
    # Multiple origins: separate with commas.
    _raw = os.environ.get('ALLOWED_ORIGINS',
        'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173')
    _origins = [o.strip() for o in _raw.split(',') if o.strip()]
    CORS(app, origins=_origins, supports_credentials=True)

    # ── SocketIO ───────────────────────────────────────────────────────────────
    _mode = 'gevent' if os.environ.get('FLASK_ENV') == 'production' else 'threading'
    socketio = SocketIO(app, cors_allowed_origins='*', async_mode=_mode)

    # ── Database teardown ──────────────────────────────────────────────────────
    app.teardown_appcontext(close_db)

    # ── Helpers available inside all routes ───────────────────────────────────
    active_connections = {}
    connections_lock   = Lock()

    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm',
                           'pdf', 'doc', 'docx', 'zip'}

    def _ph():
        """Return the correct SQL placeholder for the active database."""
        return '%s' if app.config.get('USE_POSTGRES') else '?'

    def _use_pg():
        return bool(app.config.get('USE_POSTGRES'))

    @socketio.on('connect')
    def on_connect():
        p = decode_token(request.args.get('token', ''))
        if p:
            uid = p['user_id']
            with connections_lock: active_connections[uid] = request.sid
            join_room(f'user_{uid}')
            emit('connected', {'status': 'ok', 'user_id': uid})
        else:
            emit('connected', {'status': 'ok', 'guest': True})
    
    @socketio.on('disconnect')
    def on_disconnect():
        for uid, sid in list(active_connections.items()):
            if sid == request.sid:
                with connections_lock: del active_connections[uid]
                break
    
    def push_notification(user_id, notif):
        with connections_lock:
            if user_id in active_connections:
                socketio.emit('new_notification', notif, room=f'user_{user_id}')
                return True
        return False
    
    def create_notification(db, user_id, ntype, title, message, internal_id=None):
        nid = str(uuid.uuid4())
        db.execute('''INSERT INTO notifications (id,user_id,type,title,message,internal_id)
                      VALUES (?,?,?,?,?,?)''', (nid, user_id, ntype, title, message, internal_id))
        db.commit()
        notif = {'id': nid, 'type': ntype, 'title': title, 'message': message,
                 'read': False, 'time': datetime.now().strftime('%H:%M'),
                 'date': datetime.now().strftime('%Y-%m-%d')}
        push_notification(user_id, notif)
        return nid
    
    # ── Helpers ───────────────────────────────────────────────────────────────────
    def settings_dict(row):
        if not row:
            return {'notifications':{'email':True,'push':False,'updates':True},
                    'privacy':{'twoFactor':False},
                    'instructor':{'payout':True,'messages':True}}
        return {'notifications':{'email':bool(row['email_notifications']),
                                  'push':bool(row['push_notifications']),
                                  'updates':bool(row['updates_notifications'])},
                'privacy':{'twoFactor':bool(row['two_factor_enabled'])},
                'instructor':{'payout':bool(row['instructor_payout_alerts']),
                              'messages':bool(row['instructor_messages'])}}
    
    def upsert_settings(db, uid, s):
        n = s.get('notifications', {})
        p = s.get('privacy', {})
        i = s.get('instructor', {})
        db.execute('''INSERT INTO user_settings
            (user_id,email_notifications,push_notifications,updates_notifications,
             two_factor_enabled,instructor_payout_alerts,instructor_messages)
            VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET
              email_notifications=excluded.email_notifications,
              push_notifications=excluded.push_notifications,
              updates_notifications=excluded.updates_notifications,
              two_factor_enabled=excluded.two_factor_enabled,
              instructor_payout_alerts=excluded.instructor_payout_alerts,
              instructor_messages=excluded.instructor_messages''',
            (uid, int(n.get('email',True)), int(n.get('push',False)),
             int(n.get('updates',True)), int(p.get('twoFactor',False)),
             int(i.get('payout',True)), int(i.get('messages',True))))
    
    def full_user(db, uid):
        u = db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
        if not u: return None
        u = dict(u)
        st = db.execute('SELECT * FROM user_stats WHERE user_id=?', (uid,)).fetchone()
        bd = [r['badge_key'] for r in db.execute('SELECT badge_key FROM user_badges WHERE user_id=?',(uid,))]
        se = db.execute('SELECT * FROM user_settings WHERE user_id=?', (uid,)).fetchone()
        en = [dict(r) for r in db.execute(
            'SELECT course_id, progress, enrolled_at, completed_at FROM user_enrollments WHERE user_id=?',(uid,))]
        return {
            'id':                u.get('id'),
            'name':              u.get('name', ''),
            'email':             u.get('email', ''),
            'role':              u.get('role', 'student'),
            'avatar':            u.get('avatar'),
            'bio':               u.get('bio', ''),
            'location':          u.get('location', ''),
            'website':           u.get('website', ''),
            'instructor_status': u.get('instructor_status', 'none'),
            'is_active':         bool(u.get('is_active', 1)),
            'created_at':        u.get('created_at'),
            'stats':             dict(st) if st else {},
            'badges':            bd,
            'settings':          settings_dict(se),
            'enrollments':       en,
        }
    
    # ── AUTH ──────────────────────────────────────────────────────────────────────
    @app.route('/api/auth/signup', methods=['POST'])
    def signup():
        d = request.get_json() or {}
        for f in ('name','email','password'):
            if not d.get(f): return jsonify({'error': f'{f} is required'}), 400
        if len(d['password']) < app.config['PASS_MIN_LENGTH']:
            return jsonify({'error': f'Password must be at least {app.config["PASS_MIN_LENGTH"]} characters'}), 400
    
        db = get_db()
        if db.execute('SELECT id FROM users WHERE LOWER(email)=?',(d['email'].lower(),)).fetchone():
            return jsonify({'error': 'Email already registered'}), 409
    
        uid = str(uuid.uuid4())
        is_instructor = d.get('role') == 'instructor' or d.get('isInstructor')
        role = 'instructor' if is_instructor else 'student'
        # First user ever becomes superadmin
        if db.execute('SELECT COUNT(*) as c FROM users').fetchone()['c'] == 0:
            role = 'superadmin'
    
        db.execute('''INSERT INTO users (id,name,email,password_hash,role,bio,location,website,instructor_title,instructor_status)
                      VALUES(?,?,?,?,?,?,?,?,?,?)''',
                   (uid, d['name'], d['email'].lower(), generate_password_hash(d['password']),
                    role, d.get('bio',''), d.get('location',''), d.get('website',''),
                    d.get('title','') or d.get('instructor_title',''),
                    'approved' if role in ('admin','superadmin') else
                    ('pending' if role == 'instructor' else 'none')))
        db.execute('INSERT INTO user_stats (user_id, streak, last_activity) VALUES(?,1,DATE("now"))', (uid,))
        db.execute('INSERT INTO user_settings (user_id) VALUES(?)', (uid,))
    
        # If instructor, create application record
        if role == 'instructor':
            db.execute('''INSERT OR IGNORE INTO instructor_applications (id,user_id,bio,location,website,status)
                          VALUES(?,?,?,?,?,"pending")''',
                       (str(uuid.uuid4()), uid, d.get('bio',''), d.get('location',''), d.get('website','')))
            # Notify all admins
            admins = db.execute("SELECT id FROM users WHERE role IN ('admin','superadmin')").fetchall()
            for admin in admins:
                create_notification(db, admin['id'], 'system',
                    'New Instructor Application',
                    f'{d["name"]} has applied to become an instructor. Review in Admin Panel.',
                    f'instructor_app_{uid}')
    
        db.commit()
        token = generate_token(uid, d['email'].lower(), role)
        return jsonify({'message': 'Account created', 'token': token,
                        'user': full_user(db, uid)}), 201
    
    @app.route('/api/auth/login', methods=['POST'])
    def login():
        if not request.is_json: return jsonify({'error': 'JSON required'}), 400
        d = request.get_json()
        email = (d.get('email') or '').strip().lower()
        pw = d.get('password','')
        if not email or not pw: return jsonify({'error': 'Email and password required'}), 400
    
        db = get_db()
        u = db.execute('SELECT * FROM users WHERE LOWER(email)=? AND is_active=1',(email,)).fetchone()
        if not u or not check_password_hash(u['password_hash'], pw):
            return jsonify({'error': 'Invalid email or password'}), 401
    
        db.execute('UPDATE user_stats SET last_activity=DATE("now") WHERE user_id=?',(u['id'],))
        db.commit()
        token = generate_token(u['id'], u['email'], u['role'])
        return jsonify({'token': token, 'user': full_user(db, u['id'])})
    
    @app.route('/api/auth/verify', methods=['GET'])
    @token_required
    def verify():
        u = full_user(get_db(), g.current_user['user_id'])
        if not u: return jsonify({'error': 'User not found'}), 404
        return jsonify({'valid': True, 'user': u})
    
    @app.route('/api/auth/logout', methods=['POST'])
    @token_required
    def logout():
        return jsonify({'message': 'Logged out'})
    
    # ── USERS ─────────────────────────────────────────────────────────────────────
    @app.route('/api/users/profile', methods=['GET'])
    @token_required
    def get_profile():
        u = full_user(get_db(), g.current_user['user_id'])
        if not u: return jsonify({'error': 'Not found'}), 404
        return jsonify(u)
    
    @app.route('/api/users/profile', methods=['PUT'])
    @token_required
    def update_profile():
        d = request.get_json() or {}
        db = get_db()
        fields, vals = [], []
        for f in ('name','avatar','bio','location','website'):
            if f in d:
                fields.append(f'{f}=?'); vals.append(d[f])
        if fields:
            vals.append(g.current_user['user_id'])
            db.execute(f'UPDATE users SET {",".join(fields)},updated_at=CURRENT_TIMESTAMP WHERE id=?', vals)
        u = db.execute('SELECT bio,avatar FROM users WHERE id=?',(g.current_user['user_id'],)).fetchone()
        if u and u['bio'] and u['avatar']:
            db.execute('UPDATE user_stats SET is_profile_complete=1 WHERE user_id=?',(g.current_user['user_id'],))
            db.execute('INSERT OR IGNORE INTO user_badges (user_id,badge_key) VALUES(?,"PATHFINDER")',(g.current_user['user_id'],))
        if 'settings' in d:
            upsert_settings(db, g.current_user['user_id'], d['settings'])
        db.commit()
        return jsonify({'message': 'Profile updated', 'user': full_user(db, g.current_user['user_id'])})
    
    @app.route('/api/users/settings', methods=['GET'])
    @token_required
    def get_settings():
        db = get_db()
        row = db.execute('SELECT * FROM user_settings WHERE user_id=?',(g.current_user['user_id'],)).fetchone()
        return jsonify({'settings': settings_dict(row)})
    
    @app.route('/api/users/settings', methods=['PUT'])
    @token_required
    def update_settings():
        db = get_db()
        upsert_settings(db, g.current_user['user_id'], request.get_json() or {})
        db.commit()
        return jsonify({'message': 'Settings updated'})
    
    @app.route('/api/users/change-password', methods=['POST'])
    @token_required
    def change_password():
        d = request.get_json() or {}
        if not d.get('current_password') or not d.get('new_password'):
            return jsonify({'error': 'Both passwords required'}), 400
        if len(d['new_password']) < app.config['PASS_MIN_LENGTH']:
            return jsonify({'error': f'Password must be at least {app.config["PASS_MIN_LENGTH"]} characters'}), 400
        db = get_db()
        u = db.execute('SELECT password_hash FROM users WHERE id=?',(g.current_user['user_id'],)).fetchone()
        if not u or not check_password_hash(u['password_hash'], d['current_password']):
            return jsonify({'error': 'Current password is incorrect'}), 401
        db.execute('UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                   (generate_password_hash(d['new_password']), g.current_user['user_id']))
        db.commit()
        return jsonify({'message': 'Password changed successfully'})
    
    @app.route('/api/users/account', methods=['DELETE'])
    @token_required
    def delete_account():
        d = request.get_json() or {}
        db = get_db()
        u = db.execute('SELECT email FROM users WHERE id=?',(g.current_user['user_id'],)).fetchone()
        if not u or (d.get('email','').lower() != u['email'].lower()):
            return jsonify({'error': 'Email does not match'}), 400
        db.execute('UPDATE users SET is_active=0 WHERE id=?',(g.current_user['user_id'],))
        db.commit()
        return jsonify({'message': 'Account deleted'})
    
    # ── INSTRUCTOR APPLICATION ────────────────────────────────────────────────────
    @app.route('/api/instructor/apply', methods=['POST'])
    @token_required
    def apply_instructor():
        db = get_db()
        u = db.execute('SELECT role,instructor_status FROM users WHERE id=?',(g.current_user['user_id'],)).fetchone()
        if u['role'] != 'instructor':
            return jsonify({'error': 'Only instructor accounts can apply'}), 400
        if u['instructor_status'] == 'approved':
            return jsonify({'message': 'Already approved'}), 200
        d = request.get_json() or {}
        db.execute('''INSERT INTO instructor_applications (id,user_id,bio,location,website,status)
                      VALUES(?,?,?,?,?,"pending")
                      ON CONFLICT(user_id) DO UPDATE SET
                        bio=excluded.bio, location=excluded.location,
                        website=excluded.website, status="pending", applied_at=CURRENT_TIMESTAMP''',
                   (str(uuid.uuid4()), g.current_user['user_id'],
                    d.get('bio',''), d.get('location',''), d.get('website','')))
        db.execute('UPDATE users SET instructor_status="pending" WHERE id=?',(g.current_user['user_id'],))
        db.commit()
        return jsonify({'message': 'Application submitted. Await admin approval.'})
    
    # ── COURSES ───────────────────────────────────────────────────────────────────
    @app.route('/api/courses', methods=['GET'])
    def get_courses():
        db = get_db()
        rows = db.execute("""SELECT c.*,
                (SELECT COUNT(*) FROM user_enrollments WHERE course_id=c.id) as real_enrollments
                FROM courses c WHERE c.status='published'
                ORDER BY real_enrollments DESC""").fetchall()
        courses = []
        for r in rows:
            c = dict(r)
            c['tags'] = [x['tag'] for x in db.execute('SELECT tag FROM course_tags WHERE course_id=?',(c['id'],))]
            c['learningOutcomes'] = [x['outcome'] for x in db.execute('SELECT outcome FROM course_outcomes WHERE course_id=?',(c['id'],))]
            courses.append(c)
        return jsonify({'courses': courses})
    
    @app.route('/api/courses/<cid>', methods=['GET'])
    def get_course(cid):
        db = get_db()
        c = db.execute('SELECT * FROM courses WHERE id=?',(cid,)).fetchone()
        if not c: return jsonify({'error': 'Course not found'}), 404
        cd = dict(c)
        cd['tags'] = [x['tag'] for x in db.execute('SELECT tag FROM course_tags WHERE course_id=?',(cid,))]
        cd['learningOutcomes'] = [x['outcome'] for x in db.execute('SELECT outcome FROM course_outcomes WHERE course_id=?',(cid,))]
        perks = db.execute('SELECT * FROM course_perks WHERE course_id=?',(cid,)).fetchone()
        cd['has_certificate'] = bool(perks['has_certificate']) if perks else bool(cd.get('has_certificate'))
        cd['has_lifetime_access'] = bool(perks['lifetime_access']) if perks else bool(cd.get('has_lifetime_access'))
        cd['has_resources'] = bool(perks['has_resources']) if perks else bool(cd.get('has_resources'))
    
        p = decode_token(_get_token())
        uid = p['user_id'] if p else None
        lessons = []
        # Return sections with nested lessons (grouped)
        sections = []
        sec_rows = db.execute('SELECT * FROM curriculum_sections WHERE course_id=? ORDER BY "order"', (cid,)).fetchall()
        all_lessons_flat = []
        for sec in sec_rows:
            sd = dict(sec)
            sec_lessons = []
            for l in db.execute("""SELECT l.* FROM lessons l
                                    JOIN section_lessons sl ON sl.lesson_id=l.id
                                    WHERE sl.section_id=? ORDER BY sl."order" """, (sec['id'],)):
                ld = dict(l)
                ld['resources'] = [dict(r) for r in db.execute('SELECT * FROM lesson_resources WHERE lesson_id=?',(ld['id'],))]
                ld['videoUrl'] = ld.get('video_url') or ld.get('video_file') or ''
                ld['is_final'] = bool(ld.get('is_final', 0))
                if uid:
                    prog = db.execute('SELECT is_completed FROM user_progress WHERE user_id=? AND course_id=? AND lesson_id=?',
                                      (uid, cid, ld['id'])).fetchone()
                    ld['isCompleted'] = bool(prog['is_completed']) if prog else False
                else:
                    ld['isCompleted'] = False
                ld['is_completed'] = ld['isCompleted']
                sec_lessons.append(ld)
                all_lessons_flat.append(ld)
            sd['lessons'] = sec_lessons
            sections.append(sd)
        # Fallback: lessons not in any section
        if not sections:
            for l in db.execute('SELECT * FROM lessons WHERE course_id=? ORDER BY "order"',(cid,)):
                ld = dict(l)
                ld['resources'] = [dict(r) for r in db.execute('SELECT * FROM lesson_resources WHERE lesson_id=?',(ld['id'],))]
                ld['videoUrl'] = ld.get('video_url') or ld.get('video_file') or ''
                ld['is_final'] = bool(ld.get('is_final', 0))
                if uid:
                    prog = db.execute('SELECT is_completed FROM user_progress WHERE user_id=? AND course_id=? AND lesson_id=?',
                                      (uid, cid, ld['id'])).fetchone()
                    ld['isCompleted'] = bool(prog['is_completed']) if prog else False
                else:
                    ld['isCompleted'] = False
                ld['is_completed'] = ld['isCompleted']
                all_lessons_flat.append(ld)
            sections = [{'id': 'default', 'title': 'Course Content', 'lessons': all_lessons_flat}]
        cd['sections'] = sections
        cd['lessons'] = all_lessons_flat  # keep flat list for LessonPage navigation
        # Course resources
        cd['course_resources'] = [dict(r) for r in db.execute('SELECT * FROM course_resources WHERE course_id=?',(cid,))]
        # Fetch instructor profile for display
        instructor = db.execute(
            'SELECT u.bio, u.location, u.website, u.instructor_title, u.instructor_field, '
            'COALESCE(s.courses_completed,0) as courses_completed '
            'FROM users u LEFT JOIN user_stats s ON s.user_id=u.id '
            'WHERE u.id=?', (cd.get('instructor_id',''),)
        ).fetchone()
        if instructor:
            cd['instructor_bio']      = instructor['bio'] or ''
            cd['instructor_location'] = instructor['location'] or ''
            cd['instructor_website']  = instructor['website'] or ''
            cd['instructor_title']    = instructor['instructor_title'] or 'Instructor'
            cd['instructor_field']     = instructor['instructor_field'] or ''
        else:
            cd['instructor_bio']      = ''
            cd['instructor_location'] = ''
            cd['instructor_website']  = ''
            cd['instructor_title']    = 'Instructor'
            cd['instructor_field']     = ''
        # Count total students for this instructor across all their courses
        instr_courses = db.execute('SELECT id FROM courses WHERE instructor_id=?', (cd.get('instructor_id',''),)).fetchall()
        if instr_courses:
            ph2 = ','.join('?'*len(instr_courses))
            ids = [r['id'] for r in instr_courses]
            st_row = db.execute(f'SELECT COUNT(DISTINCT user_id) as t FROM user_enrollments WHERE course_id IN ({ph2})', ids).fetchone()
            cd['instructor_total_students'] = st_row['t'] if st_row else 0
            cd['instructor_total_courses']  = len(instr_courses)
        else:
            cd['instructor_total_students'] = 0
            cd['instructor_total_courses']  = 0
        return jsonify({'course': cd})
    
    @app.route('/api/courses/<cid>/enroll', methods=['POST'])
    @token_required
    def enroll(cid):
        db = get_db()
        if not db.execute('SELECT id FROM courses WHERE id=?',(cid,)).fetchone():
            return jsonify({'error': 'Course not found'}), 404
        if db.execute('SELECT id FROM user_enrollments WHERE user_id=? AND course_id=?',
                      (g.current_user['user_id'], cid)).fetchone():
            return jsonify({'message': 'Already enrolled'}), 200
        # Check lifetime access
        course_info = db.execute('SELECT has_lifetime_access FROM courses WHERE id=?',(cid,)).fetchone()
        perks_info = db.execute('SELECT lifetime_access FROM course_perks WHERE course_id=?',(cid,)).fetchone()
        lifetime = bool(perks_info['lifetime_access']) if perks_info else bool(course_info['has_lifetime_access'] if course_info else 1)
        from datetime import timedelta
        expires_at = None if lifetime else (datetime.now() + timedelta(days=365)).isoformat()
        db.execute('INSERT INTO user_enrollments (user_id,course_id,progress,expires_at) VALUES(?,?,0,?)',
                   (g.current_user['user_id'], cid, expires_at))
        db.execute('UPDATE courses SET enrollments=enrollments+1 WHERE id=?',(cid,))
        db.commit()
        course = db.execute('SELECT title FROM courses WHERE id=?',(cid,)).fetchone()
        create_notification(db, g.current_user['user_id'], 'enrollment',
            'Enrolled Successfully!',
            f'You are now enrolled in "{course["title"]}". Start learning today!',
            f'enroll_{cid}')
        return jsonify({'message': 'Enrolled successfully'})
    
    # ── LESSONS ───────────────────────────────────────────────────────────────────
    @app.route('/api/courses/<cid>/lessons/<lid>', methods=['GET'])
    @token_required
    def get_lesson(cid, lid):
        db = get_db()
        # Check enrollment and lifetime access
        enr = db.execute('SELECT expires_at FROM user_enrollments WHERE user_id=? AND course_id=?',
                         (g.current_user['user_id'], cid)).fetchone()
        is_staff = g.current_user['role'] in ('instructor','admin','superadmin')
        # Check if instructor owns this course
        owns_course = False
        if g.current_user['role'] == 'instructor':
            owns = db.execute('SELECT id FROM courses WHERE id=? AND instructor_id=?',
                              (cid, g.current_user['user_id'])).fetchone()
            owns_course = bool(owns)
        if not enr and not is_staff:
            return jsonify({'error': 'not_enrolled', 'message': 'Please enroll in this course to access lessons'}), 403
        elif enr['expires_at']:
            # Limited access — check expiry
            try:
                exp = datetime.fromisoformat(enr['expires_at'])
                if datetime.now() > exp:
                    return jsonify({'error': 'Your access to this course has expired. Please re-enroll.'}), 403
            except:
                pass
        l = db.execute('SELECT * FROM lessons WHERE id=? AND course_id=?',(lid,cid)).fetchone()
        if not l: return jsonify({'error': 'Lesson not found'}), 404
        ld = dict(l)
        ld['resources'] = [dict(r) for r in db.execute('SELECT * FROM lesson_resources WHERE lesson_id=?',(lid,))]
        ld['videoUrl'] = ld.get('video_url') or ''
        prog = db.execute('SELECT is_completed,quiz_score FROM user_progress WHERE user_id=? AND course_id=? AND lesson_id=?',
                          (g.current_user['user_id'], cid, lid)).fetchone()
        ld['isCompleted'] = bool(prog['is_completed']) if prog else False
        ld['is_completed'] = ld['isCompleted']
        ld['quizScore'] = prog['quiz_score'] if prog else None
        return jsonify({'lesson': ld})
    
    # ── PROGRESS ──────────────────────────────────────────────────────────────────
    @app.route('/api/progress/update', methods=['POST'])
    @token_required
    def update_progress():
        d = request.get_json() or {}
        cid, lid = d.get('course_id'), d.get('lesson_id')
        if not cid or not lid: return jsonify({'error': 'course_id and lesson_id required'}), 400
        score = d.get('quiz_score')
        db = get_db()
        db.execute('''INSERT INTO user_progress (user_id,course_id,lesson_id,is_completed,quiz_score,completed_at)
                      VALUES(?,?,?,1,?,CURRENT_TIMESTAMP)
                      ON CONFLICT(user_id,course_id,lesson_id) DO UPDATE SET
                        is_completed=1, quiz_score=COALESCE(?,quiz_score), completed_at=CURRENT_TIMESTAMP''',
                   (g.current_user['user_id'], cid, lid, score, score))
        total = db.execute('SELECT COUNT(*) as t FROM lessons WHERE course_id=?',(cid,)).fetchone()['t']
        done = db.execute('SELECT COUNT(*) as d FROM user_progress WHERE user_id=? AND course_id=? AND is_completed=1',
                          (g.current_user['user_id'], cid)).fetchone()['d']
        pct = int((done/total)*100) if total else 0
        db.execute('UPDATE user_enrollments SET progress=? WHERE user_id=? AND course_id=?',
                   (pct, g.current_user['user_id'], cid))
        db.execute('''UPDATE user_stats SET lessons_completed=(
            SELECT COUNT(*) FROM user_progress WHERE user_id=? AND is_completed=1) WHERE user_id=?''',
                   (g.current_user['user_id'], g.current_user['user_id']))
        db.commit()
        # Badges
        total_lessons = db.execute('SELECT lessons_completed FROM user_stats WHERE user_id=?',
                                    (g.current_user['user_id'],)).fetchone()
        if total_lessons and total_lessons['lessons_completed'] >= 1:
            db.execute('INSERT OR IGNORE INTO user_badges (user_id,badge_key) VALUES(?,"FIRST_STEPS")',
                       (g.current_user['user_id'],))
            db.commit()
        if pct == 100:
            db.execute('UPDATE user_enrollments SET completed_at=CURRENT_TIMESTAMP WHERE user_id=? AND course_id=?',
                       (g.current_user['user_id'], cid))
            db.execute('''UPDATE user_stats SET courses_completed=(
                SELECT COUNT(*) FROM user_enrollments WHERE user_id=? AND progress=100) WHERE user_id=?''',
                       (g.current_user['user_id'], g.current_user['user_id']))
            db.execute('INSERT OR IGNORE INTO user_badges (user_id,badge_key) VALUES(?,"COURSE_CHAMPION")',
                       (g.current_user['user_id'],))
            db.commit()
            course = db.execute('SELECT title FROM courses WHERE id=?',(cid,)).fetchone()
            create_notification(db, g.current_user['user_id'], 'achievement',
                '🎉 Course Completed!',
                f'Congratulations! You completed "{course["title"]}".',
                f'course_complete_{cid}')
        return jsonify({'message': 'Progress updated', 'progress': pct, 'lesson_completed': True})
    
    # ── QUIZZES ───────────────────────────────────────────────────────────────────
    @app.route('/api/courses/<cid>/quizzes/<lid>', methods=['GET'])
    @token_required
    def get_quiz(cid, lid):
        db = get_db()
        q = db.execute('SELECT * FROM quizzes WHERE course_id=? AND lesson_id=?',(cid,lid)).fetchone()
        if not q: return jsonify({'error': 'Quiz not found for this lesson'}), 404
        qd = dict(q)
        questions = []
        for row in db.execute('SELECT * FROM quiz_questions WHERE quiz_id=? ORDER BY "order"',(qd['id'],)):
            r = dict(row)
            r['question'] = r['question_text']
            r['question_type'] = r.get('question_type', 'mcq')
            r['options'] = json.loads(r['options'])
            del r['correct_answer']
            questions.append(r)
        qd['questions'] = questions
        qd['duration'] = str(qd['duration']) if qd.get('duration') else 'No limit'
        return jsonify({'quiz': qd})
    
    @app.route('/api/quizzes/submit', methods=['POST'])
    @token_required
    def submit_quiz():
        d = request.get_json() or {}
        qid, answers = d.get('quiz_id'), d.get('answers', {})
        cid, lid = d.get('course_id'), d.get('lesson_id')
        if not qid: return jsonify({'error': 'quiz_id required'}), 400
        db = get_db()
        questions = db.execute('SELECT * FROM quiz_questions WHERE quiz_id=? ORDER BY "order"',(qid,)).fetchall()
        correct_map, correct_count = {}, 0
        for i, q in enumerate(questions):
            q_type = q['question_type'] if q['question_type'] else 'mcq'
            correct_map[i] = q['correct_answer']
            user_ans = answers.get(str(i))
            if user_ans is None:
                continue
            if q_type in ('mcq', 'true_false'):
                try:
                    if int(user_ans) == int(q['correct_answer']):
                        correct_count += 1
                except (ValueError, TypeError):
                    pass
            elif q_type == 'fill_blank':
                try:
                    opts = json.loads(q['options']) if isinstance(q['options'], str) else (q['options'] or [])
                    correct_text = str(opts[int(q['correct_answer'])]).strip().lower() if opts else ''
                    if str(user_ans).strip().lower() == correct_text:
                        correct_count += 1
                except (ValueError, TypeError, IndexError):
                    pass
        score = int((correct_count/len(questions))*100) if questions else 0
        passed = score >= app.config['QUIZ_PASS_SCORE']
        db.execute('''INSERT INTO quiz_attempts (id,user_id,quiz_id,score,answers,correct_answers)
                      VALUES(?,?,?,?,?,?)''',
                   (str(uuid.uuid4()), g.current_user['user_id'], qid, score,
                    json.dumps(answers), json.dumps(correct_map)))
        if cid and lid:
            db.execute('''INSERT INTO user_progress (user_id,course_id,lesson_id,is_completed,quiz_score,completed_at)
                          VALUES(?,?,?,1,?,CURRENT_TIMESTAMP)
                          ON CONFLICT(user_id,course_id,lesson_id) DO UPDATE SET
                            quiz_score=?,completed_at=CURRENT_TIMESTAMP''',
                       (g.current_user['user_id'], cid, lid, score, score))
        db.commit()
        if score == 100:
            db.execute('UPDATE user_stats SET perfect_quizzes=perfect_quizzes+1 WHERE user_id=?',
                       (g.current_user['user_id'],))
            db.commit()
            pq = db.execute('SELECT perfect_quizzes FROM user_stats WHERE user_id=?',
                            (g.current_user['user_id'],)).fetchone()
            if pq and pq['perfect_quizzes'] >= 5:
                db.execute('INSERT OR IGNORE INTO user_badges (user_id,badge_key) VALUES(?,"QUIZ_MASTER")',
                           (g.current_user['user_id'],))
                db.commit()
        return jsonify({'score': score, 'correct_count': correct_count,
                        'total_questions': len(questions), 'passed': passed,
                        'correct_answers': correct_map})
    
    # ── REVIEWS ───────────────────────────────────────────────────────────────────
    @app.route('/api/courses/<cid>/reviews', methods=['GET'])
    def get_reviews(cid):
        db = get_db()
        rows = db.execute('SELECT * FROM reviews WHERE course_id=? ORDER BY created_at DESC',(cid,)).fetchall()
        return jsonify({'reviews': [dict(r) for r in rows]})
    
    @app.route('/api/courses/<cid>/reviews', methods=['POST'])
    @token_required
    def add_review(cid):
        d = request.get_json() or {}
        rating = d.get('rating')
        if not rating or not (1 <= int(rating) <= 5):
            return jsonify({'error': 'Rating 1-5 required'}), 400
        db = get_db()
        # Must be enrolled
        if not db.execute('SELECT id FROM user_enrollments WHERE user_id=? AND course_id=?',
                          (g.current_user['user_id'], cid)).fetchone():
            return jsonify({'error': 'You must be enrolled to review'}), 403
        # One review per user
        if db.execute('SELECT id FROM reviews WHERE user_id=? AND course_id=?',
                      (g.current_user['user_id'], cid)).fetchone():
            return jsonify({'error': 'You have already reviewed this course'}), 409
        u = db.execute('SELECT name,avatar FROM users WHERE id=?',(g.current_user['user_id'],)).fetchone()
        rid = str(uuid.uuid4())
        db.execute('''INSERT INTO reviews (id,course_id,user_id,user_name,user_avatar,rating,content)
                      VALUES(?,?,?,?,?,?,?)''',
                   (rid, cid, g.current_user['user_id'], u['name'], u['avatar'],
                    int(rating), d.get('content','')))
        # Update average rating
        avg = db.execute('SELECT AVG(rating) as a FROM reviews WHERE course_id=?',(cid,)).fetchone()['a']
        db.execute('UPDATE courses SET rating=? WHERE id=?',(round(avg,1), cid))
        db.commit()
        return jsonify({'message': 'Review added', 'review_id': rid}), 201
    
    # ── INSTRUCTOR ────────────────────────────────────────────────────────────────
    @app.route('/api/instructor/courses', methods=['GET'])
    @instructor_required
    def instructor_courses():
        db = get_db()
        rows = db.execute('''SELECT c.*,
                                  (SELECT COUNT(*) FROM user_enrollments WHERE course_id=c.id) as student_count,
                                  (SELECT COUNT(*) FROM lessons WHERE course_id=c.id) as lesson_count,
                                  (SELECT ROUND(AVG(rating),1) FROM reviews WHERE course_id=c.id) as real_rating
                             FROM courses c WHERE c.instructor_id=? ORDER BY c.created_at DESC''',
                          (g.current_user['user_id'],)).fetchall()
        courses = []
        for r in rows:
            d = dict(r)
            # Use real student_count, not the cached enrollments column
            d['enrollments'] = d['student_count'] or 0
            courses.append(d)
        return jsonify({'courses': courses})
    
    @app.route('/api/instructor/courses', methods=['POST'])
    @instructor_required
    def create_course():
        d = request.get_json() or {}
        for f in ('title','description','category','difficulty'):
            if not d.get(f): return jsonify({'error': f'{f} is required'}), 400
        db = get_db()
        ins = db.execute('SELECT name,avatar FROM users WHERE id=?',(g.current_user['user_id'],)).fetchone()
        cid = str(uuid.uuid4())
        price = float(d.get('price', 0))
        db.execute('''INSERT INTO courses (id,title,description,instructor_id,instructor_name,instructor_avatar,
                      category,difficulty,duration,price,is_free,has_certificate,has_lifetime_access,
                      has_resources,thumbnail,rating,num_reviews)
                      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                   (cid, d['title'], d['description'], g.current_user['user_id'],
                    ins['name'], ins['avatar'],
                    d['category'], d['difficulty'], d.get('duration','TBD'),
                    price, 1 if price == 0 else 0,
                    int(bool(d.get('hasCertificate'))),
                    int(bool(d.get('hasLifetimeAccess', True))),
                    int(bool(d.get('hasResources'))),
                    d.get('thumbnail', '/placeholder.jpg'),
                    float(d.get('initial_rating', 4.5) or 4.5),
                    int(d.get('initial_reviews', 0) or 0)))
        for tag in d.get('tags', []):
            db.execute('INSERT INTO course_tags (course_id,tag) VALUES(?,?)',(cid,tag))
        for outcome in d.get('learningOutcomes', []):
            db.execute('INSERT INTO course_outcomes (course_id,outcome) VALUES(?,?)',(cid,outcome))
        perks = d.get('perks', {})
        db.execute('''INSERT INTO course_perks (course_id,has_certificate,lifetime_access,has_resources)
                      VALUES(?,?,?,?)''',
                   (cid, int(bool(perks.get('hasCertificate'))),
                    int(bool(perks.get('lifetimeAccess', True))),
                    int(bool(perks.get('hasResources')))))
        for si, sec in enumerate(d.get('curriculum', [])):
            sid = str(uuid.uuid4())
            db.execute('INSERT INTO curriculum_sections (id,course_id,title,"order") VALUES(?,?,?,?)',
                       (sid, cid, sec.get('title','Section'), si))
            for li, les in enumerate(sec.get('lessons', [])):
                leid = str(uuid.uuid4())
                db.execute('''INSERT INTO lessons (id,course_id,title,description,duration,video_url,content,type,is_final,"order")
                              VALUES(?,?,?,?,?,?,?,?,?,?)''',
                           (leid, cid, les.get('title','Lesson'), les.get('description',''),
                            les.get('duration','30 min'), les.get('videoUrl','') or les.get('video_url',''),
                            les.get('content',''), les.get('type','video'),
                            1 if les.get('is_final') else 0, li))
                # Per-lesson resources
                for res in les.get('resources', []):
                    if res.get('title') and res.get('url'):
                        db.execute('INSERT INTO lesson_resources (id,lesson_id,title,url,type) VALUES(?,?,?,?,?)',
                                   (str(uuid.uuid4()), leid, res['title'], res['url'], res.get('file_type','file')))
                db.execute('INSERT INTO section_lessons (section_id,lesson_id,"order") VALUES(?,?,?)',(sid,leid,li))
                if les.get('type') == 'quiz' and les.get('questions'):
                    qzid = str(uuid.uuid4())
                    db.execute('INSERT INTO quizzes (id,course_id,lesson_id,title,duration) VALUES(?,?,?,?,?)',
                               (qzid, cid, leid, les.get('title','Quiz'), 10))
                    for qi, q in enumerate(les['questions']):
                        db.execute('''INSERT INTO quiz_questions (id,quiz_id,question_text,options,correct_answer,question_type,"order")
                                      VALUES(?,?,?,?,?,?,?)''',
                                   (str(uuid.uuid4()), qzid, q.get('text',''),
                                    json.dumps(q.get('options',[])), q.get('correctAnswer',0),
                                    q.get('question_type','mcq'), qi))
        db.commit()
        return jsonify({'message': 'Course created', 'course_id': cid}), 201
    
    
    
    # ── INSTRUCTOR COURSE PREVIEW ─────────────────────────────────────────────────
    @app.route('/api/instructor/courses/<cid>/preview', methods=['GET'])
    @instructor_required
    def instructor_preview_course(cid):
        """Instructors can preview any course they own (or admins any course) 
           without enrolling or affecting student data."""
        db = get_db()
        course = db.execute('SELECT * FROM courses WHERE id=?', (cid,)).fetchone()
        if not course: return jsonify({'error': 'Course not found'}), 404
        # Only the course owner or admin/superadmin can preview
        if (course['instructor_id'] != g.current_user['user_id'] and
                g.current_user['role'] not in ('admin','superadmin')):
            return jsonify({'error': 'Forbidden'}), 403
        cd = dict(course)
        cd['tags'] = [r['tag'] for r in db.execute('SELECT tag FROM course_tags WHERE course_id=?',(cid,))]
        cd['learningOutcomes'] = [r['outcome'] for r in db.execute('SELECT outcome FROM course_outcomes WHERE course_id=?',(cid,))]
        perks = db.execute('SELECT * FROM course_perks WHERE course_id=?',(cid,)).fetchone()
        cd['has_certificate']    = bool(perks['has_certificate'])   if perks else bool(cd.get('has_certificate'))
        cd['has_lifetime_access']= bool(perks['lifetime_access'])   if perks else True
        cd['has_resources']      = bool(perks['has_resources'])     if perks else False
        # Build sections with all lessons (fully unlocked for instructor)
        sections, all_lessons = [], []
        for sec in db.execute('SELECT * FROM curriculum_sections WHERE course_id=? ORDER BY "order"',(cid,)):
            sd = dict(sec)
            sec_lessons = []
            for l in db.execute("""SELECT l.* FROM lessons l
                                    JOIN section_lessons sl ON sl.lesson_id=l.id
                                    WHERE sl.section_id=? ORDER BY sl."order" """, (sec['id'],)):
                ld = dict(l)
                ld['resources'] = [dict(r) for r in db.execute('SELECT * FROM lesson_resources WHERE lesson_id=?',(ld['id'],))]
                ld['videoUrl']  = ld.get('video_url') or ''
                ld['is_final']  = bool(ld.get('is_final',0))
                ld['isCompleted'] = False  # instructor preview — never mark completed
                sec_lessons.append(ld); all_lessons.append(ld)
            sd['lessons'] = sec_lessons
            sections.append(sd)
        cd['sections'] = sections
        cd['lessons']  = all_lessons
        cd['course_resources'] = [dict(r) for r in db.execute('SELECT * FROM course_resources WHERE course_id=?',(cid,))]
        cd['is_preview'] = True  # flag so frontend knows not to show enroll button
        return jsonify({'course': cd})
    
    
    @app.route('/api/instructor/courses/<cid>/lessons/<lid>/preview', methods=['GET'])
    @instructor_required
    def instructor_preview_lesson(cid, lid):
        """Preview any lesson without enrollment — instructor/admin only."""
        db = get_db()
        course = db.execute('SELECT * FROM courses WHERE id=?', (cid,)).fetchone()
        if not course: return jsonify({'error': 'Course not found'}), 404
        if (course['instructor_id'] != g.current_user['user_id'] and
                g.current_user['role'] not in ('admin','superadmin')):
            return jsonify({'error': 'Forbidden'}), 403
        l = db.execute('SELECT * FROM lessons WHERE id=? AND course_id=?', (lid, cid)).fetchone()
        if not l: return jsonify({'error': 'Lesson not found'}), 404
        ld = dict(l)
        ld['resources']   = [dict(r) for r in db.execute('SELECT * FROM lesson_resources WHERE lesson_id=?', (lid,))]
        ld['videoUrl']    = ld.get('video_url') or ''
        ld['isCompleted'] = False
        ld['is_completed']= False
        ld['is_preview']  = True
        return jsonify({'lesson': ld})
    
    @app.route('/api/instructor/courses/<cid>', methods=['GET'])
    @instructor_required
    def instructor_get_course(cid):
        db = get_db()
        course = db.execute('SELECT * FROM courses WHERE id=? AND instructor_id=?',
                            (cid, g.current_user['user_id'])).fetchone()
        if not course:
            # Admins can see any course
            if g.current_user['role'] in ('admin','superadmin'):
                course = db.execute('SELECT * FROM courses WHERE id=?', (cid,)).fetchone()
            if not course:
                return jsonify({'error': 'Course not found'}), 404
    
        cd = dict(course)
        cd['tags'] = [r['tag'] for r in db.execute('SELECT tag FROM course_tags WHERE course_id=?',(cid,))]
        cd['learningOutcomes'] = [r['outcome'] for r in db.execute('SELECT outcome FROM course_outcomes WHERE course_id=?',(cid,))]
        perks = db.execute('SELECT * FROM course_perks WHERE course_id=?',(cid,)).fetchone()
        cd['perks'] = {
            'hasCertificate': bool(perks['has_certificate']) if perks else bool(cd.get('has_certificate')),
            'lifetimeAccess':  bool(perks['lifetime_access']) if perks else bool(cd.get('has_lifetime_access')),
            'hasResources':    bool(perks['has_resources'])   if perks else bool(cd.get('has_resources')),
        }
    
        # Load sections with lessons
        sections = []
        for sec in db.execute('SELECT * FROM curriculum_sections WHERE course_id=? ORDER BY "order"', (cid,)):
            sd = dict(sec)
            lessons = []
            for les in db.execute('''SELECT l.* FROM lessons l
                                      JOIN section_lessons sl ON sl.lesson_id=l.id
                                      WHERE sl.section_id=? ORDER BY sl."order"''', (sec['id'],)):
                ld = dict(les)
                ld['videoUrl']  = ld.get('video_url') or ''
                ld['resources'] = [dict(r) for r in db.execute(
                    'SELECT * FROM lesson_resources WHERE lesson_id=?', (ld['id'],))]
                if ld['type'] == 'quiz':
                    quiz = db.execute('SELECT * FROM quizzes WHERE lesson_id=?', (ld['id'],)).fetchone()
                    if quiz:
                        questions = [dict(q) for q in db.execute(
                            'SELECT * FROM quiz_questions WHERE quiz_id=? ORDER BY "order"', (quiz['id'],))]
                        for q in questions:
                            import json as _json
                            try: q['options'] = _json.loads(q['options']) if isinstance(q['options'], str) else q['options']
                            except: q['options'] = ['','','','']
                        ld['questions'] = questions
                    else:
                        ld['questions'] = []
                lessons.append(ld)
            sd['lessons'] = lessons
            sections.append(sd)
        cd['sections'] = sections
        return jsonify({'course': cd})
    
    @app.route('/api/instructor/courses/<cid>', methods=['PUT'])
    @instructor_required
    def update_course(cid):
        db = get_db()
        row = db.execute('SELECT instructor_id FROM courses WHERE id=?',(cid,)).fetchone()
        if not row: return jsonify({'error': 'Course not found'}), 404
        if row['instructor_id'] != g.current_user['user_id'] and g.current_user['role'] not in ('admin','superadmin'):
            return jsonify({'error': 'Forbidden'}), 403
        d = request.get_json() or {}
    
        # Update core fields
        fields, vals = [], []
        for f in ('title','description','category','difficulty','duration','price','thumbnail'):
            if f in d:
                fields.append(f'{f}=?'); vals.append(d[f])
        if 'initial_rating' in d: fields.append('rating=?'); vals.append(float(d['initial_rating']))
        if 'initial_reviews' in d: fields.append('num_reviews=?'); vals.append(int(d['initial_reviews']))
        if 'price' in d:
            price_val = float(d['price']) if d['price'] else 0
            fields.append('is_free=?')
            vals.append(1 if price_val == 0 else 0)
        if fields:
            vals.append(cid)
            db.execute(f'UPDATE courses SET {",".join(fields)},updated_at=CURRENT_TIMESTAMP WHERE id=?', vals)
    
        # Update tags if provided
        if 'tags' in d:
            db.execute('DELETE FROM course_tags WHERE course_id=?', (cid,))
            for tag in d['tags']:
                db.execute('INSERT INTO course_tags (course_id,tag) VALUES(?,?)', (cid, tag))
    
        # Update outcomes if provided
        if 'learningOutcomes' in d:
            db.execute('DELETE FROM course_outcomes WHERE course_id=?', (cid,))
            for outcome in d['learningOutcomes']:
                if outcome.strip():
                    db.execute('INSERT INTO course_outcomes (course_id,outcome) VALUES(?,?)', (cid, outcome.strip()))
    
        # Update perks if provided
        if 'perks' in d:
            p = d['perks']
            db.execute('''INSERT INTO course_perks (course_id,has_certificate,lifetime_access,has_resources)
                            VALUES(?,?,?,?)
                            ON CONFLICT(course_id) DO UPDATE SET
                                has_certificate=excluded.has_certificate,
                                lifetime_access=excluded.lifetime_access,
                                has_resources=excluded.has_resources''',
                       (cid, int(bool(p.get('hasCertificate'))),
                        int(bool(p.get('lifetimeAccess',True))),
                        int(bool(p.get('hasResources')))))
    
        # Rebuild curriculum — PRESERVE existing lesson IDs so students don't get "lesson not found"
        if 'curriculum' in d:
            # Collect existing lessons by ID for reuse
            existing_lessons = {r['id']: dict(r) for r in db.execute('SELECT * FROM lessons WHERE course_id=?',(cid,))}
            # Drop old section mappings only
            old_sids = [r['id'] for r in db.execute('SELECT id FROM curriculum_sections WHERE course_id=?',(cid,))]
            for sid in old_sids:
                db.execute('DELETE FROM section_lessons WHERE section_id=?', (sid,))
            db.execute('DELETE FROM curriculum_sections WHERE course_id=?', (cid,))
            db.execute('DELETE FROM quizzes WHERE course_id=?',(cid,))
            # Find which lessons the instructor kept (by ID)
            incoming_ids = set()
            for sec in d['curriculum']:
                for les in sec.get('lessons', []):
                    if les.get('id') and les['id'] in existing_lessons:
                        incoming_ids.add(les['id'])
            # Delete truly removed lessons
            for rid in set(existing_lessons.keys()) - incoming_ids:
                db.execute('DELETE FROM lesson_resources WHERE lesson_id=?', (rid,))
                db.execute('DELETE FROM lessons WHERE id=?', (rid,))
            # Rebuild sections + lessons
            for si, sec in enumerate(d['curriculum']):
                sid = str(uuid.uuid4())
                db.execute('INSERT INTO curriculum_sections (id,course_id,title,"order") VALUES(?,?,?,?)',
                           (sid, cid, sec.get('title','Section'), si))
                for li, les in enumerate(sec.get('lessons',[])):
                    incoming_id = les.get('id') if les.get('id') and les['id'] in existing_lessons else None
                    leid = incoming_id or str(uuid.uuid4())
                    if incoming_id:
                        db.execute('''UPDATE lessons SET title=?,description=?,duration=?,video_url=?,
                                       content=?,type=?,is_final=?,"order"=? WHERE id=?''',
                                   (les.get('title','Lesson'), les.get('description',''),
                                    les.get('duration','30 min'), les.get('videoUrl','') or les.get('video_url',''),
                                    les.get('content',''), les.get('type','video'),
                                    1 if les.get('is_final') else 0, li, leid))
                    else:
                        db.execute('''INSERT INTO lessons (id,course_id,title,description,duration,video_url,content,type,is_final,"order")
                                      VALUES(?,?,?,?,?,?,?,?,?,?)''',
                                   (leid, cid, les.get('title','Lesson'), les.get('description',''),
                                    les.get('duration','30 min'), les.get('videoUrl','') or les.get('video_url',''),
                                    les.get('content',''), les.get('type','video'),
                                    1 if les.get('is_final') else 0, li))
                    db.execute('INSERT INTO section_lessons (section_id,lesson_id,"order") VALUES(?,?,?)', (sid,leid,li))
                    # Re-save resources (always replace so edits take effect)
                    db.execute('DELETE FROM lesson_resources WHERE lesson_id=?', (leid,))
                    for res in les.get('resources', []):
                        if res.get('title') and res.get('url'):
                            db.execute('INSERT INTO lesson_resources (id,lesson_id,title,url,type) VALUES(?,?,?,?,?)',
                                       (str(uuid.uuid4()), leid, res['title'], res['url'],
                                        res.get('file_type') or res.get('type') or 'file'))
                    if les.get('type') == 'quiz' and les.get('questions'):
                        qzid = str(uuid.uuid4())
                        db.execute('INSERT INTO quizzes (id,course_id,lesson_id,title,duration) VALUES(?,?,?,?,?)',
                                   (qzid, cid, leid, les.get('title','Quiz'), 10))
                        for qi, q in enumerate(les['questions']):
                            db.execute('''INSERT INTO quiz_questions (id,quiz_id,question_text,options,correct_answer,question_type,"order")
                                          VALUES(?,?,?,?,?,?,?)''',
                                       (str(uuid.uuid4()), qzid, q.get('text',''),
                                        json.dumps(q.get('options',[])), q.get('correctAnswer',0),
                                        q.get('question_type','mcq'), qi))
    
        db.commit()
        return jsonify({'message': 'Course updated', 'course_id': cid})
    
    @app.route('/api/instructor/courses/<cid>', methods=['DELETE'])
    @instructor_required
    def delete_course(cid):
        db = get_db()
        c = db.execute('SELECT instructor_id FROM courses WHERE id=?',(cid,)).fetchone()
        if not c: return jsonify({'error': 'Not found'}), 404
        if c['instructor_id'] != g.current_user['user_id'] and g.current_user['role'] not in ('admin','superadmin'):
            return jsonify({'error': 'Forbidden'}), 403
        db.execute('DELETE FROM courses WHERE id=?',(cid,))
        db.commit()
        return jsonify({'message': 'Course deleted'})
    
    @app.route('/api/instructor/stats', methods=['GET'])
    @instructor_required
    def instructor_stats():
        db = get_db()
        course_ids = [r['id'] for r in db.execute('SELECT id FROM courses WHERE instructor_id=?',
                                                   (g.current_user['user_id'],)).fetchall()]
        if not course_ids:
            return jsonify({'total_courses':0,'total_students':0,'total_earnings':0,
                            'average_rating':0,'completion_rate':0,
                            'monthly_enrollments':[],'course_performance':[],'recent_students':[]})
        ph = ','.join('?'*len(course_ids))
        total_students = db.execute(f'SELECT COUNT(DISTINCT user_id) as t FROM user_enrollments WHERE course_id IN ({ph})',
                                    course_ids).fetchone()['t']
        earnings_row = db.execute(f'''SELECT SUM(c.price*(SELECT COUNT(*) FROM user_enrollments WHERE course_id=c.id)) as t
                                      FROM courses c WHERE c.id IN ({ph})''', course_ids).fetchone()
        instructor_pct, admin_pct = get_revenue_split(db)
        gross_revenue = float(earnings_row['t'] or 0)
        from decimal import Decimal, ROUND_HALF_UP
        _gross = Decimal(str(gross_revenue))
        _pct   = Decimal(str(instructor_pct))
        total_earnings = float((_gross * (_pct / Decimal('100'))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
        avg_r = db.execute(f'SELECT AVG(rating) as a FROM reviews WHERE course_id IN ({ph})',course_ids).fetchone()['a'] or 0
        monthly = db.execute(f'''SELECT strftime('%m',enrolled_at) as m, COUNT(*) as c
                                 FROM user_enrollments WHERE course_id IN ({ph})
                                 AND enrolled_at >= date('now','-6 months')
                                 GROUP BY m ORDER BY m''', course_ids).fetchall()
        mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        monthly_enrollments = [{'month': mn[int(r['m'])-1], 'enrollments': r['c']} for r in monthly]
        # Course performance with real completion rates
        course_perf = []
        total_completed = 0
        total_enrolled_all = 0
        for r in db.execute(f'SELECT id,title,enrollments,rating FROM courses WHERE id IN ({ph}) ORDER BY enrollments DESC LIMIT 5', course_ids):
            p = db.execute('SELECT COUNT(*) as t, COUNT(CASE WHEN progress=100 THEN 1 END) as d FROM user_enrollments WHERE course_id=?',(r['id'],)).fetchone()
            t_count = p['t'] or 0
            d_count = p['d'] or 0
            total_enrolled_all += t_count
            total_completed += d_count
            rate = int((d_count / t_count) * 100) if t_count > 0 else 0
            course_perf.append({
                'title': r['title'],
                'name': r['title'],
                'students': t_count,
                'completion_rate': rate,
                'completion': rate,
                'rating': r['rating'] or 0
            })
    
        # Overall completion rate across all courses
        all_enrolled = db.execute(f'SELECT COUNT(*) as t, COUNT(CASE WHEN progress=100 THEN 1 END) as d FROM user_enrollments WHERE course_id IN ({ph})', course_ids).fetchone()
        completion_rate = int((all_enrolled['d'] / all_enrolled['t']) * 100) if all_enrolled['t'] else 0
    
        # Average rating from reviews table (more accurate)
        avg_rating_row = db.execute(f'SELECT AVG(rating) as a FROM reviews WHERE course_id IN ({ph})', course_ids).fetchone()
        final_avg_rating = round(avg_rating_row['a'] or 0, 1)
    
        recent = db.execute(f'''SELECT ue.user_id, u.name, c.title as course_title, ue.progress, ue.enrolled_at
                                FROM user_enrollments ue
                                JOIN users u ON u.id=ue.user_id
                                JOIN courses c ON c.id=ue.course_id
                                WHERE ue.course_id IN ({ph})
                                ORDER BY ue.enrolled_at DESC LIMIT 10''', course_ids).fetchall()
    
        return jsonify({
            'total_courses': len(course_ids),
            'total_students': total_students,
            'total_earnings': total_earnings,
            'instructor_share_pct': instructor_pct,
            'platform_share_pct': admin_pct,
            'platform_share': round(gross_revenue * (admin_pct / 100), 2),
            'gross_revenue': round(gross_revenue, 2),
            'average_rating': final_avg_rating,
            'completion_rate': completion_rate,
            'monthly_enrollments': monthly_enrollments,
            'course_performance': course_perf,
            'recent_students': [{'id': r['user_id'], 'name': r['name'],
                                  'course': r['course_title'], 'progress': r['progress']} for r in recent]
        })
    
    # ── ADMIN ─────────────────────────────────────────────────────────────────────
    @app.route('/api/admin/stats', methods=['GET'])
    @admin_required
    def admin_stats():
        db = get_db()
        total_users    = db.execute("SELECT COUNT(*) as c FROM users WHERE is_active=1").fetchone()['c']
        total_students = db.execute("SELECT COUNT(*) as c FROM users WHERE role='student' AND is_active=1").fetchone()['c']
        total_instructors = db.execute("SELECT COUNT(*) as c FROM users WHERE role='instructor' AND is_active=1").fetchone()['c']
        total_courses  = db.execute("SELECT COUNT(*) as c FROM courses").fetchone()['c']
        total_enrollments = db.execute("SELECT COUNT(*) as c FROM user_enrollments").fetchone()['c']
        pending_instructors = db.execute("SELECT COUNT(*) as c FROM instructor_applications WHERE status='pending'").fetchone()['c']
        recent_users = db.execute('''SELECT id,name,email,role,instructor_status,created_at FROM users
                                     WHERE is_active=1 ORDER BY created_at DESC LIMIT 10''').fetchall()
        recent_courses = db.execute('''SELECT c.id,c.title,c.category,c.enrollments,c.created_at,u.name as instructor_name
                                       FROM courses c JOIN users u ON u.id=c.instructor_id
                                       ORDER BY c.created_at DESC LIMIT 10''').fetchall()
        # Platform revenue calculations
        rev = db.execute('''SELECT SUM(c.price * (SELECT COUNT(*) FROM user_enrollments WHERE course_id=c.id)) as t
                              FROM courses c WHERE c.is_free=0''').fetchone()
        gross = float(rev['t'] or 0)
        instructor_pct, admin_pct = get_revenue_split(db)
        platform_earnings  = round(gross * (admin_pct / 100), 2)
        instructors_payout = round(gross * (instructor_pct / 100), 2)
    
        return jsonify({
            'total_users': total_users,
            'total_students': total_students,
            'total_instructors': total_instructors,
            'total_courses': total_courses,
            'total_enrollments': total_enrollments,
            'pending_instructors': pending_instructors,
            'recent_users': [dict(r) for r in recent_users],
            'recent_courses': [dict(r) for r in recent_courses],
            'gross_revenue': round(gross, 2),
            'platform_earnings': platform_earnings,
            'instructors_payout': instructors_payout,
            'instructor_share_pct': instructor_pct,
            'admin_share_pct': admin_pct,
        })
    
    @app.route('/api/admin/users', methods=['GET'])
    @admin_required
    def admin_users():
        db = get_db()
        role_filter = request.args.get('role')
        q = 'SELECT * FROM users WHERE is_active=1'
        params = []
        if role_filter:
            q += ' AND role=?'; params.append(role_filter)
        q += ' ORDER BY created_at DESC'
        rows = db.execute(q, params).fetchall()
        users = []
        for r in rows:
            u = dict(r)
            del u['password_hash']
            st = db.execute('SELECT * FROM user_stats WHERE user_id=?',(u['id'],)).fetchone()
            u['stats'] = dict(st) if st else {}
            users.append(u)
        return jsonify({'users': users})
    
    @app.route('/api/admin/users/<uid>/role', methods=['PUT'])
    @admin_required
    def change_user_role(uid):
        d = request.get_json() or {}
        new_role = d.get('role')
        if new_role not in ('student','instructor','admin','superadmin'):
            return jsonify({'error': 'Invalid role'}), 400
        if uid == g.current_user['user_id']:
            return jsonify({'error': 'Cannot change your own role'}), 400
        db = get_db()
        db.execute('UPDATE users SET role=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',(new_role, uid))
        db.commit()
        create_notification(db, uid, 'system', 'Account Updated',
            f'Your account role has been updated to {new_role}.', f'role_change_{uid}')
        return jsonify({'message': 'Role updated'})
    
    @app.route('/api/admin/users/<uid>/suspend', methods=['PUT'])
    @admin_required
    def suspend_user(uid):
        if uid == g.current_user['user_id']:
            return jsonify({'error': 'Cannot suspend yourself'}), 400
        db = get_db()
        u = db.execute('SELECT is_active FROM users WHERE id=?',(uid,)).fetchone()
        if not u: return jsonify({'error': 'User not found'}), 404
        new_status = 0 if u['is_active'] else 1
        db.execute('UPDATE users SET is_active=? WHERE id=?',(new_status, uid))
        db.commit()
        return jsonify({'message': 'suspended' if not new_status else 'activated',
                        'is_active': bool(new_status)})
    
    @app.route('/api/admin/instructor-applications', methods=['GET'])
    @admin_required
    def list_applications():
        db = get_db()
        status_filter = request.args.get('status', 'pending')
        rows = db.execute('''SELECT ia.*,u.name,u.email,u.avatar FROM instructor_applications ia
                             JOIN users u ON u.id=ia.user_id
                             WHERE ia.status=? ORDER BY ia.applied_at DESC''', (status_filter,)).fetchall()
        return jsonify({'applications': [dict(r) for r in rows]})
    
    @app.route('/api/admin/instructor-applications/<uid>/review', methods=['PUT'])
    @admin_required
    def review_application(uid):
        d = request.get_json() or {}
        action = d.get('action')  # 'approve' or 'reject'
        if action not in ('approve','reject'):
            return jsonify({'error': 'action must be approve or reject'}), 400
        db = get_db()
        app_row = db.execute('SELECT * FROM instructor_applications WHERE user_id=?',(uid,)).fetchone()
        if not app_row: return jsonify({'error': 'Application not found'}), 404
        new_status = 'approved' if action == 'approve' else 'rejected'
        db.execute('''UPDATE instructor_applications SET status=?,admin_note=?,
                      reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE user_id=?''',
                   (new_status, d.get('note',''), g.current_user['user_id'], uid))
        db.execute('UPDATE users SET instructor_status=? WHERE id=?',(new_status, uid))
        db.commit()
        if action == 'approve':
            create_notification(db, uid, 'achievement', '🎉 Instructor Approved!',
                'Your instructor application has been approved! You can now create courses.',
                f'instructor_approved_{uid}')
        else:
            create_notification(db, uid, 'system', 'Application Update',
                f'Your instructor application was not approved. {d.get("note","")}',
                f'instructor_rejected_{uid}')
        return jsonify({'message': f'Application {new_status}'})
    
    @app.route('/api/admin/courses', methods=['GET'])
    @admin_required
    def admin_courses():
        db = get_db()
        rows = db.execute('''SELECT c.*,
                                  (SELECT COUNT(*) FROM user_enrollments WHERE course_id=c.id) as student_count,
                                  (SELECT COALESCE(AVG(rating),0) FROM reviews WHERE course_id=c.id) as real_rating,
                             u.name as instructor_name
                             FROM courses c JOIN users u ON u.id=c.instructor_id
                             ORDER BY c.created_at DESC''').fetchall()
        return jsonify({'courses': [dict(r) for r in rows]})
    
    @app.route('/api/admin/courses/<cid>/status', methods=['PUT'])
    @admin_required
    def set_course_status(cid):
        d = request.get_json() or {}
        status = d.get('status')
        if status not in ('published','unpublished','suspended'):
            return jsonify({'error': 'Invalid status'}), 400
        db = get_db()
        c = db.execute('SELECT instructor_id,title FROM courses WHERE id=?',(cid,)).fetchone()
        if not c: return jsonify({'error': 'Course not found'}), 404
        db.execute('UPDATE courses SET status=? WHERE id=?',(status, cid))
        db.commit()
        create_notification(db, c['instructor_id'], 'system', 'Course Status Updated',
            f'Your course "{c["title"]}" has been set to {status} by an admin.',
            f'course_status_{cid}')
        return jsonify({'message': f'Course set to {status}'})
    
    @app.route('/api/admin/broadcast', methods=['POST'])
    @admin_required
    def broadcast_notification():
        d = request.get_json() or {}
        if not d.get('title') or not d.get('message'):
            return jsonify({'error': 'title and message required'}), 400
        role_target = d.get('role')  # None = all users
        db = get_db()
        q = 'SELECT id FROM users WHERE is_active=1'
        params = []
        if role_target:
            q += ' AND role=?'; params.append(role_target)
        users = db.execute(q, params).fetchall()
        for u in users:
            create_notification(db, u['id'], d.get('type','system'),
                d['title'], d['message'], f'broadcast_{uuid.uuid4()}')
        return jsonify({'message': f'Broadcast sent to {len(users)} users'})
    
    # ── LEADERBOARD ───────────────────────────────────────────────────────────────
    @app.route('/api/leaderboard', methods=['GET'])
    def leaderboard():
        db = get_db()
        rows = db.execute('''SELECT u.id,u.name,u.avatar,
            COALESCE(s.lessons_completed,0)*50+COALESCE(s.courses_completed,0)*500+
            COALESCE(s.perfect_quizzes,0)*100+COALESCE(s.streak,0)*10 as points,
            COALESCE(s.courses_completed,0) as courses,
            (SELECT COUNT(*) FROM user_badges WHERE user_id=u.id) as badges,
            COALESCE(s.streak,0) as streak
            FROM users u LEFT JOIN user_stats s ON s.user_id=u.id
            WHERE u.is_active=1 ORDER BY points DESC LIMIT 50''').fetchall()
        return jsonify({'leaderboard':[{'rank':i+1,'name':r['name'],'points':r['points'],
            'courses':r['courses'],'badges':r['badges'],'streak':r['streak'],
            'avatar':r['avatar'],'initial':(r['name'] or 'U')[0].upper()} for i,r in enumerate(rows)]})
    
    # ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
    @app.route('/api/notifications', methods=['GET'])
    @token_required
    def get_notifications():
        db = get_db()
        rows = db.execute('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
                          (g.current_user['user_id'],)).fetchall()
        return jsonify({'notifications':[{**dict(r),'read':bool(r['read']),
            'time':r['created_at'][:16] if r['created_at'] else '',
            'date':r['created_at'][:10] if r['created_at'] else ''} for r in rows]})
    
    @app.route('/api/notifications/<nid>/read', methods=['PUT'])
    @token_required
    def mark_read(nid):
        db = get_db()
        db.execute('UPDATE notifications SET read=1 WHERE id=? AND user_id=?',(nid,g.current_user['user_id']))
        db.commit()
        return jsonify({'message': 'Marked read'})
    
    @app.route('/api/notifications/read-all', methods=['PUT'])
    @token_required
    def mark_all_read():
        db = get_db()
        db.execute('UPDATE notifications SET read=1 WHERE user_id=? AND read=0',(g.current_user['user_id'],))
        db.commit()
        return jsonify({'message': 'All read'})
    
    @app.route('/api/notifications/<nid>', methods=['DELETE'])
    @token_required
    def del_notification(nid):
        db = get_db()
        db.execute('DELETE FROM notifications WHERE id=? AND user_id=?',(nid,g.current_user['user_id']))
        db.commit()
        return jsonify({'message': 'Deleted'})
    
    # ── CERTIFICATES ──────────────────────────────────────────────────────────────
    @app.route('/api/certificates/<cid>', methods=['GET'])
    @token_required
    def get_certificate(cid):
        db = get_db()
        uid = g.current_user['user_id']
        # Check course exists and has certificate perk
        course_check = db.execute('SELECT has_certificate FROM courses WHERE id=?',(cid,)).fetchone()
        if not course_check: return jsonify({'error': 'Course not found'}), 404
        perks_check = db.execute('SELECT has_certificate FROM course_perks WHERE course_id=?',(cid,)).fetchone()
        cert_enabled = bool(perks_check['has_certificate']) if perks_check else bool(course_check['has_certificate'])
        if not cert_enabled:
            return jsonify({'error': 'This course does not offer a certificate'}), 403
        # Must be enrolled
        enr = db.execute('SELECT progress,completed_at FROM user_enrollments WHERE user_id=? AND course_id=?',
                         (uid, cid)).fetchone()
        if not enr: return jsonify({'error': 'You are not enrolled in this course'}), 403
        # Must have passed the final quiz (is_final=1) with score >= 70
        final_lesson = db.execute(
            'SELECT id FROM lessons WHERE course_id=? AND is_final=1 AND type=\'quiz\'', (cid,)
        ).fetchone()
        if final_lesson:
            prog = db.execute(
                'SELECT quiz_score FROM user_progress WHERE user_id=? AND course_id=? AND lesson_id=? AND is_completed=1',
                (uid, cid, final_lesson['id'])
            ).fetchone()
            if not prog:
                return jsonify({'error': 'You must complete the final exam to earn this certificate', 'needs_final': True}), 403
            if (prog['quiz_score'] or 0) < 70:
                return jsonify({'error': f'You scored {prog["quiz_score"]}% on the final exam. You need 70% to earn the certificate.', 'needs_final': True, 'score': prog['quiz_score']}), 403
        c = db.execute('SELECT title,instructor_name FROM courses WHERE id=?',(cid,)).fetchone()
        if not c: return jsonify({'error': 'Course not found'}), 404
        u = db.execute('SELECT name FROM users WHERE id=?',(g.current_user['user_id'],)).fetchone()
        completed_at = enr['completed_at'] or datetime.now().isoformat()
        try:
            completion_date = datetime.fromisoformat(completed_at).strftime('%B %d, %Y')
        except:
            completion_date = str(completed_at)[:10]
        return jsonify({'certificate':{
            'courseName': c['title'],
            'instructorName': c['instructor_name'],
            'completionDate': completion_date,
            'certificateId': f"LA-{cid[:4].upper()}-{str(uuid.uuid4())[:6].upper()}",
            'userName': u['name'] if u else 'Learner'
        }})
    
    # ── HEALTH ────────────────────────────────────────────────────────────────────
    
    # ── HOMEPAGE COMMENTS ─────────────────────────────────────────────────────────
    # Create table if it doesn't exist yet (idempotent)
    def ensure_comments_table():
        pass  # Tables created in init_db
    
    @app.route('/api/homepage/comments', methods=['GET'])
    def get_homepage_comments():
        ensure_comments_table()
        db = get_db()
        p = decode_token(_get_token())
        uid = p['user_id'] if p else None
        roots = db.execute(
            "SELECT * FROM homepage_comments WHERE parent_id IS NULL ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
        def build_comment(row):
            d = dict(row)
            replies_rows = db.execute(
                "SELECT * FROM homepage_comments WHERE parent_id=? ORDER BY created_at ASC", (d['id'],)
            ).fetchall()
            d['replies'] = [build_comment(r) for r in replies_rows]
            d['reply_count'] = len(d['replies'])
            d['liked_by_me'] = bool(uid and db.execute(
                "SELECT 1 FROM homepage_comment_likes WHERE comment_id=? AND user_id=?", (d['id'], uid)
            ).fetchone())
            return d
        return jsonify({'comments': [build_comment(r) for r in roots]})
    
    @app.route('/api/homepage/comments', methods=['POST'])
    @token_required
    def post_homepage_comment():
        ensure_comments_table()
        d = request.get_json() or {}
        content = (d.get('content') or '').strip()
        if not content: return jsonify({'error': 'Content is required'}), 400
        if len(content) > 500: return jsonify({'error': 'Comment too long (max 500 chars)'}), 400
        parent_id = d.get('parent_id')
        db = get_db()
        if parent_id:
            if not db.execute('SELECT id FROM homepage_comments WHERE id=?', (parent_id,)).fetchone():
                return jsonify({'error': 'Parent comment not found'}), 404
        u = db.execute('SELECT name, avatar FROM users WHERE id=?', (g.current_user['user_id'],)).fetchone()
        cid = str(uuid.uuid4())
        db.execute(
            'INSERT INTO homepage_comments (id,user_id,user_name,user_avatar,content,parent_id) VALUES(?,?,?,?,?,?)',
            (cid, g.current_user['user_id'], u['name'], u['avatar'], content, parent_id)
        )
        db.commit()
        row = dict(db.execute('SELECT * FROM homepage_comments WHERE id=?', (cid,)).fetchone())
        row['replies'] = []; row['reply_count'] = 0; row['liked_by_me'] = False
        socketio.emit('new_homepage_comment', row)
        return jsonify({'comment': row}), 201
    
    @app.route('/api/homepage/comments/<cid>', methods=['PUT'])
    @token_required
    def edit_homepage_comment(cid):
        db = get_db()
        row = db.execute('SELECT * FROM homepage_comments WHERE id=?', (cid,)).fetchone()
        if not row: return jsonify({'error': 'Not found'}), 404
        if row['user_id'] != g.current_user['user_id']:
            return jsonify({'error': 'You can only edit your own comments'}), 403
        # 24-hour edit window
        try:
            created = datetime.fromisoformat(row['created_at'])
            if datetime.now() - created > timedelta(hours=24):
                return jsonify({'error': 'Comments can only be edited within 24 hours of posting'}), 403
        except: pass
        d = request.get_json() or {}
        content = (d.get('content') or '').strip()
        if not content: return jsonify({'error': 'Content required'}), 400
        if len(content) > 500: return jsonify({'error': 'Too long (max 500)'}), 400
        db.execute('UPDATE homepage_comments SET content=?, edited_at=? WHERE id=?',
                   (content, datetime.now().isoformat(), cid))
        db.commit()
        updated = dict(db.execute('SELECT * FROM homepage_comments WHERE id=?', (cid,)).fetchone())
        updated['replies'] = []; updated['reply_count'] = 0; updated['liked_by_me'] = False
        socketio.emit('edit_homepage_comment', updated)
        return jsonify({'comment': updated})
    
    @app.route('/api/homepage/comments/<cid>/like', methods=['POST'])
    @token_required
    def like_homepage_comment(cid):
        db = get_db()
        row = db.execute('SELECT id, likes_count FROM homepage_comments WHERE id=?', (cid,)).fetchone()
        if not row: return jsonify({'error': 'Not found'}), 404
        uid = g.current_user['user_id']
        if db.execute('SELECT 1 FROM homepage_comment_likes WHERE comment_id=? AND user_id=?', (cid, uid)).fetchone():
            db.execute('DELETE FROM homepage_comment_likes WHERE comment_id=? AND user_id=?', (cid, uid))
            new_count = max(0, (row['likes_count'] or 0) - 1)
            liked = False
        else:
            db.execute('INSERT OR IGNORE INTO homepage_comment_likes (comment_id, user_id) VALUES(?,?)', (cid, uid))
            new_count = (row['likes_count'] or 0) + 1
            liked = True
        db.execute('UPDATE homepage_comments SET likes_count=? WHERE id=?', (new_count, cid))
        db.commit()
        socketio.emit('like_homepage_comment', {'id': cid, 'likes_count': new_count})
        return jsonify({'liked': liked, 'likes_count': new_count})
    
    @app.route('/api/homepage/comments/<cid>', methods=['DELETE'])
    @token_required
    def delete_homepage_comment(cid):
        db = get_db()
        row = db.execute('SELECT user_id FROM homepage_comments WHERE id=?', (cid,)).fetchone()
        if not row: return jsonify({'error': 'Not found'}), 404
        if row['user_id'] != g.current_user['user_id'] and g.current_user['role'] not in ('admin','superadmin'):
            return jsonify({'error': 'Forbidden'}), 403
        db.execute('DELETE FROM homepage_comments WHERE parent_id=?', (cid,))
        db.execute('DELETE FROM homepage_comment_likes WHERE comment_id=?', (cid,))
        db.execute('DELETE FROM homepage_comments WHERE id=?', (cid,))
        db.commit()
        socketio.emit('delete_homepage_comment', {'id': cid})
        return jsonify({'message': 'Deleted'})
    
    # ── PAYMENTS (simulated — real integration point) ─────────────────────────────
    @app.route('/api/payments/initiate', methods=['POST'])
    @token_required
    def initiate_payment():
        d = request.get_json() or {}
        course_id = d.get('course_id')
        if not course_id:
            return jsonify({'error': 'course_id required'}), 400
        db = get_db()
        c = db.execute('SELECT id, title, price, is_free FROM courses WHERE id=?', (course_id,)).fetchone()
        if not c:
            return jsonify({'error': 'Course not found'}), 404
        if c['is_free']:
            return jsonify({'error': 'Course is free — enroll directly'}), 400
        # Check not already enrolled
        if db.execute('SELECT id FROM user_enrollments WHERE user_id=? AND course_id=?',
                      (g.current_user['user_id'], course_id)).fetchone():
            return jsonify({'error': 'Already enrolled'}), 400
        # Generate a payment reference
        ref = f"LA-{str(uuid.uuid4())[:8].upper()}"
        return jsonify({
            'payment_ref': ref,
            'course_id': course_id,
            'course_title': c['title'],
            'amount': c['price'],
            'currency': 'USD',
            'status': 'pending'
        })
    
    @app.route('/api/payments/confirm', methods=['POST'])
    @token_required
    def confirm_payment():
        """
        In production this would verify with a payment provider (Stripe/Paystack).
        For now we accept the reference and enroll the user.
        """
        d = request.get_json() or {}
        course_id = d.get('course_id')
        payment_ref = d.get('payment_ref')
        # Simulate card validation
        card = d.get('card', {})
        if not all([card.get('number'), card.get('expiry'), card.get('cvv'), card.get('name')]):
            return jsonify({'error': 'All card fields are required'}), 400
        # Basic card number check (16 digits)
        number = card['number'].replace(' ', '')
        if not number.isdigit() or len(number) != 16:
            return jsonify({'error': 'Invalid card number'}), 400
        if not course_id or not payment_ref:
            return jsonify({'error': 'course_id and payment_ref required'}), 400
        db = get_db()
        c = db.execute('SELECT id, title, price FROM courses WHERE id=?', (course_id,)).fetchone()
        if not c:
            return jsonify({'error': 'Course not found'}), 404
        # Check not already enrolled
        if db.execute('SELECT id FROM user_enrollments WHERE user_id=? AND course_id=?',
                      (g.current_user['user_id'], course_id)).fetchone():
            return jsonify({'message': 'Already enrolled', 'enrolled': True})
        # Enroll
        db.execute('INSERT INTO user_enrollments (user_id,course_id,progress) VALUES(?,?,0)',
                   (g.current_user['user_id'], course_id))
        db.execute('UPDATE courses SET enrollments=enrollments+1 WHERE id=?', (course_id,))
        db.commit()
        create_notification(db, g.current_user['user_id'], 'enrollment',
            'Payment Successful! 🎉',
            f'Your payment for "{c["title"]}" was successful. Happy learning!',
            f'payment_{course_id}')
        return jsonify({
            'message': 'Payment successful',
            'enrolled': True,
            'receipt': payment_ref,
            'course_id': course_id
        })
    
    # ── ADMIN EXTENDED CRUD ───────────────────────────────────────────────────────
    @app.route('/api/admin/users/<uid>', methods=['GET'])
    @admin_required
    def admin_get_user(uid):
        db = get_db()
        u = db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
        if not u: return jsonify({'error': 'Not found'}), 404
        ud = dict(u)
        del ud['password_hash']
        st = db.execute('SELECT * FROM user_stats WHERE user_id=?', (uid,)).fetchone()
        ud['stats'] = dict(st) if st else {}
        en = db.execute('''
            SELECT ue.*, c.title as course_title, c.category
            FROM user_enrollments ue JOIN courses c ON c.id=ue.course_id
            WHERE ue.user_id=?
        ''', (uid,)).fetchall()
        ud['enrollments'] = [dict(r) for r in en]
        bd = db.execute('SELECT badge_key, earned_at FROM user_badges WHERE user_id=?', (uid,)).fetchall()
        ud['badges'] = [dict(r) for r in bd]
        return jsonify({'user': ud})
    
    @app.route('/api/admin/users/<uid>', methods=['DELETE'])
    @admin_required
    def admin_delete_user(uid):
        import os
        db = get_db()
        target = db.execute('SELECT role, email FROM users WHERE id=?', (uid,)).fetchone()
        if not target: return jsonify({'error': 'Not found'}), 404
        if target['role'] == 'superadmin':
            return jsonify({'error': 'The superadmin account cannot be deleted'}), 403
        default_email = os.environ.get('ADMIN_EMAIL', os.environ.get('ADMIN_EMAIL', 'admin@learnafrica.com')).lower()
        if target['email'].lower() == default_email:
            return jsonify({'error': 'The default admin account cannot be deleted'}), 403
        if uid == g.current_user['user_id']:
            return jsonify({'error': 'You cannot delete your own account'}), 403
        db.execute('DELETE FROM users WHERE id=?', (uid,))
        db.commit()
        return jsonify({'message': 'User deleted permanently'})
    
    @app.route('/api/admin/users/<uid>', methods=['PUT'])
    @admin_required
    def admin_update_user(uid):
        db = get_db()
        d = request.get_json() or {}
        allowed = ['name', 'email', 'bio', 'location', 'website']
        fields, vals = [], []
        for f in allowed:
            if f in d:
                fields.append(f'{f}=?')
                vals.append(d[f])
        if fields:
            vals.append(uid)
            db.execute(f'UPDATE users SET {",".join(fields)},updated_at=CURRENT_TIMESTAMP WHERE id=?', vals)
        db.commit()
        return jsonify({'message': 'User updated'})
    
    @app.route('/api/admin/instructors', methods=['GET'])
    @admin_required
    def admin_instructors():
        db = get_db()
        rows = db.execute("""
            SELECT u.id, u.name, u.email, u.avatar, u.bio, u.location,
                   u.instructor_status, u.is_active, u.created_at,
                   (SELECT COUNT(*) FROM courses WHERE instructor_id=u.id) as course_count,
                   (SELECT COUNT(DISTINCT ue.user_id) FROM user_enrollments ue
                    JOIN courses c ON c.id=ue.course_id WHERE c.instructor_id=u.id) as total_students
            FROM users u WHERE u.role='instructor'
            ORDER BY u.created_at DESC
        """).fetchall()
        result = []
        for r in rows:
            rd = dict(r)
            courses_list = db.execute(
                'SELECT id, title, enrollments, rating, status FROM courses WHERE instructor_id=?', (r['id'],)
            ).fetchall()
            rd['courses'] = [dict(c) for c in courses_list]
            result.append(rd)
        return jsonify({'instructors': result})
    
    @app.route('/api/admin/students', methods=['GET'])
    @admin_required
    def admin_students():
        db = get_db()
        rows = db.execute("""
            SELECT u.id, u.name, u.email, u.avatar, u.is_active, u.created_at,
                   COALESCE(s.lessons_completed,0) as lessons_completed,
                   COALESCE(s.courses_completed,0) as courses_completed,
                   COALESCE(s.streak,0) as streak,
                   (SELECT COUNT(*) FROM user_enrollments WHERE user_id=u.id) as enrolled_count
            FROM users u LEFT JOIN user_stats s ON s.user_id=u.id
            WHERE u.role='student' AND u.is_active=1
            ORDER BY u.created_at DESC
        """).fetchall()
        return jsonify({'students': [dict(r) for r in rows]})
    
    
    # ── CERTIFICATE & BADGE VERIFICATION ─────────────────────────────────────────
    @app.route('/api/verify', methods=['GET'])
    def verify_credential():
        credential_id = (request.args.get('id') or '').strip().upper()
        if not credential_id:
            return jsonify({'error': 'id parameter required'}), 400
        db = get_db()
        cert = db.execute('SELECT * FROM issued_certificates WHERE UPPER(cert_id)=?', (credential_id,)).fetchone()
        if cert:
            return jsonify({'valid': True, 'type': 'certificate', 'id': cert['cert_id'],
                'holder': cert['user_name'], 'course': cert['course_name'],
                'instructor': cert['instructor_name'], 'issued_at': cert['issued_at']})
        badge = db.execute('SELECT * FROM issued_badges WHERE UPPER(badge_id)=?', (credential_id,)).fetchone()
        if badge:
            return jsonify({'valid': True, 'type': 'badge', 'id': badge['badge_id'],
                'holder': badge['user_name'], 'badge': badge['badge_title'],
                'badge_key': badge['badge_key'], 'issued_at': badge['issued_at']})
        return jsonify({'valid': False, 'message': 'Credential not found or invalid'})
    
    @app.route('/api/certificates/<cid>/issue', methods=['POST'])
    @token_required
    def issue_certificate(cid):
        db = get_db()
        enr = db.execute('SELECT progress FROM user_enrollments WHERE user_id=? AND course_id=? AND progress=100',
            (g.current_user['user_id'], cid)).fetchone()
        if not enr: return jsonify({'error': 'Course not completed'}), 403
        existing = db.execute('SELECT cert_id FROM issued_certificates WHERE user_id=? AND course_id=?',
            (g.current_user['user_id'], cid)).fetchone()
        if existing: return jsonify({'cert_id': existing['cert_id']})
        course = db.execute('SELECT title, instructor_name FROM courses WHERE id=?', (cid,)).fetchone()
        user = db.execute('SELECT name FROM users WHERE id=?', (g.current_user['user_id'],)).fetchone()
        if not course or not user: return jsonify({'error': 'Not found'}), 404
        cert_id = 'LA-CERT-' + cid[:4].upper() + '-' + str(uuid.uuid4())[:6].upper()
        db.execute('INSERT OR IGNORE INTO issued_certificates (id,cert_id,user_id,course_id,user_name,course_name,instructor_name) VALUES (?,?,?,?,?,?,?)',
            (str(uuid.uuid4()), cert_id, g.current_user['user_id'], cid, user['name'], course['title'], course['instructor_name']))
        db.commit()
        return jsonify({'cert_id': cert_id})
    
    @app.route('/api/badges/issue', methods=['POST'])
    @token_required
    def issue_badge():
        d = request.get_json() or {}
        badge_key = d.get('badge_key', '').strip()
        badge_title = d.get('badge_title', '').strip()
        if not badge_key: return jsonify({'error': 'badge_key required'}), 400
        db = get_db()
        earned = db.execute('SELECT id FROM user_badges WHERE user_id=? AND badge_key=?',
            (g.current_user['user_id'], badge_key)).fetchone()
        if not earned: return jsonify({'error': 'Badge not earned'}), 403
        existing = db.execute('SELECT badge_id FROM issued_badges WHERE user_id=? AND badge_key=?',
            (g.current_user['user_id'], badge_key)).fetchone()
        if existing: return jsonify({'badge_id': existing['badge_id']})
        user = db.execute('SELECT name FROM users WHERE id=?', (g.current_user['user_id'],)).fetchone()
        badge_id = 'LA-BADGE-' + badge_key[:4].upper() + '-' + str(uuid.uuid4())[:6].upper()
        db.execute('INSERT OR IGNORE INTO issued_badges (id,badge_id,user_id,user_name,badge_key,badge_title) VALUES (?,?,?,?,?,?)',
            (str(uuid.uuid4()), badge_id, g.current_user['user_id'], user['name'] if user else 'Learner', badge_key, badge_title))
        db.commit()
        return jsonify({'badge_id': badge_id})
    
    
    # ── FILE UPLOAD ───────────────────────────────────────────────────────────────
    def _upload_to_supabase(file_bytes, filename, content_type='image/jpeg'):
        """Upload bytes to Supabase Storage. Returns public URL or None."""
        supabase_url = os.environ.get('SUPABASE_URL', '')
        service_key  = os.environ.get('SUPABASE_SERVICE_KEY', '')
        bucket       = os.environ.get('SUPABASE_STORAGE_BUCKET', 'learnafrica-uploads')
        if not supabase_url or not service_key:
            return None
        import requests as _req
        headers = {
            'Authorization': f'Bearer {service_key}',
            'Content-Type': content_type,
            'x-upsert': 'true',
        }
        upload_url = f"{supabase_url}/storage/v1/object/{bucket}/{filename}"
        r = _req.put(upload_url, headers=headers, data=file_bytes, timeout=30)
        if r.status_code in (200, 201):
            return f"{supabase_url}/storage/v1/object/public/{bucket}/{filename}"
        return None
    
    @app.route('/api/upload/thumbnail', methods=['POST'])
    @token_required
    def upload_thumbnail():
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        if not allowed_file(file.filename):
            return jsonify({'error': 'Only image files allowed (png, jpg, jpeg, gif, webp)'}), 400
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f"thumbnails/{str(uuid.uuid4())}.{ext}"
        file_bytes = file.read(5 * 1024 * 1024 + 1)
        if len(file_bytes) > 5 * 1024 * 1024:
            return jsonify({'error': 'Image too large (max 5MB)'}), 400
        content_type = f'image/{ext}' if ext != 'jpg' else 'image/jpeg'
        # Try Supabase first (production), fall back to local (development)
        public_url = _upload_to_supabase(file_bytes, filename, content_type)
        if public_url:
            return jsonify({'url': public_url, 'filename': filename})
        # Local fallback
        local_filename = f"{str(uuid.uuid4())}.{ext}"
        path = os.path.join(app.config['UPLOAD_FOLDER'], local_filename)
        try:
            with open(path, 'wb') as out:
                out.write(file_bytes)
        except Exception as e:
            return jsonify({'error': f'Upload failed: {str(e)}'}), 500
        url = f"/uploads/{local_filename}"
        return jsonify({'url': url, 'filename': local_filename})
    
    @app.route('/uploads/<filename>')
    def serve_upload(filename):
        from flask import send_from_directory
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    
    # ── LESSON DISCUSSIONS ────────────────────────────────────────────────────────
    def ensure_discussions_table(db):
        db.execute("""CREATE TABLE IF NOT EXISTS lesson_discussions (
            id TEXT PRIMARY KEY,
            course_id TEXT NOT NULL,
            lesson_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            user_avatar TEXT,
            user_role TEXT DEFAULT 'student',
            parent_id TEXT,
            content TEXT NOT NULL,
            upvotes INTEGER DEFAULT 0,
            is_pinned INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )""")
        db.commit()
    
    @app.route('/api/courses/<cid>/lessons/<lid>/discussions', methods=['GET'])
    @token_required
    def get_discussions(cid, lid):
        db = get_db()
        ensure_discussions_table(db)
        rows = db.execute(
            """SELECT * FROM lesson_discussions
               WHERE course_id=? AND lesson_id=? AND parent_id IS NULL
               ORDER BY is_pinned DESC, created_at DESC""",
            (cid, lid)
        ).fetchall()
        posts = []
        for r in rows:
            post = dict(r)
            # Get replies
            replies = db.execute(
                """SELECT * FROM lesson_discussions
                   WHERE parent_id=? ORDER BY created_at ASC""",
                (r['id'],)
            ).fetchall()
            post['replies'] = [dict(rep) for rep in replies]
            # Check if current user upvoted (simple: store in upvoters as user count for now)
            post['can_delete'] = (
                post['user_id'] == g.current_user['user_id'] or
                g.current_user['role'] in ('admin','superadmin','instructor')
            )
            posts.append(post)
        return jsonify({'discussions': posts})
    
    @app.route('/api/courses/<cid>/lessons/<lid>/discussions', methods=['POST'])
    @token_required
    def post_discussion(cid, lid):
        db = get_db()
        ensure_discussions_table(db)
        # Must be enrolled (or instructor/admin)
        if g.current_user['role'] not in ('instructor','admin','superadmin'):
            enrolled = db.execute(
                'SELECT id FROM user_enrollments WHERE user_id=? AND course_id=?',
                (g.current_user['user_id'], cid)
            ).fetchone()
            if not enrolled:
                return jsonify({'error': 'Enroll in this course to join discussions'}), 403
        d = request.get_json() or {}
        content = (d.get('content') or '').strip()
        if not content:
            return jsonify({'error': 'Content is required'}), 400
        if len(content) > 2000:
            return jsonify({'error': 'Too long (max 2000 chars)'}), 400
        parent_id = d.get('parent_id')  # for replies
        user = db.execute('SELECT name, avatar, role FROM users WHERE id=?',
                          (g.current_user['user_id'],)).fetchone()
        did = str(uuid.uuid4())
        db.execute(
            """INSERT INTO lesson_discussions
               (id,course_id,lesson_id,user_id,user_name,user_avatar,user_role,parent_id,content)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (did, cid, lid, g.current_user['user_id'],
             user['name'], user['avatar'], user['role'], parent_id, content)
        )
        db.commit()
        row = db.execute('SELECT * FROM lesson_discussions WHERE id=?', (did,)).fetchone()
        result = dict(row)
        result['replies'] = []
        result['can_delete'] = True
        return jsonify({'discussion': result}), 201
    
    @app.route('/api/courses/<cid>/lessons/<lid>/discussions/<did>', methods=['DELETE'])
    @token_required
    def delete_discussion(cid, lid, did):
        db = get_db()
        ensure_discussions_table(db)
        row = db.execute('SELECT user_id FROM lesson_discussions WHERE id=?', (did,)).fetchone()
        if not row: return jsonify({'error': 'Not found'}), 404
        if (row['user_id'] != g.current_user['user_id'] and
                g.current_user['role'] not in ('admin','superadmin','instructor')):
            return jsonify({'error': 'Forbidden'}), 403
        # Delete replies too
        db.execute('DELETE FROM lesson_discussions WHERE parent_id=?', (did,))
        db.execute('DELETE FROM lesson_discussions WHERE id=?', (did,))
        db.commit()
        return jsonify({'message': 'Deleted'})
    
    @app.route('/api/courses/<cid>/lessons/<lid>/discussions/<did>/upvote', methods=['POST'])
    @token_required
    def upvote_discussion(cid, lid, did):
        db = get_db()
        ensure_discussions_table(db)
        db.execute('UPDATE lesson_discussions SET upvotes=upvotes+1 WHERE id=?', (did,))
        db.commit()
        row = db.execute('SELECT upvotes FROM lesson_discussions WHERE id=?', (did,)).fetchone()
        return jsonify({'upvotes': row['upvotes'] if row else 0})
    
    
    # ── REVENUE SPLIT CONFIG ──────────────────────────────────────────────────────
    @app.route('/api/admin/revenue-split', methods=['GET'])
    @admin_required
    def get_revenue_split_config():
        db = get_db()
        instructor_pct, admin_pct = get_revenue_split(db)
        return jsonify({'instructor_share': instructor_pct, 'admin_share': admin_pct})
    
    @app.route('/api/admin/revenue-split', methods=['PUT'])
    @admin_required
    def update_revenue_split():
        d = request.get_json() or {}
        instructor_share = float(d.get('instructor_share', 50))
        if not (0 <= instructor_share <= 100):
            return jsonify({'error': 'instructor_share must be between 0 and 100'}), 400
        admin_share = round(100 - instructor_share, 2)
        db = get_db()
        db.execute('INSERT INTO platform_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=CURRENT_TIMESTAMP',
                   ('instructor_share', str(instructor_share)))
        db.execute('INSERT INTO platform_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=CURRENT_TIMESTAMP',
                   ('admin_share', str(admin_share)))
        db.commit()
        return jsonify({
            'message': 'Revenue split updated',
            'instructor_share': instructor_share,
            'admin_share': admin_share
        })
    
    @app.route('/api/admin/earnings', methods=['GET'])
    @admin_required
    def admin_earnings():
        """Detailed earnings breakdown per instructor."""
        db = get_db()
        instructor_pct, admin_pct = get_revenue_split(db)
        instructors = db.execute('''
            SELECT u.id, u.name, u.email, u.avatar,
                   COUNT(DISTINCT c.id) as course_count,
                   COALESCE(SUM(c.price * (SELECT COUNT(*) FROM user_enrollments WHERE course_id=c.id)), 0) as gross
            FROM users u
            JOIN courses c ON c.instructor_id=u.id
            WHERE c.is_free=0
            GROUP BY u.id
            ORDER BY gross DESC
        ''').fetchall()
        result = []
        total_gross = 0
        for row in instructors:
            gross = float(row['gross'])
            total_gross += gross
            result.append({
                'id': row['id'],
                'name': row['name'],
                'email': row['email'],
                'course_count': row['course_count'],
                'gross_revenue': round(gross, 2),
                'instructor_earnings': round(gross * (instructor_pct / 100), 2),
                'platform_earnings':   round(gross * (admin_pct / 100), 2),
            })
        return jsonify({
            'instructors': result,
            'total_gross': round(total_gross, 2),
            'platform_total': round(total_gross * (admin_pct / 100), 2),
            'instructors_total': round(total_gross * (instructor_pct / 100), 2),
            'instructor_share_pct': instructor_pct,
            'admin_share_pct': admin_pct,
        })
    
    
    # ── INSTRUCTOR GUIDE ──────────────────────────────────────────────────────────
    @app.route('/api/instructor-guide', methods=['GET'])
    def get_instructor_guide():
        """Public — instructors and admins fetch guide steps."""
        db = get_db()
        rows = db.execute('SELECT * FROM instructor_guide ORDER BY "order", step_number').fetchall()
        return jsonify({'steps': [dict(r) for r in rows]})
    
    @app.route('/api/admin/instructor-guide', methods=['GET'])
    @admin_required
    def admin_get_guide():
        db = get_db()
        rows = db.execute('SELECT * FROM instructor_guide ORDER BY "order", step_number').fetchall()
        return jsonify({'steps': [dict(r) for r in rows]})
    
    @app.route('/api/admin/instructor-guide', methods=['POST'])
    @admin_required
    def admin_add_guide_step():
        d = request.get_json() or {}
        if not d.get('title') or not d.get('description'):
            return jsonify({'error': 'title and description required'}), 400
        db = get_db()
        max_order = db.execute('SELECT COALESCE(MAX("order"),0) as m FROM instructor_guide').fetchone()['m']
        max_step  = db.execute('SELECT COALESCE(MAX(step_number),0) as m FROM instructor_guide').fetchone()['m']
        sid = str(uuid.uuid4())
        db.execute('INSERT INTO instructor_guide (id,step_number,title,description,video_url,"order") VALUES(?,?,?,?,?,?)',
                   (sid, max_step+1, d['title'], d['description'], d.get('video_url'), max_order+1))
        db.commit()
        row = db.execute('SELECT * FROM instructor_guide WHERE id=?', (sid,)).fetchone()
        return jsonify({'step': dict(row)}), 201
    
    @app.route('/api/admin/instructor-guide/<sid>', methods=['PUT'])
    @admin_required
    def admin_update_guide_step(sid):
        d = request.get_json() or {}
        db = get_db()
        row = db.execute('SELECT id FROM instructor_guide WHERE id=?', (sid,)).fetchone()
        if not row: return jsonify({'error': 'Step not found'}), 404
        fields, vals = [], []
        for f in ('title', 'description', 'video_url', 'order', 'step_number'):
            if f in d:
                fields.append(f'"{f}"=?' if f == 'order' else f'{f}=?')
                # Allow null to clear the field (e.g. removing a video)
                vals.append(None if d[f] is None else d[f])
        if fields:
            vals.append(sid)
            db.execute(f'UPDATE instructor_guide SET {",".join(fields)},updated_at=CURRENT_TIMESTAMP WHERE id=?', vals)
            db.commit()
        row = db.execute('SELECT * FROM instructor_guide WHERE id=?', (sid,)).fetchone()
        return jsonify({'step': dict(row)})
    
    @app.route('/api/admin/instructor-guide/<sid>', methods=['DELETE'])
    @admin_required
    def admin_delete_guide_step(sid):
        db = get_db()
        db.execute('DELETE FROM instructor_guide WHERE id=?', (sid,))
        db.commit()
        return jsonify({'message': 'Deleted'})
    
    @app.route('/api/admin/instructor-guide/<sid>/upload-video', methods=['POST'])
    @admin_required
    def admin_upload_guide_video(sid):
        """Upload a video file for a guide step."""
        db = get_db()
        row = db.execute('SELECT id FROM instructor_guide WHERE id=?', (sid,)).fetchone()
        if not row: return jsonify({'error': 'Step not found'}), 404
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        # Allow video files too
        video_exts = {'mp4', 'webm', 'ogg', 'mov'}
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if ext not in video_exts:
            return jsonify({'error': 'Only video files allowed (mp4, webm, ogg, mov)'}), 400
        file.seek(0, 2); size = file.tell(); file.seek(0)
        if size > 100 * 1024 * 1024:
            return jsonify({'error': 'Video too large (max 100MB)'}), 400
        filename = f"guide_{sid}.{ext}"
        path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(path)
        url = f"/uploads/{filename}"
        db.execute('UPDATE instructor_guide SET video_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', (url, sid))
        db.commit()
        return jsonify({'url': url})
    
    
    # ── LESSON VIDEO UPLOAD ───────────────────────────────────────────────────────
    @app.route('/api/instructor/lessons/<lid>/upload-video', methods=['POST'])
    @instructor_required
    def upload_lesson_video(lid):
        """Upload a video file for a lesson. Streams to disk to handle large files."""
        db = get_db()
        lesson = db.execute('SELECT id, course_id FROM lessons WHERE id=?', (lid,)).fetchone()
        if not lesson: return jsonify({'error': 'Lesson not found'}), 404
        course = db.execute('SELECT instructor_id FROM courses WHERE id=?', (lesson['course_id'],)).fetchone()
        if course['instructor_id'] != g.current_user['user_id'] and g.current_user['role'] not in ('admin','superadmin'):
            return jsonify({'error': 'Forbidden'}), 403
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        file = request.files['file']
        if not file or not file.filename:
            return jsonify({'error': 'No file selected'}), 400
        video_exts = {'mp4','webm','ogg','mov','avi','mkv'}
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if ext not in video_exts:
            return jsonify({'error': f'File type .{ext} not allowed. Use mp4, webm, or mov.'}), 400
        filename = f"lesson_{lid}_{str(uuid.uuid4())[:8]}.{ext}"
        path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        # Stream-save in 1MB chunks — avoids loading entire file into memory
        try:
            with open(path, 'wb') as out:
                chunk_size = 1024 * 1024  # 1MB
                total = 0
                while True:
                    chunk = file.stream.read(chunk_size)
                    if not chunk:
                        break
                    out.write(chunk)
                    total += len(chunk)
                    if total > 500 * 1024 * 1024:
                        out.close()
                        os.remove(path)
                        return jsonify({'error': 'Video too large (max 500MB)'}), 400
        except Exception as e:
            if os.path.exists(path):
                os.remove(path)
            return jsonify({'error': f'Upload failed: {str(e)}'}), 500
        url = f"/uploads/{filename}"
        db.execute('UPDATE lessons SET video_file=?, video_url=? WHERE id=?', (url, url, lid))
        db.commit()
        return jsonify({'url': url, 'filename': filename, 'size_mb': round(total / 1048576, 1)})
    
    # ── COURSE RESOURCE UPLOAD ────────────────────────────────────────────────────
    @app.route('/api/instructor/courses/<cid>/resources', methods=['GET'])
    @instructor_required
    def get_course_resources(cid):
        db = get_db()
        rows = db.execute('SELECT * FROM course_resources WHERE course_id=? ORDER BY created_at', (cid,)).fetchall()
        return jsonify({'resources': [dict(r) for r in rows]})
    
    @app.route('/api/instructor/courses/<cid>/resources', methods=['POST'])
    @instructor_required
    def add_course_resource(cid):
        """Add a resource by URL or name for a course."""
        db = get_db()
        d = request.get_json() or {}
        if not d.get('title') or not d.get('url'): return jsonify({'error': 'title and url required'}), 400
        rid = str(uuid.uuid4())
        db.execute('INSERT INTO course_resources (id,course_id,title,url,file_type) VALUES(?,?,?,?,?)',
                   (rid, cid, d['title'], d['url'], d.get('file_type','file')))
        db.commit()
        row = db.execute('SELECT * FROM course_resources WHERE id=?', (rid,)).fetchone()
        return jsonify({'resource': dict(row)}), 201
    
    @app.route('/api/instructor/courses/<cid>/resources/upload', methods=['POST'])
    @instructor_required
    def upload_course_resource(cid):
        """Upload a resource file for a course."""
        db = get_db()
        course = db.execute('SELECT instructor_id FROM courses WHERE id=?', (cid,)).fetchone()
        if not course: return jsonify({'error': 'Course not found'}), 404
        if course['instructor_id'] != g.current_user['user_id'] and g.current_user['role'] not in ('admin','superadmin'):
            return jsonify({'error': 'Forbidden'}), 403
        if 'file' not in request.files: return jsonify({'error': 'No file'}), 400
        file = request.files['file']
        if not file or file.filename == '': return jsonify({'error': 'No file selected'}), 400
        file.seek(0,2); size = file.tell(); file.seek(0)
        if size > 50 * 1024 * 1024: return jsonify({'error': 'File too large (max 50MB)'}), 400
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'bin'
        filename = f"resource_{cid[:8]}_{str(uuid.uuid4())[:8]}.{ext}"
        path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(path)
        url = f"/uploads/{filename}"
        # Determine file type
        if ext in ('pdf',): ftype = 'pdf'
        elif ext in ('doc','docx'): ftype = 'doc'
        elif ext in ('ppt','pptx'): ftype = 'ppt'
        elif ext in ('xls','xlsx'): ftype = 'spreadsheet'
        elif ext in ('zip','rar','7z'): ftype = 'archive'
        elif ext in ('jpg','jpeg','png','gif','webp'): ftype = 'image'
        else: ftype = 'file'
        title = request.form.get('title', file.filename)
        size_str = f"{size // 1024}KB" if size < 1048576 else f"{size // 1048576}MB"
        rid = str(uuid.uuid4())
        db.execute('INSERT INTO course_resources (id,course_id,title,url,file_type,file_size) VALUES(?,?,?,?,?,?)',
                   (rid, cid, title, url, ftype, size_str))
        db.commit()
        row = db.execute('SELECT * FROM course_resources WHERE id=?', (rid,)).fetchone()
        return jsonify({'resource': dict(row)}), 201
    
    @app.route('/api/instructor/courses/<cid>/resources/<rid>', methods=['DELETE'])
    @instructor_required
    def delete_course_resource(cid, rid):
        db = get_db()
        db.execute('DELETE FROM course_resources WHERE id=? AND course_id=?', (rid, cid))
        db.commit()
        return jsonify({'message': 'Deleted'})
    
    @app.route('/api/health', methods=['GET'])
    def health():
        return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})
    
    # ── SEED DATA ─────────────────────────────────────────────────────────────────
    
    # ── DEFAULT ADMIN ─────────────────────────────────────────────────────────────
    def ensure_default_admin():
        """
        Guarantee an admin account always exists.
        Credentials come from environment variables with safe defaults for development.
        This account cannot be deleted via the admin panel.
        """
        import os
        admin_email    = os.environ.get('ADMIN_EMAIL',    os.environ.get('ADMIN_EMAIL', 'admin@learnafrica.com')).lower()
        admin_password = os.environ.get('ADMIN_PASSWORD', os.environ.get('ADMIN_PASSWORD', 'Admin@LearnAfrica2024!'))
        admin_name     = os.environ.get('ADMIN_NAME',     'Platform Administrator')
    
        db = None  # replaced by get_db()
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        c = db.cursor()
    
        existing = c.execute('SELECT id, role FROM users WHERE LOWER(email)=?', (admin_email,)).fetchone()
        if existing:
            # Make sure they are superadmin and approved
            if existing['role'] != 'superadmin':
                c.execute('UPDATE users SET role=?, instructor_status=? WHERE id=?',
                          ('superadmin', 'approved', existing['id']))
                db.commit()
                print(f"✅ Upgraded {admin_email} to superadmin")
            else:
                print(f"✅ Default admin exists: {admin_email}")
        else:
            uid = str(uuid.uuid4())
            c.execute("""INSERT INTO users
                (id, name, email, password_hash, role, instructor_status, is_active)
                VALUES (?, ?, ?, ?, 'superadmin', 'approved', 1)""",
                (uid, admin_name, admin_email,
                 generate_password_hash(admin_password)))
            c.execute('INSERT OR IGNORE INTO user_stats (user_id, streak, last_activity) VALUES (?, 0, DATE("now"))', (uid,))
            c.execute('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)', (uid,))
            db.commit()
            print(f"✅ Default admin created: {admin_email}")
    
        db.close()
    
    def seed_courses():
        """Create 5 complete courses with lessons and quizzes if none exist."""
        db = None  # replaced by get_db()
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        c = db.cursor()
    
        if c.execute('SELECT COUNT(*) as n FROM courses').fetchone()['n'] > 0:
            print("📊 Courses already exist, skipping seed")
            db.close()
            return
    
        # Create a demo instructor account
        inst_id = str(uuid.uuid4())
        c.execute('''INSERT OR IGNORE INTO users
            (id, name, email, password_hash, role, bio, location, instructor_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)''', (
            inst_id,
            'Dr. Amina Okonkwo',
            'instructor@learnafrica.com',
            generate_password_hash('Password123!'),
            'instructor',
            'Experienced software engineer with 10+ years in the industry, passionate about teaching the next generation of African tech talent.',
            'Accra, Ghana',
            'approved'
        ))
        c.execute('INSERT OR IGNORE INTO user_stats (user_id, streak) VALUES (?, 1)', (inst_id,))
        c.execute('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)', (inst_id,))
    
        COURSES = [
            {
                'title': 'Introduction to Web Development',
                'description': 'Learn the fundamentals of HTML, CSS, and JavaScript to build modern websites from scratch. Perfect for absolute beginners with no prior coding experience.',
                'category': 'Web Development',
                'difficulty': 'Beginner',
                'duration': '8 weeks',
                'price': 0,
                'is_free': 1,
                'has_certificate': 1,
                'thumbnail': '/placeholder.jpg',
                'tags': ['HTML', 'CSS', 'JavaScript', 'Responsive Design'],
                'outcomes': [
                    'Understand how the web works and the role of HTML, CSS, and JavaScript',
                    'Build responsive layouts using modern CSS techniques like Flexbox and Grid',
                    'Master JavaScript fundamentals including DOM manipulation and events',
                    'Create and deploy a live website to a professional hosting environment',
                ],
                'sections': [
                    {
                        'title': 'Getting Started with HTML',
                        'lessons': [
                            {'title': 'What is the Web?', 'type': 'video', 'duration': '12 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=J8hzJxb0rpc',
                             'content': '<h2>Welcome to Web Development</h2><p>The web is a system of interconnected documents and other resources, linked by hyperlinks and URLs. In this lesson we cover how browsers, servers, and the internet work together to deliver web pages.</p><h3>Key Concepts</h3><ul><li><strong>Client</strong>: Your browser (Chrome, Firefox, etc.)</li><li><strong>Server</strong>: A computer that stores and serves web pages</li><li><strong>HTTP/HTTPS</strong>: The protocol browsers and servers use to communicate</li></ul><p>When you type a URL, your browser sends an HTTP request to the server, which responds with HTML, CSS, and JavaScript files that your browser renders into the page you see.</p>'},
                            {'title': 'HTML Basics: Tags and Structure', 'type': 'video', 'duration': '18 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=UB1O30fR-EE',
                             'content': '<h2>HTML Structure</h2><p>HTML (HyperText Markup Language) is the skeleton of every web page. Every HTML document follows this structure:</p><pre><code>&lt;!DOCTYPE html&gt;\n&lt;html&gt;\n  &lt;head&gt;\n    &lt;title&gt;My Page&lt;/title&gt;\n  &lt;/head&gt;\n  &lt;body&gt;\n    &lt;h1&gt;Hello World&lt;/h1&gt;\n  &lt;/body&gt;\n&lt;/html&gt;</code></pre><h3>Common Tags</h3><ul><li><code>&lt;h1&gt;–&lt;h6&gt;</code>: Headings</li><li><code>&lt;p&gt;</code>: Paragraphs</li><li><code>&lt;a href=""&gt;</code>: Links</li><li><code>&lt;img src=""&gt;</code>: Images</li><li><code>&lt;div&gt;</code> / <code>&lt;span&gt;</code>: Containers</li></ul>'},
                            {'title': 'HTML Quiz', 'type': 'quiz', 'duration': '10 min', 'content': '',
                             'questions': [
                                 {'text': 'What does HTML stand for?', 'options': ['HyperText Markup Language', 'High Technology Modern Language', 'Hyper Transfer Markup Logic', 'Home Tool Markup Language'], 'correctAnswer': 0},
                                 {'text': 'Which tag creates the largest heading?', 'options': ['<h6>', '<head>', '<h1>', '<big>'], 'correctAnswer': 2},
                                 {'text': 'Where does the visible content of an HTML page go?', 'options': ['<head>', '<meta>', '<body>', '<html>'], 'correctAnswer': 2},
                                 {'text': 'Which attribute specifies the URL in an anchor tag?', 'options': ['src', 'href', 'link', 'url'], 'correctAnswer': 1},
                             ]},
                        ]
                    },
                    {
                        'title': 'Styling with CSS',
                        'lessons': [
                            {'title': 'CSS Selectors and Properties', 'type': 'video', 'duration': '20 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=1PnVor36_40',
                             'content': '<h2>CSS Fundamentals</h2><p>CSS (Cascading Style Sheets) controls how HTML elements look on screen. CSS rules follow this pattern:</p><pre><code>selector {\n  property: value;\n}</code></pre><h3>Types of Selectors</h3><ul><li><strong>Element selector</strong>: <code>p { color: red; }</code></li><li><strong>Class selector</strong>: <code>.card { background: white; }</code></li><li><strong>ID selector</strong>: <code>#header { font-size: 24px; }</code></li></ul><h3>Box Model</h3><p>Every HTML element is a box with: content, padding, border, and margin.</p>'},
                            {'title': 'Flexbox and Grid Layouts', 'type': 'video', 'duration': '25 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=fYq5PXgSsbE',
                             'content': '<h2>Modern CSS Layouts</h2><p><strong>Flexbox</strong> is perfect for one-dimensional layouts (row or column). Apply <code>display: flex</code> to the parent to activate it.</p><p><strong>CSS Grid</strong> handles two-dimensional layouts. Apply <code>display: grid</code> and define rows and columns.</p><pre><code>.container {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n}\n\n.grid {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 16px;\n}</code></pre>'},
                        ]
                    },
                    {
                        'title': 'JavaScript Essentials',
                        'lessons': [
                            {'title': 'Variables, Functions and DOM', 'type': 'video', 'duration': '30 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=W6NZfCO5SIk',
                             'content': '<h2>JavaScript Basics</h2><p>JavaScript brings web pages to life. Here are the essentials:</p><h3>Variables</h3><pre><code>const name = "Alice";  // cannot be reassigned\nlet age = 25;          // can be reassigned\n</code></pre><h3>Functions</h3><pre><code>function greet(name) {\n  return `Hello, ${name}!`;\n}\n</code></pre><h3>DOM Manipulation</h3><pre><code>const button = document.getElementById("myBtn");\nbutton.addEventListener("click", () => {\n  alert("Button clicked!");\n});</code></pre>'},
                            {'title': 'Final JavaScript Quiz', 'type': 'quiz', 'duration': '10 min', 'content': '',
                             'questions': [
                                 {'text': 'Which keyword declares a constant in JavaScript?', 'options': ['var', 'let', 'const', 'def'], 'correctAnswer': 2},
                                 {'text': 'How do you select an element by its ID in JavaScript?', 'options': ['document.getClass("id")', 'document.getElementById("id")', 'document.select("#id")', 'querySelector(".id")'], 'correctAnswer': 1},
                                 {'text': 'Which method adds an event listener to an element?', 'options': ['element.listenEvent()', 'element.on()', 'element.addEventListener()', 'element.bind()'], 'correctAnswer': 2},
                                 {'text': 'What does DOM stand for?', 'options': ['Document Object Model', 'Data Object Map', 'Document Order Module', 'Dynamic Object Method'], 'correctAnswer': 0},
                             ]},
                        ]
                    },
                ]
            },
            {
                'title': 'Python for Data Science',
                'description': 'Master Python programming with a focus on data analysis, visualization, and machine learning basics using industry-standard libraries like Pandas and Matplotlib.',
                'category': 'Data Science',
                'difficulty': 'Intermediate',
                'duration': '10 weeks',
                'price': 49.99,
                'is_free': 0,
                'has_certificate': 1,
                'thumbnail': '/placeholder.jpg',
                'tags': ['Python', 'Pandas', 'NumPy', 'Data Analysis', 'Matplotlib'],
                'outcomes': [
                    'Write clean, efficient Python code for data manipulation tasks',
                    'Analyze real-world datasets using Pandas DataFrames',
                    'Create insightful visualizations with Matplotlib and Seaborn',
                    'Build and evaluate basic machine learning models with scikit-learn',
                ],
                'sections': [
                    {
                        'title': 'Python Foundations',
                        'lessons': [
                            {'title': 'Python Data Types and Control Flow', 'type': 'video', 'duration': '22 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=kqtD5dpn9C8',
                             'content': '<h2>Python Essentials for Data Science</h2><p>Python is the leading language for data science due to its readability and powerful libraries.</p><h3>Key Data Types</h3><pre><code># Numbers\nx = 42\ny = 3.14\n\n# Strings\nname = "Alice"\n\n# Lists\nscores = [85, 92, 78, 95]\n\n# Dictionaries\nstudent = {"name": "Alice", "score": 95}</code></pre><h3>Control Flow</h3><pre><code>for score in scores:\n    if score >= 90:\n        print("A grade")\n    elif score >= 80:\n        print("B grade")\n    else:\n        print("Below B")</code></pre>'},
                            {'title': 'Python Quiz', 'type': 'quiz', 'duration': '10 min', 'content': '',
                             'questions': [
                                 {'text': 'Which library is primarily used for data manipulation in Python?', 'options': ['NumPy', 'Pandas', 'Matplotlib', 'Scikit-learn'], 'correctAnswer': 1},
                                 {'text': 'How do you create a list in Python?', 'options': ['{}', '()', '[]', '<>'], 'correctAnswer': 2},
                                 {'text': 'What is the correct way to define a function in Python?', 'options': ['function greet():', 'def greet():', 'func greet():', 'define greet():'], 'correctAnswer': 1},
                                 {'text': 'Which symbol is used for comments in Python?', 'options': ['//', '/*', '#', '--'], 'correctAnswer': 2},
                             ]},
                        ]
                    },
                    {
                        'title': 'Data Analysis with Pandas',
                        'lessons': [
                            {'title': 'DataFrames and Data Cleaning', 'type': 'video', 'duration': '28 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=vmEHCJofslg',
                             'content': '<h2>Pandas DataFrames</h2><p>A DataFrame is a 2-dimensional labelled data structure — think of it as a spreadsheet in Python.</p><pre><code>import pandas as pd\n\n# Create DataFrame\ndf = pd.DataFrame({\n    "name": ["Alice", "Bob", "Carol"],\n    "score": [85, 92, 78],\n    "grade": ["B", "A", "C"]\n})\n\n# Basic operations\nprint(df.head())       # First 5 rows\nprint(df.describe())   # Summary statistics\nprint(df.isnull().sum())  # Check missing values\n\n# Filter data\nhigh_scores = df[df["score"] >= 90]\n\n# Group by\navg_by_grade = df.groupby("grade")["score"].mean()</code></pre>'},
                            {'title': 'Visualisation with Matplotlib', 'type': 'video', 'duration': '24 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=3Xc3CA655Y4',
                             'content': '<h2>Data Visualisation</h2><p>Visualising data helps you understand patterns and communicate insights.</p><pre><code>import matplotlib.pyplot as plt\nimport seaborn as sns\n\n# Line chart\nplt.plot(df["score"])\nplt.title("Student Scores")\nplt.xlabel("Student")\nplt.ylabel("Score")\nplt.show()\n\n# Bar chart\ndf.groupby("grade")["score"].count().plot(kind="bar")\nplt.show()\n\n# Distribution\nsns.histplot(df["score"], bins=10)\nplt.show()</code></pre>'},
                            {'title': 'Data Analysis Quiz', 'type': 'quiz', 'duration': '10 min', 'content': '',
                             'questions': [
                                 {'text': 'What does df.head() return?', 'options': ['The last 5 rows', 'The first 5 rows', 'Column names', 'Data types'], 'correctAnswer': 1},
                                 {'text': 'Which method checks for missing values in a DataFrame?', 'options': ['df.missing()', 'df.isnull().sum()', 'df.na()', 'df.checkna()'], 'correctAnswer': 1},
                                 {'text': 'Which library is used for data visualization in Python?', 'options': ['Pandas', 'NumPy', 'Matplotlib', 'SciPy'], 'correctAnswer': 2},
                                 {'text': 'What does groupby() do in Pandas?', 'options': ['Sorts rows', 'Groups rows by a column value', 'Deletes columns', 'Merges DataFrames'], 'correctAnswer': 1},
                             ]},
                        ]
                    },
                ]
            },
            {
                'title': 'UI/UX Design Fundamentals',
                'description': 'Learn the principles of great user interface and user experience design. From design thinking to Figma prototyping, create products users love.',
                'category': 'Design',
                'difficulty': 'Beginner',
                'duration': '6 weeks',
                'price': 34.99,
                'is_free': 0,
                'has_certificate': 1,
                'thumbnail': '/placeholder.jpg',
                'tags': ['UI Design', 'UX Design', 'Figma', 'Prototyping', 'Design Thinking'],
                'outcomes': [
                    'Apply design thinking to solve user problems effectively',
                    'Create wireframes and high-fidelity prototypes in Figma',
                    'Understand colour theory, typography, and visual hierarchy',
                    'Conduct user research and usability testing',
                ],
                'sections': [
                    {
                        'title': 'Design Principles',
                        'lessons': [
                            {'title': 'Design Thinking Process', 'type': 'video', 'duration': '16 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=_r0VX-aU_T8',
                             'content': '<h2>Design Thinking</h2><p>Design thinking is a human-centred approach to problem solving. It has 5 stages:</p><ol><li><strong>Empathise</strong> — Research your users needs</li><li><strong>Define</strong> — State the problem clearly</li><li><strong>Ideate</strong> — Generate creative solutions</li><li><strong>Prototype</strong> — Build testable representations</li><li><strong>Test</strong> — Get feedback and iterate</li></ol><p>The key insight is that great design starts with deeply understanding the person you are designing for.</p>'},
                            {'title': 'Colour Theory and Typography', 'type': 'video', 'duration': '20 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=AvgCkHrcj90',
                             'content': '<h2>Visual Design Fundamentals</h2><h3>Colour Theory</h3><p>Colours communicate emotion and guide attention. Key concepts:</p><ul><li><strong>Primary colours</strong>: Red, Blue, Yellow</li><li><strong>Complementary colours</strong>: Opposite on colour wheel — create contrast</li><li><strong>Analogous colours</strong>: Adjacent on colour wheel — create harmony</li><li><strong>60-30-10 rule</strong>: 60% dominant, 30% secondary, 10% accent</li></ul><h3>Typography</h3><ul><li>Limit yourself to 2-3 font families maximum</li><li>Use font size hierarchy: H1 > H2 > Body > Caption</li><li>Ensure sufficient contrast (4.5:1 ratio for body text)</li></ul>'},
                            {'title': 'Design Principles Quiz', 'type': 'quiz', 'duration': '10 min', 'content': '',
                             'questions': [
                                 {'text': 'What is the first stage of the Design Thinking process?', 'options': ['Define', 'Prototype', 'Empathise', 'Test'], 'correctAnswer': 2},
                                 {'text': 'What does the 60-30-10 rule refer to in design?', 'options': ['Grid system', 'Colour distribution', 'Font size ratio', 'Image to text ratio'], 'correctAnswer': 1},
                                 {'text': 'Which tool is most popular for UI/UX prototyping?', 'options': ['Photoshop', 'Illustrator', 'Figma', 'Sketch'], 'correctAnswer': 2},
                                 {'text': 'What is visual hierarchy?', 'options': ['Using only one font', 'Arranging elements to show importance', 'Keeping all elements the same size', 'Using only two colours'], 'correctAnswer': 1},
                             ]},
                        ]
                    },
                    {
                        'title': 'Prototyping with Figma',
                        'lessons': [
                            {'title': 'Figma Interface and Components', 'type': 'video', 'duration': '25 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=FTFaQWZBqQ8',
                             'content': '<h2>Getting Started with Figma</h2><p>Figma is a browser-based design tool used by professional UI/UX designers worldwide. It is free for personal use.</p><h3>Key Features</h3><ul><li><strong>Frames</strong>: Screen containers (like artboards)</li><li><strong>Components</strong>: Reusable design elements</li><li><strong>Auto Layout</strong>: Responsive design constraints</li><li><strong>Prototyping</strong>: Link frames to create interactive flows</li></ul><p>Start by creating a free account at figma.com, then create a new file to begin designing.</p>'},
                        ]
                    },
                ]
            },
            {
                'title': 'Digital Marketing Mastery',
                'description': 'Master digital marketing from SEO and social media to email marketing and Google Ads. Learn to grow any business online with data-driven strategies.',
                'category': 'Marketing',
                'difficulty': 'Intermediate',
                'duration': '8 weeks',
                'price': 39.99,
                'is_free': 0,
                'has_certificate': 1,
                'thumbnail': '/placeholder.jpg',
                'tags': ['SEO', 'Social Media', 'Google Ads', 'Email Marketing', 'Content Strategy'],
                'outcomes': [
                    'Build and execute a complete digital marketing strategy',
                    'Optimise websites for search engines with on-page and off-page SEO',
                    'Run profitable Google Ads and Meta advertising campaigns',
                    'Grow email lists and create automated marketing funnels',
                ],
                'sections': [
                    {
                        'title': 'SEO Foundations',
                        'lessons': [
                            {'title': 'How Search Engines Work', 'type': 'video', 'duration': '18 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=BNHR6IQJGZs',
                             'content': '<h2>Search Engine Optimisation</h2><p>SEO is the process of improving your website visibility in search engine results pages (SERPs). Google uses over 200 ranking factors.</p><h3>How Google Works</h3><ol><li><strong>Crawling</strong>: Googlebot discovers new and updated pages</li><li><strong>Indexing</strong>: Google stores and organises the content it finds</li><li><strong>Ranking</strong>: Google orders results by relevance and quality</li></ol><h3>Key SEO Factors</h3><ul><li>Page speed and Core Web Vitals</li><li>Mobile-friendliness</li><li>Relevant keywords in titles, headings, content</li><li>High-quality backlinks from authoritative sites</li><li>User experience signals</li></ul>'},
                            {'title': 'Keyword Research', 'type': 'video', 'duration': '22 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=OMJQPqG5Egt',
                             'content': '<h2>Keyword Research</h2><p>Finding the right keywords is the foundation of SEO success. Use tools like Google Keyword Planner, Ahrefs, or Ubersuggest.</p><h3>Types of Keywords</h3><ul><li><strong>Short-tail</strong>: "shoes" — high volume, high competition</li><li><strong>Long-tail</strong>: "affordable running shoes for women" — lower volume, lower competition, higher conversion</li></ul><h3>Search Intent</h3><ul><li><strong>Informational</strong>: "how to tie shoes"</li><li><strong>Navigational</strong>: "Nike website"</li><li><strong>Transactional</strong>: "buy Nike Air Max online"</li></ul><p>Match your content to search intent to rank higher.</p>'},
                            {'title': 'SEO Quiz', 'type': 'quiz', 'duration': '10 min', 'content': '',
                             'questions': [
                                 {'text': 'What does SEO stand for?', 'options': ['Social Engagement Optimisation', 'Search Engine Optimisation', 'Site Experience Overview', 'Structured Email Outreach'], 'correctAnswer': 1},
                                 {'text': 'What is a long-tail keyword?', 'options': ['A short generic keyword', 'A specific multi-word phrase', 'A keyword with high competition', 'A paid keyword'], 'correctAnswer': 1},
                                 {'text': 'Which search intent type indicates readiness to buy?', 'options': ['Informational', 'Navigational', 'Transactional', 'Commercial'], 'correctAnswer': 2},
                                 {'text': 'What is a backlink?', 'options': ['An internal site link', 'A link from another website to yours', 'A broken link', 'A redirect'], 'correctAnswer': 1},
                             ]},
                        ]
                    },
                    {
                        'title': 'Social Media and Paid Advertising',
                        'lessons': [
                            {'title': 'Social Media Strategy', 'type': 'video', 'duration': '20 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=pD2_FbZhCtE',
                             'content': '<h2>Social Media Marketing</h2><p>Social media marketing involves creating content on social platforms to promote your brand and drive traffic.</p><h3>Choosing Platforms</h3><ul><li><strong>Instagram / TikTok</strong>: B2C, visual products, younger audiences</li><li><strong>LinkedIn</strong>: B2B, professional services</li><li><strong>Facebook</strong>: Broad audience, community groups</li><li><strong>Twitter / X</strong>: News, tech, real-time conversations</li></ul><h3>Content Strategy</h3><ul><li>Follow the 80/20 rule: 80% value, 20% promotional</li><li>Post consistently — 3-5x per week minimum</li><li>Engage with comments and messages within 24 hours</li></ul>'},
                        ]
                    },
                ]
            },
            {
                'title': 'Cybersecurity Essentials',
                'description': 'Learn to protect digital systems and data from cyber threats. Cover network security, ethical hacking fundamentals, encryption, and security best practices.',
                'category': 'Cybersecurity',
                'difficulty': 'Intermediate',
                'duration': '10 weeks',
                'price': 59.99,
                'is_free': 0,
                'has_certificate': 1,
                'thumbnail': '/placeholder.jpg',
                'tags': ['Network Security', 'Ethical Hacking', 'Encryption', 'Firewalls', 'OWASP'],
                'outcomes': [
                    'Understand common cyber threats and attack vectors',
                    'Apply encryption and authentication best practices',
                    'Perform basic vulnerability assessments and penetration tests',
                    'Secure web applications against OWASP Top 10 vulnerabilities',
                ],
                'sections': [
                    {
                        'title': 'Security Fundamentals',
                        'lessons': [
                            {'title': 'Cyber Threat Landscape', 'type': 'video', 'duration': '20 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=rcDO8km6R6c',
                             'content': '<h2>Understanding Cyber Threats</h2><p>The CIA Triad is the foundation of information security:</p><ul><li><strong>Confidentiality</strong>: Only authorised parties can access data</li><li><strong>Integrity</strong>: Data is accurate and unaltered</li><li><strong>Availability</strong>: Systems are accessible when needed</li></ul><h3>Common Threats</h3><ul><li><strong>Malware</strong>: Viruses, ransomware, spyware</li><li><strong>Phishing</strong>: Fake emails tricking users into revealing credentials</li><li><strong>SQL Injection</strong>: Inserting malicious SQL into input fields</li><li><strong>DDoS</strong>: Overwhelming a server with traffic to take it offline</li><li><strong>Social Engineering</strong>: Manipulating people to give up security information</li></ul>'},
                            {'title': 'Encryption and Authentication', 'type': 'video', 'duration': '24 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=AQDCe585Lnc',
                             'content': '<h2>Encryption</h2><p>Encryption converts readable data (plaintext) into unreadable data (ciphertext) using mathematical algorithms.</p><h3>Types</h3><ul><li><strong>Symmetric</strong>: Same key to encrypt and decrypt (e.g. AES). Fast, good for large data.</li><li><strong>Asymmetric</strong>: Public key encrypts, private key decrypts (e.g. RSA). Used in HTTPS and email.</li><li><strong>Hashing</strong>: One-way transformation (e.g. SHA-256). Used for passwords.</li></ul><h3>Authentication Methods</h3><ul><li>Passwords (weakest)</li><li>Multi-factor authentication (MFA) — best practice</li><li>Biometrics</li><li>Certificate-based (PKI)</li></ul><p>Always store passwords as salted hashes, never plain text.</p>'},
                            {'title': 'Security Fundamentals Quiz', 'type': 'quiz', 'duration': '10 min', 'content': '',
                             'questions': [
                                 {'text': 'What does the CIA Triad stand for?', 'options': ['Confidentiality, Integrity, Availability', 'Coding, Integration, Automation', 'Central Intelligence Agency', 'Control, Inspect, Audit'], 'correctAnswer': 0},
                                 {'text': 'Which attack overwhelms a server with traffic?', 'options': ['SQL Injection', 'Phishing', 'DDoS', 'Man-in-the-Middle'], 'correctAnswer': 2},
                                 {'text': 'What is hashing?', 'options': ['Two-way encryption', 'One-way data transformation', 'Symmetric encryption', 'Data compression'], 'correctAnswer': 1},
                                 {'text': 'What does MFA stand for?', 'options': ['Managed Firewall Access', 'Multi-Factor Authentication', 'Malware Filter Automation', 'Mobile First Architecture'], 'correctAnswer': 1},
                             ]},
                        ]
                    },
                    {
                        'title': 'Web Application Security',
                        'lessons': [
                            {'title': 'OWASP Top 10 Vulnerabilities', 'type': 'video', 'duration': '28 min',
                             'videoUrl': 'https://www.youtube.com/watch?v=t_ikpnurhnA',
                             'content': '<h2>OWASP Top 10</h2><p>OWASP (Open Web Application Security Project) publishes the 10 most critical web application security risks.</p><h3>Top 5 Most Critical</h3><ol><li><strong>Broken Access Control</strong>: Users accessing data or actions beyond their permissions</li><li><strong>Cryptographic Failures</strong>: Weak encryption or passwords stored in plain text</li><li><strong>Injection</strong>: SQL, NoSQL, command injection via untrusted input</li><li><strong>Insecure Design</strong>: Flaws in the application architecture itself</li><li><strong>Security Misconfiguration</strong>: Default credentials, open cloud storage, verbose error messages</li></ol><h3>Defence Strategies</h3><ul><li>Always validate and sanitise user input</li><li>Use parameterised queries for database calls</li><li>Implement proper authentication and session management</li><li>Keep all libraries and frameworks up to date</li></ul>'},
                        ]
                    },
                ]
            },
        ]
    
        for ci, course_data in enumerate(COURSES):
            cid = str(uuid.uuid4())
            c.execute('''INSERT INTO courses
                (id, title, description, instructor_id, instructor_name, instructor_avatar,
                 category, difficulty, duration, price, is_free, has_certificate,
                 has_lifetime_access, has_resources, thumbnail, enrollments, rating, status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', (
                cid, course_data['title'], course_data['description'],
                inst_id, 'Dr. Amina Okonkwo', '/placeholder-user.jpg',
                course_data['category'], course_data['difficulty'], course_data['duration'],
                course_data['price'], course_data['is_free'], course_data['has_certificate'],
                1, 1, course_data['thumbnail'],
                0,   # start at 0 - real enrollments come from user_enrollments table
                round(4.5 + (ci % 3) * 0.1, 1),
                'published'
            ))
            for tag in course_data['tags']:
                c.execute('INSERT INTO course_tags (course_id, tag) VALUES (?,?)', (cid, tag))
            for outcome in course_data['outcomes']:
                c.execute('INSERT INTO course_outcomes (course_id, outcome) VALUES (?,?)', (cid, outcome))
            c.execute('INSERT INTO course_perks (course_id, has_certificate, lifetime_access, has_resources) VALUES (?,1,1,1)', (cid,))
    
            lesson_order = 0
            for section_data in course_data['sections']:
                sid = str(uuid.uuid4())
                c.execute('INSERT INTO curriculum_sections (id, course_id, title, "order") VALUES (?,?,?,?)',
                          (sid, cid, section_data['title'], lesson_order))
                for lesson_data in section_data['lessons']:
                    lid = str(uuid.uuid4())
                    c.execute('''INSERT INTO lessons
                        (id, course_id, title, description, duration, video_url, content, type, "order")
                        VALUES (?,?,?,?,?,?,?,?,?)''', (
                        lid, cid,
                        lesson_data['title'], '',
                        lesson_data.get('duration', '20 min'),
                        lesson_data.get('videoUrl', ''),
                        lesson_data.get('content', ''),
                        lesson_data['type'],
                        lesson_order
                    ))
                    c.execute('INSERT INTO section_lessons (section_id, lesson_id, "order") VALUES (?,?,?)',
                              (sid, lid, lesson_order))
                    lesson_order += 1
    
                    if lesson_data['type'] == 'quiz' and lesson_data.get('questions'):
                        qzid = str(uuid.uuid4())
                        c.execute('INSERT INTO quizzes (id, course_id, lesson_id, title, duration) VALUES (?,?,?,?,?)',
                                  (qzid, cid, lid, lesson_data['title'], 10))
                        for qi, q in enumerate(lesson_data['questions']):
                            c.execute('''INSERT INTO quiz_questions
                                (id, quiz_id, question_text, options, correct_answer, "order")
                                VALUES (?,?,?,?,?,?)''', (
                                str(uuid.uuid4()), qzid,
                                q['text'], json.dumps(q['options']),
                                q['correctAnswer'], qi
                            ))
    
        db.commit()
        db.close()
        print(f"✅ Seeded {len(COURSES)} complete courses")
        print("   Demo instructor: instructor@learnafrica.com / Password123!")
    
    # Init DB when app starts (works with gunicorn and flask dev server)
    with app.app_context():
        init_db()
    
    if __name__ == '__main__':
        ensure_default_admin()
        seed_courses()
        import os
        admin_email    = os.environ.get('ADMIN_EMAIL',    os.environ.get('ADMIN_EMAIL', 'admin@learnafrica.com'))
        admin_password = os.environ.get('ADMIN_PASSWORD', os.environ.get('ADMIN_PASSWORD', 'Admin@LearnAfrica2024!'))
        demo_password  = 'Password123!'
        print("\n" + "="*60)
        print("🚀 LearnAfrica Lite  →  http://localhost:5000")
        print("="*60)
        print(f"🔐 Admin:    {admin_email}")
        print(f"   Password: {admin_password}")
        print(f"📚 Demo Instructor: instructor@learnafrica.com")
        print(f"   Password: {demo_password}")
        print("="*60 + "\n")
        port = int(os.environ.get('PORT', 5000))
        debug = os.environ.get('FLASK_ENV', 'development') != 'production'
        socketio.run(app, host='0.0.0.0', port=port, debug=debug, allow_unsafe_werkzeug=True)
    
    return app
