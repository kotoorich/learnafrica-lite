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
    _raw = os.environ.get('ALLOWED_ORIGINS',
        'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173')
    _origins = [o.strip() for o in _raw.split(',') if o.strip()]
    CORS(app, origins=_origins, supports_credentials=True)

    # ── Global error handlers — ALWAYS return JSON, never HTML ───────────────
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({'error': str(e.description)}), 400

    @app.errorhandler(401)
    def unauthorized(e):
        return jsonify({'error': 'Authentication required'}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({'error': 'Forbidden'}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({'error': 'Not found'}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({'error': 'Method not allowed'}), 405

    @app.errorhandler(500)
    def server_error(e):
        try:
            db = getattr(g, '_db', None)
            if db and hasattr(db, '_conn'):
                db._conn.rollback()
        except Exception:
            pass
        return jsonify({'error': 'Internal server error', 'detail': str(e.description) if hasattr(e, 'description') else str(e)}), 500

    @app.errorhandler(Exception)
    def unhandled_exception(e):
        import traceback
        tb = traceback.format_exc()
        app.logger.error(f"Unhandled exception: {tb}")
        # Rollback any failed DB transaction so connection is clean
        try:
            db = getattr(g, '_db', None)
            if db and hasattr(db, '_conn'):
                db._conn.rollback()
        except Exception:
            pass
        error_detail = str(e)
        # Don't expose internal details in production
        if app.config.get('FLASK_ENV') == 'production':
            error_detail = 'An internal error occurred'
        return jsonify({'error': 'Internal server error', 'detail': error_detail}), 500

    # ── SocketIO ───────────────────────────────────────────────────────────────
    _mode = 'eventlet' if os.environ.get('FLASK_ENV') == 'production' else 'threading'
    socketio = SocketIO(app, cors_allowed_origins='*', async_mode=_mode)

    # ── Database teardown ──────────────────────────────────────────────────────
    app.teardown_appcontext(close_db)

    # ── Helpers available inside all routes ───────────────────────────────────
    active_connections = {}
    connections_lock   = Lock()

    def safe_dict(row):
        """Convert a database row to a JSON-safe dict, handling datetime objects."""
        if row is None:
            return {}
        d = dict(row)
        for k, v in d.items():
            if hasattr(v, 'isoformat'):  # datetime, date
                d[k] = v.isoformat()
        return d

    def safe_list(rows):
        """Convert a list of database rows to JSON-safe dicts."""
        return [safe_dict(r) for r in rows]

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
                try:
                    socketio.emit('new_notification', notif, room=f'user_{user_id}')
                except Exception:
                    pass
                return True
        return False
    
    def create_notification(db, user_id, ntype, title, message, internal_id=None, use_postgres=False):
        try:
            nid = str(uuid.uuid4())
            db.execute(
                'INSERT INTO user_notifications (id,user_id,type,title,message,data,"read",created_at)'
                ' VALUES (?,?,?,?,?,?,?,?)',
                (nid, user_id, ntype, title, message,
                 internal_id, False, datetime.now().isoformat())
            )
            db.commit()
            notif = {'id': nid, 'type': ntype, 'title': title, 'message': message,
                     'read': False, 'time': datetime.now().strftime('%H:%M'),
                     'date': datetime.now().strftime('%Y-%m-%d')}
            try:
                socketio.emit('new_notification', notif, room=f'user_{user_id}')
            except Exception:
                pass
            return nid
        except Exception as e:
            app.logger.error(f'Notification error: {e}')
            return None
    
    # ── Helpers ───────────────────────────────────────────────────────────────────



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
        db.execute('INSERT INTO user_stats (user_id, streak, last_activity) VALUES(?,1,CURRENT_DATE)', (uid,))
        db.execute('INSERT INTO user_settings (user_id) VALUES(?)', (uid,))
    
        # If instructor, create application record
        if role == 'instructor':
            db.execute('''INSERT OR IGNORE INTO instructor_applications (id,user_id,bio,location,website,status)
                          VALUES(?,?,?,?,?,'pending')''',
                       (str(uuid.uuid4()), uid, d.get('bio',''), d.get('location',''), d.get('website','')))
            # Notify all admins
            admins = db.execute("SELECT id FROM users WHERE role IN ('admin','superadmin')").fetchall()
            for admin in admins:
                create_notification(db, admin['id'], 'system',
                    'New Instructor Application',
                    f'{d["name"]} has applied to become an instructor. Review in Admin Panel.',
                    f'instructor_app_{uid}', app.config.get('USE_POSTGRES'))

    
        db.commit()
        token = generate_token(uid, d['email'].lower(), role)
        return jsonify({'message': 'Account created', 'token': token,
                        'user': full_user(db, uid, app.config.get('USE_POSTGRES'))}), 201
    
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
    
        db.execute('UPDATE user_stats SET last_activity=CURRENT_DATE WHERE user_id=?',(u['id'],))
        db.commit()
        token = generate_token(u['id'], u['email'], u['role'])
        return jsonify({'token': token, 'user': full_user(db, u['id'], app.config.get('USE_POSTGRES'))})
    
    @app.route('/api/users/me', methods=['GET'])
    @app.route('/api/auth/verify', methods=['GET'])
    @token_required
    def verify():
        u = full_user(get_db(), g.current_user['user_id'], app.config.get('USE_POSTGRES'))
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
        u = full_user(get_db(), g.current_user['user_id'], app.config.get('USE_POSTGRES'))
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
            db.execute("INSERT OR IGNORE INTO user_badges (user_id,badge_key) VALUES(?,'PATHFINDER')",(g.current_user['user_id'],))
        if 'settings' in d:
            upsert_settings(db, g.current_user['user_id'], d['settings'], app.config.get('USE_POSTGRES'))
        db.commit()
        return jsonify({'message': 'Profile updated', 'user': full_user(db, g.current_user['user_id'], app.config.get('USE_POSTGRES'))})
    
    @app.route('/api/users/settings', methods=['GET'])
    @token_required
    def get_settings():
        db = get_db()
        uid = g.current_user['user_id']
        row = db.execute('SELECT * FROM user_settings WHERE user_id=?',(uid,)).fetchone()
        if not row:
            # Create default settings if missing
            try:
                db.execute('INSERT INTO user_settings (user_id) VALUES (?)',(uid,))
                db.commit()
                row = db.execute('SELECT * FROM user_settings WHERE user_id=?',(uid,)).fetchone()
            except Exception:
                pass
        return jsonify({'settings': settings_dict(row)})
    
    @app.route('/api/users/settings', methods=['PUT'])
    @token_required
    def update_settings():
        db = get_db()
        upsert_settings(db, g.current_user['user_id'], request.get_json() or {}, app.config.get('USE_POSTGRES'))
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
        db.execute(
            'INSERT INTO instructor_applications (id,user_id,bio,status,submitted_at)'
            ' VALUES(?,?,?,\'pending\',CURRENT_TIMESTAMP)'
            ' ON CONFLICT(user_id) DO UPDATE SET bio=EXCLUDED.bio, status=\'pending\'',
            (str(uuid.uuid4()), g.current_user['user_id'], d.get('bio',''))
        )
        db.execute("UPDATE users SET instructor_status='pending' WHERE id=?",(g.current_user['user_id'],))
        db.commit()
        return jsonify({'message': 'Application submitted. Await admin approval.'})
    
    # ── COURSES ───────────────────────────────────────────────────────────────────
    @app.route('/api/courses', methods=['GET'])
    def get_courses():
        db = get_db()
        rows = db.execute(
            'SELECT c.*, COALESCE(e.cnt, 0) as real_enrollments,'
            ' COALESCE(u.name, c.instructor_name) as fresh_instructor_name,'
            ' COALESCE(u.avatar, c.instructor_avatar) as fresh_instructor_avatar,'
            ' COALESCE(u.instructor_title, \'Instructor\') as fresh_instructor_title'
            ' FROM courses c'
            ' LEFT JOIN users u ON u.id = c.instructor_id'
            ' LEFT JOIN (SELECT course_id, COUNT(*) as cnt'
            '            FROM user_enrollments GROUP BY course_id) e'
            '        ON e.course_id = c.id'
            ' WHERE c.is_published=1'
            ' ORDER BY real_enrollments DESC'
        ).fetchall()
        # Fetch all tags and outcomes in bulk to avoid N+1 queries
        all_ids = [r['id'] for r in rows]
        courses = []
        for r in rows:
            cd = safe_dict(r)
            # Override stale instructor fields with fresh data from users table
            if cd.get('fresh_instructor_name'):
                cd['instructor_name'] = cd['fresh_instructor_name']
            if cd.get('fresh_instructor_avatar'):
                cd['instructor_avatar'] = cd['fresh_instructor_avatar']
            cd['instructor_title'] = cd.get('fresh_instructor_title') or 'Instructor'
            cd.pop('fresh_instructor_name', None)
            cd.pop('fresh_instructor_avatar', None)
            cd.pop('fresh_instructor_title', None)
            cd['tags'] = [
                x['tag'] for x in
                db.execute('SELECT tag FROM course_tags WHERE course_id=?', (cd['id'],)).fetchall()
            ]
            cd['learningOutcomes'] = [
                x['outcome'] for x in
                db.execute('SELECT outcome FROM course_outcomes WHERE course_id=?', (cd['id'],)).fetchall()
            ]
            courses.append(cd)
        return jsonify({'courses': courses})
    
    @app.route('/api/courses/<cid>', methods=['GET'])
    def get_course(cid):
        db = get_db()
        c = db.execute('SELECT * FROM courses WHERE id=?',(cid,)).fetchone()
        if not c: return jsonify({'error': 'Course not found'}), 404
        cd = safe_dict(c)
        # Always fetch fresh instructor data (in case admin updated profile)
        try:
            inst = db.execute(
                'SELECT name, avatar, bio, instructor_title FROM users WHERE id=?',
                (cd.get('instructor_id'),)
            ).fetchone()
            if inst:
                cd['instructor_name']   = inst['name'] or cd.get('instructor_name', '')
                cd['instructor_avatar'] = inst['avatar'] or cd.get('instructor_avatar', '')
                cd['instructor_bio']    = inst['bio'] or ''
                cd['instructor_title']  = inst['instructor_title'] or 'Instructor'
        except Exception:
            pass
        cd['tags'] = [x['tag'] for x in db.execute('SELECT tag FROM course_tags WHERE course_id=?',(cid,)).fetchall()]
        cd['learningOutcomes'] = [x['outcome'] for x in db.execute('SELECT outcome FROM course_outcomes WHERE course_id=?',(cid,)).fetchall()]
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
                                    WHERE sl.section_id=? ORDER BY sl."order" """, (sec['id'],)).fetchall():
                ld = dict(l)
                ld['resources'] = [dict(r) for r in db.execute('SELECT * FROM lesson_resources WHERE lesson_id=?',(ld['id'],)).fetchall()]
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
            for l in db.execute('SELECT * FROM lessons WHERE course_id=? ORDER BY "order"',(cid,)).fetchall():
                ld = dict(l)
                ld['resources'] = [dict(r) for r in db.execute('SELECT * FROM lesson_resources WHERE lesson_id=?',(ld['id'],)).fetchall()]
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
        cd['course_resources'] = [dict(r) for r in db.execute('SELECT * FROM course_resources WHERE course_id=?',(cid,)).fetchall()]
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
            st_row = db.execute('SELECT COUNT(DISTINCT user_id) as t FROM user_enrollments WHERE course_id IN (' + ph2 + ')', ids).fetchone()
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
        db.execute('INSERT INTO user_enrollments (id,user_id,course_id,progress,expires_at) VALUES(?,?,?,0,?)',
                   (str(uuid.uuid4()), g.current_user['user_id'], cid, expires_at))
        db.execute('UPDATE courses SET enrollments=enrollments+1 WHERE id=?',(cid,))
        db.commit()
        course = db.execute('SELECT title FROM courses WHERE id=?',(cid,)).fetchone()
        create_notification(db, g.current_user['user_id'], 'enrollment',
            'Enrolled Successfully!',
            f'You are now enrolled in "{course["title"]}". Start learning today!',
            f'enroll_{cid}', app.config.get('USE_POSTGRES'))

        return jsonify({'message': 'Enrolled successfully', 'enrolled': True})
    
    # ── LESSONS ───────────────────────────────────────────────────────────────────
    @app.route('/api/courses/<cid>/lessons/<lid>', methods=['GET'])
    @token_required
    def get_lesson(cid, lid):
        try:
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
            # Check expiry only if enrolled (staff don't have enr)
            if enr and enr['expires_at']:
                try:
                    exp_val = enr['expires_at']
                    if hasattr(exp_val, 'isoformat'):
                        exp = exp_val
                    else:
                        exp = datetime.fromisoformat(str(exp_val))
                    if datetime.now() > exp:
                        return jsonify({'error': 'Your access to this course has expired. Please re-enroll.'}), 403
                except Exception:
                    pass
            l = db.execute('SELECT * FROM lessons WHERE id=? AND course_id=?', (lid, cid)).fetchone()
            if not l:
                return jsonify({'error': 'Lesson not found'}), 404
            ld = safe_dict(l)
            ld['resources'] = safe_list(db.execute('SELECT * FROM lesson_resources WHERE lesson_id=?', (lid,)).fetchall())
            ld['videoUrl'] = ld.get('video_url') or ''
            prog = db.execute('SELECT is_completed, quiz_score FROM user_progress WHERE user_id=? AND course_id=? AND lesson_id=?',
                              (g.current_user['user_id'], cid, lid)).fetchone()
            ld['isCompleted'] = bool(prog['is_completed']) if prog else False
            ld['is_completed'] = ld['isCompleted']
            ld['quizScore'] = prog['quiz_score'] if prog else None
            return jsonify({'lesson': ld})
        except Exception as e:
            import traceback
            app.logger.error(f'get_lesson error: {traceback.format_exc()}')
            return jsonify({'error': 'Failed to load lesson', 'detail': str(e)}), 500

    # ── PROGRESS ──────────────────────────────────────────────────────────────────
    @app.route('/api/progress/update', methods=['POST'])
    @token_required
    def update_progress():
        try:
            d = request.get_json() or {}
            cid = d.get('course_id')
            lid = d.get('lesson_id')
            if not cid or not lid:
                return jsonify({'error': 'course_id and lesson_id required'}), 400
            score = d.get('quiz_score')
            db = get_db()
            uid = g.current_user['user_id']

            # Upsert progress: check first, then insert OR update
            existing = db.execute(
                'SELECT id FROM user_progress WHERE user_id=? AND course_id=? AND lesson_id=?',
                (uid, cid, lid)
            ).fetchone()
            if existing:
                if score is not None:
                    db.execute(
                        'UPDATE user_progress SET is_completed=1, quiz_score=?, completed_at=CURRENT_TIMESTAMP'
                        ' WHERE user_id=? AND course_id=? AND lesson_id=?',
                        (score, uid, cid, lid)
                    )
                else:
                    db.execute(
                        'UPDATE user_progress SET is_completed=1, completed_at=CURRENT_TIMESTAMP'
                        ' WHERE user_id=? AND course_id=? AND lesson_id=?',
                        (uid, cid, lid)
                    )
            else:
                try:
                    db.execute(
                        'INSERT INTO user_progress (user_id,course_id,lesson_id,is_completed,quiz_score,completed_at)'
                        ' VALUES(?,?,?,1,?,CURRENT_TIMESTAMP)',
                        (uid, cid, lid, score)
                    )
                except Exception:
                    # Race condition: another request inserted, just update
                    try:
                        if hasattr(db, '_conn'):
                            db._conn.rollback()
                    except Exception:
                        pass
                    db.execute(
                        'UPDATE user_progress SET is_completed=1, completed_at=CURRENT_TIMESTAMP'
                        ' WHERE user_id=? AND course_id=? AND lesson_id=?',
                        (uid, cid, lid)
                    )
            db.commit()

            # Recalculate course progress percentage
            total = 0
            done = 0
            try:
                t_row = db.execute('SELECT COUNT(*) as cnt FROM lessons WHERE course_id=?', (cid,)).fetchone()
                total = t_row['cnt'] if t_row else 0
                d_row = db.execute(
                    'SELECT COUNT(*) as cnt FROM user_progress WHERE user_id=? AND course_id=? AND is_completed=1',
                    (uid, cid)
                ).fetchone()
                done = d_row['cnt'] if d_row else 0
            except Exception as ex:
                app.logger.warning(f'progress count failed: {ex}')
            pct = int((done/total)*100) if total else 0

            try:
                db.execute('UPDATE user_enrollments SET progress=? WHERE user_id=? AND course_id=?', (pct, uid, cid))
                db.commit()
            except Exception as ex:
                app.logger.warning(f'enrollment progress update failed: {ex}')

            # Best-effort badge / stats updates - never fail the request
            try:
                db.execute(
                    'UPDATE user_stats SET lessons_completed=('
                    'SELECT COUNT(*) FROM user_progress WHERE user_id=? AND is_completed=1) WHERE user_id=?',
                    (uid, uid)
                )
                db.commit()
            except Exception as ex:
                app.logger.warning(f'user_stats update failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass

            try:
                db.execute(
                    "INSERT INTO user_badges (user_id,badge_key) VALUES(?,'FIRST_STEPS') ON CONFLICT DO NOTHING",
                    (uid,)
                )
                db.commit()
            except Exception as ex:
                app.logger.warning(f'FIRST_STEPS badge failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass

            if pct == 100:
                try:
                    db.execute('UPDATE user_enrollments SET completed_at=CURRENT_TIMESTAMP WHERE user_id=? AND course_id=?', (uid, cid))
                    db.execute("INSERT INTO user_badges (user_id,badge_key) VALUES(?,'COURSE_CHAMPION') ON CONFLICT DO NOTHING", (uid,))
                    db.commit()
                except Exception as ex:
                    app.logger.warning(f'completion handling failed: {ex}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass

            return jsonify({'message': 'Progress updated', 'progress': pct, 'lesson_completed': True})
        except Exception as e:
            import traceback
            app.logger.error(f'update_progress error: {traceback.format_exc()}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to update progress', 'detail': str(e)}), 500
    
    # ── QUIZZES ───────────────────────────────────────────────────────────────────
    @app.route('/api/courses/<cid>/quizzes/<lid>', methods=['GET'])
    @token_required
    def get_quiz(cid, lid):
        db = get_db()
        q = db.execute('SELECT * FROM quizzes WHERE course_id=? AND lesson_id=?',(cid,lid)).fetchone()
        if not q: return jsonify({'error': 'Quiz not found for this lesson'}), 404
        qd = dict(q)
        questions = []
        for row in db.execute('SELECT * FROM quiz_questions WHERE quiz_id=? ORDER BY "order"',(qd['id'],)).fetchall():
            r = dict(row)
            r['question'] = r['question_text']
            r['question_type'] = r.get('question_type', 'mcq')
            try:
                opts = r['options']
                r['options'] = json.loads(opts) if isinstance(opts, str) else (opts or [])
            except Exception:
                r['options'] = []
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
                db.execute(
                    "INSERT INTO user_badges (user_id,badge_key) VALUES(?,'QUIZ_MASTER') ON CONFLICT DO NOTHING",
                    (g.current_user['user_id'],)
                )
                db.commit()
        return jsonify({'score': score, 'correct_count': correct_count,
                        'total_questions': len(questions), 'passed': passed,
                        'correct_answers': correct_map})
    
    # ── REVIEWS ───────────────────────────────────────────────────────────────────
    @app.route('/api/courses/<cid>/reviews', methods=['GET'])
    def get_reviews(cid):
        db = get_db()
        rows = db.execute('SELECT * FROM reviews WHERE course_id=? ORDER BY created_at DESC',(cid,)).fetchall()
        return jsonify({'reviews': safe_list(rows)})
    
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
        u = db.execute('SELECT name FROM users WHERE id=?',(g.current_user['user_id'],)).fetchone()
        rid = str(uuid.uuid4())
        db.execute(
            'INSERT INTO reviews (id,course_id,user_id,user_name,rating,content)'
            ' VALUES(?,?,?,?,?,?)',
            (rid, cid, g.current_user['user_id'],
             u['name'] if u else '', int(rating), d.get('content',''))
        )
        # Update average rating
        _avg_row = db.execute('SELECT AVG(rating) as a FROM reviews WHERE course_id=?',(cid,)).fetchone()
        _avg = float(_avg_row['a'] or 0) if _avg_row else 0.0
        db.execute('UPDATE courses SET rating=? WHERE id=?',(round(_avg,1), cid))
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
        """Instructors can preview any course they own (or admins any course)."""
        try:
            db = get_db()
            course = db.execute('SELECT * FROM courses WHERE id=?', (cid,)).fetchone()
            if not course:
                return jsonify({'error': 'Course not found'}), 404
            if (course['instructor_id'] != g.current_user['user_id'] and
                    g.current_user['role'] not in ('admin','superadmin')):
                return jsonify({'error': 'Forbidden'}), 403
            cd = safe_dict(course)
            cd['tags'] = [r['tag'] for r in db.execute('SELECT tag FROM course_tags WHERE course_id=?', (cid,)).fetchall()]
            cd['learningOutcomes'] = [r['outcome'] for r in db.execute('SELECT outcome FROM course_outcomes WHERE course_id=?', (cid,)).fetchall()]
            perks = db.execute('SELECT * FROM course_perks WHERE course_id=?', (cid,)).fetchone()
            cd['has_certificate']     = bool(perks['has_certificate']) if perks else bool(cd.get('has_certificate'))
            cd['has_lifetime_access'] = bool(perks['lifetime_access']) if perks else True
            cd['has_resources']       = bool(perks['has_resources']) if perks else False
            sections, all_lessons = [], []
            for sec in db.execute('SELECT * FROM curriculum_sections WHERE course_id=? ORDER BY "order"', (cid,)).fetchall():
                sd = safe_dict(sec)
                sec_lessons = []
                for l in db.execute(
                    'SELECT l.* FROM lessons l'
                    ' JOIN section_lessons sl ON sl.lesson_id = l.id'
                    ' WHERE sl.section_id=? ORDER BY sl."order"',
                    (sec['id'],)
                ).fetchall():
                    ld = safe_dict(l)
                    ld['resources']   = safe_list(db.execute('SELECT * FROM lesson_resources WHERE lesson_id=?', (ld['id'],)).fetchall())
                    ld['videoUrl']    = ld.get('video_url') or ''
                    ld['is_final']    = bool(ld.get('is_final', 0))
                    ld['isCompleted'] = False
                    sec_lessons.append(ld)
                    all_lessons.append(ld)
                sd['lessons'] = sec_lessons
                sections.append(sd)
            cd['sections'] = sections
            cd['lessons'] = all_lessons
            cd['course_resources'] = safe_list(db.execute('SELECT * FROM course_resources WHERE course_id=?', (cid,)).fetchall())
            cd['is_preview'] = True
            return jsonify({'course': cd})
        except Exception as e:
            import traceback
            app.logger.error(f'preview_course error: {traceback.format_exc()}')
            return jsonify({'error': 'Failed to load preview', 'detail': str(e)}), 500

    @app.route('/api/instructor/courses/<cid>/lessons/<lid>/preview', methods=['GET'])
    @instructor_required
    def instructor_preview_lesson(cid, lid):
        """Preview any lesson without enrollment - instructor/admin only."""
        try:
            db = get_db()
            course = db.execute('SELECT * FROM courses WHERE id=?', (cid,)).fetchone()
            if not course:
                return jsonify({'error': 'Course not found'}), 404
            if (course['instructor_id'] != g.current_user['user_id'] and
                    g.current_user['role'] not in ('admin','superadmin')):
                return jsonify({'error': 'Forbidden'}), 403
            l = db.execute('SELECT * FROM lessons WHERE id=? AND course_id=?', (lid, cid)).fetchone()
            if not l:
                return jsonify({'error': 'Lesson not found'}), 404
            ld = safe_dict(l)
            ld['resources']    = safe_list(db.execute('SELECT * FROM lesson_resources WHERE lesson_id=?', (lid,)).fetchall())
            ld['videoUrl']     = ld.get('video_url') or ''
            ld['isCompleted']  = False
            ld['is_completed'] = False
            ld['is_preview']   = True
            return jsonify({'lesson': ld})
        except Exception as e:
            import traceback
            app.logger.error(f'preview_lesson error: {traceback.format_exc()}')
            return jsonify({'error': 'Failed to load lesson preview', 'detail': str(e)}), 500

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
        cd['tags'] = [r['tag'] for r in db.execute('SELECT tag FROM course_tags WHERE course_id=?',(cid,)).fetchall()]
        cd['learningOutcomes'] = [r['outcome'] for r in db.execute('SELECT outcome FROM course_outcomes WHERE course_id=?',(cid,)).fetchall()]
        perks = db.execute('SELECT * FROM course_perks WHERE course_id=?',(cid,)).fetchone()
        cd['perks'] = {
            'hasCertificate': bool(perks['has_certificate']) if perks else bool(cd.get('has_certificate')),
            'lifetimeAccess':  bool(perks['lifetime_access']) if perks else bool(cd.get('has_lifetime_access')),
            'hasResources':    bool(perks['has_resources'])   if perks else bool(cd.get('has_resources')),
        }
    
        # Load sections with lessons
        sections = []
        for sec in db.execute('SELECT * FROM curriculum_sections WHERE course_id=? ORDER BY "order"', (cid,)).fetchall():
            sd = dict(sec)
            lessons = []
            for les in db.execute('''SELECT l.* FROM lessons l
                                      JOIN section_lessons sl ON sl.lesson_id=l.id
                                      WHERE sl.section_id=? ORDER BY sl."order"''', (sec['id'],)).fetchall():
                ld = dict(les)
                ld['videoUrl']  = ld.get('video_url') or ''
                ld['resources'] = [dict(r) for r in db.execute(
                    'SELECT * FROM lesson_resources WHERE lesson_id=?', (ld['id'],))]
                if ld['type'] == 'quiz':
                    quiz = db.execute('SELECT * FROM quizzes WHERE lesson_id=?', (ld['id'],)).fetchone()
                    if quiz:
                        questions = [dict(q) for q in db.execute(
                            'SELECT * FROM quiz_questions WHERE quiz_id=? ORDER BY "order"', (quiz['id'],)).fetchall()]
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
            existing_lessons = {r['id']: dict(r) for r in db.execute('SELECT * FROM lessons WHERE course_id=?',(cid,)).fetchall()}
            # Drop old section mappings only
            old_sids = [r['id'] for r in db.execute('SELECT id FROM curriculum_sections WHERE course_id=?',(cid,)).fetchall()]
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
        db  = get_db()
        uid = g.current_user['user_id']
        use_pg = app.config.get('USE_POSTGRES')
        course_rows = db.execute(
            'SELECT id FROM courses WHERE instructor_id=?', (uid,)
        ).fetchall()
        course_ids = [r['id'] for r in course_rows]
        if not course_ids:
            return jsonify({
                'total_courses': 0, 'total_students': 0, 'total_earnings': 0,
                'average_rating': 0, 'completion_rate': 0,
                'monthly_enrollments': [], 'course_performance': [], 'recent_students': []
            })
        ph = ','.join(['?'] * len(course_ids))
        st = db.execute(
            'SELECT COUNT(DISTINCT user_id) as t FROM user_enrollments WHERE course_id IN (' + ph + ')',
            course_ids).fetchone()
        total_students = int(st['t'] or 0) if st else 0
        earnings_row = db.execute(
            'SELECT SUM(c.price * COALESCE(e.cnt, 0)) as t'
            ' FROM courses c LEFT JOIN'
            ' (SELECT course_id, COUNT(*) as cnt FROM user_enrollments GROUP BY course_id) e'
            ' ON e.course_id = c.id WHERE c.id IN (' + ph + ')', course_ids).fetchone()
        gross = float(earnings_row['t'] or 0) if earnings_row else 0.0
        instructor_pct, _ = get_revenue_split(db)
        total_earnings = round(gross * instructor_pct / 100, 2)
        avg_row = db.execute(
            'SELECT AVG(rating) as a FROM reviews WHERE course_id IN (' + ph + ')',
            course_ids).fetchone()
        final_avg_rating = round(float(avg_row['a'] or 0), 1) if avg_row else 0.0
        if use_pg:
            monthly = db.execute(
                'SELECT EXTRACT(MONTH FROM enrolled_at)::int as m, COUNT(*) as c'
                ' FROM user_enrollments WHERE course_id IN (' + ph + ')'
                " AND enrolled_at >= NOW() - INTERVAL '6 months' GROUP BY m ORDER BY m",
                course_ids).fetchall()
        else:
            monthly = db.execute(
                "SELECT strftime('%m',enrolled_at) as m, COUNT(*) as c"
                ' FROM user_enrollments WHERE course_id IN (' + ph + ')'
                " AND enrolled_at >= date('now','-6 months') GROUP BY m ORDER BY m",
                course_ids).fetchall()
        mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        monthly_enrollments = [{'month': mn[int(r['m'])-1], 'enrollments': r['c']} for r in monthly]
        course_perf = []
        for r in db.execute('SELECT id,title,rating FROM courses WHERE id IN (' + ph + ') LIMIT 5', course_ids).fetchall():
            p = db.execute('SELECT COUNT(*) as t, COUNT(CASE WHEN progress=100 THEN 1 END) as d FROM user_enrollments WHERE course_id=?',(r['id'],)).fetchone()
            t_c = int(p['t'] or 0) if p else 0
            d_c = int(p['d'] or 0) if p else 0
            course_perf.append({'id': r['id'], 'title':r['title'],'name':r['title'],'students':t_c,
                'completion_rate': int((d_c/t_c)*100) if t_c else 0,
                'completion': int((d_c/t_c)*100) if t_c else 0,
                'rating': float(r['rating'] or 0)})
        all_e = db.execute('SELECT COUNT(*) as t, COUNT(CASE WHEN progress=100 THEN 1 END) as d FROM user_enrollments WHERE course_id IN (' + ph + ')', course_ids).fetchone()
        completion_rate = int((all_e['d']/all_e['t'])*100) if all_e and all_e['t'] else 0
        recent = db.execute(
            'SELECT ue.user_id, u.name, c.title as course_title, ue.progress, CAST(ue.enrolled_at AS TEXT) as enrolled_at'
            ' FROM user_enrollments ue JOIN users u ON u.id=ue.user_id JOIN courses c ON c.id=ue.course_id'
            ' WHERE ue.course_id IN (' + ph + ') ORDER BY ue.enrolled_at DESC LIMIT 10', course_ids).fetchall()
        return jsonify({
            'total_courses': len(course_ids), 'total_students': total_students,
            'total_earnings': total_earnings, 'average_rating': final_avg_rating,
            'completion_rate': completion_rate, 'monthly_enrollments': monthly_enrollments,
            'course_performance': course_perf, 'recent_students': safe_list(recent),
        })

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
        rev = db.execute(
            'SELECT SUM(c.price * COALESCE(e.cnt,0)) as t'
            ' FROM courses c'
            ' LEFT JOIN (SELECT course_id, COUNT(*) as cnt FROM user_enrollments GROUP BY course_id) e'
            ' ON e.course_id = c.id'
            ' WHERE c.is_free=0'
        ).fetchone()
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
            'recent_users': safe_list(recent_users),
            'recent_courses': safe_list(recent_courses),
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
            f'Your account role has been updated to {new_role}.', f'role_change_{uid}', app.config.get('USE_POSTGRES'))

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
                             WHERE ia.status=? ORDER BY ia.submitted_at DESC''', (status_filter,)).fetchall()
        return jsonify({'applications': safe_list(rows)})
    
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
                f'instructor_approved_{uid}', app.config.get('USE_POSTGRES'))

        else:
            create_notification(db, uid, 'system', 'Application Update',
                f'Your instructor application was not approved. {d.get("note","")}',
                f'instructor_rejected_{uid}', app.config.get('USE_POSTGRES'))

        return jsonify({'message': f'Application {new_status}'})
    
    @app.route('/api/admin/courses', methods=['GET'])
    @admin_required
    def admin_courses():
        db = get_db()
        rows = db.execute(
            'SELECT c.*, u.name as instructor_name,'
            ' COALESCE(e.cnt, 0) as student_count,'
            ' COALESCE(rv.avg_r, 0) as real_rating'
            ' FROM courses c'
            ' JOIN users u ON u.id = c.instructor_id'
            ' LEFT JOIN (SELECT course_id, COUNT(*) as cnt'
            '            FROM user_enrollments GROUP BY course_id) e'
            '        ON e.course_id = c.id'
            ' LEFT JOIN (SELECT course_id, AVG(rating) as avg_r'
            '            FROM reviews GROUP BY course_id) rv'
            '        ON rv.course_id = c.id'
            ' ORDER BY c.created_at DESC'
        ).fetchall()
        return jsonify({'courses': safe_list(rows)})
    
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
        db.execute('UPDATE courses SET is_published=? WHERE id=?',(1 if status=='published' else 0, cid))
        db.commit()
        create_notification(db, c['instructor_id'], 'system', 'Course Status Updated',
            f'Your course "{c["title"]}" has been set to {status} by an admin.',
            f'course_status_{cid}', app.config.get('USE_POSTGRES'))

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
                d['title'], d['message'], f'broadcast_{uuid.uuid4()}', app.config.get('USE_POSTGRES'))

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
        rows = db.execute('SELECT * FROM user_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
                          (g.current_user['user_id'],)).fetchall()
        def fmt(r):
            n = dict(r)
            n['read'] = bool(r['read'])
            ca = r['created_at']
            if ca is None:
                n['time'] = ''
                n['date'] = ''
            elif hasattr(ca, 'isoformat'):
                n['time'] = ca.strftime('%H:%M')
                n['date'] = ca.strftime('%Y-%m-%d')
            else:
                s = str(ca)
                n['time'] = s[11:16] if len(s) > 16 else ''
                n['date'] = s[:10]
            return n
        return jsonify({'notifications': [fmt(r) for r in rows]})
    
    @app.route('/api/notifications/<nid>/read', methods=['PUT'])
    @token_required
    def mark_read(nid):
        try:
            db = get_db()
            # Quote "read" - it's a reserved keyword in Postgres
            db.execute('UPDATE user_notifications SET "read"=TRUE WHERE id=? AND user_id=?',
                       (nid, g.current_user['user_id']))
            db.commit()
            return jsonify({'message': 'Marked read'})
        except Exception as e:
            app.logger.error(f'mark_read error: {e}')
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed', 'detail': str(e)}), 500
    
    @app.route('/api/notifications/read-all', methods=['PUT'])
    @token_required
    def mark_all_read():
        try:
            db = get_db()
            db.execute('UPDATE user_notifications SET "read"=TRUE WHERE user_id=? AND "read"=FALSE',
                       (g.current_user['user_id'],))
            db.commit()
            return jsonify({'message': 'All read'})
        except Exception as e:
            app.logger.error(f'mark_all_read error: {e}')
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed', 'detail': str(e)}), 500
    
    @app.route('/api/notifications/<nid>', methods=['DELETE'])
    @token_required
    def del_notification(nid):
        db = get_db()
        db.execute('DELETE FROM user_notifications WHERE id=? AND user_id=?',(nid,g.current_user['user_id']))
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
            d = safe_dict(row)
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
            (cid, g.current_user['user_id'], u['name'] if u else 'User', u['avatar'] if u else '', content, parent_id)
        )
        db.commit()
        result = db.execute('SELECT * FROM homepage_comments WHERE id=?', (cid,)).fetchone()
        row = {}
        for k, v in dict(result).items():
            row[k] = str(v) if hasattr(v, 'isoformat') else v
        row['replies'] = []; row['reply_count'] = 0; row['liked_by_me'] = False
        try:
            socketio.emit('new_homepage_comment', row)
        except Exception:
            pass
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
        try:
            socketio.emit('edit_homepage_comment', updated)
        except Exception:
            pass
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
        try:
            socketio.emit('like_homepage_comment', {'id': cid, 'likes_count': new_count})
        except Exception:
            pass
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
        try:
            socketio.emit('delete_homepage_comment', {'id': cid})
        except Exception:
            pass
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
        # Get lifetime access and enroll
        _cp = db.execute('SELECT lifetime_access FROM course_perks WHERE course_id=?', (course_id,)).fetchone()
        _lifetime = bool(_cp['lifetime_access']) if _cp else True
        from datetime import timedelta as _td
        _expires = None if _lifetime else (datetime.now() + _td(days=365)).isoformat()
        db.execute('INSERT INTO user_enrollments (id,user_id,course_id,progress,expires_at) VALUES(?,?,?,0,?)',
                   (str(uuid.uuid4()), g.current_user['user_id'], course_id, _expires))
        db.execute('UPDATE courses SET enrollments=enrollments+1 WHERE id=?', (course_id,))
        db.commit()
        create_notification(db, g.current_user['user_id'], 'enrollment',
            'Payment Successful! 🎉',
            f'Your payment for "{c["title"]}" was successful. Happy learning!',
            f'payment_{course_id}', app.config.get('USE_POSTGRES'))

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
        pass  # os imported at top
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
        return jsonify({'students': safe_list(rows)})
    
    
    # ── CERTIFICATE & BADGE VERIFICATION ─────────────────────────────────────────
    @app.route('/api/verify', methods=['GET'])
    def verify_credential():
        try:
            credential_id = (request.args.get('id') or '').strip().upper()
            if not credential_id:
                return jsonify({'error': 'id parameter required'}), 400
            db = get_db()
            # Try certificates first
            try:
                cert = db.execute('SELECT * FROM issued_certificates WHERE UPPER(cert_id)=?',
                                  (credential_id,)).fetchone()
                if cert:
                    cd = safe_dict(cert)
                    return jsonify({
                        'valid': True, 'type': 'certificate',
                        'id': cd.get('cert_id', credential_id),
                        'holder': cd.get('user_name', '—'),
                        'course': cd.get('course_name', '—'),
                        'instructor': cd.get('instructor_name', '—'),
                        'issued_at': cd.get('issued_at', ''),
                    })
            except Exception as ex:
                app.logger.warning(f'verify certificate lookup failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
            # Try badges
            try:
                badge = db.execute('SELECT * FROM issued_badges WHERE UPPER(badge_id)=?',
                                   (credential_id,)).fetchone()
                if badge:
                    bd = safe_dict(badge)
                    return jsonify({
                        'valid': True, 'type': 'badge',
                        'id': bd.get('badge_id', credential_id),
                        'holder': bd.get('user_name', '—'),
                        'badge': bd.get('badge_title', bd.get('badge_key', '—')),
                        'badge_key': bd.get('badge_key', ''),
                        'issued_at': bd.get('earned_at', ''),
                    })
            except Exception as ex:
                app.logger.warning(f'verify badge lookup failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
            return jsonify({'valid': False, 'message': 'Credential not found or invalid'})
        except Exception as e:
            import traceback
            app.logger.error(f'verify_credential error: {traceback.format_exc()}')
            return jsonify({'valid': False, 'message': 'Verification service error'}), 200
    
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
        try:
            d = request.get_json() or {}
            badge_key = (d.get('badge_key') or '').strip()
            badge_title = (d.get('badge_title') or '').strip()
            if not badge_key:
                return jsonify({'error': 'badge_key required'}), 400
            db = get_db()
            uid = g.current_user['user_id']
            
            # Verify user earned it
            earned = db.execute('SELECT id FROM user_badges WHERE user_id=? AND badge_key=?',
                                (uid, badge_key)).fetchone()
            if not earned:
                return jsonify({'error': 'Badge not earned'}), 403
            
            # Ensure required columns exist on issued_badges (force-add if missing)
            use_pg = app.config.get('USE_POSTGRES')
            if use_pg:
                for col_sql in [
                    'ALTER TABLE issued_badges ADD COLUMN IF NOT EXISTS badge_id TEXT',
                    'ALTER TABLE issued_badges ADD COLUMN IF NOT EXISTS user_name TEXT',
                    'ALTER TABLE issued_badges ADD COLUMN IF NOT EXISTS badge_title TEXT',
                ]:
                    try:
                        db.execute(col_sql)
                        db.commit()
                    except Exception:
                        try:
                            if hasattr(db, '_conn'): db._conn.rollback()
                        except Exception: pass
            
            # Check if already issued (now safe since columns exist)
            existing = None
            try:
                existing = db.execute('SELECT badge_id FROM issued_badges WHERE user_id=? AND badge_key=?',
                                      (uid, badge_key)).fetchone()
                if existing and existing['badge_id']:
                    return jsonify({'badge_id': existing['badge_id']})
            except Exception as ex:
                app.logger.warning(f'badge lookup failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
            
            # Issue a new one
            user = db.execute('SELECT name FROM users WHERE id=?', (uid,)).fetchone()
            user_name = user['name'] if user else 'Learner'
            badge_id = 'LA-BADGE-' + badge_key[:4].upper() + '-' + str(uuid.uuid4())[:6].upper()
            
            try:
                db.execute(
                    'INSERT INTO issued_badges (badge_id,user_id,user_name,badge_key,badge_title)'
                    ' VALUES (?,?,?,?,?) ON CONFLICT (user_id,badge_key) DO NOTHING',
                    (badge_id, uid, user_name, badge_key, badge_title)
                )
                db.commit()
            except Exception as ex:
                app.logger.warning(f'full insert failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
                # Fallback - try with what's likely to exist
                try:
                    db.execute(
                        'INSERT INTO issued_badges (user_id, badge_key) VALUES (?, ?)'
                        ' ON CONFLICT (user_id, badge_key) DO NOTHING',
                        (uid, badge_key)
                    )
                    db.commit()
                except Exception as ex2:
                    app.logger.warning(f'minimal insert failed: {ex2}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
            
            # Try UPDATE to ensure badge_id is set on the row (in case INSERT was DO NOTHING)
            try:
                db.execute(
                    'UPDATE issued_badges SET badge_id=?, user_name=?, badge_title=?'
                    ' WHERE user_id=? AND badge_key=? AND (badge_id IS NULL OR badge_id=\'\')',
                    (badge_id, user_name, badge_title, uid, badge_key)
                )
                db.commit()
            except Exception as ex:
                app.logger.warning(f'badge_id update failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
            
            # Re-fetch what's actually stored
            try:
                final = db.execute('SELECT badge_id FROM issued_badges WHERE user_id=? AND badge_key=?',
                                   (uid, badge_key)).fetchone()
                if final and final['badge_id']:
                    return jsonify({'badge_id': final['badge_id']})
            except Exception:
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
            
            return jsonify({'badge_id': badge_id})
        except Exception as e:
            import traceback
            app.logger.error(f'issue_badge error: {traceback.format_exc()}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to issue badge', 'detail': str(e)}), 500
    
    
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
        try:
            db = get_db()
            ensure_discussions_table(db)
            # Try with is_pinned first (works on fresh schemas), fallback if column missing
            try:
                rows = db.execute(
                    'SELECT * FROM lesson_discussions'
                    ' WHERE course_id=? AND lesson_id=? AND parent_id IS NULL'
                    ' ORDER BY COALESCE(is_pinned, 0) DESC, created_at DESC',
                    (cid, lid)
                ).fetchall()
            except Exception:
                # Old schema without is_pinned column - rollback failed txn first
                try:
                    db._conn.rollback() if hasattr(db, '_conn') else None
                except Exception:
                    pass
                rows = db.execute(
                    'SELECT * FROM lesson_discussions'
                    ' WHERE course_id=? AND lesson_id=? AND parent_id IS NULL'
                    ' ORDER BY created_at DESC',
                    (cid, lid)
                ).fetchall()
            posts = []
            for r in rows:
                post = safe_dict(r)
                try:
                    replies = db.execute(
                        'SELECT * FROM lesson_discussions'
                        ' WHERE parent_id=? ORDER BY created_at ASC',
                        (r['id'],)
                    ).fetchall()
                    post['replies'] = safe_list(replies)
                except Exception:
                    post['replies'] = []
                post['can_delete'] = (
                    post.get('user_id') == g.current_user['user_id'] or
                    g.current_user['role'] in ('admin','superadmin','instructor')
                )
                posts.append(post)
            return jsonify({'discussions': posts})
        except Exception as e:
            import traceback
            app.logger.error(f'get_discussions error: {traceback.format_exc()}')
            return jsonify({'discussions': [], 'error': str(e)}), 200
    
    @app.route('/api/courses/<cid>/lessons/<lid>/discussions', methods=['POST'])
    @token_required
    def post_discussion(cid, lid):
        try:
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
            parent_id = d.get('parent_id')
            user = db.execute('SELECT name, avatar, role FROM users WHERE id=?',
                              (g.current_user['user_id'],)).fetchone()
            did = str(uuid.uuid4())
            # Try full insert first; fall back to minimal columns if newer columns missing
            try:
                db.execute(
                    'INSERT INTO lesson_discussions'
                    ' (id,course_id,lesson_id,user_id,user_name,user_avatar,user_role,parent_id,content)'
                    ' VALUES(?,?,?,?,?,?,?,?,?)',
                    (did, cid, lid, g.current_user['user_id'],
                     user['name'] if user else '',
                     user['avatar'] if user else None,
                     user['role'] if user else 'student',
                     parent_id, content)
                )
            except Exception:
                # Old schema fallback
                db.rollback() if hasattr(db, 'rollback') else None
                db.execute(
                    'INSERT INTO lesson_discussions'
                    ' (id,course_id,lesson_id,user_id,user_name,user_avatar,parent_id,content)'
                    ' VALUES(?,?,?,?,?,?,?,?)',
                    (did, cid, lid, g.current_user['user_id'],
                     user['name'] if user else '',
                     user['avatar'] if user else None,
                     parent_id, content)
                )
            db.commit()
            row = db.execute('SELECT * FROM lesson_discussions WHERE id=?', (did,)).fetchone()
            result = safe_dict(row)
            result['replies'] = []
            result['can_delete'] = True
            return jsonify({'discussion': result}), 201
        except Exception as e:
            import traceback
            app.logger.error(f'post_discussion error: {traceback.format_exc()}')
            return jsonify({'error': 'Failed to post', 'detail': str(e)}), 500
    
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
            gross = float(row['gross'] or 0) if row else 0.0
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
        """Public - returns instructor guide steps."""
        try:
            db = get_db()
            rows = db.execute(
                'SELECT id, step_number, title,'
                " COALESCE(content, '') as description,"
                " '' as video_url"
                ' FROM instructor_guide ORDER BY step_number'
            ).fetchall()
            return jsonify({'steps': safe_list(rows)})
        except Exception as e:
            app.logger.error(f'instructor_guide error: {e}')
            return jsonify({'steps': []})
    
    @app.route('/api/admin/instructor-guide', methods=['GET'])
    @admin_required
    def admin_get_guide():
        try:
            db = get_db()
            rows = db.execute(
                'SELECT id, step_number, title,'
                " COALESCE(content, '') as description,"
                " '' as video_url"
                ' FROM instructor_guide ORDER BY step_number'
            ).fetchall()
            return jsonify({'steps': safe_list(rows)})
        except Exception as e:
            app.logger.error(f'admin_guide error: {e}')
            return jsonify({'steps': []})
    
    @app.route('/api/admin/instructor-guide', methods=['POST'])
    @admin_required
    def admin_add_guide_step():
        d = request.get_json() or {}
        if not d.get('title') or not d.get('description'):
            return jsonify({'error': 'title and description required'}), 400
        db = get_db()
        max_order = db.execute('SELECT COALESCE(MAX(step_number),0) as m FROM instructor_guide').fetchone()['m']
        max_step = max_order
        db.execute('INSERT INTO instructor_guide (step_number,title,content) VALUES(?,?,?)',
                   (sid, max_step+1, d['title'], d['description'], d.get('video_url'), max_order+1))
        db.commit()
        row = db.execute('SELECT * FROM instructor_guide WHERE id=?', (sid,)).fetchone()
        return jsonify({'step': safe_dict(row)}), 201
    
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
        return jsonify({'step': safe_dict(row)})
    
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
        return jsonify({'resources': safe_list(rows)})
    
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
        return jsonify({'resource': safe_dict(row)}), 201
    
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
        return jsonify({'resource': safe_dict(row)}), 201
    
    @app.route('/api/instructor/courses/<cid>/resources/<rid>', methods=['DELETE'])
    @instructor_required
    def delete_course_resource(cid, rid):
        db = get_db()
        db.execute('DELETE FROM course_resources WHERE id=? AND course_id=?', (rid, cid))
        db.commit()
        return jsonify({'message': 'Deleted'})
    
    @app.route('/api/health', methods=['GET'])
    def health():
        try:
            db = get_db()
            db.execute('SELECT 1').fetchone()
            db_status = 'connected'
        except Exception as e:
            db_status = f'error: {str(e)}'
        return jsonify({
            'status': 'ok' if db_status == 'connected' else 'degraded',
            'database': db_status,
            'timestamp': datetime.now().isoformat(),
            'postgres': bool(app.config.get('USE_POSTGRES')),
        })

    @app.route('/api/admin/run-migrations', methods=['POST', 'GET'])
    def run_migrations_now():
        """
        Manually run all database migrations. Useful when startup migrations failed.
        Requires admin authorization via Authorization: Bearer <ADMIN_PASSWORD> header.
        """
        admin_pw = os.environ.get('ADMIN_PASSWORD', '')
        auth = request.headers.get('Authorization', '')
        if not admin_pw or auth != f'Bearer {admin_pw}':
            return jsonify({'error': 'Unauthorized'}), 401
        try:
            from .database import MIGRATIONS
            db = get_db()
            results = {'success': [], 'failed': []}
            for m in MIGRATIONS:
                try:
                    if 'IF NOT EXISTS' in m.upper():
                        pg_m = m
                    else:
                        pg_m = m.replace('ADD COLUMN ', 'ADD COLUMN IF NOT EXISTS ')
                    db.execute(pg_m)
                    db.commit()
                    results['success'].append(m[:100])
                except Exception as e:
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
                    results['failed'].append(f'{m[:80]} — {str(e)[:100]}')
            return jsonify({
                'ran': len(MIGRATIONS),
                'succeeded': len(results['success']),
                'failed': len(results['failed']),
                'details': results,
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/keepalive', methods=['GET', 'HEAD'])
    def keepalive():
        """
        Lightweight endpoint for UptimeRobot to ping every 5 minutes.
        Touches the database to keep Neon's free tier from auto-suspending,
        AND keeps Render's free dyno from spinning down after 15 min idle.
        Returns minimal payload to save bandwidth.
        """
        alive = True
        try:
            db = get_db()
            db.execute('SELECT 1').fetchone()
        except Exception:
            alive = False
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
        # Return text/plain for minimal overhead — UptimeRobot just checks the 200
        from flask import Response
        return Response(
            'OK' if alive else 'DEGRADED',
            status=200 if alive else 503,
            mimetype='text/plain'
        )
    
    # ── SEED DATA ─────────────────────────────────────────────────────────────────
    
    # ── DEFAULT ADMIN ─────────────────────────────────────────────────────────────


    return app
