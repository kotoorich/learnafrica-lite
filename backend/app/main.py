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
import os, json, uuid, re, random, secrets
from datetime import datetime, timedelta
from functools import wraps
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from flask import Flask, request, jsonify, g, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from threading import Lock
import jwt
import requests
from urllib.parse import urlencode

from .database  import get_db, close_db, init_db, ensure_column, ensure_transactions_table
from .security  import (token_required, admin_required, instructor_required,
                         superadmin_required, generate_token, decode_token, _get_token)
from .schema    import (full_user, settings_dict, upsert_settings,
                         validate_signup, allowed_image, allowed_file,
                         COURSE_CATEGORIES)
from .crud      import (get_revenue_split, create_notification, push_notification,
                         upload_to_supabase, seed_admin, seed_demo_courses, seed_instructor_guide)
from .sanitize  import sanitize_html, contains_html_or_script, matches_extension
from .models    import (get_course_sections, score_quiz, get_or_issue_certificate,
                         get_instructor_stats, get_user_enrolled_courses)
from .quiz_service import (build_served_questions, public_questions, grade_served,
                           session_expiry, is_expired, new_session_id)
from . import email_service

# ── Globals (set inside create_app) ──────────────────────────────────────────
socketio = None

def default_thumbnail_for(course):
    """Return an auto-generated thumbnail for a course that has no image set.
    Uses an inline SVG data URI — self-contained, no network call, always renders.
    Deterministic per course (same course always gets the same image)."""
    thumb = (course.get('thumbnail') or '').strip()
    placeholders = ('', '/placeholder.jpg', 'placeholder.jpg',
                    '/images/placeholder.jpg', 'null', 'undefined', 'none')
    if thumb and thumb.lower() not in placeholders and thumb.lower() != 'null':
        return thumb

    return _generate_svg_thumbnail(course)


# Palette pairs — gradient (from, to) for each theme
_THEME_PALETTES = {
    'code':     ('#0f172a', '#3b82f6'),  # slate → blue
    'data':     ('#134e4a', '#10b981'),  # teal → green
    'ai':       ('#312e81', '#a855f7'),  # indigo → purple
    'design':   ('#831843', '#f472b6'),  # pink → magenta
    'business': ('#0c4a6e', '#0ea5e9'),  # navy → sky
    'finance':  ('#14532d', '#facc15'),  # forest → gold
    'marketing':('#78350f', '#f97316'),  # brown → orange
    'photo':    ('#1e1b4b', '#ec4899'),  # deep purple → pink
    'music':    ('#4c1d95', '#c084fc'),  # violet → lavender
    'language': ('#7c2d12', '#fb923c'),  # rust → amber
    'health':   ('#064e3b', '#34d399'),  # emerald → mint
    'fitness':  ('#7f1d1d', '#fb7185'),  # crimson → coral
    'cooking':  ('#78350f', '#fbbf24'),  # bronze → yellow
    'default':  ('#1e293b', '#8b5cf6'),  # slate → violet
}

# Category name → theme key
_CATEGORY_THEME = {
    'web development': 'code', 'programming': 'code', 'coding': 'code',
    'data science': 'data', 'analytics': 'data',
    'machine learning': 'ai', 'ai': 'ai', 'artificial intelligence': 'ai',
    'design': 'design', 'ui/ux': 'design', 'ux': 'design', 'graphic design': 'design',
    'business': 'business', 'entrepreneurship': 'business',
    'finance': 'finance', 'accounting': 'finance',
    'marketing': 'marketing', 'seo': 'marketing',
    'photography': 'photo',
    'music': 'music',
    'language': 'language', 'languages': 'language',
    'health': 'health', 'wellness': 'health',
    'fitness': 'fitness',
    'cooking': 'cooking', 'food': 'cooking',
}


def _generate_svg_thumbnail(course):
    """Produce a data-URI SVG thumbnail unique to this course."""
    import base64, hashlib

    title = (course.get('title') or 'Course').strip()
    category = (course.get('category') or '').lower().strip()
    theme_key = _CATEGORY_THEME.get(category, 'default')
    color_from, color_to = _THEME_PALETTES[theme_key]

    # Seed rotation from course id so each course has a slightly different look
    seed_src = (course.get('id') or title or 'course')
    seed = int(hashlib.md5(seed_src.encode()).hexdigest()[:8], 16)
    rotation = seed % 360
    dot_seed = (seed >> 8) % 20  # varying dot pattern

    # First two letters as monogram
    words = [w for w in title.split() if w]
    monogram = ''
    for w in words[:2]:
        if w and w[0].isalnum():
            monogram += w[0].upper()
    if not monogram:
        monogram = title[:2].upper() if title else 'LA'
    monogram = monogram[:2]

    # Truncate title for display
    display_title = title if len(title) <= 32 else title[:29] + '...'

    # Build decorative dots (deterministic)
    dots_svg = ''
    for i in range(12):
        h = int(hashlib.md5(f'{seed_src}-{i}'.encode()).hexdigest()[:6], 16)
        cx = 40 + (h % 720)
        cy = 40 + ((h >> 12) % 520)
        r = 4 + ((h >> 20) % 20)
        opacity = 0.05 + ((h >> 24) % 15) / 100.0
        dots_svg += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#ffffff" opacity="{opacity:.2f}"/>'

    # SVG — 800x600
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">'
        f'<defs>'
        f'<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate({rotation} 0.5 0.5)">'
        f'<stop offset="0%" stop-color="{color_from}"/>'
        f'<stop offset="100%" stop-color="{color_to}"/>'
        f'</linearGradient>'
        f'<radialGradient id="glow" cx="50%" cy="35%" r="60%">'
        f'<stop offset="0%" stop-color="#ffffff" stop-opacity="0.25"/>'
        f'<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>'
        f'</radialGradient>'
        f'</defs>'
        f'<rect width="800" height="600" fill="url(#bg)"/>'
        f'<rect width="800" height="600" fill="url(#glow)"/>'
        f'{dots_svg}'
        # Large circle behind monogram
        f'<circle cx="400" cy="240" r="110" fill="#ffffff" opacity="0.12"/>'
        f'<circle cx="400" cy="240" r="90" fill="#ffffff" opacity="0.18"/>'
        # Monogram
        f'<text x="400" y="278" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="120" font-weight="900" fill="#ffffff">{_xml_escape(monogram)}</text>'
        # Title
        f'<text x="400" y="420" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="34" font-weight="700" fill="#ffffff" opacity="0.95">{_xml_escape(display_title)}</text>'
        # Category chip
        f'<rect x="330" y="460" width="140" height="34" rx="17" fill="#ffffff" opacity="0.2"/>'
        f'<text x="400" y="483" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" letter-spacing="2" fill="#ffffff">{_xml_escape((course.get("category") or "COURSE").upper()[:15])}</text>'
        f'</svg>'
    )
    # Encode as data URI (URL-safe, no external deps)
    b64 = base64.b64encode(svg.encode('utf-8')).decode('ascii')
    return f'data:image/svg+xml;base64,{b64}'


def _xml_escape(s):
    """Minimal XML escape for text content inside SVG."""
    return (str(s)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace("'", '&#39;'))


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
    app.config['PASS_MIN_LENGTH']      = int(os.environ.get('PASS_MIN_LENGTH', 8))
    app.config['QUIZ_PASS_SCORE']      = int(os.environ.get('QUIZ_PASS_SCORE', 70))
    # Cap request bodies so a single oversized upload cannot exhaust the free
    # Render instance. Default 100MB (resource uploads cap at 50MB anyway);
    # override with MAX_CONTENT_LENGTH when larger video uploads are needed.
    app.config['MAX_CONTENT_LENGTH']   = int(
        os.environ.get('MAX_CONTENT_LENGTH', 100 * 1024 * 1024))

    # Local file upload folder (dev only — production uses Supabase)
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'instance', 'uploads')
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    if not app.config['USE_POSTGRES']:
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    # Refuse to run in production with the built-in dev secret. Without a real
    # SECRET_KEY/JWT_SECRET every login token can be forged.
    _is_prod = (os.environ.get('FLASK_ENV') == 'production')
    if _is_prod and not os.environ.get('JWT_SECRET') and not os.environ.get('SECRET_KEY'):
        raise RuntimeError(
            'SECRET_KEY (or JWT_SECRET) must be set in production — refusing to start '
            'with the default development secret.'
        )

    # ── Simple in-process rate limiter ────────────────────────────────────────
    # Best-effort protection against password guessing and OTP/email spam.
    # Works per gunicorn worker (this app runs -w 1, so it is process-wide).
    _rate_lock = Lock()
    _rate_hits = {}

    def _rate_limit(key, limit, window_seconds):
        """Return True if the caller is under `limit` hits within the window,
        recording this hit. Returns False when the limit is exceeded."""
        import time as _time
        now = _time.time()
        with _rate_lock:
            hits = [t for t in _rate_hits.get(key, []) if now - t < window_seconds]
            if len(hits) >= limit:
                _rate_hits[key] = hits
                return False
            hits.append(now)
            _rate_hits[key] = hits
        return True

    def _client_ip():
        fwd = request.headers.get('X-Forwarded-For', '')
        if fwd:
            return fwd.split(',')[0].strip()
        return request.remote_addr or 'unknown'

    # ── Audit trail ────────────────────────────────────────────────────────────
    # Append-only record of admin actions. Written best-effort: a logging
    # failure must never block or fail the real action the admin performed.
    # The table is pruned to the most recent AUDIT_LOG_CAP rows so it cannot
    # grow unbounded on a small database.
    AUDIT_LOG_CAP = 5000

    def audit(action, target_type=None, target_id=None, target_label=None, details=None):
        try:
            db = get_db()
            actor = getattr(g, 'current_user', None) or {}
            db.execute(
                '''INSERT INTO audit_log
                   (id,actor_id,actor_name,actor_role,action,target_type,target_id,target_label,details,ip)
                   VALUES(?,?,?,?,?,?,?,?,?,?)''',
                (str(uuid.uuid4()), actor.get('user_id'), actor.get('name'),
                 actor.get('role'), action, target_type, target_id, target_label,
                 json.dumps(details) if details is not None else None, _client_ip()))
            # Prune the oldest rows beyond the cap.
            try:
                db.execute(
                    'DELETE FROM audit_log WHERE id NOT IN ('
                    ' SELECT id FROM audit_log ORDER BY created_at DESC LIMIT ?)',
                    (AUDIT_LOG_CAP,))
            except Exception:
                pass
            db.commit()
        except Exception as e:
            app.logger.warning(f'audit log write failed: {e}')

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

    @app.errorhandler(413)
    def request_too_large(e):
        return jsonify({'error': 'Request too large'}), 413

    @app.errorhandler(500)
    def server_error(e):
        try:
            db = getattr(g, '_db', None)
            if db and hasattr(db, '_conn'):
                db._conn.rollback()
        except Exception:
            pass
        return jsonify({'error': 'Internal server error', 'detail': _err_detail(getattr(e, 'description', e))}), 500

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
        # Never expose internal details when running in production. FLASK_ENV is
        # set to 'production' in render.yaml; DEBUG is used as a second signal so
        # the check holds even if only debug mode was configured.
        if app.config.get('FLASK_ENV') == 'production' or not app.debug:
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

    def _err_detail(err):
        """Redact internal error strings outside of debug/local runs.

        Error messages can include SQL, file paths and configuration values, so
        they must never reach an API caller in production.
        """
        if app.config.get('FLASK_ENV') == 'production' or not app.debug:
            return 'An internal error occurred'
        return str(err)

    def _shape_public_lesson(db, row, uid, cid, include_content):
        """Shape a lesson for the public course endpoint.

        Always returns id/title/order metadata so the curriculum outline renders,
        but only includes the video URL, lesson text and resource links when the
        viewer is allowed to consume the content (enrolled student, owner, admin,
        or a free course). Draft/paid content is otherwise withheld.
        """
        ld = dict(row)
        prog = None
        if uid:
            prog = db.execute(
                'SELECT is_completed FROM user_progress WHERE user_id=? AND course_id=? AND lesson_id=?',
                (uid, cid, ld['id'])).fetchone()
        ld['isCompleted'] = bool(prog['is_completed']) if prog else False
        ld['is_completed'] = ld['isCompleted']
        ld['is_final'] = bool(ld.get('is_final', 0))
        ld['type'] = ld.get('type') or 'video'
        if include_content:
            ld['resources'] = [dict(r) for r in db.execute(
                'SELECT * FROM lesson_resources WHERE lesson_id=?', (ld['id'],)).fetchall()]
            ld['videoUrl'] = ld.get('video_url') or ld.get('video_file') or ''
            if ld.get('content'):
                ld['content'] = sanitize_html(ld['content'])
        else:
            ld['resources'] = []
            ld.pop('video_url', None); ld.pop('video_file', None)
            ld.pop('content', None); ld.pop('text_content', None)
            ld['videoUrl'] = ''
            ld['locked'] = True
        return ld

    # Self-heal for tables that may be missing on Postgres if init_db was skipped
    # on a previous deploy. Runs once per process — subsequent calls are no-ops.
    _tables_verified = {'done': False}
    def _ensure_new_tables():
        if _tables_verified['done']:
            return
        try:
            db = get_db()
            use_pg = app.config.get('USE_POSTGRES')
            stmts = [
                """CREATE TABLE IF NOT EXISTS coupons (
                    id TEXT PRIMARY KEY,
                    code TEXT NOT NULL UNIQUE,
                    discount_type TEXT NOT NULL DEFAULT 'percent',
                    discount_value REAL NOT NULL DEFAULT 0,
                    applies_to TEXT NOT NULL DEFAULT 'all',
                    course_id TEXT,
                    max_uses INTEGER,
                    current_uses INTEGER DEFAULT 0,
                    expires_at TIMESTAMP,
                    active INTEGER DEFAULT 1,
                    created_by TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )""",
                """CREATE TABLE IF NOT EXISTS live_sessions (
                    id TEXT PRIMARY KEY,
                    course_id TEXT NOT NULL,
                    instructor_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    scheduled_at TIMESTAMP NOT NULL,
                    duration_minutes INTEGER NOT NULL DEFAULT 60,
                    meeting_url TEXT NOT NULL,
                    recording_url TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )""",
            ]
            # RSVP table uses different auto-increment syntax on the two DBs
            if use_pg:
                stmts.append("""CREATE TABLE IF NOT EXISTS live_session_rsvps (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    rsvped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(session_id, user_id)
                )""")
            else:
                stmts.append("""CREATE TABLE IF NOT EXISTS live_session_rsvps (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    rsvped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(session_id, user_id)
                )""")
            # Global platform settings (key-value) + email verification codes
            stmts.append("""CREATE TABLE IF NOT EXISTS platform_settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by TEXT
            )""")
            stmts.append("""CREATE TABLE IF NOT EXISTS email_verification_codes (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                code_hash TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                attempts INTEGER DEFAULT 0,
                used INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""")
            # Also ensure the new columns on transactions exist (idempotent)
            extra_cols = [
                "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS coupon_code TEXT",
                "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS discount_applied REAL DEFAULT 0",
                "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_amount REAL",
                "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS component_key TEXT",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS course_code TEXT",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified INTEGER DEFAULT 1",
            ]
            for s in stmts:
                try:
                    db.execute(s); db.commit()
                except Exception as e:
                    app.logger.warning(f'_ensure_new_tables CREATE skipped: {e}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
            if use_pg:
                for c in extra_cols:
                    try:
                        db.execute(c); db.commit()
                    except Exception as e:
                        app.logger.warning(f'_ensure_new_tables COLUMN skipped: {e}')
                        try:
                            if hasattr(db, '_conn'): db._conn.rollback()
                        except Exception: pass
            _tables_verified['done'] = True
            app.logger.info('_ensure_new_tables: verified')
        except Exception as e:
            app.logger.error(f'_ensure_new_tables FAILED (will retry next request): {e}')

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
        try:
            d = request.get_json() or {}
            for f in ('name','email','password'):
                if not d.get(f): return jsonify({'error': f'{f} is required'}), 400
            if len(d['password']) < app.config['PASS_MIN_LENGTH']:
                return jsonify({'error': f'Password must be at least {app.config["PASS_MIN_LENGTH"]} characters'}), 400

            # Optional contact phone ("call line"). Stored normalised so it can be
            # used for support/recovery without duplicating formats.
            phone, phone_err = _clean_profile_phone(d.get('phone'))
            if phone_err:
                return jsonify({'error': phone_err}), 400

            db = get_db()
            if db.execute('SELECT id FROM users WHERE LOWER(email)=?',(d['email'].lower(),)).fetchone():
                return jsonify({'error': 'Email already registered'}), 409

            uid = str(uuid.uuid4())
            is_instructor = d.get('role') == 'instructor' or d.get('isInstructor')
            role = 'instructor' if is_instructor else 'student'
            # First user ever becomes superadmin
            if db.execute('SELECT COUNT(*) as c FROM users').fetchone()['c'] == 0:
                role = 'superadmin'

            # Force-add columns inline if missing (defensive against failed migrations)
            if app.config.get('USE_POSTGRES'):
                for col_sql in [
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS website TEXT",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS instructor_title TEXT",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS instructor_status TEXT DEFAULT 'none'",
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT",
                ]:
                    try:
                        db.execute(col_sql)
                        db.commit()
                    except Exception:
                        try:
                            if hasattr(db, '_conn'): db._conn.rollback()
                        except Exception: pass

            instructor_status_val = ('approved' if role in ('admin','superadmin') else
                                     ('pending' if role == 'instructor' else 'none'))
            # Force-add instructor_field column inline (in case migration didn't run)
            if app.config.get('USE_POSTGRES'):
                try:
                    db.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS instructor_field TEXT')
                    db.commit()
                except Exception:
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
            # SPECIALIZATION: accept many key names, but always store in instructor_field
            specialisation_value = (
                d.get('instructor_field') or d.get('specialisation') or d.get('specialization')
                or d.get('title') or d.get('instructor_title') or ''
            )
            try:
                db.execute('INSERT INTO users (id,name,email,password_hash,role,phone,bio,location,website,'
                           'instructor_title,instructor_field,instructor_status)'
                           ' VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                           (uid, d['name'], d['email'].lower(), generate_password_hash(d['password']),
                            role, phone, d.get('bio',''), d.get('location',''), d.get('website',''),
                            specialisation_value,  # legacy column - same value
                            specialisation_value,  # primary column - the specialisation
                            instructor_status_val))
            except Exception as ex:
                app.logger.warning(f'full users INSERT failed, trying minimal: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
                # Minimal fallback - just core columns
                db.execute('INSERT INTO users (id,name,email,password_hash,role) VALUES(?,?,?,?,?)',
                           (uid, d['name'], d['email'].lower(), generate_password_hash(d['password']), role))

            # Best-effort user_stats and user_settings creation
            try:
                db.execute('INSERT INTO user_stats (user_id, streak, last_activity) VALUES(?,1,CURRENT_DATE)', (uid,))
            except Exception as ex:
                app.logger.warning(f'user_stats insert failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass

            try:
                db.execute('INSERT INTO user_settings (user_id) VALUES(?)', (uid,))
            except Exception as ex:
                app.logger.warning(f'user_settings insert failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass

            # If instructor, create application record
            if role == 'instructor':
                # Force-add missing columns first (in case migrations didn't run)
                if app.config.get('USE_POSTGRES'):
                    for col_sql in [
                        'ALTER TABLE instructor_applications ADD COLUMN IF NOT EXISTS location TEXT',
                        'ALTER TABLE instructor_applications ADD COLUMN IF NOT EXISTS website TEXT',
                        'ALTER TABLE instructor_applications ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP',
                    ]:
                        try:
                            db.execute(col_sql)
                            db.commit()
                        except Exception:
                            try:
                                if hasattr(db, '_conn'): db._conn.rollback()
                            except Exception: pass
                try:
                    db.execute('INSERT INTO instructor_applications (id,user_id,bio,location,website,status)'
                               " VALUES(?,?,?,?,?,'pending') ON CONFLICT DO NOTHING",
                               (str(uuid.uuid4()), uid, d.get('bio',''), d.get('location',''), d.get('website','')))
                    db.commit()
                except Exception as ex:
                    app.logger.warning(f'instructor_applications full insert failed: {ex}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
                    # Fallback - minimal columns only
                    try:
                        db.execute('INSERT INTO instructor_applications (id,user_id,bio,status)'
                                   " VALUES(?,?,?,'pending') ON CONFLICT DO NOTHING",
                                   (str(uuid.uuid4()), uid, d.get('bio','')))
                        db.commit()
                    except Exception as ex2:
                        app.logger.warning(f'instructor_applications minimal insert failed: {ex2}')
                        try:
                            if hasattr(db, '_conn'): db._conn.rollback()
                        except Exception: pass
                try:
                    admins = db.execute("SELECT id FROM users WHERE role IN ('admin','superadmin')").fetchall()
                    for admin in admins:
                        create_notification(db, admin['id'], 'system',
                            'New Instructor Application',
                            f'{d["name"]} has applied to become an instructor. Review in Admin Panel.',
                            f'instructor_app_{uid}', app.config.get('USE_POSTGRES'))
                except Exception as ex:
                    app.logger.warning(f'admin notification failed: {ex}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass

            db.commit()

            # ── Check current signup verification mode ─────────────────────────
            # If admin has enabled 'email_otp' mode, send OTP now and DON'T issue
            # a login token. The user must verify their email first via /verify-code
            # which will then issue their token. If SendPulse isn't configured, we
            # fall through to logging the user in with a warning in the logs.
            try:
                mode_row = db.execute(
                    "SELECT value FROM platform_settings WHERE key='signup_verification_mode'"
                ).fetchone()
                mode = mode_row['value'] if mode_row else 'none'
            except Exception:
                mode = 'none'
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass

            if mode == 'email_otp':
                # Mark this user as unverified until they enter the OTP
                try:
                    db.execute('UPDATE users SET email_verified=0 WHERE id=?', (uid,))
                    db.commit()
                except Exception:
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
                # Send the verification code
                ok, err = _generate_and_send_code(d['email'].lower(), d['name'])
                if ok:
                    return jsonify({
                        'message': 'Account created — please verify your email',
                        'needs_verification': True,
                        'email': d['email'].lower(),
                    }), 201
                # Send failed — log and fall through to auto-login so users
                # aren't locked out due to a config problem on the server
                app.logger.error(f'OTP send failed on signup for {d["email"]}: {err}. Falling back to auto-login.')
                try:
                    db.execute('UPDATE users SET email_verified=1 WHERE id=?', (uid,))
                    db.commit()
                except Exception:
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass

            token = generate_token(uid, d['email'].lower(), role, 0)
            return jsonify({'message': 'Account created', 'token': token,
                            'user': full_user(db, uid, app.config.get('USE_POSTGRES'))}), 201
        except Exception as e:
            import traceback
            app.logger.error(f'signup error: {traceback.format_exc()}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to create account', 'detail': _err_detail(e)}), 500
    
    def _user_role(db, user_id):
        row = db.execute('SELECT role FROM users WHERE id=?', (user_id,)).fetchone()
        return row['role'] if row else None

    def _instructor_missing_payout(db, user_id):
        """True when user_id is a non-admin account with no saved payout method."""
        ensure_column(db, 'users', 'payment_method', 'TEXT')
        ensure_column(db, 'users', 'payment_details', 'TEXT')
        row = db.execute('SELECT role, payment_method, payment_details FROM users WHERE id=?', (user_id,)).fetchone()
        if not row or row['role'] in ('admin', 'superadmin'):
            return False
        return not (row['payment_method'] and row['payment_details'])

    def _setting_flag(db, key, default=False):
        """Read a boolean platform_config flag. '1'/'true'/'yes'/'on' => True."""
        try:
            row = db.execute('SELECT value FROM platform_config WHERE key=?', (key,)).fetchone()
            if not row or row['value'] is None:
                return default
            return str(row['value']).strip().lower() in ('1', 'true', 'yes', 'on')
        except Exception:
            return default

    def _homepage_stats_values(db):
        """Admin-configured display numbers for the landing page stats strip.

        These are marketing figures the admin chooses — not live counts — so the
        admin can present the platform at its best. Stored as JSON in
        platform_config under 'homepage_stats_values'.
        """
        defaults = {'courses': 50, 'students': 2500, 'instructors': 40}
        try:
            row = db.execute("SELECT value FROM platform_config WHERE key='homepage_stats_values'").fetchone()
            if row and row['value']:
                data = row['value']
                if isinstance(data, str):
                    data = json.loads(data)
                if isinstance(data, dict):
                    for k in list(defaults.keys()):
                        if data.get(k) is not None:
                            defaults[k] = max(0, int(data[k]))
        except Exception:
            pass
        return defaults

    def _touch_streak(db, user_id):
        """Daily streak: same day keeps it, the next day adds 1, a missed day resets to 1."""
        try:
            row = db.execute('SELECT streak, last_activity FROM user_stats WHERE user_id=?', (user_id,)).fetchone()
            if not row:
                return
            today = datetime.now().date()
            last = str(row['last_activity'] or '')[:10]
            if last == today.isoformat():
                return
            yesterday = (today - timedelta(days=1)).isoformat()
            streak = int(row['streak'] or 0) + 1 if last == yesterday else 1
            db.execute('UPDATE user_stats SET streak=?, last_activity=? WHERE user_id=?',
                       (streak, today.isoformat(), user_id))
            db.commit()
        except Exception as ex:
            app.logger.warning(f'streak update failed: {ex}')
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass

    @app.route('/api/auth/login', methods=['POST'])
    def login():
        if not request.is_json: return jsonify({'error': 'JSON required'}), 400
        d = request.get_json()
        email = (d.get('email') or '').strip().lower()
        pw = d.get('password','')
        if not email or not pw: return jsonify({'error': 'Email and password required'}), 400

        # Throttle password guessing: per IP and per account.
        ip = _client_ip()
        if not _rate_limit(f'login:ip:{ip}', 20, 300) or \
                not _rate_limit(f'login:acct:{email}', 10, 300):
            return jsonify({'error': 'Too many login attempts. Please wait a few minutes and try again.'}), 429

        db = get_db()
        u = db.execute('SELECT * FROM users WHERE LOWER(email)=? AND is_active=1',(email,)).fetchone()
        if not u or not check_password_hash(u['password_hash'], pw):
            return jsonify({'error': 'Invalid email or password'}), 401

        # If email verification is switched on, unverified accounts cannot log in.
        try:
            mode_row = db.execute(
                "SELECT value FROM platform_settings WHERE key='signup_verification_mode'"
            ).fetchone()
            mode = mode_row['value'] if mode_row else 'none'
        except Exception:
            mode = 'none'
        try:
            email_verified = u['email_verified']
        except (KeyError, IndexError):
            email_verified = None
        if mode == 'email_otp' and email_verified is not None and not int(email_verified):
            return jsonify({
                'error': 'Please verify your email before logging in.',
                'needs_verification': True,
                'email': email,
            }), 403

        _touch_streak(db, u['id'])
        try:
            _tv = int(u['token_version'] or 0)
        except Exception:
            _tv = 0
        token = generate_token(u['id'], u['email'], u['role'], _tv)
        return jsonify({'token': token, 'user': full_user(db, u['id'], app.config.get('USE_POSTGRES'))})

    @app.route('/api/auth/google', methods=['POST'])
    def google_auth():
        """Sign in / sign up with Google.

        The frontend sends the ID token Google issues (a signed JWT). We verify
        it with Google before trusting anything in it, then find or create the
        LearnAfrica account. Existing accounts keep their role; new accounts get
        the safe default for the requested type (student, or instructor pending
        approval). The client-supplied role can never grant privileges.
        """
        d = request.get_json() or {}
        credential = (d.get('credential') or '').strip()
        requested = (d.get('role') or 'student').strip().lower()
        if not credential:
            return jsonify({'error': 'Google credential is required'}), 400

        client_id = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '').strip()
        if not client_id:
            return jsonify({'error': 'Google sign-in is not configured on the server.'}), 400

        # Verify the token with Google (checks signature, expiry and issuer).
        try:
            vr = requests.get('https://oauth2.googleapis.com/tokeninfo',
                              params={'id_token': credential}, timeout=10)
        except Exception as ex:
            return jsonify({'error': f'Could not verify Google sign-in: {ex}'}), 502
        if vr.status_code != 200:
            return jsonify({'error': 'Invalid Google sign-in token'}), 401
        info = vr.json() or {}
        if info.get('aud') != client_id:
            return jsonify({'error': 'Google token was issued for a different application'}), 401
        if str(info.get('email_verified', '')).lower() not in ('true', '1'):
            return jsonify({'error': 'Your Google email is not verified'}), 401
        email = (info.get('email') or '').strip().lower()
        if not email:
            return jsonify({'error': 'Google did not return an email address'}), 400

        db = get_db()
        u = db.execute('SELECT * FROM users WHERE LOWER(email)=?', (email,)).fetchone()
        created = False
        if not u:
            # New account. Only student/instructor are allowed; instructor still
            # needs approval. Google can never create an admin.
            is_instructor = requested == 'instructor'
            role = 'instructor' if is_instructor else 'student'
            uid = str(uuid.uuid4())
            # Google already verified the address; password auth is not used for
            # this account, so store an unusable random hash, never a real one.
            unusable = generate_password_hash(secrets.token_urlsafe(32))
            status = 'pending' if is_instructor else 'none'
            try:
                db.execute(
                    'INSERT INTO users (id,name,email,password_hash,role,avatar,'
                    'instructor_status,email_verified) VALUES(?,?,?,?,?,?,?,1)',
                    (uid, info.get('name') or email.split('@')[0], email, unusable,
                     role, info.get('picture') or '', status))
            except Exception as ex:
                app.logger.warning(f'google users INSERT failed, retrying minimal: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
                try:
                    db.execute('INSERT INTO users (id,name,email,password_hash,role,avatar) '
                               'VALUES(?,?,?,?,?,?)',
                               (uid, info.get('name') or email.split('@')[0], email, unusable,
                                role, info.get('picture') or ''))
                except Exception as ex2:
                    app.logger.error(f'google minimal INSERT failed: {ex2}')
                    return jsonify({'error': 'Failed to create account'}), 500
            try:
                db.execute('INSERT INTO user_stats (user_id, streak, last_activity) VALUES(?,1,CURRENT_DATE)', (uid,))
            except Exception: pass
            try:
                db.execute('INSERT INTO user_settings (user_id) VALUES(?)', (uid,))
            except Exception: pass
            if is_instructor:
                try:
                    db.execute("INSERT INTO instructor_applications (id,user_id,bio,status) "
                               "VALUES(?,?,?,'pending') ON CONFLICT DO NOTHING",
                               (str(uuid.uuid4()), uid, ''))
                except Exception:
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
            db.commit()
            u = db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
            created = True
            audit('google_signup', 'user', uid, email, {'role': role})
        else:
            # Existing account — never change its role here.
            if u['is_active'] is not None and not int(u['is_active']):
                return jsonify({'error': 'This account has been suspended.'}), 403
            # Mark verified if Google is satisfied and it was not already.
            try:
                if not int(u['email_verified'] or 0):
                    db.execute('UPDATE users SET email_verified=1 WHERE id=?', (u['id'],))
                    db.commit()
            except Exception:
                pass

        # Google accounts are always email-verified, so the OTP gate (which only
        # blocks unverified accounts) never applies to them.

        _touch_streak(db, u['id'])
        try:
            _tv = int(u['token_version'] or 0)
        except Exception:
            _tv = 0
        token = generate_token(u['id'], u['email'], u['role'], _tv)
        return jsonify({
            'token': token,
            'user': full_user(db, u['id'], app.config.get('USE_POSTGRES')),
            'created': created,
        }), (201 if created else 200)
    
    @app.route('/api/users/me', methods=['GET'])
    @app.route('/api/auth/verify', methods=['GET'])
    @token_required
    def verify():
        db = get_db()
        _touch_streak(db, g.current_user['user_id'])
        u = full_user(db, g.current_user['user_id'], app.config.get('USE_POSTGRES'))
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
        try:
            d = request.get_json() or {}
            db = get_db()
            fields, vals = [], []
            for f in ('name','avatar','bio','location','website','instructor_title','instructor_field'):
                if f in d:
                    fields.append(f'{f}=?'); vals.append(d[f])
            # Contact phone ("call line") — optional, validated when provided.
            if 'phone' in d:
                phone, phone_err = _clean_profile_phone(d.get('phone'))
                if phone_err:
                    return jsonify({'error': phone_err}), 400
                fields.append('phone=?'); vals.append(phone)
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
    
        except Exception as e:
            import traceback
            app.logger.error('update_profile error: ' + traceback.format_exc())
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed', 'detail': _err_detail(e)}), 500
    
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
        try:
            db = get_db()
            # Force-add missing columns first
            if app.config.get('USE_POSTGRES'):
                for col_sql in [
                    'ALTER TABLE instructor_applications ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS instructor_status TEXT DEFAULT 'none'",
                ]:
                    try:
                        db.execute(col_sql); db.commit()
                    except Exception:
                        try:
                            if hasattr(db, '_conn'): db._conn.rollback()
                        except Exception: pass
            u = db.execute('SELECT role,instructor_status FROM users WHERE id=?',(g.current_user['user_id'],)).fetchone()
            if u['role'] != 'instructor':
                return jsonify({'error': 'Only instructor accounts can apply'}), 400
            if u['instructor_status'] == 'approved':
                return jsonify({'message': 'Already approved'}), 200
            d = request.get_json() or {}
            # Also update the user's profile with title and specialization
            try:
                db.execute(
                    "UPDATE users SET bio=?, instructor_title=?, instructor_field=? WHERE id=?",
                    (d.get('bio',''), d.get('instructor_title',''), d.get('instructor_field',''), g.current_user['user_id'])
                )
                db.commit()
            except Exception as ex:
                app.logger.warning(f'user profile update in apply failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
            
            try:
                db.execute(
                    'INSERT INTO instructor_applications (id,user_id,bio,status,submitted_at)'
                    " VALUES(?,?,?,'pending',CURRENT_TIMESTAMP)"
                    " ON CONFLICT(user_id) DO UPDATE SET bio=EXCLUDED.bio, status='pending'",
                    (str(uuid.uuid4()), g.current_user['user_id'], d.get('bio',''))
                )
                db.commit()
            except Exception as ex:
                app.logger.warning(f'apply full insert failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
                # Fallback - minimal
                try:
                    db.execute(
                        'INSERT INTO instructor_applications (id,user_id,bio,status)'
                        " VALUES(?,?,?,'pending') ON CONFLICT(user_id) DO UPDATE SET bio=EXCLUDED.bio, status='pending'",
                        (str(uuid.uuid4()), g.current_user['user_id'], d.get('bio',''))
                    )
                    db.commit()
                except Exception as ex2:
                    app.logger.warning(f'apply minimal insert failed: {ex2}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
            try:
                db.execute("UPDATE users SET instructor_status='pending' WHERE id=?",(g.current_user['user_id'],))
                db.commit()
            except Exception as ex:
                app.logger.warning(f'instructor_status update failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
            return jsonify({'message': 'Application submitted. Await admin approval.'})
        except Exception as e:
            import traceback
            app.logger.error(f'apply_instructor error: {traceback.format_exc()}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to submit application', 'detail': _err_detail(e)}), 500
    
    # ── COURSES ───────────────────────────────────────────────────────────────────
    @app.route('/api/courses', methods=['GET'])
    def get_courses():
        db = get_db()
        # Search + filter query params (all optional)
        q          = (request.args.get('q') or '').strip()
        category   = (request.args.get('category') or '').strip()
        difficulty = (request.args.get('difficulty') or '').strip()

        base_sql = (
            'SELECT c.*, COALESCE(e.cnt, 0) as real_enrollments,'
            ' COALESCE(u.name, c.instructor_name) as fresh_instructor_name,'
            ' COALESCE(u.avatar, c.instructor_avatar) as fresh_instructor_avatar,'
            ' COALESCE(u.instructor_title, \'Instructor\') as fresh_instructor_title,'
            " COALESCE(u.instructor_field, u.instructor_title, '') as fresh_specialization,"
            " COALESCE(u.bio, '') as fresh_instructor_bio,"
            " COALESCE(u.location, '') as fresh_instructor_location,"
            " COALESCE(u.website, '') as fresh_instructor_website"
            ' FROM courses c'
            ' LEFT JOIN users u ON u.id = c.instructor_id'
            ' LEFT JOIN (SELECT course_id, COUNT(*) as cnt'
            '            FROM user_enrollments GROUP BY course_id) e'
            '        ON e.course_id = c.id'
            ' WHERE c.is_published=1'
        )
        params = []
        # Case-insensitive search across title/description/category/instructor_name.
        # Using LOWER + LIKE for cross-DB compatibility (works on both SQLite and Postgres).
        if q:
            like = f'%{q.lower()}%'
            base_sql += (
                " AND (LOWER(c.title) LIKE ?"
                "   OR LOWER(c.description) LIKE ?"
                "   OR LOWER(c.category) LIKE ?"
                "   OR LOWER(COALESCE(u.name, c.instructor_name)) LIKE ?"
                "   OR LOWER(COALESCE(c.course_code, '')) LIKE ?"
                "   OR c.id IN (SELECT course_id FROM course_tags WHERE LOWER(tag) LIKE ?))"
            )
            params += [like, like, like, like, like, like]
        if category and category.lower() not in ('all', 'all categories'):
            base_sql += ' AND LOWER(c.category) = ?'
            params.append(category.lower())
        if difficulty and difficulty.lower() not in ('all', 'all levels'):
            base_sql += ' AND LOWER(c.difficulty) = ?'
            params.append(difficulty.lower())
        base_sql += ' ORDER BY real_enrollments DESC'

        rows = db.execute(base_sql, tuple(params)).fetchall()
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
            cd['instructor_title']          = cd.get('fresh_instructor_title') or 'Instructor'
            cd['instructor_specialization'] = cd.get('fresh_specialization') or ''
            cd['instructor_field']          = cd['instructor_specialization']
            cd['instructor_bio']            = cd.get('fresh_instructor_bio') or ''
            cd['instructor_location']       = cd.get('fresh_instructor_location') or ''
            cd['instructor_website']        = cd.get('fresh_instructor_website') or ''
            cd.pop('fresh_instructor_name', None)
            cd.pop('fresh_instructor_avatar', None)
            cd.pop('fresh_instructor_title', None)
            cd.pop('fresh_specialization', None)
            cd.pop('fresh_instructor_bio', None)
            cd.pop('fresh_instructor_location', None)
            cd.pop('fresh_instructor_website', None)
            cd['tags'] = [
                x['tag'] for x in
                db.execute('SELECT tag FROM course_tags WHERE course_id=?', (cd['id'],)).fetchall()
            ]
            cd['learningOutcomes'] = [
                x['outcome'] for x in
                db.execute('SELECT outcome FROM course_outcomes WHERE course_id=?', (cd['id'],)).fetchall()
            ]
            # Auto-sum total lesson seconds for "Hours required"
            try:
                tot = db.execute(
                    'SELECT COALESCE(SUM(duration_seconds),0) as t FROM lessons WHERE course_id=?',
                    (cd['id'],)
                ).fetchone()
                cd['hours_required_seconds'] = int(tot['t'] or 0) if tot else 0
            except Exception:
                cd['hours_required_seconds'] = 0
            courses.append(cd)
        # Ensure every course has a thumbnail (auto-generated for those without)
        for _cd in courses:
            _cd['thumbnail'] = default_thumbnail_for(_cd)
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
                'SELECT name, avatar, bio, location, website, instructor_title, instructor_field'
                ' FROM users WHERE id=?',
                (cd.get('instructor_id'),)
            ).fetchone()
            if inst:
                cd['instructor_name']     = inst['name'] or cd.get('instructor_name', '')
                cd['instructor_avatar']   = inst['avatar'] or cd.get('instructor_avatar', '')
                cd['instructor_bio']      = inst['bio'] or ''
                cd['instructor_location'] = inst['location'] or ''
                cd['instructor_website']  = inst['website'] or ''
                # Primary specialisation source: instructor_field. Fallback: instructor_title for legacy data.
                spec_value = inst['instructor_field'] or inst['instructor_title'] or ''
                cd['instructor_specialization'] = spec_value
                cd['instructor_field']          = spec_value  # alias for backward compat
        except Exception:
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
        cd['tags'] = [x['tag'] for x in db.execute('SELECT tag FROM course_tags WHERE course_id=?',(cid,)).fetchall()]
        cd['learningOutcomes'] = [x['outcome'] for x in db.execute('SELECT outcome FROM course_outcomes WHERE course_id=?',(cid,)).fetchall()]
        perks = db.execute('SELECT * FROM course_perks WHERE course_id=?',(cid,)).fetchone()
        cd['has_certificate'] = bool(perks['has_certificate']) if perks else bool(cd.get('has_certificate'))
        cd['has_lifetime_access'] = bool(perks['lifetime_access']) if perks else bool(cd.get('has_lifetime_access'))
        cd['has_resources'] = bool(perks['has_resources']) if perks else bool(cd.get('has_resources'))
    
        # ── ACCESS CONTROL ────────────────────────────────────────────────────
        # Resolve the viewer (this route is public, so we decode the token
        # ourselves instead of using @token_required). Role and active status are
        # read fresh from the DB so a demoted/suspended user cannot keep access.
        p = decode_token(_get_token())
        uid, viewer_role = None, None
        if p:
            try:
                vr = db.execute('SELECT role, is_active FROM users WHERE id=?', (p.get('user_id'),)).fetchone()
                if vr and (vr['is_active'] is None or int(vr['is_active'])):
                    uid, viewer_role = p.get('user_id'), vr['role']
            except Exception:
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass

        is_staff   = viewer_role in ('instructor', 'admin', 'superadmin')
        is_admin   = viewer_role in ('admin', 'superadmin')
        owns_course = bool(is_admin) or (cd.get('instructor_id') == uid)

        # Draft (unpublished) courses are only visible to their owner/admins.
        if not int(cd.get('is_published', 1) or 0) and not owns_course and not is_admin:
            return jsonify({'error': 'Course not found'}), 404

        is_paid = not bool(int(cd.get('is_free') or 0)) and float(cd.get('price') or 0) > 0

        # Enrollment (ignoring expired access)
        is_enrolled = False
        if uid and not owns_course:
            enr = db.execute(
                'SELECT expires_at FROM user_enrollments WHERE user_id=? AND course_id=?',
                (uid, cid)
            ).fetchone()
            if enr:
                is_enrolled = True
                if enr['expires_at']:
                    try:
                        exp = enr['expires_at']
                        exp = exp if hasattr(exp, 'isoformat') else datetime.fromisoformat(str(exp))
                        if datetime.now() > exp:
                            is_enrolled = False
                    except Exception:
                        pass

        # Lesson text/video/resources are only released to enrolled students or
        # the course owner. Free courses stay previewable (as before); paid and
        # draft content is withheld from anonymous/other viewers.
        can_view_content = owns_course or is_enrolled or (not is_paid)
        can_read_lesson_content = owns_course or is_enrolled or (not is_paid)

        if not can_view_content:
            # Strip the whole curriculum rather than leaking it.
            cd.pop('video_url', None); cd.pop('video_file', None)
            cd.pop('content', None); cd.pop('text_content', None)
            cd['sections'] = []
            cd['lessons'] = []
            cd['course_resources'] = []
            cd['locked'] = True
        else:
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
                    ld = _shape_public_lesson(db, l, uid, cid, can_read_lesson_content)
                    sec_lessons.append(ld)
                    all_lessons_flat.append(ld)
                sd['lessons'] = sec_lessons
                sections.append(sd)
            # Fallback: lessons not in any section
            if not sections:
                for l in db.execute('SELECT * FROM lessons WHERE course_id=? ORDER BY "order"',(cid,)).fetchall():
                    ld = _shape_public_lesson(db, l, uid, cid, can_read_lesson_content)
                    all_lessons_flat.append(ld)
                sections = [{'id': 'default', 'title': 'Course Content', 'lessons': all_lessons_flat}]
            cd['sections'] = sections
            cd['lessons'] = all_lessons_flat  # keep flat list for LessonPage navigation
            cd['course_resources'] = [dict(r) for r in db.execute('SELECT * FROM course_resources WHERE course_id=?',(cid,)).fetchall()] if can_read_lesson_content else []
            cd['locked'] = not can_read_lesson_content
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
            spec_value = instructor['instructor_field'] or instructor['instructor_title'] or ''
            cd['instructor_specialization'] = spec_value
            cd['instructor_field']          = spec_value
        else:
            cd['instructor_bio']      = ''
            cd['instructor_location'] = ''
            cd['instructor_website']  = ''
            cd['instructor_specialization'] = ''
            cd['instructor_field']          = ''
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

        # Auto-sum total lesson hours (sum of all lessons' duration_seconds)
        try:
            tot_row = db.execute(
                'SELECT COALESCE(SUM(duration_seconds),0) as t FROM lessons WHERE course_id=?',
                (cid,)
            ).fetchone()
            cd['hours_required_seconds'] = int(tot_row['t'] or 0) if tot_row else 0
        except Exception:
            cd['hours_required_seconds'] = 0

        cd['thumbnail'] = default_thumbnail_for(cd)
        return jsonify({'course': cd})
    
    @app.route('/api/courses/<cid>/enroll', methods=['POST'])
    @token_required
    def enroll(cid):
        db = get_db()
        if _user_role(db, g.current_user['user_id']) != 'student':
            return jsonify({'error': 'Only student accounts can enroll in courses.'}), 403
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
            role = g.current_user['role']
            # Admins may read any lesson; an instructor may only read lessons for
            # courses they actually own (previously any instructor could read any
            # course's lessons).
            is_staff = role in ('admin', 'superadmin')
            owns_course = False
            if role == 'instructor':
                owns = db.execute('SELECT id FROM courses WHERE id=? AND instructor_id=?',
                                  (cid, g.current_user['user_id'])).fetchone()
                owns_course = bool(owns)
                is_staff = owns_course
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
            if ld.get('content'):
                ld['content'] = sanitize_html(ld['content'])
            prog = db.execute('SELECT is_completed, quiz_score FROM user_progress WHERE user_id=? AND course_id=? AND lesson_id=?',
                              (g.current_user['user_id'], cid, lid)).fetchone()
            ld['isCompleted'] = bool(prog['is_completed']) if prog else False
            ld['is_completed'] = ld['isCompleted']
            ld['quizScore'] = prog['quiz_score'] if prog else None
            return jsonify({'lesson': ld})
        except Exception as e:
            import traceback
            app.logger.error(f'get_lesson error: {traceback.format_exc()}')
            return jsonify({'error': 'Failed to load lesson', 'detail': _err_detail(e)}), 500

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
            db = get_db()
            uid = g.current_user['user_id']

            # Must be enrolled in the course (admins bypass for support access).
            if g.current_user['role'] not in ('admin', 'superadmin'):
                enrolled = db.execute(
                    'SELECT 1 FROM user_enrollments WHERE user_id=? AND course_id=?',
                    (uid, cid)
                ).fetchone()
                if not enrolled:
                    return jsonify({'error': 'not_enrolled', 'message': 'Enroll in this course to track progress'}), 403

            lesson_row = db.execute(
                'SELECT type FROM lessons WHERE id=? AND course_id=?', (lid, cid)
            ).fetchone()
            if not lesson_row:
                return jsonify({'error': 'Lesson not found'}), 404

            # A score supplied by the client is NEVER trusted for a quiz lesson —
            # quiz scores must come from /api/quizzes/submit, which grades the
            # answers server-side. This closes the "send score 100, get a
            # certificate" hole.
            is_quiz = (lesson_row['type'] or '') == 'quiz'
            if is_quiz:
                graded = db.execute(
                    'SELECT quiz_score FROM user_progress WHERE user_id=? AND course_id=? AND lesson_id=?',
                    (uid, cid, lid)
                ).fetchone()
                if not graded or graded['quiz_score'] is None:
                    return jsonify({
                        'message': 'Quiz scores are recorded when the quiz is submitted',
                        'lesson_completed': False,
                    }), 200
            # The client-supplied quiz_score is ignored for every lesson type —
            # scores are only ever written by /api/quizzes/submit.
            score = None

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
                    'SELECT COUNT(*) FROM user_progress WHERE user_id=? AND is_completed=1), '
                    'courses_completed=('
                    'SELECT COUNT(*) FROM user_enrollments WHERE user_id=? AND progress>=100) WHERE user_id=?',
                    (uid, uid, uid)
                )
                db.commit()
                _touch_streak(db, uid)
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
            return jsonify({'error': 'Failed to update progress', 'detail': _err_detail(e)}), 500
    
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
            # CRITICAL: never leak the correct answer to the client.
            # For fill_blank, `options` holds the correct answer itself, so wipe it.
            # For mcq/true_false, options are the choices shown to the student (safe to send),
            # but the correct_answer index must be removed.
            if r['question_type'] == 'fill_blank':
                r['options'] = []
            r.pop('correct_answer', None)
            questions.append(r)
        qd['questions'] = questions
        qd['duration'] = str(qd['duration']) if qd.get('duration') else 'No limit'
        qd['max_attempts'] = int(qd.get('max_attempts') or 0)
        # Anti-cheat flags. When any of these are on, the student flow calls
        # POST /api/quizzes/<id>/start instead of relying on this response.
        qd['duration_seconds']     = int(qd.get('duration_seconds') or 0)
        qd['questions_per_attempt'] = int(qd.get('questions_per_attempt') or 0)
        qd['shuffle_questions']    = bool(qd.get('shuffle_questions'))
        qd['shuffle_options']      = bool(qd.get('shuffle_options'))
        qd['question_count']       = len(questions)
        qd['randomized'] = bool(
            qd['shuffle_questions'] or qd['shuffle_options']
            or (0 < qd['questions_per_attempt'] < len(questions))
        )
        try:
            used = db.execute(
                'SELECT COUNT(*) AS cnt FROM quiz_attempts WHERE user_id=? AND quiz_id=?',
                (g.current_user['user_id'], qd['id'])
            ).fetchone()
            qd['attempts_used'] = int(used['cnt'] or 0) if used else 0
        except Exception:
            qd['attempts_used'] = 0
        return jsonify({'quiz': qd})

    @app.route('/api/quizzes/<qid>/start', methods=['POST'])
    @token_required
    def start_quiz(qid):
        """Begin a quiz attempt. Serves the (optionally randomised) question
        set, records it server-side, and starts the authoritative timer.

        The question set and the deadline are held on the server; the client
        only receives the questions (no answers) and the expiry timestamp, so
        neither can be tampered with.
        """
        try:
            db = get_db()
            quiz_row = db.execute('SELECT * FROM quizzes WHERE id=?', (qid,)).fetchone()
            if not quiz_row:
                return jsonify({'error': 'Quiz not found'}), 404
            quiz = dict(quiz_row)
            cid, lid = quiz.get('course_id'), quiz.get('lesson_id')
            uid = g.current_user['user_id']
            is_admin_user = g.current_user['role'] in ('admin', 'superadmin')

            if not is_admin_user:
                enrolled = db.execute(
                    'SELECT 1 FROM user_enrollments WHERE user_id=? AND course_id=?',
                    (uid, cid)).fetchone()
                if not enrolled:
                    return jsonify({'error': 'not_enrolled',
                                    'message': 'Enroll in this course to take its quizzes'}), 403

            if not _rate_limit(f'quizstart:{uid}', 30, 300):
                return jsonify({'error': 'Too many quiz starts. Please slow down.'}), 429

            max_attempts = int(quiz.get('max_attempts') or 0)
            if not is_admin_user and max_attempts > 0:
                row = db.execute(
                    'SELECT COUNT(*) AS cnt FROM quiz_attempts WHERE user_id=? AND quiz_id=?',
                    (uid, qid)).fetchone()
                used = int(row['cnt'] or 0) if row else 0
                if used >= max_attempts:
                    return jsonify({
                        'error': 'attempt_limit',
                        'message': f'You have used all {max_attempts} attempts for this quiz.',
                        'attempts_used': used, 'max_attempts': max_attempts,
                    }), 429

            # The minimum-course-time gate only applies to the final quiz.
            if cid and lid:
                lesson_row = db.execute(
                    'SELECT is_final FROM lessons WHERE id=? AND course_id=?', (lid, cid)).fetchone()
                if lesson_row and bool(lesson_row['is_final']):
                    course_row = db.execute(
                        'SELECT min_time_seconds, enforce_min_time FROM courses WHERE id=?', (cid,)).fetchone()
                    enforce = bool(course_row['enforce_min_time']) if course_row else False
                    required = int(course_row['min_time_seconds'] or 0) if course_row else 0
                    if enforce and required > 0:
                        tt = db.execute(
                            'SELECT total_seconds FROM time_tracking WHERE user_id=? AND course_id=?',
                            (uid, cid)).fetchone()
                        spent = int(tt['total_seconds'] or 0) if tt else 0
                        if spent < required:
                            return jsonify({
                                'error': 'time_gate',
                                'required_seconds': required, 'spent_seconds': spent,
                                'message': f'You need to spend at least {required // 60} minutes on this '
                                           f'course before taking the final quiz. You have spent '
                                           f'{spent // 60} minutes so far.'
                            }), 403

            question_rows = db.execute(
                'SELECT * FROM quiz_questions WHERE quiz_id=? ORDER BY "order"', (qid,)).fetchall()
            if not question_rows:
                return jsonify({'error': 'This quiz has no questions yet.'}), 400

            served = build_served_questions(quiz, question_rows)
            expires_at = session_expiry(quiz.get('duration_seconds'))
            session_id = new_session_id()
            db.execute(
                '''INSERT INTO quiz_attempt_sessions
                   (id,user_id,quiz_id,course_id,lesson_id,started_at,expires_at,
                    served_questions,submitted)
                   VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,?,?,0)''',
                (session_id, uid, qid, cid, lid,
                 expires_at.isoformat() if expires_at else None,
                 json.dumps(served)))
            db.commit()

            return jsonify({
                'attempt_id': session_id,
                'quiz_id': qid,
                'title': quiz.get('title'),
                'duration_seconds': int(quiz.get('duration_seconds') or 0),
                'expires_at': expires_at.isoformat() if expires_at else None,
                'max_attempts': max_attempts,
                'randomized': bool(quiz.get('shuffle_questions') or quiz.get('shuffle_options')
                                   or (0 < int(quiz.get('questions_per_attempt') or 0) < len(question_rows))),
                'questions': public_questions(served),
            })
        except Exception as e:
            import traceback
            app.logger.error('start_quiz error: ' + traceback.format_exc())
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to start quiz', 'detail': _err_detail(e)}), 500
    
    @app.route('/api/quizzes/submit', methods=['POST'])
    @token_required
    def submit_quiz():
        try:
            d = request.get_json() or {}
            qid, answers = d.get('quiz_id'), d.get('answers', {})
            if not qid: return jsonify({'error': 'quiz_id required'}), 400
            db = get_db()

            # Resolve the quiz server-side and IGNORE any course/lesson ids the
            # client sent — those were previously trusted, which allowed a
            # submitted quiz to be attributed to an arbitrary course/lesson.
            quiz_row = db.execute('SELECT * FROM quizzes WHERE id=?', (qid,)).fetchone()
            if not quiz_row:
                return jsonify({'error': 'Quiz not found'}), 404
            cid, lid = quiz_row['course_id'], quiz_row['lesson_id']

            # Only enrolled students (or admins) may submit a quiz.
            if g.current_user['role'] not in ('admin', 'superadmin'):
                enrolled = db.execute(
                    'SELECT 1 FROM user_enrollments WHERE user_id=? AND course_id=?',
                    (g.current_user['user_id'], cid)
                ).fetchone()
                if not enrolled:
                    return jsonify({'error': 'not_enrolled', 'message': 'Enroll in this course to take its quizzes'}), 403

            # Throttle submissions so answers cannot be farmed by rapid retries.
            if not _rate_limit(f'quizsub:{g.current_user["user_id"]}', 20, 300):
                return jsonify({'error': 'Too many quiz submissions. Please slow down.'}), 429

            # Cap total attempts. The limit is set per quiz by the instructor
            # when they build the course; 0 means unlimited. Admins are exempt
            # (support/diagnostic use).
            is_admin_user = g.current_user['role'] in ('admin', 'superadmin')
            prior_attempts = 0
            max_attempts = int(quiz_row['max_attempts'] or 0)
            if not is_admin_user and max_attempts > 0:
                row = db.execute(
                    'SELECT COUNT(*) AS cnt FROM quiz_attempts WHERE user_id=? AND quiz_id=?',
                    (g.current_user['user_id'], qid)
                ).fetchone()
                prior_attempts = int(row['cnt'] or 0) if row else 0
                if prior_attempts >= max_attempts:
                    return jsonify({
                        'error': 'attempt_limit',
                        'message': f'You have used all {max_attempts} attempts for this quiz.',
                        'attempts_used': prior_attempts,
                        'max_attempts': max_attempts,
                    }), 429

            # TIME GATE: if final quiz, enforce min course time.
            # SECURITY FIX: this used to wrap the whole check in try/except and
            # silently allow the quiz through on ANY exception (a fail-open bug).
            # It is no longer swallowed here. If something genuinely breaks while
            # determining whether the gate applies, that error now surfaces
            # through the normal error handling below instead of quietly
            # bypassing the minimum-time requirement.
            if cid and lid:
                lesson_row = db.execute(
                    'SELECT is_final FROM lessons WHERE id=? AND course_id=?',
                    (lid, cid)
                ).fetchone()
                is_final_quiz = bool(lesson_row['is_final']) if lesson_row else False
                if is_final_quiz:
                    course_row = db.execute(
                        'SELECT min_time_seconds, enforce_min_time FROM courses WHERE id=?', (cid,)
                    ).fetchone()
                    enforce = bool(course_row['enforce_min_time']) if course_row else False
                    required = int(course_row['min_time_seconds'] or 0) if course_row else 0
                    if enforce and required > 0:
                        tt = db.execute(
                            'SELECT total_seconds FROM time_tracking WHERE user_id=? AND course_id=?',
                            (g.current_user['user_id'], cid)
                        ).fetchone()
                        spent = int(tt['total_seconds'] or 0) if tt else 0
                        if spent < required:
                            return jsonify({
                                'error': 'time_gate',
                                'required_seconds': required,
                                'spent_seconds': spent,
                                'message': f'You need to spend at least {required // 60} minutes on this course before taking the final quiz. You have spent {spent // 60} minutes so far.'
                            }), 403

            # Grade against the exact question set the student was served.
            # When a start session exists (the randomised/timed flow) that set
            # — and its option order — is authoritative and stored server-side.
            # Without a session (legacy quizzes), fall back to the ordered
            # question table, which reproduces the original behaviour.
            attempt_id = d.get('attempt_id')
            session = None
            if attempt_id:
                session = db.execute(
                    'SELECT * FROM quiz_attempt_sessions WHERE id=? AND user_id=? AND quiz_id=?',
                    (attempt_id, g.current_user['user_id'], qid)).fetchone()
                if not session:
                    return jsonify({'error': 'invalid_attempt',
                                    'message': 'This quiz attempt is no longer valid. Please restart the quiz.'}), 400
                if session['submitted']:
                    return jsonify({'error': 'already_submitted',
                                    'message': 'This attempt has already been submitted.'}), 409
                if is_expired(session['expires_at']):
                    db.execute('UPDATE quiz_attempt_sessions SET submitted=1 WHERE id=?', (attempt_id,))
                    db.commit()
                    return jsonify({
                        'error': 'time_expired',
                        'message': 'Time is up — the attempt was not accepted. Please start the quiz again.',
                    }), 403

            if session:
                served = json.loads(session['served_questions'] or '[]')
                score, correct_count, correct_map, passed = grade_served(
                    served, answers, app.config['QUIZ_PASS_SCORE'])
                total_questions = len(served)
            else:
                questions = db.execute(
                    'SELECT * FROM quiz_questions WHERE quiz_id=? ORDER BY "order"', (qid,)).fetchall()
                correct_map, correct_count = {}, 0
                for i, q in enumerate(questions):
                    q_type = q['question_type'] if q['question_type'] else 'mcq'
                    user_ans = answers.get(str(i))
                    if q_type == 'fill_blank':
                        try:
                            opts = json.loads(q['options']) if isinstance(q['options'], str) else (q['options'] or [])
                            correct_text = str(opts[int(q['correct_answer'])]) if opts else ''
                        except (ValueError, TypeError, IndexError):
                            correct_text = ''
                        correct_map[i] = correct_text
                        if user_ans is not None:
                            if str(user_ans).strip().lower() == correct_text.strip().lower():
                                correct_count += 1
                    else:
                        correct_map[i] = q['correct_answer']
                        if user_ans is not None:
                            try:
                                if int(user_ans) == int(q['correct_answer']):
                                    correct_count += 1
                            except (ValueError, TypeError):
                                pass
                total_questions = len(questions)
                score = int((correct_count / total_questions) * 100) if total_questions else 0
                passed = score >= app.config['QUIZ_PASS_SCORE']
            db.execute('''INSERT INTO quiz_attempts (id,user_id,quiz_id,score,answers,correct_answers)
                          VALUES(?,?,?,?,?,?)''',
                       (str(uuid.uuid4()), g.current_user['user_id'], qid, score,
                        json.dumps(answers), json.dumps(correct_map)))
            if session:
                db.execute(
                    'UPDATE quiz_attempt_sessions SET submitted=1, score=?, submitted_at=CURRENT_TIMESTAMP WHERE id=?',
                    (score, attempt_id))
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
            # Release the answer key only when the quiz was passed. A failed
            # attempt must not hand back the correct answers, otherwise a single
            # submission (even the very first) leaks the key and makes the next
            # attempt — and the certificate gate — trivial to game.
            response = {'score': score, 'correct_count': correct_count,
                        'total_questions': total_questions, 'passed': passed}
            if passed:
                response['correct_answers'] = correct_map
            return jsonify(response)
    
        except Exception as e:
            import traceback
            app.logger.error('submit_quiz error: ' + traceback.format_exc())
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed', 'detail': _err_detail(e)}), 500
    
    # ── PUBLIC DIRECTORY (SEO) ────────────────────────────────────────────────────
    # Public, unauthenticated read endpoints backing the instructor directory,
    # instructor profile pages and the blog. Only approved instructors and
    # published courses/posts are exposed.
    @app.route('/api/instructors', methods=['GET'])
    def list_public_instructors():
        try:
            db = get_db()
            rows = db.execute(
                "SELECT id, name, avatar, bio, location, website, instructor_title,"
                " instructor_field FROM users"
                " WHERE role IN ('instructor','admin','superadmin')"
                " AND instructor_status='approved'"
                " AND COALESCE(is_active,1)=1"
                " ORDER BY name"
            ).fetchall()
            out = []
            for r in rows:
                d = dict(r)
                d['course_count'] = db.execute(
                    "SELECT COUNT(*) AS c FROM courses WHERE instructor_id=? AND is_published=1",
                    (d['id'],)).fetchone()['c']
                d['student_count'] = db.execute(
                    "SELECT COUNT(*) AS c FROM user_enrollments e JOIN courses c ON c.id=e.course_id"
                    " WHERE c.instructor_id=? AND c.is_published=1", (d['id'],)).fetchone()['c']
                out.append(d)
            return jsonify({'instructors': out})
        except Exception as e:
            app.logger.error(f'list_public_instructors: {e}')
            return jsonify({'instructors': []})

    @app.route('/api/instructors/<uid>', methods=['GET'])
    def get_public_instructor(uid):
        try:
            db = get_db()
            r = db.execute(
                "SELECT id, name, avatar, bio, location, website, instructor_title,"
                " instructor_field FROM users"
                " WHERE id=? AND role IN ('instructor','admin','superadmin')"
                " AND instructor_status='approved' AND COALESCE(is_active,1)=1",
                (uid,)).fetchone()
            if not r:
                return jsonify({'error': 'Instructor not found'}), 404
            d = dict(r)
            courses = db.execute(
                "SELECT c.id, c.title, c.description, c.category, c.difficulty, c.price, c.is_free,"
                " COALESCE(e.cnt,0) AS student_count, COALESCE(rv.avg_r,0) AS rating"
                " FROM courses c"
                " LEFT JOIN (SELECT course_id, COUNT(*) cnt FROM user_enrollments GROUP BY course_id) e"
                " ON e.course_id=c.id"
                " LEFT JOIN (SELECT course_id, AVG(rating) avg_r FROM reviews GROUP BY course_id) rv"
                " ON rv.course_id=c.id"
                " WHERE c.instructor_id=? AND c.is_published=1 ORDER BY c.created_at DESC",
                (uid,)).fetchall()
            d['courses'] = safe_list(courses)
            d['course_count'] = len(d['courses'])
            return jsonify({'instructor': d})
        except Exception as e:
            app.logger.error(f'get_public_instructor: {e}')
            return jsonify({'error': 'Failed to load instructor'}), 500

    @app.route('/api/blog', methods=['GET'])
    def list_blog_posts():
        try:
            db = get_db()
            rows = db.execute(
                "SELECT id, slug, title, excerpt, cover, author_name, tags,"
                " CAST(created_at AS TEXT) AS created_at FROM blog_posts"
                " WHERE is_published=1 ORDER BY created_at DESC LIMIT 100"
            ).fetchall()
            return jsonify({'posts': safe_list(rows)})
        except Exception as e:
            app.logger.error(f'list_blog_posts: {e}')
            return jsonify({'posts': []})

    @app.route('/api/blog/<slug>', methods=['GET'])
    def get_blog_post(slug):
        try:
            db = get_db()
            r = db.execute(
                "SELECT id, slug, title, excerpt, cover, body, author_name, tags,"
                " CAST(created_at AS TEXT) AS created_at FROM blog_posts"
                " WHERE slug=? AND is_published=1", (slug,)).fetchone()
            if not r:
                return jsonify({'error': 'Post not found'}), 404
            return jsonify({'post': dict(r)})
        except Exception as e:
            app.logger.error(f'get_blog_post: {e}')
            return jsonify({'error': 'Failed to load post'}), 500

    @app.route('/api/sitemap.xml', methods=['GET'])
    def sitemap_xml():
        """Machine-readable sitemap of public pages for search engines."""
        try:
            db = get_db()
            base = (request.args.get('base') or os.environ.get('SITE_URL')
                    or 'https://learnafrica-lite-weld.vercel.app').rstrip('/')
            urls = [f'{base}/', f'{base}/courses', f'{base}/instructors', f'{base}/blog']
            for r in db.execute("SELECT id FROM courses WHERE is_published=1").fetchall():
                urls.append(f'{base}/courses/{r["id"]}')
            for r in db.execute(
                    "SELECT id FROM users WHERE instructor_status='approved'"
                    " AND role IN ('instructor','admin','superadmin')").fetchall():
                urls.append(f'{base}/instructors/{r["id"]}')
            for r in db.execute("SELECT slug FROM blog_posts WHERE is_published=1").fetchall():
                urls.append(f'{base}/blog/{r["slug"]}')
            body = ('<?xml version="1.0" encoding="UTF-8"?>\n'
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                    + ''.join(f'  <url><loc>{u}</loc></url>\n' for u in urls)
                    + '</urlset>')
            resp = app.response_class(body, mimetype='application/xml')
            return resp
        except Exception as e:
            app.logger.error(f'sitemap_xml: {e}')
            return app.response_class(
                '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
                mimetype='application/xml')

    # ── ADMIN BLOG CRUD ───────────────────────────────────────────────────────────
    def _blog_slug(title):
        s = re.sub(r'[^a-z0-9]+', '-', (title or '').strip().lower()).strip('-')
        return s or 'post'

    @app.route('/api/admin/blog', methods=['GET'])
    @admin_required
    def admin_list_blog():
        db = get_db()
        rows = db.execute(
            "SELECT * FROM blog_posts ORDER BY created_at DESC LIMIT 200").fetchall()
        return jsonify({'posts': safe_list(rows)})

    @app.route('/api/admin/blog', methods=['POST'])
    @admin_required
    def admin_create_blog():
        try:
            d = request.get_json() or {}
            title = (d.get('title') or '').strip()
            if not title:
                return jsonify({'error': 'title is required'}), 400
            db = get_db()
            slug = (d.get('slug') or '').strip() or _blog_slug(title)
            # Ensure the slug is unique.
            exists = db.execute('SELECT 1 FROM blog_posts WHERE slug=?', (slug,)).fetchone()
            if exists:
                slug = f'{slug}-{str(uuid.uuid4())[:6]}'
            pid = str(uuid.uuid4())
            db.execute(
                '''INSERT INTO blog_posts (id,slug,title,excerpt,cover,body,author_id,author_name,tags,is_published)
                   VALUES(?,?,?,?,?,?,?,?,?,?)''',
                (pid, slug, title, d.get('excerpt', ''), d.get('cover', ''), d.get('body', ''),
                 g.current_user['user_id'], d.get('author_name') or g.current_user.get('name') or 'LearnAfrica',
                 json.dumps(d.get('tags', [])) if isinstance(d.get('tags'), (list, dict)) else (d.get('tags') or ''),
                 1 if d.get('is_published', True) else 0))
            db.commit()
            audit('blog_create', 'blog', pid, title, {'slug': slug})
            return jsonify({'message': 'Post created', 'id': pid, 'slug': slug}), 201
        except Exception as e:
            app.logger.error(f'admin_create_blog: {e}')
            return jsonify({'error': 'Could not create post', 'detail': _err_detail(e)}), 500

    @app.route('/api/admin/blog/<pid>', methods=['PUT'])
    @admin_required
    def admin_update_blog(pid):
        try:
            d = request.get_json() or {}
            db = get_db()
            row = db.execute('SELECT * FROM blog_posts WHERE id=?', (pid,)).fetchone()
            if not row:
                return jsonify({'error': 'Post not found'}), 404
            fields, params = [], []
            for col in ('title', 'excerpt', 'cover', 'body'):
                if col in d:
                    fields.append(f'{col}=?'); params.append(d[col])
            if 'tags' in d:
                fields.append('tags=?')
                params.append(json.dumps(d['tags']) if isinstance(d['tags'], (list, dict)) else (d['tags'] or ''))
            if 'is_published' in d:
                fields.append('is_published=?'); params.append(1 if d['is_published'] else 0)
            if not fields:
                return jsonify({'message': 'Nothing to update'})
            fields.append('updated_at=CURRENT_TIMESTAMP')
            params.append(pid)
            db.execute(f'UPDATE blog_posts SET {", ".join(fields)} WHERE id=?', params)
            db.commit()
            audit('blog_update', 'blog', pid, row['title'], {'fields': list(d.keys())})
            return jsonify({'message': 'Post updated'})
        except Exception as e:
            app.logger.error(f'admin_update_blog: {e}')
            return jsonify({'error': 'Could not update post', 'detail': _err_detail(e)}), 500

    @app.route('/api/admin/blog/<pid>', methods=['DELETE'])
    @admin_required
    def admin_delete_blog(pid):
        try:
            db = get_db()
            row = db.execute('SELECT title FROM blog_posts WHERE id=?', (pid,)).fetchone()
            if not row:
                return jsonify({'error': 'Post not found'}), 404
            db.execute('DELETE FROM blog_posts WHERE id=?', (pid,))
            db.commit()
            audit('blog_delete', 'blog', pid, row['title'], {})
            return jsonify({'message': 'Post deleted'})
        except Exception as e:
            app.logger.error(f'admin_delete_blog: {e}')
            return jsonify({'error': 'Could not delete post', 'detail': _err_detail(e)}), 500

    # ── REVIEWS ───────────────────────────────────────────────────────────────────
    @app.route('/api/courses/<cid>/reviews', methods=['GET'])
    def get_reviews(cid):
        db = get_db()
        rows = db.execute('SELECT * FROM reviews WHERE course_id=? ORDER BY created_at DESC',(cid,)).fetchall()
        return jsonify({'reviews': safe_list(rows)})
    
    @app.route('/api/courses/<cid>/reviews', methods=['POST'])
    @token_required
    def add_review(cid):
        try:
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
    
        except Exception as e:
            import traceback
            app.logger.error('add_review error: ' + traceback.format_exc())
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed', 'detail': _err_detail(e)}), 500
    
    # ── INSTRUCTOR ────────────────────────────────────────────────────────────────
    @app.route('/api/instructor/courses', methods=['GET'])
    @instructor_required
    def instructor_courses():
        db = get_db()
        rows = db.execute('''SELECT c.*,
                                  u.bio as instructor_bio,
                                  u.instructor_title,
                                  u.instructor_field as instructor_specialization,
                                  (SELECT COUNT(*) FROM user_enrollments WHERE course_id=c.id) as student_count,
                                  (SELECT COUNT(*) FROM lessons WHERE course_id=c.id) as lesson_count,
                                  (SELECT ROUND(AVG(rating),1) FROM reviews WHERE course_id=c.id) as real_rating
                             FROM courses c
                             LEFT JOIN users u ON u.id=c.instructor_id
                             WHERE c.instructor_id=? ORDER BY c.created_at DESC''',
                          (g.current_user['user_id'],)).fetchall()
        courses = []
        for r in rows:
            d = dict(r)
            # Use real student_count, not the cached enrollments column
            d['enrollments'] = d['student_count'] or 0
            d['thumbnail'] = default_thumbnail_for(d)
            courses.append(d)
        return jsonify({'courses': courses})
    
    @app.route('/api/instructor/courses', methods=['POST'])
    @instructor_required
    def create_course():
        try:
            d = request.get_json() or {}
            for f in ('title','description','category','difficulty'):
                if not d.get(f): return jsonify({'error': f'{f} is required'}), 400
            db = get_db()
            # Safety net: ensure new columns exist on production
            ensure_column(db, 'courses', 'min_time_seconds', 'INTEGER DEFAULT 0')
            ensure_column(db, 'courses', 'enforce_min_time', 'INTEGER DEFAULT 0')
            ensure_column(db, 'lessons', 'text_content', 'TEXT')
            ensure_column(db, 'quizzes', 'duration_seconds', 'INTEGER DEFAULT 0')
            ensure_column(db, 'quizzes', 'max_attempts', 'INTEGER DEFAULT 0')
            ins = db.execute('SELECT name,avatar FROM users WHERE id=?',(g.current_user['user_id'],)).fetchone()
            cid = str(uuid.uuid4())
            price = float(d.get('price', 0))
            # Paid courses always need a payout method. When the admin turns on
            # "require payout before courses", free courses need one too.
            _need_payout = price > 0 or _setting_flag(db, 'require_payout_before_courses', True)
            if _need_payout and _instructor_missing_payout(db, g.current_user['user_id']):
                return jsonify({'error': 'Add a payout method on your Profile page before creating a course.'}), 400
            # Parse time-tracking fields (optional, default off)
            min_time_seconds = int(d.get('min_time_seconds') or 0)
            enforce_min_time = 1 if d.get('enforce_min_time') else 0
            weeks_required = int(d.get('weeks_required') or d.get('duration_weeks') or 0)
            course_code_val = (d.get('course_code') or d.get('courseCode') or '').strip() or None
            ensure_column(db, 'courses', 'weeks_required', 'INTEGER DEFAULT 0')
            ensure_column(db, 'courses', 'course_code', 'TEXT')
            db.execute('''INSERT INTO courses (id,title,description,instructor_id,instructor_name,instructor_avatar,
                          category,difficulty,duration,price,is_free,has_certificate,has_lifetime_access,
                          has_resources,thumbnail,rating,num_reviews,min_time_seconds,enforce_min_time,weeks_required,course_code)
                          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                       (cid, d['title'], d['description'], g.current_user['user_id'],
                        ins['name'], ins['avatar'],
                        d['category'], d['difficulty'], d.get('duration','TBD'),
                        price, 1 if price == 0 else 0,
                        int(bool(d.get('hasCertificate'))),
                        int(bool(d.get('hasLifetimeAccess', True))),
                        int(bool(d.get('hasResources'))),
                        d.get('thumbnail', '/placeholder.jpg'),
                        float(d.get('initial_rating', 4.5) or 4.5),
                        int(d.get('initial_reviews', 0) or 0),
                        min_time_seconds, enforce_min_time, weeks_required, course_code_val))
            for tag in d.get('tags', []):
                db.execute('INSERT INTO course_tags (course_id,tag) VALUES(?,?)',(cid,tag))
            for outcome in d.get('learningOutcomes', []):
                db.execute('INSERT INTO course_outcomes (course_id,outcome) VALUES(?,?)',(cid,outcome))
            # FIX: this used to read only from a nested `perks` object. If a
            # caller sent hasCertificate/hasResources/etc. at the top level
            # only (as one of the two INSERT statements in this same function
            # already does for the courses table itself), course_perks would
            # silently end up with certificate/lifetime/resources all False,
            # regardless of what was actually requested. Both shapes are now
            # accepted, with the nested `perks` object taking precedence when
            # both are present.
            perks_raw = d.get('perks') or {}
            def _perk(key, top_level_key, default=False):
                if key in perks_raw:
                    return bool(perks_raw.get(key))
                return bool(d.get(top_level_key, default))
            has_cert_flag     = _perk('hasCertificate', 'hasCertificate', False)
            lifetime_flag     = _perk('lifetimeAccess', 'hasLifetimeAccess', True)
            has_resources_flag = _perk('hasResources', 'hasResources', False)
            # Auto-derive has_resources: if any course-level or lesson-level
            # resources were uploaded, force the flag to True so students see them.
            if not has_resources_flag:
                if d.get('course_resources'):
                    has_resources_flag = True
                else:
                    for sec_check in d.get('curriculum', []):
                        for les_check in sec_check.get('lessons', []) or []:
                            if les_check.get('resources'):
                                has_resources_flag = True
                                break
                        if has_resources_flag: break
            db.execute('''INSERT INTO course_perks (course_id,has_certificate,lifetime_access,has_resources)
                          VALUES(?,?,?,?)''',
                       (cid, int(has_cert_flag), int(lifetime_flag), int(has_resources_flag)))
            # Save course-level resources from the payload (skip blob: URLs)
            for res in d.get('course_resources', []) or []:
                try:
                    if res.get('title') and res.get('url') and not str(res['url']).startswith('blob:'):
                        db.execute(
                            'INSERT INTO course_resources (id,course_id,title,url,file_type) VALUES(?,?,?,?,?)',
                            (str(uuid.uuid4()), cid, res['title'], res['url'], res.get('file_type','file'))
                        )
                except Exception as _res_err:
                    app.logger.warning(f'course_resources insert failed (non-fatal): {_res_err}')
            for si, sec in enumerate(d.get('curriculum', [])):
                sid = str(uuid.uuid4())
                db.execute('INSERT INTO curriculum_sections (id,course_id,title,"order") VALUES(?,?,?,?)',
                           (sid, cid, sec.get('title','Section'), si))
                for li, les in enumerate(sec.get('lessons', [])):
                    leid = str(uuid.uuid4())
                    db.execute('''INSERT INTO lessons (id,course_id,title,description,duration,video_url,content,type,is_final,"order",text_content,duration_seconds,component_key)
                                  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                               (leid, cid, les.get('title','Lesson'), les.get('description',''),
                                les.get('duration','30 min'), les.get('videoUrl','') or les.get('video_url',''),
                                sanitize_html(les.get('content','')), les.get('type','video'),
                                1 if les.get('is_final') else 0, li,
                                les.get('text_content') or les.get('textContent') or '',
                                int(les.get('duration_seconds') or 0),
                                les.get('component_key') or les.get('componentKey') or None))
                    # Per-lesson resources (skip blob: URLs - those are unuploaded files)
                    for res in les.get('resources', []):
                        if res.get('title') and res.get('url') and not res['url'].startswith('blob:'):
                            db.execute('INSERT INTO lesson_resources (id,lesson_id,title,url,type) VALUES(?,?,?,?,?)',
                                       (str(uuid.uuid4()), leid, res['title'], res['url'], res.get('file_type','file')))
                    db.execute('INSERT INTO section_lessons (section_id,lesson_id,"order") VALUES(?,?,?)',(sid,leid,li))
                    if les.get('type') == 'quiz' and les.get('questions'):
                        qzid = str(uuid.uuid4())
                        # Accept duration_seconds (preferred) or fall back to text duration
                        q_dur_sec = int(les.get('duration_seconds') or les.get('quiz_duration_seconds') or 0)
                        q_dur_text = les.get('duration') or ('No limit' if q_dur_sec == 0 else f'{q_dur_sec // 60} min')
                        q_max_att = max(0, int(les.get('max_attempts') or 0))
                        q_per_att = max(0, int(les.get('questions_per_attempt') or 0))
                        q_shuf_q  = 1 if les.get('shuffle_questions') else 0
                        q_shuf_o  = 1 if les.get('shuffle_options') else 0
                        db.execute('INSERT INTO quizzes (id,course_id,lesson_id,title,duration,duration_seconds,max_attempts,'
                                   'questions_per_attempt,shuffle_questions,shuffle_options) VALUES(?,?,?,?,?,?,?,?,?,?)',
                                   (qzid, cid, leid, les.get('title','Quiz'), q_dur_text, q_dur_sec, q_max_att,
                                    q_per_att, q_shuf_q, q_shuf_o))
                        for qi, q in enumerate(les['questions']):
                            db.execute('''INSERT INTO quiz_questions (id,quiz_id,question_text,options,correct_answer,question_type,"order")
                                          VALUES(?,?,?,?,?,?,?)''',
                                       (str(uuid.uuid4()), qzid, q.get('text',''),
                                        json.dumps(q.get('options',[])), q.get('correctAnswer',0),
                                        q.get('question_type','mcq'), qi))
            db.commit()
            return jsonify({'message': 'Course created', 'course_id': cid}), 201
    
    
    
        except Exception as e:
            import traceback
            app.logger.error('create_course error: ' + traceback.format_exc())
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to create course', 'detail': _err_detail(e)}), 500
    
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
            cd['thumbnail'] = default_thumbnail_for(cd)
            return jsonify({'course': cd})
        except Exception as e:
            import traceback
            app.logger.error(f'preview_course error: {traceback.format_exc()}')
            return jsonify({'error': 'Failed to load preview', 'detail': _err_detail(e)}), 500

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
            return jsonify({'error': 'Failed to load lesson preview', 'detail': _err_detail(e)}), 500

    @app.route('/api/instructor/courses/<cid>', methods=['GET'])
    @instructor_required
    def instructor_get_course(cid):
        db = get_db()
        # Safety net: ensure new columns exist on production
        ensure_column(db, 'courses', 'min_time_seconds', 'INTEGER DEFAULT 0')
        ensure_column(db, 'courses', 'enforce_min_time', 'INTEGER DEFAULT 0')
        ensure_column(db, 'lessons', 'text_content', 'TEXT')
        ensure_column(db, 'quizzes', 'duration_seconds', 'INTEGER DEFAULT 0')
        ensure_column(db, 'quizzes', 'max_attempts', 'INTEGER DEFAULT 0')
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
                        try:
                            ld['duration_seconds'] = int(quiz['duration_seconds'] or 0)
                        except Exception:
                            ld['duration_seconds'] = 0
                        try:
                            ld['max_attempts'] = int(quiz['max_attempts'] or 0)
                        except Exception:
                            ld['max_attempts'] = 0
                        # Anti-cheat settings, so the instructor editor can show
                        # their current values when re-opening a course.
                        try:
                            ld['questions_per_attempt'] = int(quiz['questions_per_attempt'] or 0)
                        except Exception:
                            ld['questions_per_attempt'] = 0
                        try:
                            ld['shuffle_questions'] = bool(quiz['shuffle_questions'])
                        except Exception:
                            ld['shuffle_questions'] = False
                        try:
                            ld['shuffle_options'] = bool(quiz['shuffle_options'])
                        except Exception:
                            ld['shuffle_options'] = False
                        questions = [dict(q) for q in db.execute(
                            'SELECT * FROM quiz_questions WHERE quiz_id=? ORDER BY "order"', (quiz['id'],)).fetchall()]
                        for q in questions:
                            import json as _json
                            try: q['options'] = _json.loads(q['options']) if isinstance(q['options'], str) else q['options']
                            except: q['options'] = ['','','','']
                        ld['questions'] = questions
                    else:
                        ld['questions'] = []
                        ld['duration_seconds'] = 0
                lessons.append(ld)
            sd['lessons'] = lessons
            sections.append(sd)
        cd['sections'] = sections
        # Auto-sum lesson seconds for "Hours required" display
        try:
            tot = db.execute(
                'SELECT COALESCE(SUM(duration_seconds),0) as t FROM lessons WHERE course_id=?',
                (cid,)
            ).fetchone()
            cd['hours_required_seconds'] = int(tot['t'] or 0) if tot else 0
        except Exception:
            cd['hours_required_seconds'] = 0
        cd['thumbnail'] = default_thumbnail_for(cd)
        return jsonify({'course': cd})

    @app.route('/api/instructor/courses/<cid>', methods=['PUT'])
    @instructor_required
    def update_course(cid):
        try:
            db = get_db()
            # Safety net: ensure new columns exist on production. Run these in their own
            # mini-transactions so a failure here can't poison the rest of the request.
            for col, sql_type in [
                ('min_time_seconds', 'INTEGER DEFAULT 0'),
                ('enforce_min_time', 'INTEGER DEFAULT 0'),
                ('weeks_required',   'INTEGER DEFAULT 0'),
                ('course_code',      'TEXT'),
            ]:
                ensure_column(db, 'courses', col, sql_type)
            ensure_column(db, 'lessons', 'text_content', 'TEXT')
            ensure_column(db, 'lessons', 'duration_seconds', 'INTEGER DEFAULT 0')
            ensure_column(db, 'quizzes', 'duration_seconds', 'INTEGER DEFAULT 0')
            ensure_column(db, 'quizzes', 'max_attempts', 'INTEGER DEFAULT 0')

            row = db.execute('SELECT instructor_id FROM courses WHERE id=?',(cid,)).fetchone()
            if not row: return jsonify({'error': 'Course not found'}), 404
            if row['instructor_id'] != g.current_user['user_id'] and g.current_user['role'] not in ('admin','superadmin'):
                return jsonify({'error': 'Forbidden'}), 403
            d = request.get_json() or {}
            if 'price' in d and float(d['price'] or 0) > 0 and _instructor_missing_payout(db, row['instructor_id']):
                msg = ('Add a payout method on your Profile page before making this course paid.'
                       if row['instructor_id'] == g.current_user['user_id']
                       else 'The course instructor must add a payout method before this course can be paid.')
                return jsonify({'error': msg}), 400
    
            # Update core fields
            fields, vals = [], []
            for f in ('title','description','category','difficulty','duration','price','thumbnail'):
                if f in d:
                    fields.append(f'{f}=?'); vals.append(d[f])
            if 'initial_rating' in d: fields.append('rating=?'); vals.append(float(d['initial_rating']))
            if 'initial_reviews' in d: fields.append('num_reviews=?'); vals.append(int(d['initial_reviews']))
            if 'min_time_seconds' in d:
                fields.append('min_time_seconds=?'); vals.append(int(d['min_time_seconds'] or 0))
            if 'enforce_min_time' in d:
                fields.append('enforce_min_time=?'); vals.append(1 if d['enforce_min_time'] else 0)
            if 'weeks_required' in d or 'duration_weeks' in d:
                w = int(d.get('weeks_required') or d.get('duration_weeks') or 0)
                fields.append('weeks_required=?'); vals.append(w)
            if 'course_code' in d or 'courseCode' in d:
                cc = (d.get('course_code') or d.get('courseCode') or '').strip() or None
                fields.append('course_code=?'); vals.append(cc)
            if 'price' in d:
                price_val = float(d['price']) if d['price'] else 0
                fields.append('is_free=?')
                vals.append(1 if price_val == 0 else 0)
            if fields:
                vals.append(cid)
                db.execute(f'UPDATE courses SET {",".join(fields)},updated_at=CURRENT_TIMESTAMP WHERE id=?', vals)
            db.commit()  # commit core fields so later failures don't undo them

            # Update tags if provided
            if 'tags' in d:
                try:
                    db.execute('DELETE FROM course_tags WHERE course_id=?', (cid,))
                    for tag in d['tags']:
                        if tag and str(tag).strip():
                            db.execute('INSERT INTO course_tags (course_id,tag) VALUES(?,?)', (cid, str(tag).strip()))
                    db.commit()
                except Exception as tag_err:
                    app.logger.warning(f'tags update failed (non-fatal): {tag_err}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass

            # Update outcomes if provided
            if 'learningOutcomes' in d:
                try:
                    db.execute('DELETE FROM course_outcomes WHERE course_id=?', (cid,))
                    for outcome in d['learningOutcomes']:
                        if outcome and outcome.strip():
                            db.execute('INSERT INTO course_outcomes (course_id,outcome) VALUES(?,?)', (cid, outcome.strip()))
                    db.commit()
                except Exception as out_err:
                    app.logger.warning(f'outcomes update failed (non-fatal): {out_err}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
    
            # Update perks if provided
            if 'perks' in d:
                try:
                    p = d['perks']
                    # Use DELETE+INSERT pattern instead of ON CONFLICT to be safer across DBs
                    db.execute('DELETE FROM course_perks WHERE course_id=?', (cid,))
                    # Auto-derive has_resources when uploads exist
                    has_res_flag = bool(p.get('hasResources'))
                    if not has_res_flag:
                        if d.get('course_resources'):
                            has_res_flag = True
                        else:
                            for _sec in d.get('curriculum', []) or []:
                                for _les in _sec.get('lessons', []) or []:
                                    if _les.get('resources'):
                                        has_res_flag = True; break
                                if has_res_flag: break
                    db.execute(
                        'INSERT INTO course_perks (course_id,has_certificate,lifetime_access,has_resources) VALUES(?,?,?,?)',
                        (cid, int(bool(p.get('hasCertificate'))),
                         int(bool(p.get('lifetimeAccess', True))),
                         int(has_res_flag))
                    )
                    db.commit()
                except Exception as perk_err:
                    app.logger.warning(f'perks update failed (non-fatal): {perk_err}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
    
            # Rebuild curriculum — PRESERVE existing lesson IDs so students don't get "lesson not found"
            if 'curriculum' in d:
                # Rebuild course-level resources: delete all + re-insert (last-write-wins)
                if 'course_resources' in d:
                    try:
                        db.execute('DELETE FROM course_resources WHERE course_id=?', (cid,))
                        for res in d.get('course_resources', []) or []:
                            if res.get('title') and res.get('url') and not str(res['url']).startswith('blob:'):
                                db.execute(
                                    'INSERT INTO course_resources (id,course_id,title,url,file_type) VALUES(?,?,?,?,?)',
                                    (str(uuid.uuid4()), cid, res['title'], res['url'], res.get('file_type','file'))
                                )
                    except Exception as _cr_err:
                        app.logger.warning(f'course_resources rebuild failed (non-fatal): {_cr_err}')
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
                        text_content_val = les.get('text_content') or les.get('textContent') or ''
                        lesson_duration_seconds = int(les.get('duration_seconds') or 0)
                        component_key_val = les.get('component_key') or les.get('componentKey') or None
                        if incoming_id:
                            db.execute('''UPDATE lessons SET title=?,description=?,duration=?,video_url=?,
                                           content=?,type=?,is_final=?,"order"=?,text_content=?,duration_seconds=?,component_key=? WHERE id=?''',
                                       (les.get('title','Lesson'), les.get('description',''),
                                        les.get('duration','30 min'), les.get('videoUrl','') or les.get('video_url',''),
                                        sanitize_html(les.get('content','')), les.get('type','video'),
                                        1 if les.get('is_final') else 0, li, text_content_val,
                                        lesson_duration_seconds, component_key_val, leid))
                        else:
                            db.execute('''INSERT INTO lessons (id,course_id,title,description,duration,video_url,content,type,is_final,"order",text_content,duration_seconds,component_key)
                                          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                                       (leid, cid, les.get('title','Lesson'), les.get('description',''),
                                        les.get('duration','30 min'), les.get('videoUrl','') or les.get('video_url',''),
                                        sanitize_html(les.get('content','')), les.get('type','video'),
                                        1 if les.get('is_final') else 0, li, text_content_val,
                                        lesson_duration_seconds, component_key_val))
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
                            q_dur_sec = int(les.get('duration_seconds') or les.get('quiz_duration_seconds') or 0)
                            q_dur_text = les.get('duration') or ('No limit' if q_dur_sec == 0 else f'{q_dur_sec // 60} min')
                            q_max_att = max(0, int(les.get('max_attempts') or 0))
                            q_per_att = max(0, int(les.get('questions_per_attempt') or 0))
                            q_shuf_q  = 1 if les.get('shuffle_questions') else 0
                            q_shuf_o  = 1 if les.get('shuffle_options') else 0
                            db.execute('INSERT INTO quizzes (id,course_id,lesson_id,title,duration,duration_seconds,max_attempts,'
                                       'questions_per_attempt,shuffle_questions,shuffle_options) VALUES(?,?,?,?,?,?,?,?,?,?)',
                                       (qzid, cid, leid, les.get('title','Quiz'), q_dur_text, q_dur_sec, q_max_att,
                                        q_per_att, q_shuf_q, q_shuf_o))
                            for qi, q in enumerate(les['questions']):
                                db.execute('''INSERT INTO quiz_questions (id,quiz_id,question_text,options,correct_answer,question_type,"order")
                                              VALUES(?,?,?,?,?,?,?)''',
                                           (str(uuid.uuid4()), qzid, q.get('text',''),
                                            json.dumps(q.get('options',[])), q.get('correctAnswer',0),
                                            q.get('question_type','mcq'), qi))
    
            db.commit()
            return jsonify({'message': 'Course updated', 'course_id': cid})
    
        except Exception as e:
            import traceback
            app.logger.error('update_course error: ' + traceback.format_exc())
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to update course', 'detail': _err_detail(e)}), 500
    
    @app.route('/api/instructor/courses/<cid>', methods=['DELETE'])
    @instructor_required
    def delete_course(cid):
        db = get_db()
        c = db.execute('SELECT instructor_id FROM courses WHERE id=?',(cid,)).fetchone()
        if not c: return jsonify({'error': 'Not found'}), 404
        if c['instructor_id'] != g.current_user['user_id'] and g.current_user['role'] not in ('admin','superadmin'):
            return jsonify({'error': 'Forbidden'}), 403
        row = db.execute('SELECT title FROM courses WHERE id=?', (cid,)).fetchone()
        db.execute('DELETE FROM courses WHERE id=?',(cid,))
        db.commit()
        # Only admin-initiated deletions of other people's courses belong in the
        # admin audit trail; an instructor deleting their own is routine.
        if g.current_user['role'] in ('admin', 'superadmin') and c['instructor_id'] != g.current_user['user_id']:
            audit('delete_course', 'course', cid, row['title'] if row else None, {})
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
        ensure_transactions_table(db)
        earnings_row = db.execute(
            "SELECT COALESCE(SUM(instructor_share), 0) as t FROM transactions"
            " WHERE instructor_id=? AND type='purchase' AND status='success'", (uid,)).fetchone()
        total_earnings = round(float(earnings_row['t'] or 0), 2) if earnings_row else 0.0
        # Earnings breakdown by payout state. Manual payouts (admin pays from
        # their own account and marks it sent) leave the row as 'pending' with a
        # payout request in flight, so subtract requested amounts to get what is
        # still available to request.
        paid_row = db.execute(
            "SELECT COALESCE(SUM(instructor_share), 0) as t FROM transactions"
            " WHERE instructor_id=? AND type='purchase' AND status='success'"
            " AND payout_status='paid'", (uid,)).fetchone()
        total_paid = round(float(paid_row['t'] or 0), 2) if paid_row else 0.0
        req_row = db.execute(
            "SELECT COALESCE(SUM(amount), 0) as t FROM payout_requests"
            " WHERE instructor_id=? AND status='requested'", (uid,)).fetchone()
        requested = round(float(req_row['t'] or 0), 2) if req_row else 0.0
        available = round(max(0.0, total_earnings - total_paid - requested), 2)
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
            'total_paid': total_paid, 'pending_payout': requested, 'available_to_request': available,
        })

    # ────────────────────────────────────────────────────────────────────────
    # ── INSTRUCTOR ANALYTICS (no AI — pure aggregation)
    # ────────────────────────────────────────────────────────────────────────

    @app.route('/api/instructor/analytics/enrollments-timeline', methods=['GET'])
    @instructor_required
    def analytics_enrollments_timeline():
        _ensure_new_tables()
        """Return enrollments per week for the last 12 weeks, for all courses
        owned by the current instructor. Pure count query, no AI."""
        db = get_db()
        uid = g.current_user['user_id']
        use_pg = app.config.get('USE_POSTGRES')
        course_rows = db.execute('SELECT id FROM courses WHERE instructor_id=?', (uid,)).fetchall()
        course_ids = [r['id'] for r in course_rows]
        if not course_ids:
            return jsonify({'weeks': [], 'total_last_30_days': 0})
        ph = ','.join(['?'] * len(course_ids))
        # Get all enrollments in last 12 weeks, group by week
        if use_pg:
            rows = db.execute(
                f"SELECT DATE_TRUNC('week', enrolled_at)::text as week, COUNT(*) as c "
                f"FROM user_enrollments WHERE course_id IN ({ph}) "
                f"AND enrolled_at >= NOW() - INTERVAL '12 weeks' "
                f"GROUP BY week ORDER BY week",
                course_ids
            ).fetchall()
            recent = db.execute(
                f"SELECT COUNT(*) as c FROM user_enrollments WHERE course_id IN ({ph}) "
                f"AND enrolled_at >= NOW() - INTERVAL '30 days'",
                course_ids
            ).fetchone()
        else:
            rows = db.execute(
                f"SELECT strftime('%Y-%W', enrolled_at) as week, COUNT(*) as c "
                f"FROM user_enrollments WHERE course_id IN ({ph}) "
                f"AND enrolled_at >= date('now','-12 weeks') "
                f"GROUP BY week ORDER BY week",
                course_ids
            ).fetchall()
            recent = db.execute(
                f"SELECT COUNT(*) as c FROM user_enrollments WHERE course_id IN ({ph}) "
                f"AND enrolled_at >= date('now','-30 days')",
                course_ids
            ).fetchone()
        return jsonify({
            'weeks': [{'week': str(r['week']), 'count': int(r['c'])} for r in rows],
            'total_last_30_days': int(recent['c'] or 0) if recent else 0,
        })

    @app.route('/api/instructor/analytics/per-course', methods=['GET'])
    @instructor_required
    def analytics_per_course():
        _ensure_new_tables()
        """Per-course table: enrollments, revenue, completion %, rating.
        One row per course owned by the instructor."""
        db = get_db()
        uid = g.current_user['user_id']
        instructor_pct, _ = get_revenue_split(db)
        # Admin-owned courses get 100%, non-admin get configured split
        u = db.execute('SELECT role FROM users WHERE id=?', (uid,)).fetchone()
        is_admin = u and u['role'] in ('admin', 'superadmin')
        share_pct = 100 if is_admin else instructor_pct
        courses = db.execute(
            'SELECT id, title, price, rating FROM courses WHERE instructor_id=? ORDER BY created_at DESC',
            (uid,)
        ).fetchall()
        results = []
        for c in courses:
            total_row = db.execute(
                'SELECT COUNT(*) as t, COUNT(CASE WHEN progress=100 THEN 1 END) as d '
                'FROM user_enrollments WHERE course_id=?', (c['id'],)
            ).fetchone()
            total = int(total_row['t'] or 0) if total_row else 0
            done  = int(total_row['d'] or 0) if total_row else 0
            revenue = round(float(c['price'] or 0) * total * (share_pct / 100.0), 2)
            results.append({
                'course_id':      c['id'],
                'title':          c['title'],
                'enrollments':    total,
                'revenue':        revenue,
                'completion_rate': int(done / total * 100) if total else 0,
                'rating':         round(float(c['rating'] or 0), 1),
            })
        return jsonify({'courses': results})

    @app.route('/api/instructor/analytics/lesson-dropoff/<course_id>', methods=['GET'])
    @instructor_required
    def analytics_lesson_dropoff(course_id):
        _ensure_new_tables()
        """For a specific course, show how many students reached each lesson.
        Useful for spotting the exact lesson where students give up."""
        db = get_db()
        uid = g.current_user['user_id']
        # Verify ownership
        course = db.execute('SELECT id, instructor_id, title FROM courses WHERE id=?', (course_id,)).fetchone()
        if not course:
            return jsonify({'error': 'Course not found'}), 404
        user_row = db.execute('SELECT role FROM users WHERE id=?', (uid,)).fetchone()
        is_admin = user_row and user_row['role'] in ('admin', 'superadmin')
        if course['instructor_id'] != uid and not is_admin:
            return jsonify({'error': 'Forbidden'}), 403

        # Get ordered lessons in this course
        lessons = db.execute(
            'SELECT l.id, l.title, l."order" as order_n FROM lessons l '
            'WHERE l.course_id=? ORDER BY l."order"',
            (course_id,)
        ).fetchall()
        # For each lesson, count how many students have a progress entry
        # (i.e. they at least started it). We use lesson_progress if it exists.
        lesson_data = []
        biggest_drop = 0
        biggest_drop_at = None
        prev_count = None
        for l in lessons:
            try:
                cnt_row = db.execute(
                    'SELECT COUNT(DISTINCT user_id) as c FROM lesson_progress WHERE lesson_id=?',
                    (l['id'],)
                ).fetchone()
                count = int(cnt_row['c'] or 0) if cnt_row else 0
            except Exception:
                # lesson_progress table may not exist yet; fall back to 0
                count = 0
            item = {'lesson_id': l['id'], 'title': l['title'], 'reached_count': count}
            lesson_data.append(item)
            if prev_count is not None:
                drop = prev_count - count
                if drop > biggest_drop:
                    biggest_drop = drop
                    biggest_drop_at = {
                        'from_lesson': lesson_data[-2]['title'],
                        'to_lesson':   l['title'],
                        'students_lost': drop,
                    }
            prev_count = count

        return jsonify({
            'course_id':  course_id,
            'course_title': course['title'],
            'lessons':    lesson_data,
            'biggest_drop': biggest_drop_at,
        })

    # ────────────────────────────────────────────────────────────────────────
    # ── LIVE COHORT SESSIONS
    # ────────────────────────────────────────────────────────────────────────
    def _serialize_session(row, db=None, user_id=None):
        d = safe_dict(row)
        d['duration_minutes'] = int(d.get('duration_minutes') or 60)
        # RSVP count
        if db is not None:
            try:
                cnt = db.execute('SELECT COUNT(*) as c FROM live_session_rsvps WHERE session_id=?', (d['id'],)).fetchone()
                d['rsvp_count'] = int(cnt['c'] or 0) if cnt else 0
            except Exception:
                d['rsvp_count'] = 0
            if user_id:
                try:
                    my = db.execute('SELECT 1 FROM live_session_rsvps WHERE session_id=? AND user_id=?', (d['id'], user_id)).fetchone()
                    d['i_rsvped'] = bool(my)
                except Exception:
                    d['i_rsvped'] = False
        return d

    @app.route('/api/courses/<course_id>/live-sessions', methods=['GET'])
    def list_live_sessions(course_id):
        _ensure_new_tables()
        """List all live sessions for a course. Public — anyone can see the
        schedule (helps market the course). RSVP requires enrollment."""
        db = get_db()
        rows = db.execute(
            'SELECT * FROM live_sessions WHERE course_id=? ORDER BY scheduled_at DESC',
            (course_id,)
        ).fetchall()
        # Resolve the viewer from the token (this route is public). `decode_token`
        # is the real helper — `decode_jwt` does not exist, so the old import
        # raised ImportError and every caller silently looked anonymous.
        user_id, viewer_role = None, None
        try:
            p = decode_token(_get_token())
            if p:
                vr = db.execute('SELECT role, is_active FROM users WHERE id=?',
                                (p.get('user_id'),)).fetchone()
                if vr and (vr['is_active'] is None or int(vr['is_active'])):
                    user_id, viewer_role = p.get('user_id'), vr['role']
        except Exception:
            pass
        # A live session's join link and recording are paid-course content: only
        # the course owner, admins, or an enrolled student may see them. The
        # schedule stays public so the course can still be marketed.
        owner = db.execute('SELECT instructor_id FROM courses WHERE id=?', (course_id,)).fetchone()
        can_join = bool(viewer_role in ('admin', 'superadmin')) or (
            owner and owner['instructor_id'] == user_id)
        if not can_join and user_id:
            can_join = bool(db.execute(
                'SELECT 1 FROM user_enrollments WHERE user_id=? AND course_id=?',
                (user_id, course_id)).fetchone())
        sessions = [_serialize_session(r, db, user_id) for r in rows]
        if not can_join:
            for s in sessions:
                s.pop('meeting_url', None)
                s.pop('recording_url', None)
        return jsonify({'sessions': sessions})

    @app.route('/api/instructor/courses/<course_id>/live-sessions', methods=['POST'])
    @instructor_required
    def create_live_session(course_id):
        _ensure_new_tables()
        """Instructor creates a scheduled live session.
        Body: { title, description?, scheduled_at (ISO), duration_minutes, meeting_url }
        """
        try:
            db = get_db()
            uid = g.current_user['user_id']
            user_row = db.execute('SELECT role FROM users WHERE id=?', (uid,)).fetchone()
            is_admin = user_row and user_row['role'] in ('admin', 'superadmin')
            course = db.execute('SELECT id, instructor_id FROM courses WHERE id=?', (course_id,)).fetchone()
            if not course:
                return jsonify({'error': 'Course not found'}), 404
            if course['instructor_id'] != uid and not is_admin:
                return jsonify({'error': 'You can only create sessions for your own courses.'}), 403

            body = request.get_json() or {}
            title = (body.get('title') or '').strip()
            scheduled_at = (body.get('scheduled_at') or '').strip()
            meeting_url  = (body.get('meeting_url') or '').strip()
            if not title:
                return jsonify({'error': 'Title is required.'}), 400
            if not scheduled_at:
                return jsonify({'error': 'Scheduled date/time is required.'}), 400
            if not meeting_url:
                return jsonify({'error': 'Meeting URL (Zoom/Meet/etc.) is required.'}), 400
            if not (meeting_url.startswith('http://') or meeting_url.startswith('https://')):
                return jsonify({'error': 'Meeting URL must start with http:// or https://'}), 400
            try:
                duration = int(body.get('duration_minutes') or 60)
                if duration <= 0 or duration > 720: duration = 60
            except (TypeError, ValueError):
                duration = 60

            sid = str(uuid.uuid4())
            db.execute(
                '''INSERT INTO live_sessions
                   (id, course_id, instructor_id, title, description, scheduled_at,
                    duration_minutes, meeting_url, recording_url, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)''',
                (sid, course_id, uid, title, (body.get('description') or ''),
                 scheduled_at, duration, meeting_url, body.get('recording_url') or None)
            )
            db.commit()
            row = db.execute('SELECT * FROM live_sessions WHERE id=?', (sid,)).fetchone()
            return jsonify({'session': _serialize_session(row, db, uid)}), 201
        except Exception as e:
            app.logger.error(f'create_live_session FAILED: {e}')
            return jsonify({'error': 'Failed to create session', 'detail': _err_detail(e)}), 500

    @app.route('/api/instructor/live-sessions/<session_id>', methods=['PUT'])
    @instructor_required
    def update_live_session(session_id):
        _ensure_new_tables()
        """Update a live session. Owner-only."""
        try:
            db = get_db()
            uid = g.current_user['user_id']
            row = db.execute('SELECT * FROM live_sessions WHERE id=?', (session_id,)).fetchone()
            if not row:
                return jsonify({'error': 'Session not found'}), 404
            user_row = db.execute('SELECT role FROM users WHERE id=?', (uid,)).fetchone()
            is_admin = user_row and user_row['role'] in ('admin', 'superadmin')
            if row['instructor_id'] != uid and not is_admin:
                return jsonify({'error': 'Forbidden'}), 403
            body = request.get_json() or {}
            fields = []
            values = []
            for key, col in [('title','title'), ('description','description'),
                             ('scheduled_at','scheduled_at'), ('meeting_url','meeting_url'),
                             ('recording_url','recording_url')]:
                if key in body:
                    fields.append(f'{col}=?'); values.append(body[key])
            if 'duration_minutes' in body:
                try:
                    dur = int(body['duration_minutes'])
                    if dur > 0 and dur <= 720:
                        fields.append('duration_minutes=?'); values.append(dur)
                except (TypeError, ValueError): pass
            if not fields:
                return jsonify({'error': 'Nothing to update.'}), 400
            values.append(session_id)
            db.execute(f'UPDATE live_sessions SET {", ".join(fields)} WHERE id=?', tuple(values))
            db.commit()
            row = db.execute('SELECT * FROM live_sessions WHERE id=?', (session_id,)).fetchone()
            return jsonify({'session': _serialize_session(row, db, uid)})
        except Exception as e:
            app.logger.error(f'update_live_session FAILED: {e}')
            return jsonify({'error': 'Failed to update session', 'detail': _err_detail(e)}), 500

    @app.route('/api/instructor/live-sessions/<session_id>', methods=['DELETE'])
    @instructor_required
    def delete_live_session(session_id):
        _ensure_new_tables()
        try:
            db = get_db()
            uid = g.current_user['user_id']
            row = db.execute('SELECT * FROM live_sessions WHERE id=?', (session_id,)).fetchone()
            if not row:
                return jsonify({'error': 'Session not found'}), 404
            user_row = db.execute('SELECT role FROM users WHERE id=?', (uid,)).fetchone()
            is_admin = user_row and user_row['role'] in ('admin', 'superadmin')
            if row['instructor_id'] != uid and not is_admin:
                return jsonify({'error': 'Forbidden'}), 403
            db.execute('DELETE FROM live_session_rsvps WHERE session_id=?', (session_id,))
            db.execute('DELETE FROM live_sessions WHERE id=?', (session_id,))
            db.commit()
            return jsonify({'message': 'Session deleted', 'id': session_id})
        except Exception as e:
            app.logger.error(f'delete_live_session FAILED: {e}')
            return jsonify({'error': 'Failed to delete session'}), 500

    @app.route('/api/live-sessions/<session_id>/rsvp', methods=['POST'])
    @token_required
    def rsvp_live_session(session_id):
        _ensure_new_tables()
        """Student RSVPs to a live session. Must be enrolled in the course."""
        try:
            db = get_db()
            uid = g.current_user['user_id']
            row = db.execute('SELECT * FROM live_sessions WHERE id=?', (session_id,)).fetchone()
            if not row:
                return jsonify({'error': 'Session not found'}), 404
            enrolled = db.execute(
                'SELECT 1 FROM user_enrollments WHERE user_id=? AND course_id=?',
                (uid, row['course_id'])
            ).fetchone()
            if not enrolled:
                return jsonify({'error': 'You must be enrolled in this course to RSVP.'}), 403
            # Insert if not already present
            existing = db.execute(
                'SELECT 1 FROM live_session_rsvps WHERE session_id=? AND user_id=?',
                (session_id, uid)
            ).fetchone()
            if not existing:
                db.execute(
                    'INSERT INTO live_session_rsvps (session_id, user_id, rsvped_at) VALUES (?,?,CURRENT_TIMESTAMP)',
                    (session_id, uid)
                )
                db.commit()
            return jsonify({'message': 'RSVP confirmed', 'i_rsvped': True})
        except Exception as e:
            app.logger.error(f'rsvp_live_session FAILED: {e}')
            return jsonify({'error': 'Failed to RSVP', 'detail': _err_detail(e)}), 500

    @app.route('/api/live-sessions/<session_id>/rsvp', methods=['DELETE'])
    @token_required
    def unrsvp_live_session(session_id):
        _ensure_new_tables()
        try:
            db = get_db()
            uid = g.current_user['user_id']
            db.execute(
                'DELETE FROM live_session_rsvps WHERE session_id=? AND user_id=?',
                (session_id, uid)
            )
            db.commit()
            return jsonify({'message': 'RSVP removed', 'i_rsvped': False})
        except Exception as e:
            app.logger.error(f'unrsvp_live_session FAILED: {e}')
            return jsonify({'error': 'Failed to remove RSVP'}), 500

    @app.route('/api/admin/audit-log', methods=['GET'])
    @admin_required
    def admin_audit_log():
        """Read the admin audit trail. Newest first, paginated and filterable."""
        try:
            db = get_db()
            limit  = min(max(int(request.args.get('limit', 100)), 1), 500)
            offset = max(int(request.args.get('offset', 0)), 0)
            action = (request.args.get('action') or '').strip()
            where, params = '', []
            if action:
                where = ' WHERE action LIKE ?'
                params.append(f'%{action}%')
            rows = db.execute(
                f'''SELECT id,actor_id,actor_name,actor_role,action,target_type,target_id,
                           target_label,details,ip,CAST(created_at AS TEXT) AS created_at
                    FROM audit_log{where}
                    ORDER BY created_at DESC LIMIT ? OFFSET ?''',
                params + [limit, offset]).fetchall()
            total = db.execute(f'SELECT COUNT(*) AS c FROM audit_log{where}', params).fetchone()['c']
            return jsonify({'log': safe_list(rows), 'total': total, 'limit': limit, 'offset': offset})
        except Exception as e:
            app.logger.error(f'admin_audit_log: {e}')
            return jsonify({'log': [], 'total': 0})

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
        ensure_transactions_table(db)
        rev = db.execute(
            "SELECT COALESCE(SUM(t.amount), 0) as gross,"
            " COALESCE(SUM(CASE WHEN u.role IN ('admin','superadmin') THEN 0 ELSE t.instructor_share END), 0) as owed"
            " FROM transactions t LEFT JOIN users u ON u.id = t.instructor_id"
            " WHERE t.type='purchase' AND t.status='success'"
        ).fetchone()
        gross = float(rev['gross'] or 0)
        instructor_pct, admin_pct = get_revenue_split(db)
        instructors_payout = round(float(rev['owed'] or 0), 2)
        platform_earnings  = round(gross - instructors_payout, 2)
    
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
    
    @app.route('/api/admin/instructors/<uid>/emergency-password-reset', methods=['POST'])
    @superadmin_required
    def emergency_password_reset(uid):
        """Emergency reset of an instructor's password.

        Strictly for exceptional situations (unlawful conduct or a serious
        threat to the platform), not routine administration. Superadmin only.
        The old password is never returned or logged; the admin chooses the new
        one. All existing sessions for the account are revoked and the action is
        written to the audit log.
        """
        d = request.get_json() or {}
        reason   = (d.get('reason') or '').strip()
        incident = (d.get('incident') or '').strip()
        confirm  = (d.get('confirm') or '').strip()
        admin_pw = d.get('admin_password') or ''
        new_pw   = d.get('new_password') or ''
        confirm_pw = d.get('confirm_password') or ''
        ack      = d.get('acknowledged')

        def _fail(msg, code, email=None):
            audit('emergency_password_reset', 'user', uid, email,
                  {'instructor_id': uid, 'reason': reason, 'incident': incident,
                   'outcome': 'failed', 'error': msg})
            return jsonify({'error': msg}), code

        if not reason or len(reason) < 10:
            return _fail('A stated reason (at least 10 characters) is required', 400)
        if not incident or len(incident) < 20:
            return _fail('An incident description (at least 20 characters) is required', 400)
        if confirm != 'RESET':
            return _fail('Type RESET to confirm the action', 400)
        if ack is not True:
            return _fail('You must acknowledge that this action is necessary', 400)
        if len(new_pw) < app.config.get('PASS_MIN_LENGTH', 8):
            return _fail('New password is too short', 400)
        if new_pw != confirm_pw:
            return _fail('New password and confirmation do not match', 400)

        db = get_db()
        # Re-authenticate the acting admin with their own password.
        me = db.execute('SELECT password_hash FROM users WHERE id=?',
                        (g.current_user['user_id'],)).fetchone()
        if not me or not check_password_hash(me['password_hash'], admin_pw):
            return _fail('Administrator password did not match. Reset cancelled.', 403)

        target = db.execute(
            'SELECT id, name, email, role, token_version FROM users WHERE id=?', (uid,)).fetchone()
        if not target:
            return _fail('Instructor account not found', 404)
        if target['role'] not in ('instructor', 'admin', 'superadmin'):
            return _fail('This account is not an instructor account', 400)

        try:
            cur_tv = int(target['token_version'] or 0)
        except (TypeError, ValueError):
            cur_tv = 0
        # Replace the password and bump the session counter together, so old
        # sessions are invalidated the moment the new password takes effect.
        db.execute(
            'UPDATE users SET password_hash=?, token_version=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
            (generate_password_hash(new_pw), cur_tv + 1, uid))
        db.commit()

        # Notify the instructor in-app — never include the new password.
        try:
            create_notification(
                db, uid, 'system', 'Password Changed by Administrator',
                'An administrator changed your account password for security reasons. '
                'If you did not expect this, contact LearnAfrica support immediately.',
                f'pw_reset_{uuid.uuid4()}', app.config.get('USE_POSTGRES'))
        except Exception as ex:
            app.logger.warning(f'emergency reset notification failed: {ex}')

        # Email the instructor (no password), using the admin-selected sender.
        try:
            email_service.send_email(
                db, target['email'], target['name'],
                'Your LearnAfrica password was changed',
                "<div style='font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px'>"
                "<h2 style='color:#22c55e'>LearnAfrica</h2>"
                f"<p>Hi {target['name'] or 'there'},</p>"
                "<p>An administrator changed the password for your account for security reasons.</p>"
                "<p>If you did not expect this, contact LearnAfrica support immediately.</p>"
                "</div>",
                'An administrator changed your LearnAfrica password for security reasons. '
                'If you did not expect this, contact LearnAfrica support immediately.',
                use_postgres=app.config.get('USE_POSTGRES'))
        except Exception as ex:
            app.logger.warning(f'emergency reset email failed: {ex}')

        audit('emergency_password_reset', 'user', uid, target['email'],
              {'reason': reason, 'incident': incident,
               'sessions_revoked': True, 'outcome': 'success'})
        return jsonify({'message': f"Password reset for {target['name'] or target['email']}. "
                                   f"Any active sessions have been signed out."})

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
        target = db.execute('SELECT role, email FROM users WHERE id=?', (uid,)).fetchone()
        if not target:
            return jsonify({'error': 'User not found'}), 404
        # Only a superadmin may grant or revoke superadmin. This stops a plain
        # admin from creating a new superadmin or demoting the existing one.
        if (target['role'] == 'superadmin' or new_role == 'superadmin') and \
                g.current_user['role'] != 'superadmin':
            return jsonify({'error': 'Only a superadmin can change superadmin roles'}), 403
        old_role = target['role']
        db.execute('UPDATE users SET role=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',(new_role, uid))
        db.commit()
        create_notification(db, uid, 'system', 'Account Updated',
            f'Your account role has been updated to {new_role}.', f'role_change_{uid}', app.config.get('USE_POSTGRES'))
        audit('role_change', 'user', uid, target['email'],
              {'from': old_role, 'to': new_role})

        return jsonify({'message': 'Role updated'})
    
    @app.route('/api/admin/users/<uid>/suspend', methods=['PUT'])
    @admin_required
    def suspend_user(uid):
        try:
            if uid == g.current_user['user_id']:
                return jsonify({'error': 'Cannot suspend yourself'}), 400
            db = get_db()
            u = db.execute('SELECT is_active, role FROM users WHERE id=?',(uid,)).fetchone()
            if not u: return jsonify({'error': 'User not found'}), 404
            # Only a superadmin may suspend another superadmin.
            if u['role'] == 'superadmin' and g.current_user['role'] != 'superadmin':
                return jsonify({'error': 'Only a superadmin can suspend a superadmin'}), 403
            new_status = 0 if u['is_active'] else 1
            db.execute('UPDATE users SET is_active=? WHERE id=?',(new_status, uid))
            db.commit()
            audit('suspend_user' if not new_status else 'activate_user', 'user', uid, None,
                  {'is_active': bool(new_status)})
            return jsonify({'message': 'suspended' if not new_status else 'activated',
                            'is_active': bool(new_status)})
    
        except Exception as e:
            import traceback
            app.logger.error('suspend error: ' + traceback.format_exc())
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed', 'detail': _err_detail(e)}), 500
    
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
        try:
            d = request.get_json() or {}
            action = d.get('action')
            if action not in ('approve', 'reject'):
                return jsonify({'error': 'action must be approve or reject'}), 400
            db = get_db()
            
            # Force-add columns first in case migrations didn't run
            if app.config.get('USE_POSTGRES'):
                for col_sql in [
                    'ALTER TABLE instructor_applications ADD COLUMN IF NOT EXISTS admin_note TEXT',
                    'ALTER TABLE instructor_applications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP',
                    'ALTER TABLE instructor_applications ADD COLUMN IF NOT EXISTS reviewed_by TEXT',
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS instructor_status TEXT DEFAULT 'none'",
                ]:
                    try:
                        db.execute(col_sql); db.commit()
                    except Exception:
                        try:
                            if hasattr(db, '_conn'): db._conn.rollback()
                        except Exception: pass
            
            app_row = db.execute('SELECT * FROM instructor_applications WHERE user_id=?',(uid,)).fetchone()
            if not app_row: return jsonify({'error': 'Application not found'}), 404
            if action == 'approve' and _setting_flag(db, 'require_payout_before_approval', False) and _instructor_missing_payout(db, uid):
                return jsonify({'error': 'This applicant has not added a payout method yet. '
                                         'They must add one on their Profile page before they can be approved.'}), 400
            new_status = 'approved' if action == 'approve' else 'rejected'
            
            # Try full update first; fall back to minimal if columns missing
            try:
                db.execute(
                    'UPDATE instructor_applications SET status=?,admin_note=?,'
                    'reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE user_id=?',
                    (new_status, d.get('note',''), g.current_user['user_id'], uid)
                )
                db.commit()
            except Exception as ex:
                app.logger.warning(f'full review update failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
                # Fallback - just status
                try:
                    db.execute('UPDATE instructor_applications SET status=? WHERE user_id=?',
                               (new_status, uid))
                    db.commit()
                except Exception as ex2:
                    app.logger.warning(f'minimal review update failed: {ex2}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
            
            # Update the user's instructor_status
            try:
                db.execute('UPDATE users SET instructor_status=? WHERE id=?',(new_status, uid))
                db.commit()
            except Exception as ex:
                app.logger.warning(f'users instructor_status update failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
            
            # If approved, also upgrade their role to instructor
            if action == 'approve':
                try:
                    db.execute("UPDATE users SET role='instructor' WHERE id=? AND role='student'", (uid,))
                    db.commit()
                except Exception as ex:
                    app.logger.warning(f'role upgrade failed: {ex}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass

            audit('instructor_' + new_status, 'user', uid, None, {'note': d.get('note', '')})

            # Notify the user
            try:
                if action == 'approve':
                    create_notification(db, uid, 'achievement', '🎉 Instructor Approved!',
                        'Your instructor application has been approved! You can now create courses.',
                        f'instructor_approved_{uid}', app.config.get('USE_POSTGRES'))
                else:
                    create_notification(db, uid, 'system', 'Application Update',
                        f'Your instructor application was not approved. ' + d.get('note',''),
                        f'instructor_rejected_{uid}', app.config.get('USE_POSTGRES'))
            except Exception as ex:
                app.logger.warning(f'notification failed: {ex}')
            
            return jsonify({'message': 'Application ' + new_status})
        except Exception as e:
            import traceback
            app.logger.error(f'review_application error: {traceback.format_exc()}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to review application', 'detail': _err_detail(e)}), 500
    
    @app.route('/api/admin/courses', methods=['GET'])
    @admin_required
    def admin_courses():
        db = get_db()
        # Optional ?instructor_id= lets an admin list one instructor's courses
        # when supervising a specific account.
        instructor_id = request.args.get('instructor_id')
        sql = (
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
        )
        params = []
        if instructor_id:
            sql += ' WHERE c.instructor_id=?'
            params.append(instructor_id)
        sql += ' ORDER BY c.created_at DESC'
        rows = db.execute(sql, params).fetchall()
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
        audit('course_status', 'course', cid, c['title'], {'status': status})
        create_notification(db, c['instructor_id'], 'system', 'Course Status Updated',
            f'Your course "{c["title"]}" has been set to {status} by an admin.',
            f'course_status_{cid}', app.config.get('USE_POSTGRES'))

        return jsonify({'message': f'Course set to {status}'})
    
    @app.route('/api/admin/broadcast', methods=['POST'])
    @admin_required
    def broadcast_notification():
        try:
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

            audit('broadcast', 'broadcast', None, d['title'],
                  {'recipients': len(users), 'role': role_target or 'all'})
            return jsonify({'message': f'Broadcast sent to {len(users)} users'})
    
        except Exception as e:
            import traceback
            app.logger.error('broadcast error: ' + traceback.format_exc())
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed', 'detail': _err_detail(e)}), 500
    
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
            return jsonify({'error': 'Failed', 'detail': _err_detail(e)}), 500
    
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
            return jsonify({'error': 'Failed', 'detail': _err_detail(e)}), 500
    
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
        # FIX: this route used to reimplement the eligibility check inline
        # (a second, independently-drifting copy of the logic in
        # models.get_or_issue_certificate), AND generated a brand new random
        # certificateId on every single call, completely disconnected from
        # the real issued_certificates record that /api/verify checks against.
        # It now calls the one shared, source-of-truth function instead, so
        # there is exactly one place this rule lives and the ID shown here
        # always matches the real stored certificate.
        db = get_db()
        uid = g.current_user['user_id']
        cert, err = get_or_issue_certificate(db, uid, cid, _use_pg())
        if err:
            needs_final = 'final exam' in err.lower()
            return jsonify({'error': err, 'needs_final': needs_final}), 403
        enr = db.execute('SELECT completed_at FROM user_enrollments WHERE user_id=? AND course_id=?', (uid, cid)).fetchone()
        completed_at = (enr['completed_at'] if enr else None) or cert.get('issued_at') or datetime.now().isoformat()
        try:
            completion_date = datetime.fromisoformat(str(completed_at).replace('Z', '')).strftime('%B %d, %Y')
        except Exception:
            completion_date = str(completed_at)[:10]
        return jsonify({'certificate': {
            'courseName':      cert['course_name'],
            'instructorName':  cert['instructor_name'],
            'completionDate':  completion_date,
            'certificateId':   cert['cert_id'],
            'userName':        cert['user_name'],
            'certificateName': cert.get('certificate_name') or cert['user_name'],
            'nameChangeCount': int(cert.get('name_change_count') or 0),
            'nameChangesRemaining': max(0, 3 - int(cert.get('name_change_count') or 0)),
        }})
    
    # ── HEALTH ────────────────────────────────────────────────────────────────────
    
    # ── HOMEPAGE COMMENTS ─────────────────────────────────────────────────────────
    # Create table if it doesn't exist yet (idempotent)
    def ensure_comments_table():
        pass  # Tables created in init_db
    
    @app.route('/api/homepage/stats', methods=['GET'])
    def homepage_stats():
        """Public counters for the landing page.

        Returns the marketing numbers the admin set in Admin → Settings, so the
        platform can be presented at its best. Falls back to built-in defaults
        if the admin has not set any. No personal data is ever returned.
        """
        try:
            db = get_db()
            if not _setting_flag(db, 'homepage_stats_enabled', True):
                return jsonify({'enabled': False})
            values = _homepage_stats_values(db)
            return jsonify({
                'enabled': True,
                'courses': values['courses'],
                'students': values['students'],
                'instructors': values['instructors'],
            })
        except Exception as e:
            app.logger.error(f'homepage_stats: {e}')
            return jsonify({'enabled': False})

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
            ORDER BY ue.enrolled_at DESC
        ''', (uid,)).fetchall()
        ud['enrollments'] = [dict(r) for r in en]
        bd = db.execute('SELECT badge_key, earned_at FROM user_badges WHERE user_id=?', (uid,)).fetchall()
        ud['badges'] = [dict(r) for r in bd]
        # Quiz activity — how many attempts, and the best score per quiz
        try:
            qz = db.execute('''
                SELECT qa.id, qa.score, qa.attempted_at as created_at, q.title as quiz_title,
                       c.title as course_title
                FROM quiz_attempts qa
                LEFT JOIN quizzes q ON q.id = qa.quiz_id
                LEFT JOIN courses c ON c.id = q.course_id
                WHERE qa.user_id=?
                ORDER BY qa.attempted_at DESC
                LIMIT 50
            ''', (uid,)).fetchall()
            ud['quiz_attempts'] = [dict(r) for r in qz]
        except Exception:
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            ud['quiz_attempts'] = []
        # Payment history (receipts) — purchases, amounts, status
        try:
            tx = db.execute('''
                SELECT receipt_id, type, amount, currency, status, course_title, created_at
                FROM transactions WHERE user_id=?
                ORDER BY created_at DESC
                LIMIT 50
            ''', (uid,)).fetchall()
            ud['transactions'] = [dict(r) for r in tx]
            ud['total_spent'] = float(sum(
                (r['amount'] or 0) for r in tx if (r['status'] or '') in ('success', 'completed', 'paid')
            ))
        except Exception:
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            ud['transactions'] = []
            ud['total_spent'] = 0.0
        # Instructor-specific extras: courses taught + total earnings/students
        if ud.get('role') == 'instructor':
            try:
                cr = db.execute(
                    'SELECT id, title, enrollments, rating, price, COALESCE(status,'
                    " 'published') as status FROM courses WHERE instructor_id=? ORDER BY created_at DESC",
                    (uid,)
                ).fetchall()
                ud['courses_taught'] = [dict(r) for r in cr]
            except Exception:
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
                try:
                    cr = db.execute(
                        'SELECT id, title, enrollments, rating, price FROM courses WHERE instructor_id=?',
                        (uid,)
                    ).fetchall()
                    ud['courses_taught'] = [dict(safe_dict(x), status='published') for x in cr]
                except Exception:
                    ud['courses_taught'] = []
            try:
                earn = db.execute(
                    "SELECT COALESCE(SUM(instructor_share),0) as earned FROM transactions"
                    " WHERE instructor_id=? AND status IN ('success','completed','paid')",
                    (uid,)
                ).fetchone()
                ud['total_earned'] = float(earn['earned']) if earn else 0.0
            except Exception:
                ud['total_earned'] = 0.0
            try:
                cnt = db.execute(
                    'SELECT COUNT(DISTINCT ue.user_id) as c FROM user_enrollments ue'
                    ' JOIN courses c ON c.id=ue.course_id WHERE c.instructor_id=?',
                    (uid,)
                ).fetchone()
                ud['total_students'] = int(cnt['c']) if cnt else 0
            except Exception:
                ud['total_students'] = 0
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
        audit('delete_user', 'user', uid, target['email'], {})
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
        try:
            db = get_db()
            # Force-add status column inline (idempotent)
            if app.config.get('USE_POSTGRES'):
                try:
                    db.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published'")
                    db.commit()
                except Exception:
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
            try:
                rows = db.execute("""
                    SELECT u.id, u.name, u.email, u.avatar, u.bio, u.location,
                           u.instructor_status, u.is_active, u.created_at,
                           (SELECT COUNT(*) FROM courses WHERE instructor_id=u.id) as course_count,
                           (SELECT COUNT(DISTINCT ue.user_id) FROM user_enrollments ue
                            JOIN courses c ON c.id=ue.course_id WHERE c.instructor_id=u.id) as total_students
                    FROM users u WHERE u.role='instructor'
                    ORDER BY u.created_at DESC
                """).fetchall()
            except Exception as ex:
                app.logger.warning(f'admin_instructors rows fetch failed: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
                rows = db.execute(
                    "SELECT id, name, email, avatar, is_active, created_at"
                    " FROM users WHERE role='instructor' ORDER BY created_at DESC"
                ).fetchall()
            result = []
            for r in rows:
                rd = safe_dict(r)
                try:
                    courses_list = db.execute(
                        "SELECT id, title, enrollments, rating, COALESCE(status, 'published') as status"
                        ' FROM courses WHERE instructor_id=?', (r['id'],)
                    ).fetchall()
                    rd['courses'] = [safe_dict(x) for x in courses_list]
                except Exception:
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
                    try:
                        courses_list = db.execute(
                            'SELECT id, title, enrollments, rating FROM courses WHERE instructor_id=?', (r['id'],)
                        ).fetchall()
                        rd['courses'] = [dict(safe_dict(x), status='published') for x in courses_list]
                    except Exception:
                        rd['courses'] = []
                result.append(rd)
            return jsonify({'instructors': result})
        except Exception as e:
            import traceback
            app.logger.error('admin_instructors error: ' + traceback.format_exc())
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'instructors': [], 'error': _err_detail(e)}), 200
    
    @app.route('/api/admin/students', methods=['GET'])
    @admin_required
    def admin_students():
        db = get_db()
        rows = db.execute("""
            SELECT u.id, u.name, u.email, u.avatar, u.phone, u.bio, u.location,
                   u.is_active, u.created_at,
                   COALESCE(s.lessons_completed,0) as lessons_completed,
                   COALESCE(s.courses_completed,0) as courses_completed,
                   COALESCE(s.streak,0) as streak,
                   s.last_activity,
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
            import re as _re
            raw = request.args.get('id') or ''
            # Normalize aggressively: strip all whitespace/tabs/newlines everywhere,
            # remove any surrounding quotes, drop hyphens/underscores (users often
            # transcribe them differently), uppercase for case-insensitive match.
            credential_id = _re.sub(r'\s+', '', raw).strip('"\'').upper()
            if not credential_id:
                return jsonify({'error': 'id parameter required'}), 400
            # Build a "loose" version with hyphens/underscores removed for fallback match
            loose = credential_id.replace('-', '').replace('_', '')

            db = get_db()
            # Try certificates first
            try:
                # First try exact-normalized match (case + whitespace tolerant)
                cert = db.execute(
                    'SELECT * FROM issued_certificates WHERE UPPER(cert_id)=?',
                    (credential_id,)
                ).fetchone()
                # Fallback: match against stored id with hyphens/underscores stripped
                if not cert:
                    cert = db.execute(
                        "SELECT * FROM issued_certificates WHERE UPPER(REPLACE(REPLACE(cert_id,'-',''),'_',''))=?",
                        (loose,)
                    ).fetchone()
                if cert:
                    cd = safe_dict(cert)
                    if cd.get('revoked_at'):
                        return jsonify({
                            'valid': False, 'type': 'certificate', 'revoked': True,
                            'id': cd.get('cert_id', credential_id),
                            'holder': cd.get('user_name', '—'),
                            'course': cd.get('course_name', '—'),
                            'message': 'This certificate has been revoked by the issuing organisation.',
                        })
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
                badge = db.execute(
                    'SELECT * FROM issued_badges WHERE UPPER(badge_id)=?',
                    (credential_id,)
                ).fetchone()
                if not badge:
                    badge = db.execute(
                        "SELECT * FROM issued_badges WHERE UPPER(REPLACE(REPLACE(badge_id,'-',''),'_',''))=?",
                        (loose,)
                    ).fetchone()
                if badge:
                    bd = safe_dict(badge)
                    if bd.get('revoked_at'):
                        return jsonify({
                            'valid': False, 'type': 'badge', 'revoked': True,
                            'id': bd.get('badge_id', credential_id),
                            'holder': bd.get('user_name', '—'),
                            'badge': bd.get('badge_title', bd.get('badge_key', '—')),
                            'message': 'This badge has been revoked by the issuing organisation.',
                        })
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
        # FIX: this route used to only check user_enrollments.progress == 100
        # with NO verification that a final exam exists, was completed, or was
        # passed. That is the exact bug where a course with no final exam
        # still handed out a certificate. It also used SQLite-only syntax
        # (INSERT OR IGNORE, bare '?' placeholders) with no Postgres
        # branching, while production runs on Postgres. Both problems are
        # fixed by routing through the single shared, already-correct
        # models.get_or_issue_certificate function instead of reimplementing
        # the rule a third time.
        try:
            db = get_db()
            cert, err = get_or_issue_certificate(db, g.current_user['user_id'], cid, _use_pg())
            if err:
                return jsonify({'error': err}), 403
            audit('certificate_issue', 'certificate', cert.get('cert_id'), cert.get('course_name'),
                  {'course_id': cid, 'user_id': g.current_user['user_id']})
            return jsonify({'cert_id': cert['cert_id']})
        except Exception as e:
            import traceback
            app.logger.error('issue_certificate error: ' + traceback.format_exc())
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed', 'detail': _err_detail(e)}), 500
    
    @app.route('/api/certificates/<cid>/name', methods=['PUT'])
    @token_required
    def update_certificate_name(cid):
        """Edit the name shown on a certificate. Hard-capped at 3 successful
        changes per certificate, enforced here in the database, not in the
        frontend, so it cannot be reset by logging out, switching devices, or
        calling this endpoint directly."""
        try:
            new_name = (request.get_json() or {}).get('name', '').strip()
            if not new_name or len(new_name) < 2:
                return jsonify({'error': 'Please enter a valid name (at least 2 characters).'}), 400
            if len(new_name) > 100:
                return jsonify({'error': 'Name is too long.'}), 400

            db = get_db()
            uid = g.current_user['user_id']
            row = db.execute(
                'SELECT id, name_change_count FROM issued_certificates WHERE user_id=? AND course_id=?',
                (uid, cid)
            ).fetchone()
            if not row:
                return jsonify({'error': 'Certificate not found. It may not have been issued yet.'}), 404

            current_count = int(row['name_change_count'] or 0)
            if current_count >= 3:
                return jsonify({
                    'error': 'You have used all 3 allowed name changes for this certificate. Please contact support for further correction.',
                    'nameChangesRemaining': 0,
                }), 403

            db.execute(
                'UPDATE issued_certificates SET certificate_name=?, name_change_count=name_change_count+1 WHERE id=?',
                (new_name, row['id'])
            )
            db.commit()
            remaining = max(0, 3 - (current_count + 1))
            return jsonify({'certificateName': new_name, 'nameChangesRemaining': remaining})
        except Exception as e:
            app.logger.error(f'update_certificate_name: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to update name. Your change was not counted, please try again.'}), 500
    
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
                    audit('badge_issue', 'badge', final['badge_id'], badge_title,
                          {'badge_key': badge_key})
                    return jsonify({'badge_id': final['badge_id']})
            except Exception:
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
            audit('badge_issue', 'badge', badge_id, badge_title, {'badge_key': badge_key})
            return jsonify({'badge_id': badge_id})
        except Exception as e:
            import traceback
            app.logger.error(f'issue_badge error: {traceback.format_exc()}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to issue badge', 'detail': _err_detail(e)}), 500
    
    @app.route('/api/badges/<badge_key>', methods=['GET'])
    @token_required
    def get_badge_name_info(badge_key):
        """Returns the current display name and remaining name-changes for
        one of the student's own earned badges. Mirrors the certificate
        name-info shape so the frontend can reuse the same edit UI pattern."""
        db = get_db()
        uid = g.current_user['user_id']
        row = db.execute(
            'SELECT user_name, badge_name, name_change_count FROM issued_badges WHERE user_id=? AND badge_key=?',
            (uid, badge_key)
        ).fetchone()
        if not row:
            return jsonify({'error': 'Badge not issued yet'}), 404
        count = int(row['name_change_count'] or 0)
        return jsonify({
            'badgeName': row['badge_name'] or row['user_name'],
            'nameChangeCount': count,
            'nameChangesRemaining': max(0, 3 - count),
        })

    @app.route('/api/badges/<badge_key>/name', methods=['PUT'])
    @token_required
    def update_badge_name(badge_key):
        """Edit the name shown on a badge. Same hard-capped 3-change rule as
        certificates, tracked separately per badge (not shared with the
        certificate's own counter, they're different achievements)."""
        try:
            new_name = (request.get_json() or {}).get('name', '').strip()
            if not new_name or len(new_name) < 2:
                return jsonify({'error': 'Please enter a valid name (at least 2 characters).'}), 400
            if len(new_name) > 100:
                return jsonify({'error': 'Name is too long.'}), 400

            db = get_db()
            uid = g.current_user['user_id']
            row = db.execute(
                'SELECT id, name_change_count FROM issued_badges WHERE user_id=? AND badge_key=?',
                (uid, badge_key)
            ).fetchone()
            if not row:
                return jsonify({'error': 'Badge not found. It may not have been issued yet.'}), 404

            current_count = int(row['name_change_count'] or 0)
            if current_count >= 3:
                return jsonify({
                    'error': 'You have used all 3 allowed name changes for this badge. Please contact support for further correction.',
                    'nameChangesRemaining': 0,
                }), 403

            db.execute(
                'UPDATE issued_badges SET badge_name=?, name_change_count=name_change_count+1 WHERE id=?',
                (new_name, row['id'])
            )
            db.commit()
            remaining = max(0, 3 - (current_count + 1))
            return jsonify({'badgeName': new_name, 'nameChangesRemaining': remaining})
        except Exception as e:
            app.logger.error(f'update_badge_name: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to update name. Your change was not counted, please try again.'}), 500

    # ── CREDENTIAL REVOCATION (admin) ─────────────────────────────────────────────
    # Revoking does not delete the record: the public /api/verify check keeps the
    # ID resolvable but reports it as revoked, so a scanned QR or a link shows
    # "this credential was revoked" instead of silently failing. Superadmin only,
    # because cancelling someone's earned credential is a serious action.
    @app.route('/api/admin/credentials/revoke', methods=['POST'])
    @superadmin_required
    def admin_revoke_credential():
        """Revoke a certificate or badge.
        Body: { id, type: 'certificate'|'badge', reason? }"""
        try:
            d = request.get_json() or {}
            cred_id = (d.get('id') or '').strip()
            ctype   = (d.get('type') or '').strip().lower()
            reason  = (d.get('reason') or '').strip()[:300]
            if not cred_id:
                return jsonify({'error': 'id is required'}), 400
            if ctype not in ('certificate', 'badge'):
                return jsonify({'error': "type must be 'certificate' or 'badge'"}), 400
            db = get_db()
            actor = g.current_user['user_id']
            if ctype == 'certificate':
                row = db.execute('SELECT * FROM issued_certificates WHERE UPPER(cert_id)=?',
                                 (cred_id.upper(),)).fetchone()
            else:
                row = db.execute('SELECT * FROM issued_badges WHERE UPPER(badge_id)=?',
                                 (cred_id.upper(),)).fetchone()
            if not row:
                return jsonify({'error': 'Credential not found'}), 404
            rd = dict(row)
            if rd.get('revoked_at'):
                return jsonify({'message': 'Already revoked', 'revoked_at': str(rd['revoked_at'])}), 200

            if ctype == 'certificate':
                db.execute('UPDATE issued_certificates SET revoked_at=CURRENT_TIMESTAMP,'
                           ' revoked_by=?, revoke_reason=? WHERE id=?',
                           (actor, reason, rd['id']))
            else:
                db.execute('UPDATE issued_badges SET revoked_at=CURRENT_TIMESTAMP,'
                           ' revoked_by=?, revoke_reason=? WHERE id=?',
                           (actor, reason, rd['id']))
            db.commit()
            label = rd.get('course_name') if ctype == 'certificate' else (rd.get('badge_title') or rd.get('badge_key'))
            audit('credential_revoke', ctype, cred_id, label,
                  {'holder': rd.get('user_name'), 'reason': reason})
            return jsonify({'message': 'Credential revoked', 'id': cred_id, 'type': ctype})
        except Exception as e:
            app.logger.error(f'admin_revoke_credential: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to revoke credential', 'detail': _err_detail(e)}), 500

    @app.route('/api/admin/credentials/restore', methods=['POST'])
    @superadmin_required
    def admin_restore_credential():
        """Undo a revocation.
        Body: { id, type: 'certificate'|'badge' }"""
        try:
            d = request.get_json() or {}
            cred_id = (d.get('id') or '').strip()
            ctype   = (d.get('type') or '').strip().lower()
            if not cred_id or ctype not in ('certificate', 'badge'):
                return jsonify({'error': 'id and valid type are required'}), 400
            db = get_db()
            if ctype == 'certificate':
                row = db.execute('SELECT * FROM issued_certificates WHERE UPPER(cert_id)=?',
                                 (cred_id.upper(),)).fetchone()
            else:
                row = db.execute('SELECT * FROM issued_badges WHERE UPPER(badge_id)=?',
                                 (cred_id.upper(),)).fetchone()
            if not row:
                return jsonify({'error': 'Credential not found'}), 404
            rd = dict(row)
            if ctype == 'certificate':
                db.execute('UPDATE issued_certificates SET revoked_at=NULL, revoked_by=NULL,'
                           ' revoke_reason=NULL WHERE id=?', (rd['id'],))
            else:
                db.execute('UPDATE issued_badges SET revoked_at=NULL, revoked_by=NULL,'
                           ' revoke_reason=NULL WHERE id=?', (rd['id'],))
            db.commit()
            label = rd.get('course_name') if ctype == 'certificate' else (rd.get('badge_title') or rd.get('badge_key'))
            audit('credential_restore', ctype, cred_id, label, {'holder': rd.get('user_name')})
            return jsonify({'message': 'Credential restored', 'id': cred_id, 'type': ctype})
        except Exception as e:
            app.logger.error(f'admin_restore_credential: {e}')
            return jsonify({'error': 'Failed to restore credential', 'detail': _err_detail(e)}), 500

    @app.route('/api/admin/credentials', methods=['GET'])
    @admin_required
    def admin_list_credentials():
        """List issued certificates and badges for the admin review screen.
        Query: type=certificate|badge|all, q=<search>, limit, offset."""
        try:
            db = get_db()
            ctype = (request.args.get('type') or 'all').strip().lower()
            q     = (request.args.get('q') or '').strip()
            limit  = min(max(int(request.args.get('limit', 100)), 1), 500)
            offset = max(int(request.args.get('offset', 0)), 0)
            out = []
            if ctype in ('certificate', 'all'):
                where, params = '', []
                if q:
                    where = (' WHERE UPPER(cert_id) LIKE ? OR UPPER(user_name) LIKE ?'
                             ' OR UPPER(course_name) LIKE ?')
                    like = f'%{q.upper()}%'
                    params = [like, like, like]
                rows = db.execute(
                    f'SELECT cert_id AS cred_id, user_name, course_name AS label,'
                    f' CAST(issued_at AS TEXT) AS issued_at, revoked_at, revoked_by, revoke_reason'
                    f' FROM issued_certificates{where} ORDER BY issued_at DESC LIMIT ? OFFSET ?',
                    params + [limit, offset]).fetchall()
                for r in rows:
                    dd = safe_dict(r); dd['type'] = 'certificate'; out.append(dd)
            if ctype in ('badge', 'all'):
                where, params = '', []
                if q:
                    where = (' WHERE UPPER(badge_id) LIKE ? OR UPPER(user_name) LIKE ?'
                             ' OR UPPER(badge_title) LIKE ? OR UPPER(badge_key) LIKE ?')
                    like = f'%{q.upper()}%'
                    params = [like, like, like, like]
                rows = db.execute(
                    f'SELECT badge_id AS cred_id, user_name,'
                    f' COALESCE(badge_title, badge_key) AS label,'
                    f' CAST(earned_at AS TEXT) AS issued_at, revoked_at, revoked_by, revoke_reason'
                    f' FROM issued_badges{where} ORDER BY earned_at DESC LIMIT ? OFFSET ?',
                    params + [limit, offset]).fetchall()
                for r in rows:
                    dd = safe_dict(r); dd['type'] = 'badge'; out.append(dd)
            out.sort(key=lambda x: (x.get('issued_at') or ''), reverse=True)
            return jsonify({'credentials': out[:limit]})
        except Exception as e:
            app.logger.error(f'admin_list_credentials: {e}')
            return jsonify({'credentials': []})

    # ── FILE UPLOAD ───────────────────────────────────────────────────────────────
    def _upload_to_supabase(file_bytes, filename, content_type='image/jpeg'):
        """Upload bytes to Supabase Storage. Returns (public_url, error_message).
        On success: (url, None). On failure: (None, reason_string)."""
        supabase_url = os.environ.get('SUPABASE_URL', '').strip()
        service_key  = os.environ.get('SUPABASE_SERVICE_KEY', '').strip()
        bucket       = os.environ.get('SUPABASE_STORAGE_BUCKET', 'learnafrica-uploads').strip()
        if not supabase_url:
            return None, 'SUPABASE_URL env var not set on the server'
        if not service_key:
            return None, 'SUPABASE_SERVICE_KEY env var not set on the server'
        if not bucket:
            return None, 'SUPABASE_STORAGE_BUCKET env var not set on the server'
        try:
            import requests as _req
            headers = {
                'Authorization': f'Bearer {service_key}',
                'Content-Type': content_type,
                'x-upsert': 'true',
            }
            upload_url = f"{supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{filename}"
            r = _req.put(upload_url, headers=headers, data=file_bytes, timeout=60)
            if r.status_code in (200, 201):
                return f"{supabase_url.rstrip('/')}/storage/v1/object/public/{bucket}/{filename}", None
            # Supabase returned an error — surface it so we can debug
            try:
                err_body = r.json()
                err_msg  = err_body.get('message') or err_body.get('error') or str(err_body)[:200]
            except Exception:
                err_msg = (r.text or '')[:200] or f'HTTP {r.status_code}'
            app.logger.error(f'Supabase upload failed ({r.status_code}) to bucket={bucket}: {err_msg}')
            return None, f'Supabase returned {r.status_code}: {err_msg}'
        except Exception as ex:
            app.logger.error(f'Supabase upload exception: {ex}')
            return None, f'Supabase request failed: {ex}'
    
    @app.route('/api/admin/instructor-guide/reseed', methods=['POST'])
    @admin_required
    def admin_reseed_guide():
        """Manually trigger reseeding of the default instructor guide.
        Use this if the auto-seed didn't run on deploy.
        Pass {force: true} to wipe existing steps and reseed."""
        try:
            d = request.get_json() or {}
            force = bool(d.get('force'))
            db = get_db()
            # Force-add columns
            if app.config.get('USE_POSTGRES'):
                for col_sql in [
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS description TEXT',
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS content TEXT',
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS video_url TEXT',
                ]:
                    try:
                        db.execute(col_sql); db.commit()
                    except Exception:
                        try:
                            if hasattr(db, '_conn'): db._conn.rollback()
                        except Exception: pass

            if force:
                try:
                    db.execute('DELETE FROM instructor_guide')
                    db.commit()
                except Exception as ex:
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
                    return jsonify({'error': 'Failed to clear existing steps', 'detail': _err_detail(ex)}), 500

            from .crud import seed_instructor_guide as _seed
            _seed(app, db)
            # Count what we ended up with
            try:
                row = db.execute('SELECT COUNT(*) as c FROM instructor_guide').fetchone()
                count = row['c'] if row else 0
            except Exception:
                count = 0
            return jsonify({'message': 'Reseed complete', 'step_count': count})
        except Exception as e:
            import traceback
            app.logger.error('admin_reseed_guide error: ' + traceback.format_exc())
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to reseed', 'detail': _err_detail(e)}), 500

    @app.route('/api/upload/thumbnail', methods=['POST'])
    @token_required
    def upload_thumbnail():
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        if g.current_user['role'] not in ('instructor', 'admin', 'superadmin'):
            return jsonify({'error': 'Only instructors can upload thumbnails'}), 403
        if not allowed_image(file.filename):
            return jsonify({'error': 'Only image files allowed (png, jpg, jpeg, gif, webp)'}), 400
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f"thumbnails/{str(uuid.uuid4())}.{ext}"
        file_bytes = file.read(5 * 1024 * 1024 + 1)
        if len(file_bytes) > 5 * 1024 * 1024:
            return jsonify({'error': 'Image too large (max 5MB)'}), 400
        if not matches_extension(file_bytes, ext) or contains_html_or_script(file_bytes):
            return jsonify({'error': 'File contents are not a valid image'}), 400
        content_type = f'image/{ext}' if ext != 'jpg' else 'image/jpeg'
        # Try Supabase first (production), fall back to local (development)
        public_url, sb_err = _upload_to_supabase(file_bytes, filename, content_type)
        if public_url:
            return jsonify({'url': public_url, 'filename': filename})
        # Local fallback — only used in development (Render has no persistent disk)
        local_filename = f"{str(uuid.uuid4())}.{ext}"
        try:
            os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
            path = os.path.join(app.config['UPLOAD_FOLDER'], local_filename)
            with open(path, 'wb') as out:
                out.write(file_bytes)
        except Exception as e:
            # If Supabase failed AND local disk failed, tell the user WHY Supabase failed —
            # that's the actionable error, not the local disk fallback error.
            if sb_err:
                return jsonify({
                    'error': 'Storage not configured on the server. Contact admin.',
                    'detail': _err_detail(sb_err),
                }), 500
            return jsonify({'error': 'Upload failed', 'detail': _err_detail(e)}), 500
        url = f"/uploads/{local_filename}"
        return jsonify({'url': url, 'filename': local_filename})
    
    @app.route('/api/upload/avatar', methods=['POST'])
    @token_required
    def upload_avatar():
        """Upload a user avatar to Supabase. Returns public URL."""
        try:
            if 'file' not in request.files:
                return jsonify({'error': 'No file provided'}), 400
            file = request.files['file']
            if not file or file.filename == '':
                return jsonify({'error': 'No file selected'}), 400
            if not allowed_image(file.filename):
                return jsonify({'error': 'Only image files allowed (png, jpg, jpeg, gif, webp)'}), 400
            ext = file.filename.rsplit('.', 1)[1].lower()
            filename = f"avatars/{g.current_user['user_id']}_{int(__import__('time').time())}.{ext}"
            file_bytes = file.read(5 * 1024 * 1024 + 1)
            if len(file_bytes) > 5 * 1024 * 1024:
                return jsonify({'error': 'Image too large (max 5MB)'}), 400
            if not matches_extension(file_bytes, ext) or contains_html_or_script(file_bytes):
                return jsonify({'error': 'File contents are not a valid image'}), 400
            content_type = f'image/{ext}' if ext != 'jpg' else 'image/jpeg'
            public_url, sb_err = _upload_to_supabase(file_bytes, filename, content_type)
            if public_url:
                # Also update user's avatar column in DB
                try:
                    db = get_db()
                    db.execute('UPDATE users SET avatar=? WHERE id=?',
                               (public_url, g.current_user['user_id']))
                    db.commit()
                except Exception as ex:
                    app.logger.warning(f'avatar DB update failed: {ex}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
                return jsonify({'url': public_url, 'filename': filename})
            # Local fallback for dev
            local_filename = f"{str(uuid.uuid4())}.{ext}"
            try:
                os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
                path = os.path.join(app.config['UPLOAD_FOLDER'], local_filename)
                with open(path, 'wb') as out:
                    out.write(file_bytes)
                local_url = f"/uploads/{local_filename}"
                try:
                    db = get_db()
                    db.execute('UPDATE users SET avatar=? WHERE id=?',
                               (local_url, g.current_user['user_id']))
                    db.commit()
                except Exception: pass
                return jsonify({'url': local_url, 'filename': local_filename})
            except Exception as ex:
                if sb_err:
                    return jsonify({
                        'error': 'Storage not configured on the server. Contact admin.',
                        'detail': _err_detail(sb_err),
                    }), 500
                return jsonify({'error': 'Upload failed', 'detail': _err_detail(ex)}), 500
        except Exception as e:
            import traceback
            app.logger.error('upload_avatar error: ' + traceback.format_exc())
            return jsonify({'error': 'Failed to upload avatar', 'detail': _err_detail(e)}), 500

    @app.route('/api/admin/storage-check', methods=['GET'])
    @admin_required
    def admin_storage_check():
        """Admin-only diagnostic: reports whether Supabase Storage is properly
        configured on this server. Returns which env vars are set (without
        exposing their values) so admins can debug upload failures."""
        import requests as _req
        supabase_url = os.environ.get('SUPABASE_URL', '').strip()
        service_key  = os.environ.get('SUPABASE_SERVICE_KEY', '').strip()
        bucket       = os.environ.get('SUPABASE_STORAGE_BUCKET', '').strip()

        report = {
            'SUPABASE_URL':            'set' if supabase_url else 'MISSING',
            'SUPABASE_SERVICE_KEY':    'set' if service_key else 'MISSING',
            'SUPABASE_STORAGE_BUCKET': bucket or 'MISSING (defaults to "learnafrica-uploads")',
            'upload_folder':           app.config.get('UPLOAD_FOLDER'),
            'test_upload_ok':          None,
            'test_upload_error':       None,
        }
        # Try a real 1-byte upload to verify config end-to-end
        if supabase_url and service_key:
            bucket_to_use = bucket or 'learnafrica-uploads'
            test_name = f'diagnostics/storage-check-{int(__import__("time").time())}.txt'
            try:
                r = _req.put(
                    f"{supabase_url.rstrip('/')}/storage/v1/object/{bucket_to_use}/{test_name}",
                    headers={
                        'Authorization': f'Bearer {service_key}',
                        'Content-Type': 'text/plain',
                        'x-upsert': 'true',
                    },
                    data=b'diagnostics',
                    timeout=15,
                )
                if r.status_code in (200, 201):
                    report['test_upload_ok'] = True
                    # Clean up the test file
                    try:
                        _req.delete(
                            f"{supabase_url.rstrip('/')}/storage/v1/object/{bucket_to_use}/{test_name}",
                            headers={'Authorization': f'Bearer {service_key}'},
                            timeout=15,
                        )
                    except Exception: pass
                else:
                    report['test_upload_ok'] = False
                    try:
                        report['test_upload_error'] = r.json()
                    except Exception:
                        report['test_upload_error'] = (r.text or '')[:300]
            except Exception as ex:
                report['test_upload_ok'] = False
                report['test_upload_error'] = str(ex)
        return jsonify(report)

    @app.route('/api/upload/resource', methods=['POST'])
    @token_required
    def upload_resource():
        """Upload a lesson/course resource file to Supabase. Returns public URL."""
        try:
            if 'file' not in request.files:
                return jsonify({'error': 'No file provided'}), 400
            file = request.files['file']
            if not file or file.filename == '':
                return jsonify({'error': 'No file selected'}), 400
            # Only instructors/admins may place files on the platform, and only
            # safe document/media types. Active web content (.html/.svg/.js) is
            # rejected: served from our storage it would allow phishing pages and
            # stored XSS against our own users.
            if g.current_user['role'] not in ('instructor', 'admin', 'superadmin'):
                return jsonify({'error': 'Only instructors can upload course resources'}), 403
            allowed_resource_exts = {
                'pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','rtf','odt',
                'zip','rar','7z','tar','gz',
                'png','jpg','jpeg','gif','webp',
                'mp4','webm','mov','avi','mkv',
                'mp3','wav','ogg','m4a',
            }
            if '.' not in file.filename:
                return jsonify({'error': 'File must have an extension'}), 400
            ext = file.filename.rsplit('.', 1)[1].lower()
            if ext not in allowed_resource_exts:
                return jsonify({'error': f'File type .{ext} is not allowed'}), 400

            safe_name = file.filename.replace(' ', '_').replace('/', '_').replace('\\', '_')[:80]
            filename = f"resources/{g.current_user['user_id']}_{int(__import__('time').time())}_{safe_name}"

            MAX = 50 * 1024 * 1024  # 50MB
            file_bytes = file.read(MAX + 1)
            if len(file_bytes) > MAX:
                return jsonify({'error': 'File too large (max 50MB)'}), 400
            # The extension must match the actual bytes, and active content is
            # rejected regardless of the claimed extension.
            if not matches_extension(file_bytes, ext):
                return jsonify({'error': 'File contents do not match the file extension'}), 400
            if contains_html_or_script(file_bytes):
                return jsonify({'error': 'HTML/script content is not allowed in uploads'}), 400

            # Determine MIME type
            mime_map = {
                'pdf':'application/pdf', 'doc':'application/msword',
                'docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'xls':'application/vnd.ms-excel',
                'xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'ppt':'application/vnd.ms-powerpoint',
                'pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'txt':'text/plain', 'csv':'text/csv', 'json':'application/json',
                'zip':'application/zip', 'rar':'application/vnd.rar',
                'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','gif':'image/gif',
                'webp':'image/webp','svg':'image/svg+xml',
                'mp4':'video/mp4','webm':'video/webm','mov':'video/quicktime',
                'mp3':'audio/mpeg','wav':'audio/wav','m4a':'audio/mp4',
                'html':'text/html','css':'text/css','js':'application/javascript','md':'text/markdown',
            }
            content_type = mime_map.get(ext, 'application/octet-stream')

            public_url, sb_err = _upload_to_supabase(file_bytes, filename, content_type)
            if public_url:
                return jsonify({
                    'url': public_url,
                    'filename': file.filename,
                    'file_type': ext,
                    'file_size_bytes': len(file_bytes),
                })

            # Local disk is only a development convenience — Render's disk is
            # ephemeral, so a file written here would vanish on the next
            # restart/deploy. In production, fail loudly instead of handing the
            # user a URL that will 404 within hours.
            if os.environ.get('FLASK_ENV') == 'production':
                return jsonify({
                    'error': 'Storage upload failed. The file was not saved.',
                    'detail': 'Ask your admin to check the SUPABASE_URL, SUPABASE_SERVICE_KEY and SUPABASE_STORAGE_BUCKET environment variables.',
                }), 500

            # Local fallback for dev
            local_filename = f"{str(uuid.uuid4())}_{safe_name}"
            try:
                os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
                local_path = os.path.join(app.config['UPLOAD_FOLDER'], local_filename)
                with open(local_path, 'wb') as out:
                    out.write(file_bytes)
                return jsonify({
                    'url': f"/uploads/{local_filename}",
                    'filename': file.filename,
                    'file_type': ext,
                    'file_size_bytes': len(file_bytes),
                })
            except Exception as ex:
                # In production, this branch means Supabase failed AND we couldn't
                # write locally either (ephemeral filesystem on Render). Surface
                # the ACTUAL Supabase failure reason so the admin can fix env vars.
                if sb_err:
                    return jsonify({
                        'error': 'Storage not configured on the server. The upload could not be saved.',
                        'detail': 'Storage upload failed. Ask your admin to check the SUPABASE_URL, SUPABASE_SERVICE_KEY and SUPABASE_STORAGE_BUCKET environment variables.',
                    }), 500
                return jsonify({'error': 'Upload failed', 'detail': _err_detail(ex)}), 500
        except Exception as e:
            import traceback
            app.logger.error('upload_resource error: ' + traceback.format_exc())
            return jsonify({'error': 'Failed to upload resource', 'detail': _err_detail(e)}), 500

    @app.route('/uploads/<filename>')
    def serve_upload(filename):
        from flask import send_from_directory
        # Never serve active content from our own origin (defence in depth for
        # the local/dev upload path; production uses Supabase Storage).
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        if ext in ('html', 'htm', 'svg', 'js', 'mjs', 'xhtml'):
            return jsonify({'error': 'Not found'}), 404
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
            # Only people who can see the course may read its discussions:
            # an enrolled student, the course owner, or an admin. Without this a
            # plain instructor (or any logged-in user) could read the discussion
            # threads of every other course by id.
            role = g.current_user['role']
            if role not in ('admin', 'superadmin'):
                enrolled = db.execute(
                    'SELECT 1 FROM user_enrollments WHERE user_id=? AND course_id=?',
                    (g.current_user['user_id'], cid)
                ).fetchone()
                owns = db.execute(
                    'SELECT 1 FROM courses WHERE id=? AND instructor_id=?',
                    (cid, g.current_user['user_id'])
                ).fetchone()
                if not enrolled and not owns:
                    return jsonify({'error': 'Enroll in this course to view discussions'}), 403
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
                role = g.current_user['role']
                can_moderate = role in ('admin', 'superadmin')
                if role == 'instructor':
                    can_moderate = bool(db.execute(
                        'SELECT 1 FROM courses WHERE id=? AND instructor_id=?',
                        (cid, g.current_user['user_id'])).fetchone())
                post['can_delete'] = (post.get('user_id') == g.current_user['user_id'] or can_moderate)
                posts.append(post)
            return jsonify({'discussions': posts})
        except Exception as e:
            import traceback
            app.logger.error(f'get_discussions error: {traceback.format_exc()}')
            return jsonify({'discussions': [], 'error': _err_detail(e)}), 200
    
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
            return jsonify({'error': 'Failed to post', 'detail': _err_detail(e)}), 500
    
    @app.route('/api/courses/<cid>/lessons/<lid>/discussions/<did>', methods=['DELETE'])
    @token_required
    def delete_discussion(cid, lid, did):
        db = get_db()
        ensure_discussions_table(db)
        row = db.execute('SELECT user_id FROM lesson_discussions WHERE id=?', (did,)).fetchone()
        if not row: return jsonify({'error': 'Not found'}), 404
        role = g.current_user['role']
        # Authors, admins, and the instructor who OWNS this course may delete.
        # A plain instructor must not moderate another instructor's course.
        can_moderate = role in ('admin', 'superadmin')
        if role == 'instructor':
            can_moderate = bool(db.execute(
                'SELECT 1 FROM courses WHERE id=? AND instructor_id=?',
                (cid, g.current_user['user_id'])).fetchone())
        if row['user_id'] != g.current_user['user_id'] and not can_moderate:
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
        ensure_transactions_table(db)
        instructors = db.execute('''
            SELECT u.id, u.name, u.email, u.avatar, u.role,
                   (SELECT COUNT(*) FROM courses c WHERE c.instructor_id=u.id AND c.is_free=0) as course_count,
                   COALESCE(SUM(t.amount), 0) as gross,
                   COALESCE(SUM(t.instructor_share), 0) as instr
            FROM users u
            LEFT JOIN transactions t
              ON t.instructor_id=u.id AND t.type='purchase' AND t.status='success'
            WHERE EXISTS (SELECT 1 FROM courses c WHERE c.instructor_id=u.id AND c.is_free=0)
            GROUP BY u.id, u.name, u.email, u.avatar, u.role
            ORDER BY gross DESC
        ''').fetchall()
        result = []
        total_gross = 0.0
        total_instr = 0.0
        for row in instructors:
            gross = float(row['gross'] or 0)
            # Admin-owned course revenue stays with the platform.
            instr = 0.0 if row['role'] in ('admin', 'superadmin') else float(row['instr'] or 0)
            total_gross += gross
            total_instr += instr
            result.append({
                'id': row['id'],
                'name': row['name'],
                'email': row['email'],
                'course_count': row['course_count'],
                'gross_revenue': round(gross, 2),
                'instructor_earnings': round(instr, 2),
                'platform_earnings':   round(gross - instr, 2),
            })
        return jsonify({
            'instructors': result,
            'total_gross': round(total_gross, 2),
            'platform_total': round(total_gross - total_instr, 2),
            'instructors_total': round(total_instr, 2),
            'instructor_share_pct': instructor_pct,
            'admin_share_pct': admin_pct,
        })
    
    
    # ── INSTRUCTOR GUIDE ──────────────────────────────────────────────────────────
    @app.route('/api/instructor-guide', methods=['GET'])
    @token_required
    def get_instructor_guide():
        """Returns instructor guide steps for any logged-in user."""
        try:
            db = get_db()
            if app.config.get('USE_POSTGRES'):
                for col_sql in [
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS description TEXT',
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS content TEXT',
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS video_url TEXT',
                ]:
                    try:
                        db.execute(col_sql); db.commit()
                    except Exception:
                        try:
                            if hasattr(db, '_conn'): db._conn.rollback()
                        except Exception: pass
            try:
                rows = db.execute(
                    'SELECT id, step_number, title,'
                    ' COALESCE(description, content, \'\') as description,'
                    ' COALESCE(content, description, \'\') as content,'
                    ' COALESCE(video_url, \'\') as video_url'
                    ' FROM instructor_guide ORDER BY step_number'
                ).fetchall()
            except Exception:
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
                rows = db.execute('SELECT * FROM instructor_guide').fetchall()
            return jsonify({'steps': safe_list(rows)})
        except Exception as e:
            app.logger.error(f'instructor_guide error: {e}')
            return jsonify({'steps': []})
    
    @app.route('/api/admin/instructor-guide', methods=['GET'])
    @admin_required
    def admin_get_guide():
        try:
            db = get_db()
            if app.config.get('USE_POSTGRES'):
                for col_sql in [
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS description TEXT',
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS content TEXT',
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS video_url TEXT',
                ]:
                    try:
                        db.execute(col_sql); db.commit()
                    except Exception:
                        try:
                            if hasattr(db, '_conn'): db._conn.rollback()
                        except Exception: pass
            try:
                rows = db.execute(
                    'SELECT id, step_number, title,'
                    ' COALESCE(description, content, \'\') as description,'
                    ' COALESCE(content, description, \'\') as content,'
                    ' COALESCE(video_url, \'\') as video_url'
                    ' FROM instructor_guide ORDER BY step_number'
                ).fetchall()
            except Exception:
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
                rows = db.execute('SELECT * FROM instructor_guide').fetchall()
            return jsonify({'steps': safe_list(rows)})
        except Exception as e:
            app.logger.error(f'admin_guide error: {e}')
            return jsonify({'steps': []})
    
    @app.route('/api/admin/instructor-guide', methods=['POST'])
    @admin_required
    def admin_add_guide_step():
        try:
            d = request.get_json() or {}
            if not d.get('title') or not d.get('description'):
                return jsonify({'error': 'title and description required'}), 400
            db = get_db()
            # Force-add missing columns first
            if app.config.get('USE_POSTGRES'):
                for col_sql in [
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS description TEXT',
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS content TEXT',
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS video_url TEXT',
                    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
                ]:
                    try:
                        db.execute(col_sql)
                        db.commit()
                    except Exception:
                        try:
                            if hasattr(db, '_conn'): db._conn.rollback()
                        except Exception: pass
            # Compute next step_number (table id is SERIAL, auto-increment)
            max_row = db.execute('SELECT COALESCE(MAX(step_number),0) as m FROM instructor_guide').fetchone()
            next_step = (max_row['m'] if max_row else 0) + 1
            db.execute(
                'INSERT INTO instructor_guide (step_number,title,description,content,video_url)'
                ' VALUES(?,?,?,?,?)',
                (next_step, d['title'], d['description'], d.get('content', d['description']), d.get('video_url'))
            )
            db.commit()
            # Read back the newly inserted row
            row = db.execute(
                'SELECT id, step_number, title, description, content, video_url'
                ' FROM instructor_guide WHERE step_number=?',
                (next_step,)
            ).fetchone()
            return jsonify({'step': safe_dict(row)}), 201
        except Exception as e:
            import traceback
            app.logger.error(f'add_guide_step error: {traceback.format_exc()}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to add guide step', 'detail': _err_detail(e)}), 500
    
    @app.route('/api/admin/instructor-guide/<sid>', methods=['PUT'])
    @admin_required
    def admin_update_guide_step(sid):
        try:
            d = request.get_json() or {}
            db = get_db()
            row = db.execute('SELECT id FROM instructor_guide WHERE id=?', (sid,)).fetchone()
            if not row: return jsonify({'error': 'Step not found'}), 404
            fields, vals = [], []
            for f in ('title', 'description', 'content', 'video_url', 'step_number'):
                if f in d:
                    fields.append(f + '=?')
                    vals.append(None if d[f] is None else d[f])
            if fields:
                vals.append(sid)
                try:
                    db.execute(
                        'UPDATE instructor_guide SET ' + ','.join(fields) +
                        ',updated_at=CURRENT_TIMESTAMP WHERE id=?',
                        vals
                    )
                    db.commit()
                except Exception:
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
                    # Fallback without updated_at if that column doesn't exist
                    db.execute(
                        'UPDATE instructor_guide SET ' + ','.join(fields) + ' WHERE id=?',
                        vals
                    )
                    db.commit()
            row = db.execute('SELECT * FROM instructor_guide WHERE id=?', (sid,)).fetchone()
            return jsonify({'step': safe_dict(row)})
        except Exception as e:
            app.logger.error(f'update_guide_step error: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to update step', 'detail': _err_detail(e)}), 500
    
    @app.route('/api/admin/instructor-guide/<sid>', methods=['DELETE'])
    @admin_required
    def admin_delete_guide_step(sid):
        try:
            db = get_db()
            db.execute('DELETE FROM instructor_guide WHERE id=?', (sid,))
            db.commit()
            return jsonify({'message': 'Deleted'})
        except Exception as e:
            app.logger.error(f'delete_guide_step error: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to delete step', 'detail': _err_detail(e)}), 500
    
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
        # Read into memory in chunks with a hard cap so a single request cannot
        # exhaust the free Render instance.
        MAX = 200 * 1024 * 1024  # 200MB
        buf = bytearray()
        while True:
            chunk = file.stream.read(1024 * 1024)
            if not chunk:
                break
            buf.extend(chunk)
            if len(buf) > MAX:
                return jsonify({'error': 'Video too large (max 200MB)'}), 400
        total = len(buf)
        # Supabase is the durable store. Render's disk is ephemeral, so a video
        # written locally would disappear on the next restart/deploy.
        public_url, sb_err = _upload_to_supabase(bytes(buf), filename, 'video/mp4')
        if not public_url:
            if os.environ.get('FLASK_ENV') == 'production':
                return jsonify({
                    'error': 'Storage upload failed. The video was not saved.',
                    'detail': 'Ask your admin to check the SUPABASE_URL, SUPABASE_SERVICE_KEY and SUPABASE_STORAGE_BUCKET environment variables.',
                }), 500
            os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
            with open(os.path.join(app.config['UPLOAD_FOLDER'], filename), 'wb') as out:
                out.write(buf)
            url = f"/uploads/{filename}"
        else:
            url = public_url
        db.execute('UPDATE lessons SET video_file=?, video_url=? WHERE id=?', (url, url, lid))
        db.commit()
        return jsonify({'url': url, 'filename': filename, 'size_mb': round(total / 1048576, 1)})
    
    # ── COURSE RESOURCE UPLOAD ────────────────────────────────────────────────────
    def _instructor_can_manage_course(db, cid):
        """True if the current user may manage the given course's resources.
        Admins can manage any course; an instructor only their own."""
        if g.current_user['role'] in ('admin', 'superadmin'):
            return True
        row = db.execute('SELECT instructor_id FROM courses WHERE id=?', (cid,)).fetchone()
        return bool(row) and row['instructor_id'] == g.current_user['user_id']

    @app.route('/api/instructor/courses/<cid>/resources', methods=['GET'])
    @instructor_required
    def get_course_resources(cid):
        db = get_db()
        if not _instructor_can_manage_course(db, cid):
            return jsonify({'error': 'Forbidden'}), 403
        rows = db.execute('SELECT * FROM course_resources WHERE course_id=? ORDER BY created_at', (cid,)).fetchall()
        return jsonify({'resources': safe_list(rows)})
    
    @app.route('/api/instructor/courses/<cid>/resources', methods=['POST'])
    @instructor_required
    def add_course_resource(cid):
        """Add a resource by URL or name for a course."""
        db = get_db()
        if not _instructor_can_manage_course(db, cid):
            return jsonify({'error': 'Forbidden'}), 403
        d = request.get_json() or {}
        if not d.get('title') or not d.get('url'): return jsonify({'error': 'title and url required'}), 400
        if d['url'].startswith('blob:'):
            return jsonify({'error': 'Upload file first via /api/upload/resource before saving as a resource'}), 400
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
        allowed_resource_exts = {
            'pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','rtf','odt',
            'zip','rar','7z','tar','gz',
            'png','jpg','jpeg','gif','webp',
            'mp4','webm','mov','avi','mkv',
            'mp3','wav','ogg','m4a',
        }
        if '.' not in file.filename:
            return jsonify({'error': 'File must have an extension'}), 400
        ext = file.filename.rsplit('.', 1)[1].lower()
        if ext not in allowed_resource_exts:
            return jsonify({'error': f'File type .{ext} is not allowed'}), 400
        file.seek(0,2); size = file.tell(); file.seek(0)
        if size > 50 * 1024 * 1024: return jsonify({'error': 'File too large (max 50MB)'}), 400
        file_bytes = file.read()
        if not matches_extension(file_bytes, ext):
            return jsonify({'error': 'File contents do not match the file extension'}), 400
        if contains_html_or_script(file_bytes):
            return jsonify({'error': 'HTML/script content is not allowed in uploads'}), 400
        filename = f"resource_{cid[:8]}_{str(uuid.uuid4())[:8]}.{ext}"
        # Store in Supabase. Render's disk is ephemeral, so writing resources
        # locally means they vanish on the next restart/deploy.
        public_url, sb_err = _upload_to_supabase(file_bytes, filename, 'application/octet-stream')
        if not public_url:
            if os.environ.get('FLASK_ENV') == 'production':
                return jsonify({
                    'error': 'Storage upload failed. The file was not saved.',
                    'detail': 'Ask your admin to check the SUPABASE_URL, SUPABASE_SERVICE_KEY and SUPABASE_STORAGE_BUCKET environment variables.',
                }), 500
            os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
            with open(os.path.join(app.config['UPLOAD_FOLDER'], filename), 'wb') as out:
                out.write(file_bytes)
            url = f"/uploads/{filename}"
        else:
            url = public_url
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
        if not _instructor_can_manage_course(db, cid):
            return jsonify({'error': 'Forbidden'}), 403
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
            app.logger.error(f'health check DB error: {e}')
            db_status = 'error'
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
            return jsonify({'error': 'Migration run failed', 'detail': _err_detail(e)}), 500

    # ────────────────────────────────────────────────────────────────────────
    # ── PAYMENT METHOD on user profile (momo / bank)
    # ────────────────────────────────────────────────────────────────────────
    @app.route('/api/users/me/payment-method', methods=['GET'])
    @token_required
    def get_payment_method():
        try:
            db = get_db()
            # Defensive: try the new columns; fall back if migration hasn't run yet
            try:
                row = db.execute(
                    'SELECT payment_method, payment_details, payment_country FROM users WHERE id=?',
                    (g.current_user['user_id'],)
                ).fetchone()
            except Exception as col_err:
                app.logger.warning(f'payment-method columns missing — rolling back & returning empty: {col_err}')
                # Rollback so the connection isn't poisoned
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
                return jsonify({'method': None, 'details': None, 'country': 'GH', 'configured': False})
            if not row:
                return jsonify({'method': None, 'details': None, 'country': 'GH', 'configured': False})
            details = None
            try:
                raw = row['payment_details']
                if raw:
                    details = json.loads(raw) if isinstance(raw, str) else raw
            except Exception:
                details = None
            return jsonify({
                'method': row['payment_method'] or None,
                'details': details,
                'country': row['payment_country'] or 'GH',
                'configured': bool(row['payment_method'] and details),
            })
        except Exception as e:
            app.logger.error(f'get_payment_method: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            # Don't 500 — return empty state so the UI doesn't break
            return jsonify({'method': None, 'details': None, 'country': 'GH', 'configured': False})

    def _normalize_gh_phone(raw):
        """Normalise a Ghana mobile number to 0XXXXXXXXX. Returns '' if unusable."""
        digits = re.sub(r'\D', '', str(raw or ''))
        if not digits:
            return ''
        if digits.startswith('233'):
            digits = '0' + digits[3:]
        elif len(digits) == 9 and not digits.startswith('0'):
            digits = '0' + digits
        return digits

    def _is_valid_gh_phone(raw):
        return bool(re.fullmatch(r'0\d{9}', _normalize_gh_phone(raw)))

    def _clean_profile_phone(raw):
        """Validate/normalise an optional profile 'call line'. Returns
        (normalised_or_None, error_or_None). Blank input is allowed and stored
        as None, so the field stays optional at signup and on the profile.

        The UI sends an international value such as '+233244123456'; a local
        number such as '0244123456' is accepted too for backward compatibility.
        Only digits (and one optional leading '+') survive, so letters, spaces,
        brackets and dashes are removed rather than rejected."""
        if raw is None or str(raw).strip() == '':
            return None, None
        text = str(raw).strip()
        plus = text.startswith('+')
        digits = re.sub(r'\D', '', text)
        if not digits:
            return None, 'Enter a valid phone number, e.g. 0244123456 or +233244123456.'
        if len(digits) < 6 or len(digits) > 15:
            return None, 'Enter a valid phone number, e.g. 0244123456 or +233244123456.'
        return ('+' if plus else '') + digits, None

    def _validate_payout_details(method, details):
        """Validate payout details server-side. Returns (clean_details, error).

        Mirrors the frontend rules so a bad phone/account can never be saved and
        later break a payout.
        """
        clean = dict(details or {})
        if method == 'momo':
            required = ['provider', 'phone', 'account_name']
            missing = [k for k in required if not str(clean.get(k, '')).strip()]
            if missing:
                return None, f'Missing required fields: {", ".join(missing)}'
            digits = _normalize_gh_phone(clean.get('phone'))
            if not re.fullmatch(r'0\d{9}', digits):
                return None, 'Enter a valid Ghana mobile money number, e.g. 0244123456.'
            clean['phone'] = digits
        else:  # bank
            required = ['bank_code', 'bank_name', 'account_number', 'account_name']
            missing = [k for k in required if not str(clean.get(k, '')).strip()]
            if missing:
                return None, f'Missing required fields: {", ".join(missing)}'
            acct = re.sub(r'\D', '', str(clean.get('account_number')))
            if not (8 <= len(acct) <= 20):
                return None, 'Enter a valid bank account number (8-20 digits).'
            clean['account_number'] = acct
        return clean, None

    @app.route('/api/users/me/payment-method', methods=['PUT'])
    @token_required
    def update_payment_method():
        try:
            d = request.get_json() or {}
            method = (d.get('method') or '').strip().lower()
            details = d.get('details') or {}
            country = (d.get('country') or 'GH').strip().upper()

            if method not in ('momo', 'bank'):
                return jsonify({'error': 'method must be "momo" or "bank"'}), 400
            if country != 'GH':
                return jsonify({'error': 'Payouts are currently only available to Ghana accounts.'}), 400
            if not isinstance(details, dict):
                return jsonify({'error': 'details must be an object'}), 400

            # Validate required fields per method
            clean_details, verr = _validate_payout_details(method, details)
            if verr:
                return jsonify({'error': verr}), 400

            db = get_db()
            # Safety net: make sure columns exist (in case migrations didn't run yet)
            ensure_column(db, 'users', 'payment_method', 'TEXT')
            ensure_column(db, 'users', 'payment_details', 'TEXT')
            ensure_column(db, 'users', 'payment_country', "TEXT DEFAULT 'GH'")
            db.execute(
                'UPDATE users SET payment_method=?, payment_details=?, payment_country=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
                (method, json.dumps(clean_details), country, g.current_user['user_id'])
            )
            db.commit()
            return jsonify({'message': 'Payment method saved', 'method': method, 'country': country,
                            'details': clean_details})
        except Exception as e:
            app.logger.error(f'update_payment_method: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to save'}), 500

    # ────────────────────────────────────────────────────────────────────────
    # ── TIME TRACKING (per user, per course)
    # ────────────────────────────────────────────────────────────────────────
    @app.route('/api/courses/<cid>/time', methods=['GET'])
    @token_required
    def get_course_time(cid):
        try:
            db = get_db()
            # Safety net
            ensure_column(db, 'courses', 'min_time_seconds', 'INTEGER DEFAULT 0')
            ensure_column(db, 'courses', 'enforce_min_time', 'INTEGER DEFAULT 0')
            ensure_transactions_table(db)  # also creates time_tracking
            tt = db.execute(
                'SELECT total_seconds FROM time_tracking WHERE user_id=? AND course_id=?',
                (g.current_user['user_id'], cid)
            ).fetchone()
            spent = int(tt['total_seconds'] or 0) if tt else 0
            course = db.execute(
                'SELECT min_time_seconds, enforce_min_time FROM courses WHERE id=?', (cid,)
            ).fetchone()
            required = int(course['min_time_seconds'] or 0) if course else 0
            enforce = bool(course['enforce_min_time']) if course else False
            return jsonify({
                'spent_seconds': spent,
                'required_seconds': required if enforce else 0,
                'enforce': enforce,
                'met': (not enforce) or (spent >= required),
            })
        except Exception as e:
            app.logger.error(f'get_course_time: {e}')
            return jsonify({'spent_seconds': 0, 'required_seconds': 0, 'enforce': False, 'met': True})

    @app.route('/api/courses/<cid>/time', methods=['POST'])
    @token_required
    def add_course_time(cid):
        """Increment time spent on this course.

        SECURITY NOTE (fixed): this endpoint used to trust the client-sent
        `seconds` value directly (clamped to 0..120), which meant a student
        could script repeated calls to this endpoint and inflate their
        tracked time arbitrarily fast, completely bypassing the minimum
        time-to-complete gate on the final quiz. It is now server-authoritative:
        the credited amount is computed from the real wall-clock gap between
        this request and the last recorded heartbeat (`last_seen`), not from
        anything the client claims. The client's `seconds` value is only used
        as a "the student is still here" signal, never as the amount credited.
        """
        try:
            d = request.get_json() or {}
            claimed_seconds = int(d.get('seconds') or 0)
            if claimed_seconds <= 0:
                return jsonify({'message': 'noop', 'added': 0})

            db = get_db()
            ensure_transactions_table(db)
            if not db.execute('SELECT id FROM courses WHERE id=?', (cid,)).fetchone():
                return jsonify({'error': 'Course not found'}), 404

            uid = g.current_user['user_id']
            existing = db.execute(
                'SELECT total_seconds, last_seen FROM time_tracking WHERE user_id=? AND course_id=?',
                (uid, cid)
            ).fetchone()

            now = datetime.utcnow()
            MAX_CREDIT_PER_HEARTBEAT = 120  # hard ceiling regardless of anything else

            if not existing:
                # First heartbeat ever for this user+course: no prior timestamp to
                # diff against, so credit a small conservative bootstrap amount
                # rather than trusting the client's number outright.
                credited = min(claimed_seconds, 30)
                try:
                    db.execute(
                        'INSERT INTO time_tracking (user_id, course_id, total_seconds, last_seen) VALUES (?,?,?,CURRENT_TIMESTAMP)',
                        (uid, cid, credited)
                    )
                except Exception:
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
                    db.execute(
                        'UPDATE time_tracking SET total_seconds=total_seconds+?, last_seen=CURRENT_TIMESTAMP WHERE user_id=? AND course_id=?',
                        (credited, uid, cid)
                    )
            else:
                last_seen_raw = existing['last_seen']
                elapsed_real = 0
                if last_seen_raw:
                    try:
                        last_seen_str = str(last_seen_raw).replace('Z', '')
                        last_seen_dt = datetime.fromisoformat(last_seen_str)
                        elapsed_real = (now - last_seen_dt).total_seconds()
                    except Exception:
                        elapsed_real = 0
                # Credit whichever is smaller: real elapsed time, or the hard
                # per-heartbeat ceiling. Never the client-claimed value.
                credited = int(max(0, min(elapsed_real, MAX_CREDIT_PER_HEARTBEAT)))
                db.execute(
                    'UPDATE time_tracking SET total_seconds=total_seconds+?, last_seen=CURRENT_TIMESTAMP WHERE user_id=? AND course_id=?',
                    (credited, uid, cid)
                )

            db.commit()

            tt = db.execute(
                'SELECT total_seconds FROM time_tracking WHERE user_id=? AND course_id=?',
                (uid, cid)
            ).fetchone()
            return jsonify({'added': credited, 'total_seconds': int(tt['total_seconds'] or 0) if tt else 0})
        except Exception as e:
            app.logger.error(f'add_course_time: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to update time'}), 500

    # ────────────────────────────────────────────────────────────────────────
    # ── TRANSACTIONS / RECEIPTS
    # ────────────────────────────────────────────────────────────────────────
    @app.route('/api/transactions', methods=['GET'])
    @token_required
    def list_transactions():
        """List transactions visible to the caller.
        - Students: their own (not soft-deleted by them)
        - Instructors: transactions for their courses (purchases) + their payouts
        - Admins: everything (deleted or not)
        Query filters: ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&user_id=&course_id=&status=
        """
        try:
            db = get_db()
            # Safety net: ensure transactions table exists
            ensure_transactions_table(db)
            uid = g.current_user['user_id']
            role = g.current_user['role']

            where = []
            params = []

            if role in ('admin', 'superadmin'):
                pass  # see all
            else:
                # Everyone else: only their own transactions (as buyer OR as instructor receiving)
                where.append('(user_id=? OR instructor_id=?)')
                params.extend([uid, uid])
                where.append('deleted_by_user=0')

            # Filters
            df = request.args.get('date_from')
            dt = request.args.get('date_to')
            f_uid = request.args.get('user_id')
            f_cid = request.args.get('course_id')
            f_st  = request.args.get('status')
            f_type = request.args.get('type')
            if df:    where.append('created_at >= ?'); params.append(df)
            if dt:    where.append('created_at <= ?'); params.append(dt + ' 23:59:59')
            # user_id filter is admin-only — ignored for non-admins
            if f_uid and role in ('admin', 'superadmin'):
                where.append('user_id=?'); params.append(f_uid)
            if f_cid: where.append('course_id=?'); params.append(f_cid)
            if f_st:  where.append('status=?'); params.append(f_st)
            if f_type: where.append('type=?'); params.append(f_type)

            sql = 'SELECT * FROM transactions'
            if where:
                sql += ' WHERE ' + ' AND '.join(where)
            sql += ' ORDER BY created_at DESC LIMIT 500'

            rows = db.execute(sql, tuple(params)).fetchall()
            out = []
            for r in rows:
                d = dict(r)
                # Parse payment_details JSON for display (admin only)
                if role in ('admin', 'superadmin') and d.get('payment_details'):
                    try:
                        d['payment_details'] = json.loads(d['payment_details'])
                    except Exception:
                        pass
                else:
                    d.pop('payment_details', None)  # Hide from non-admins
                out.append(d)
            return jsonify({'transactions': out, 'count': len(out)})
        except Exception as e:
            app.logger.error(f'list_transactions: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            # Return empty rather than 500 so the UI doesn't break
            return jsonify({'transactions': [], 'count': 0})

    @app.route('/api/transactions/<tid>', methods=['DELETE'])
    @token_required
    def delete_transaction(tid):
        """Soft delete — sets deleted_by_user=1. User no longer sees it but
        admin still can. Admin can hard delete by passing ?hard=1."""
        try:
            db = get_db()
            role = g.current_user['role']
            uid = g.current_user['user_id']

            row = db.execute('SELECT user_id, instructor_id FROM transactions WHERE id=?', (tid,)).fetchone()
            if not row:
                return jsonify({'error': 'Not found'}), 404

            if role in ('admin', 'superadmin') and request.args.get('hard') == '1':
                db.execute('DELETE FROM transactions WHERE id=?', (tid,))
                db.commit()
                return jsonify({'message': 'Permanently deleted'})

            # User can only soft-delete their own
            owns = (row['user_id'] == uid) or (row['instructor_id'] == uid) or role in ('admin', 'superadmin')
            if not owns:
                return jsonify({'error': 'Forbidden'}), 403

            db.execute('UPDATE transactions SET deleted_by_user=1, updated_at=CURRENT_TIMESTAMP WHERE id=?', (tid,))
            db.commit()
            return jsonify({'message': 'Hidden from your view'})
        except Exception as e:
            app.logger.error(f'delete_transaction: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed'}), 500

    # ── INSTRUCTOR EARNINGS SUMMARY ─────────────────────────────────────────
    @app.route('/api/instructor/earnings/summary', methods=['GET'])
    @token_required
    def instructor_earnings_summary():
        """Returns pending payout balance + lifetime stats for the logged-in user."""
        try:
            db = get_db()
            ensure_transactions_table(db)
            uid = g.current_user['user_id']
            pending = db.execute(
                """SELECT COALESCE(SUM(instructor_share), 0) as total FROM transactions
                   WHERE instructor_id=? AND type='purchase'
                     AND status='success' AND payout_status='pending'""", (uid,)
            ).fetchone()
            lifetime = db.execute(
                """SELECT COALESCE(SUM(instructor_share), 0) as total FROM transactions
                   WHERE instructor_id=? AND type='purchase' AND status='success'""", (uid,)
            ).fetchone()
            paid_out = db.execute(
                """SELECT COALESCE(SUM(amount), 0) as total FROM transactions
                   WHERE user_id=? AND type='payout' AND status='success'""", (uid,)
            ).fetchone()
            return jsonify({
                'pending_payout':  round(float(pending['total'] or 0), 2),
                'lifetime_earned': round(float(lifetime['total'] or 0), 2),
                'total_paid_out':  round(float(paid_out['total'] or 0), 2),
                'currency': 'GHS',
            })
        except Exception as e:
            app.logger.error(f'instructor_earnings_summary: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'pending_payout': 0, 'lifetime_earned': 0, 'total_paid_out': 0, 'currency': 'GHS'})

    # ── ADMIN PAYOUTS ────────────────────────────────────────────────────────
    @app.route('/api/admin/payouts/pending', methods=['GET'])
    @admin_required
    def admin_payouts_pending():
        """List every non-admin instructor with a pending payout balance."""
        try:
            db = get_db()
            ensure_transactions_table(db)
            rows = db.execute(
                """SELECT instructor_id, COALESCE(SUM(instructor_share), 0) as pending
                   FROM transactions
                   WHERE type='purchase' AND status='success'
                     AND payout_status='pending' AND instructor_id IS NOT NULL
                   GROUP BY instructor_id
                   HAVING SUM(instructor_share) > 0
                   ORDER BY pending DESC"""
            ).fetchall()
            out = []
            total_pending = 0.0
            for r in rows:
                iid = r['instructor_id']
                if not iid: continue
                ur = db.execute(
                    'SELECT name, email, role, payment_method, payment_details FROM users WHERE id=?',
                    (iid,)
                ).fetchone()
                if not ur or ur['role'] in ('admin', 'superadmin'):
                    continue
                pd = None
                try:
                    if ur['payment_details']:
                        pd = json.loads(ur['payment_details']) if isinstance(ur['payment_details'], str) else ur['payment_details']
                except Exception:
                    pd = None
                has_method = bool(ur['payment_method']) and bool(pd)
                method_label = '(not set up)'
                if has_method:
                    if ur['payment_method'] == 'momo':
                        method_label = f"{pd.get('provider','MoMo')} · {pd.get('phone','')}"
                    elif ur['payment_method'] == 'bank':
                        method_label = f"{pd.get('bank_name','Bank')} · {pd.get('account_number','')}"
                pending = float(r['pending'] or 0)
                total_pending += pending
                out.append({
                    'instructor_id': iid,
                    'name': ur['name'] or 'Unknown',
                    'email': ur['email'] or '',
                    'pending': round(pending, 2),
                    'method': ur['payment_method'] or None,
                    'method_label': method_label,
                    'has_payment_method': has_method,
                })
            return jsonify({
                'instructors': out,
                'total_pending': round(total_pending, 2),
                'currency': 'GHS',
            })
        except Exception as e:
            app.logger.error(f'admin_payouts_pending: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'instructors': [], 'total_pending': 0, 'currency': 'GHS'})

    def _do_payout_for_instructor(db, instructor_id):
        """Internal helper: pay one instructor their pending balance."""
        from .payments import process_payout
        pending_rows = db.execute(
            """SELECT id, instructor_share FROM transactions
               WHERE instructor_id=? AND type='purchase'
                 AND status='success' AND payout_status='pending'""",
            (instructor_id,)
        ).fetchall()
        if not pending_rows:
            return {'ok': False, 'reason': 'No pending balance.'}
        amount = round(sum(float(r['instructor_share'] or 0) for r in pending_rows), 2)
        if amount <= 0:
            return {'ok': False, 'reason': 'Balance is zero.'}
        ur = db.execute(
            'SELECT name, email, payment_method, payment_details FROM users WHERE id=?',
            (instructor_id,)
        ).fetchone()
        if not ur:
            return {'ok': False, 'reason': 'Instructor not found.'}
        try:
            pd = json.loads(ur['payment_details']) if ur['payment_details'] else None
        except Exception:
            pd = None
        if not ur['payment_method'] or not pd:
            return {'ok': False, 'reason': 'Instructor has not set up a payment method.'}
        pay = process_payout(
            instructor={
                'id': instructor_id, 'name': ur['name'], 'email': ur['email'],
                'payment_method': ur['payment_method'], 'payment_details': pd,
            },
            amount=amount, currency='GHS',
        )
        payout_status = pay.get('status') or 'pending'
        if payout_status not in ('success', 'pending'):
            return {'ok': False, 'reason': pay.get('message') or 'Payout was not accepted by the payment provider.'}
        db.execute(
            '''INSERT INTO transactions
               (id, receipt_id, type, user_id, user_name, user_email,
                instructor_id, amount, currency,
                instructor_share, platform_share,
                status, provider, provider_ref, payment_method, payment_details,
                payout_status, notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (pay['id'], pay['receipt_id'], 'payout',
             instructor_id, ur['name'], ur['email'],
             instructor_id, amount, 'GHS', amount, 0,
             payout_status, pay['provider'], pay['provider_ref'],
             ur['payment_method'], json.dumps(pd), 'n/a',
             f"Payout for {len(pending_rows)} purchase(s)")
        )
        for r in pending_rows:
            db.execute(
                """UPDATE transactions SET payout_status=?, payout_transaction_id=?,
                   updated_at=CURRENT_TIMESTAMP WHERE id=?""",
                ('paid', pay['id'], r['id'])
            )
        db.commit()
        return {
            'ok': True, 'amount': amount,
            'receipt_id': pay['receipt_id'], 'transaction_id': pay['id'],
            'provider': pay['provider'],
            'status': payout_status,
            'message': (f'Payout of GH₵ {amount:.2f} sent to {ur["name"]}.' if payout_status == 'success'
                        else f'Payout of GH₵ {amount:.2f} to {ur["name"]} is processing; it will be confirmed by the payment provider.'),
        }

    @app.route('/api/admin/payouts/pay/<instructor_id>', methods=['POST'])
    @admin_required
    def admin_pay_instructor(instructor_id):
        try:
            db = get_db()
            ensure_transactions_table(db)
            result = _do_payout_for_instructor(db, instructor_id)
            if not result.get('ok'):
                return jsonify({'error': result.get('reason', 'Payout failed')}), 400
            return jsonify(result)
        except Exception as e:
            app.logger.error(f'admin_pay_instructor: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Payout failed', 'detail': _err_detail(e)}), 500

    def _manual_payout_for_instructor(db, instructor_id, reference, note, admin_id):
        """Admin pays an instructor from their own account and records it here.
        No Paystack transfer. Marks the instructor's pending earnings as paid and
        closes any open payout request. Returns (ok, amount, error)."""
        pending_rows = db.execute(
            """SELECT id, instructor_share FROM transactions
               WHERE instructor_id=? AND type='purchase'
                 AND status='success' AND payout_status='pending'""",
            (instructor_id,)).fetchall()
        amount = round(sum(float(r['instructor_share'] or 0) for r in pending_rows), 2)
        if not pending_rows or amount <= 0:
            return False, 0, 'No pending balance to pay.'
        ur = db.execute('SELECT name, email FROM users WHERE id=?', (instructor_id,)).fetchone()
        if not ur:
            return False, 0, 'Instructor not found.'

        payout_id = str(uuid.uuid4())
        receipt_id = f'PAY-M-{datetime.now().strftime("%Y%m%d")}-{payout_id[:8].upper()}'
        db.execute(
            """INSERT INTO transactions
               (id, receipt_id, type, user_id, user_name, user_email,
                instructor_id, amount, currency,
                instructor_share, platform_share,
                status, provider, provider_ref, payment_method, payment_details,
                payout_status, notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (payout_id, receipt_id, 'payout',
             instructor_id, ur['name'], ur['email'],
             instructor_id, amount, 'GHS', amount, 0,
             'success', 'manual', reference or None, None, None,
             'paid',
             (f'Manual payout by admin{f" ({reference})" if reference else ""}'
              + (f' — {note}' if note else ''))))
        for r in pending_rows:
            db.execute(
                """UPDATE transactions SET payout_status='paid', payout_transaction_id=?,
                   updated_at=CURRENT_TIMESTAMP WHERE id=?""",
                (payout_id, r['id']))
        # Close any open payout request from this instructor, if there is one.
        db.execute(
            """UPDATE payout_requests SET status='sent', processed_at=CURRENT_TIMESTAMP,
               processed_by=?, reference=COALESCE(?, reference), admin_note=COALESCE(?, admin_note)
               WHERE instructor_id=? AND status='requested'""",
            (admin_id, reference or None, note or None, instructor_id))
        db.commit()

        try:
            subject = f'Your payout of GH₵ {amount:.2f} has been sent'
            html = (f'<p>Hi {ur["name"] or "there"},</p>'
                    f'<p>Your payout of <strong>GH₵ {amount:.2f}</strong> has been sent.</p>'
                    f'{f"<p>Reference: {reference}</p>" if reference else ""}'
                    f'<p>— LearnAfrica</p>')
            text = f'Your payout of GH₵ {amount:.2f} has been sent.'
            _send_via_sendpulse(ur['email'], ur['name'] or '', subject, html, text)
        except Exception as _mail_err:
            app.logger.warning(f'manual payout email failed: {_mail_err}')

        return True, amount, None

    @app.route('/api/admin/payouts/pay-manual/<instructor_id>', methods=['POST'])
    @admin_required
    def admin_pay_instructor_manual(instructor_id):
        """Admin pays an instructor manually (no request needed) and marks it paid."""
        try:
            d = request.get_json(silent=True) or {}
            reference = (d.get('reference') or '').strip()
            note      = (d.get('note') or '').strip()
            db = get_db()
            ensure_transactions_table(db)
            ok, amount, err = _manual_payout_for_instructor(
                db, instructor_id, reference, note, g.current_user['user_id'])
            if not ok:
                return jsonify({'error': err}), 400
            return jsonify({'message': f'Marked paid. GH₵ {amount:.2f} paid to instructor.',
                            'amount': amount, 'status': 'paid'})
        except Exception as e:
            app.logger.error(f'admin_pay_instructor_manual: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Manual payout failed', 'detail': _err_detail(e)}), 500

    @app.route('/api/admin/payouts/pay-all-manual', methods=['POST'])
    @admin_required
    def admin_pay_all_manual():
        """Admin pays every instructor with a pending balance manually."""
        try:
            d = request.get_json(silent=True) or {}
            reference = (d.get('reference') or '').strip()
            db = get_db()
            ensure_transactions_table(db)
            rows = db.execute(
                """SELECT instructor_id FROM transactions
                   WHERE type='purchase' AND status='success'
                     AND payout_status='pending' AND instructor_id IS NOT NULL
                   GROUP BY instructor_id
                   HAVING SUM(instructor_share) > 0"""
            ).fetchall()
            paid, failed = [], []
            for r in rows:
                iid = r['instructor_id']
                ur = db.execute('SELECT role FROM users WHERE id=?', (iid,)).fetchone()
                if not ur or ur['role'] in ('admin', 'superadmin'):
                    continue
                ok, amount, err = _manual_payout_for_instructor(
                    db, iid, reference, None, g.current_user['user_id'])
                if ok:
                    paid.append({'instructor_id': iid, 'amount': amount})
                else:
                    failed.append({'instructor_id': iid, 'reason': err})
            return jsonify({
                'paid_count': len(paid), 'paid': paid,
                'failed_count': len(failed), 'failed': failed,
                'message': f'Marked {len(paid)} paid, {len(failed)} failed.',
            })
        except Exception as e:
            app.logger.error(f'admin_pay_all_manual: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Bulk manual payout failed', 'detail': _err_detail(e)}), 500

    @app.route('/api/admin/payouts/pay-all', methods=['POST'])
    @admin_required
    def admin_pay_all_instructors():
        try:
            db = get_db()
            ensure_transactions_table(db)
            rows = db.execute(
                """SELECT instructor_id FROM transactions
                   WHERE type='purchase' AND status='success'
                     AND payout_status='pending' AND instructor_id IS NOT NULL
                   GROUP BY instructor_id
                   HAVING SUM(instructor_share) > 0"""
            ).fetchall()
            paid, skipped, failed = [], [], []
            for r in rows:
                iid = r['instructor_id']
                ur = db.execute('SELECT role FROM users WHERE id=?', (iid,)).fetchone()
                if not ur or ur['role'] in ('admin', 'superadmin'):
                    continue
                result = _do_payout_for_instructor(db, iid)
                if result.get('ok'):
                    paid.append({'instructor_id': iid, 'amount': result['amount'], 'receipt_id': result['receipt_id']})
                elif 'payment method' in (result.get('reason') or '').lower():
                    skipped.append({'instructor_id': iid, 'reason': result.get('reason')})
                else:
                    failed.append({'instructor_id': iid, 'reason': result.get('reason')})
            return jsonify({
                'paid_count': len(paid), 'paid': paid,
                'skipped_count': len(skipped), 'skipped': skipped,
                'failed_count': len(failed), 'failed': failed,
                'message': f'Paid {len(paid)}, skipped {len(skipped)}, failed {len(failed)}.',
            })
        except Exception as e:
            app.logger.error(f'admin_pay_all_instructors: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Bulk payout failed', 'detail': _err_detail(e)}), 500

    # ────────────────────────────────────────────────────────────────────────
    # ── MANUAL PAYOUT REQUESTS ────────────────────────────────────────────────
    # Used while the Paystack account is a Starter Business, which cannot use
    # Paystack Transfers. The instructor taps "Request payment"; an admin pays
    # from their own account and marks the request sent, which marks the
    # instructor's pending earnings as paid.
    # ────────────────────────────────────────────────────────────────────────

    def _payout_breakdown(db, instructor_id):
        """Return (total_earned, total_paid, requested, available) for an instructor.

        Earnings from admin-owned courses are booked with payout_status='n/a'
        because an admin already receives 100% of their own course revenue
        directly; those must never count toward a payable balance.
        """
        earned_row = db.execute(
            "SELECT COALESCE(SUM(instructor_share), 0) as t FROM transactions"
            " WHERE instructor_id=? AND type='purchase' AND status='success'"
            " AND (payout_status IS NULL OR payout_status != 'n/a')",
            (instructor_id,)).fetchone()
        total_earned = round(float(earned_row['t'] or 0), 2) if earned_row else 0.0
        paid_row = db.execute(
            "SELECT COALESCE(SUM(instructor_share), 0) as t FROM transactions"
            " WHERE instructor_id=? AND type='purchase' AND status='success'"
            " AND payout_status='paid'", (instructor_id,)).fetchone()
        total_paid = round(float(paid_row['t'] or 0), 2) if paid_row else 0.0
        req_row = db.execute(
            "SELECT COALESCE(SUM(amount), 0) as t FROM payout_requests"
            " WHERE instructor_id=? AND status='requested'", (instructor_id,)).fetchone()
        requested = round(float(req_row['t'] or 0), 2) if req_row else 0.0
        available = round(max(0.0, total_earned - total_paid - requested), 2)
        return total_earned, total_paid, requested, available

    @app.route('/api/instructor/payouts/summary', methods=['GET'])
    @instructor_required
    def instructor_payout_summary():
        """Earnings breakdown + payout request history for the current instructor."""
        try:
            db = get_db()
            ensure_transactions_table(db)
            uid = g.current_user['user_id']
            is_admin = g.current_user.get('role') in ('admin', 'superadmin')
            total_earned, total_paid, requested, available = _payout_breakdown(db, uid)
            rows = db.execute(
                "SELECT id, amount, currency, status, method, details, reference, admin_note,"
                " CAST(requested_at AS TEXT) as requested_at, CAST(processed_at AS TEXT) as processed_at"
                " FROM payout_requests WHERE instructor_id=? ORDER BY requested_at DESC LIMIT 50",
                (uid,)).fetchall()
            requests = []
            for r in rows:
                d = dict(r)
                try:
                    d['details'] = json.loads(d['details']) if d.get('details') else None
                except Exception:
                    d['details'] = None
                requests.append(d)
            return jsonify({
                'total_earned': total_earned, 'total_paid': total_paid,
                'requested': requested, 'available': available,
                'currency': 'GHS', 'requests': requests,
                # Admins own the platform and keep 100% of their own course
                # revenue directly, so payouts never apply to them. The UI uses
                # this to hide the request button; the request route enforces it.
                'is_admin': is_admin, 'payout_eligible': not is_admin,
            })
        except Exception as e:
            app.logger.error(f'instructor_payout_summary: {e}')
            return jsonify({'total_earned': 0, 'total_paid': 0, 'requested': 0,
                            'available': 0, 'currency': 'GHS', 'requests': []})

    @app.route('/api/instructor/payouts/request', methods=['POST'])
    @instructor_required
    def instructor_request_payout():
        """Instructor requests their available balance. The admin pays manually
        (from their own account) within 24 hours and marks it sent."""
        try:
            # Admins own the platform and are paid their own course revenue
            # directly, so they must never request a payout. @instructor_required
            # lets admins through (they have implicit instructor access), so the
            # block has to live here.
            if g.current_user.get('role') in ('admin', 'superadmin'):
                return jsonify({
                    'error': 'Admin accounts do not request payouts',
                    'code': 'admin_no_payout',
                    'message': 'You are an admin. Course revenue from your own courses '
                               'is received directly; payout requests apply to instructors only.',
                }), 403
            db = get_db()
            ensure_transactions_table(db)
            uid = g.current_user['user_id']
            ur = db.execute(
                'SELECT name, email, payment_method, payment_details FROM users WHERE id=?',
                (uid,)).fetchone()
            if not ur:
                return jsonify({'error': 'Account not found.'}), 404
            pd = None
            try:
                if ur['payment_details']:
                    pd = json.loads(ur['payment_details']) if isinstance(ur['payment_details'], str) else ur['payment_details']
            except Exception:
                pd = None
            if not ur['payment_method'] or not pd:
                return jsonify({'error': 'Add a payout method on your profile before requesting payment.'}), 400

            # Block a second request while one is already in flight.
            open_req = db.execute(
                "SELECT id, amount FROM payout_requests"
                " WHERE instructor_id=? AND status='requested'", (uid,)).fetchone()
            if open_req:
                return jsonify({
                    'error': 'You already have a payment request in progress.',
                    'request_id': open_req['id'], 'amount': float(open_req['amount'] or 0),
                }), 409

            _, _, _, available = _payout_breakdown(db, uid)
            if available < 1:
                return jsonify({'error': 'You have no balance available to request yet.'}), 400

            rid = str(uuid.uuid4())
            db.execute(
                """INSERT INTO payout_requests
                   (id, instructor_id, amount, currency, status, method, details)
                   VALUES (?,?,?,?,?,?,?)""",
                (rid, uid, available, 'GHS', 'requested', ur['payment_method'], json.dumps(pd)))
            db.commit()

            # Best-effort email to the instructor. Never let email failure
            # break the request.
            try:
                subject = f'Payout request received — GH₵ {available:.2f}'
                html = (f'<p>Hi {ur["name"] or "there"},</p>'
                        f'<p>We received your payout request for <strong>GH₵ {available:.2f}</strong>.</p>'
                        f'<p>We will send it to your saved {ur["payment_method"]} account within 24 hours.</p>'
                        f'<p>— LearnAfrica</p>')
                text = (f'Payout request received for GH₵ {available:.2f}. '
                        f'We will send it within 24 hours.')
                _send_via_sendpulse(ur['email'], ur['name'] or '', subject, html, text)
            except Exception as _mail_err:
                app.logger.warning(f'payout request email failed: {_mail_err}')

            return jsonify({
                'message': 'Request received. We will send your payment within 24 hours.',
                'request_id': rid, 'amount': available, 'currency': 'GHS',
                'status': 'requested',
            })
        except Exception as e:
            app.logger.error(f'instructor_request_payout: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Could not create payout request', 'detail': _err_detail(e)}), 500

    @app.route('/api/admin/payouts/requests', methods=['GET'])
    @admin_required
    def admin_payout_requests():
        """List payout requests. ?status=requested|sent|rejected|all"""
        try:
            db = get_db()
            ensure_transactions_table(db)
            status = (request.args.get('status') or 'requested').strip().lower()
            sql = ("SELECT pr.*, u.name as instructor_name, u.email as instructor_email,"
                   " u.payment_method as saved_method, u.payment_details as saved_details"
                   " FROM payout_requests pr LEFT JOIN users u ON u.id=pr.instructor_id")
            params = ()
            if status != 'all':
                sql += " WHERE pr.status=?"
                params = (status,)
            sql += " ORDER BY pr.requested_at DESC LIMIT 200"
            rows = db.execute(sql, params).fetchall()
            out = []
            for r in rows:
                d = dict(r)
                for k in ('details', 'saved_details'):
                    try:
                        d[k] = json.loads(d[k]) if d.get(k) else None
                    except Exception:
                        d[k] = None
                # The request stores a snapshot of the payout details. If the
                # instructor has since changed them, the admin must pay the
                # CURRENT number, not the stale snapshot.
                d['current_details'] = d.get('saved_details')
                d['current_method']  = d.get('saved_method')
                d['details_changed'] = bool(
                    d.get('details') and d.get('saved_details') and d['details'] != d['saved_details'])
                out.append(d)
            total = round(sum(float(r['amount'] or 0) for r in rows if r['status'] == 'requested'), 2)
            return jsonify({'requests': out, 'count': len(out),
                            'total_requested': total, 'currency': 'GHS'})
        except Exception as e:
            app.logger.error(f'admin_payout_requests: {e}')
            return jsonify({'requests': [], 'count': 0, 'total_requested': 0, 'currency': 'GHS'})

    @app.route('/api/admin/payouts/requests/<rid>/mark-sent', methods=['POST'])
    @admin_required
    def admin_mark_payout_sent(rid):
        """Mark a payout request as sent after paying the instructor manually.
        Marks that instructor's pending earnings as paid so the balance resets."""
        try:
            d = request.get_json(silent=True) or {}
            reference = (d.get('reference') or '').strip()
            note      = (d.get('note') or '').strip()
            db = get_db()
            ensure_transactions_table(db)
            req = db.execute('SELECT * FROM payout_requests WHERE id=?', (rid,)).fetchone()
            if not req:
                return jsonify({'error': 'Payout request not found.'}), 404
            if req['status'] != 'requested':
                return jsonify({'error': f'This request is already {req["status"]}.'}), 409
            iid = req['instructor_id']

            # Pay out the instructor's pending purchase rows (manual — no
            # Paystack transfer). This is the same bookkeeping the automated
            # path did, minus the provider call.
            pending_rows = db.execute(
                """SELECT id, instructor_share FROM transactions
                   WHERE instructor_id=? AND type='purchase'
                     AND status='success' AND payout_status='pending'""",
                (iid,)).fetchall()
            amount = round(sum(float(r['instructor_share'] or 0) for r in pending_rows), 2)
            payout_txn_id = str(uuid.uuid4())
            for r in pending_rows:
                db.execute(
                    """UPDATE transactions SET payout_status='paid', payout_transaction_id=?,
                       updated_at=CURRENT_TIMESTAMP WHERE id=?""",
                    (payout_txn_id, r['id']))
            db.execute(
                """UPDATE payout_requests SET status='sent', processed_at=CURRENT_TIMESTAMP,
                   processed_by=?, reference=?, admin_note=? WHERE id=?""",
                (g.current_user['user_id'], reference or None, note or None, rid))
            db.commit()

            try:
                ur = db.execute('SELECT name, email FROM users WHERE id=?', (iid,)).fetchone()
                if ur:
                    subject = f'Your payout of GH₵ {amount:.2f} has been sent'
                    html = (f'<p>Hi {ur["name"] or "there"},</p>'
                            f'<p>Your payout of <strong>GH₵ {amount:.2f}</strong> has been sent.</p>'
                            f'{f"<p>Reference: {reference}</p>" if reference else ""}'
                            f'<p>— LearnAfrica</p>')
                    text = f'Your payout of GH₵ {amount:.2f} has been sent.'
                    _send_via_sendpulse(ur['email'], ur['name'] or '', subject, html, text)
            except Exception as _mail_err:
                app.logger.warning(f'payout sent email failed: {_mail_err}')

            return jsonify({'message': f'Marked sent. GH₵ {amount:.2f} paid to instructor.',
                            'request_id': rid, 'amount': amount, 'status': 'sent'})
        except Exception as e:
            app.logger.error(f'admin_mark_payout_sent: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Could not mark payout sent', 'detail': _err_detail(e)}), 500

    @app.route('/api/admin/payouts/requests/<rid>/reject', methods=['POST'])
    @admin_required
    def admin_reject_payout(rid):
        try:
            d = request.get_json(silent=True) or {}
            note = (d.get('note') or '').strip()
            db = get_db()
            ensure_transactions_table(db)
            req = db.execute('SELECT * FROM payout_requests WHERE id=?', (rid,)).fetchone()
            if not req:
                return jsonify({'error': 'Payout request not found.'}), 404
            if req['status'] != 'requested':
                return jsonify({'error': f'This request is already {req["status"]}.'}), 409
            db.execute(
                """UPDATE payout_requests SET status='rejected', processed_at=CURRENT_TIMESTAMP,
                   processed_by=?, admin_note=? WHERE id=?""",
                (g.current_user['user_id'], note or None, rid))
            db.commit()
            return jsonify({'message': 'Request rejected.', 'request_id': rid, 'status': 'rejected'})
        except Exception as e:
            app.logger.error(f'admin_reject_payout: {e}')
            return jsonify({'error': 'Could not reject payout', 'detail': _err_detail(e)}), 500

    @app.route('/api/admin/transactions/verify', methods=['POST'])
    @admin_required
    def admin_verify_transaction():
        """Admin enters a receipt_id or provider_ref to look up a transaction
        and verify/mark its status."""
        try:
            d = request.get_json() or {}
            lookup = (d.get('receipt_id') or d.get('reference') or '').strip()
            new_status = (d.get('mark_status') or '').strip().lower()
            if not lookup:
                return jsonify({'error': 'receipt_id or reference required'}), 400

            db = get_db()
            row = db.execute(
                'SELECT * FROM transactions WHERE receipt_id=? OR provider_ref=? OR id=?',
                (lookup, lookup, lookup)
            ).fetchone()
            if not row:
                return jsonify({'found': False, 'message': 'No transaction found with that ID/reference'})

            txn = dict(row)
            try:
                if txn.get('payment_details'):
                    txn['payment_details'] = json.loads(txn['payment_details'])
            except Exception:
                pass

            if new_status and new_status in ('pending', 'success', 'failed', 'refunded'):
                db.execute(
                    'UPDATE transactions SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
                    (new_status, txn['id'])
                )
                db.commit()
                txn['status'] = new_status

            return jsonify({'found': True, 'transaction': txn})
        except Exception as e:
            app.logger.error(f'admin_verify_transaction: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed', 'detail': _err_detail(e)}), 500

    # ────────────────────────────────────────────────────────────────────────
    # ── PAYMENT INITIATION (for paid courses)
    # ────────────────────────────────────────────────────────────────────────
    @app.route('/api/courses/<cid>/purchase', methods=['POST'])
    @token_required
    def purchase_course(cid):
        """Initiate a course purchase.

        Body: {
          payment_method: 'any' | 'mtn_momo' | 'vodafone_cash' | 'airteltigo_money' | 'card' | 'bank_transfer',
          payment_details: {
             name, phone, city   (contact details for the receipt)
          }
        }

        The card number, CVV and mobile-money number are entered once on
        Paystack's hosted checkout — they never pass through this server.

        In mock mode: payment succeeds immediately, student is enrolled,
        split is recorded (admin-owned = 100%, others = configured 80/20).
        In Paystack mode: returns checkout_url for redirect; webhook later
        confirms + enrolls.
        """
        try:
            from .payments import initiate_payment, compute_split

            if _user_role(get_db(), g.current_user['user_id']) != 'student':
                return jsonify({'error': 'Only student accounts can buy courses.'}), 403

            body = request.get_json() or {}
            payment_method  = body.get('payment_method') or 'card'
            payment_details = body.get('payment_details') or {}
            coupon_code     = (body.get('coupon_code') or '').strip().upper()

            # Validate payment_method. `any` lets the student choose the channel
            # on Paystack's hosted page; the named values pre-select one.
            valid_methods = ('any', 'mtn_momo', 'vodafone_cash', 'airteltigo_money', 'card', 'bank_transfer')
            if payment_method not in valid_methods:
                return jsonify({'error': f'Invalid payment method. Must be one of: {", ".join(valid_methods)}'}), 400

            # Payment details are the student's own contact info (name/phone/
            # city), not card data — the card or momo details are entered on
            # Paystack's hosted page. Keep only known, safe fields.
            payment_details = {
                'name':  (payment_details.get('name')  or '').strip(),
                'phone': (payment_details.get('phone') or '').strip(),
                'city':  (payment_details.get('city')  or '').strip(),
            }
            if payment_method in ('mtn_momo', 'vodafone_cash', 'airteltigo_money'):
                if not _is_valid_gh_phone(payment_details['phone']):
                    return jsonify({'error': 'A valid Ghana mobile money number is required, e.g. 0244123456.'}), 400
            payment_details['phone'] = _normalize_gh_phone(payment_details['phone'])

            db = get_db()
            ensure_transactions_table(db)
            course = db.execute(
                'SELECT id, title, instructor_id, price, is_free FROM courses WHERE id=?', (cid,)
            ).fetchone()
            if not course:
                return jsonify({'error': 'Course not found'}), 404
            if int(course['is_free'] or 0):
                return jsonify({'error': 'This course is free — use /enroll instead'}), 400
            amount = float(course['price'] or 0)
            if amount <= 0:
                return jsonify({'error': 'Course has no price set'}), 400

            uid = g.current_user['user_id']

            # Check if the student is already enrolled — no double-charge
            already = db.execute(
                'SELECT 1 FROM user_enrollments WHERE user_id=? AND course_id=?', (uid, cid)
            ).fetchone()
            if already:
                return jsonify({'error': 'You are already enrolled in this course.'}), 400

            user_row = db.execute(
                'SELECT name, email FROM users WHERE id=?', (uid,)
            ).fetchone()

            # ── COUPON VALIDATION & DISCOUNT ─────────────────────────────────
            # If the user provided a coupon_code, validate it against the
            # coupons table. On success we discount `amount` before the split
            # rules run; if invalid, we return a clear error (no charge).
            original_amount   = amount
            discount_applied  = 0.0
            applied_coupon    = None
            if coupon_code:
                cpn = db.execute(
                    'SELECT * FROM coupons WHERE UPPER(code)=? AND COALESCE(active,1)=1',
                    (coupon_code,)
                ).fetchone()
                if not cpn:
                    return jsonify({'error': 'Coupon code not found or inactive.'}), 400
                # Expiry check
                if cpn['expires_at']:
                    try:
                        from datetime import datetime as _dt
                        exp = cpn['expires_at']
                        if isinstance(exp, str):
                            exp = _dt.fromisoformat(exp.replace('Z','+00:00'))
                        if exp < _dt.now(exp.tzinfo if hasattr(exp,'tzinfo') else None):
                            return jsonify({'error': 'This coupon has expired.'}), 400
                    except Exception:
                        pass
                # Max uses check
                if cpn['max_uses'] and int(cpn['current_uses'] or 0) >= int(cpn['max_uses']):
                    return jsonify({'error': 'This coupon has reached its usage limit.'}), 400
                # Applicability check
                applies_to = (cpn['applies_to'] or 'all').lower()
                if applies_to == 'course' and cpn['course_id'] and cpn['course_id'] != cid:
                    return jsonify({'error': "This coupon doesn't apply to this course."}), 400
                # Compute discount
                dtype = (cpn['discount_type'] or 'percent').lower()
                dval  = float(cpn['discount_value'] or 0)
                if dtype == 'percent':
                    discount_applied = round(amount * (dval / 100.0), 2)
                else:
                    discount_applied = round(min(dval, amount), 2)
                if discount_applied < 0:
                    discount_applied = 0
                # Clamp so amount never goes negative
                if discount_applied > amount:
                    discount_applied = amount
                amount = round(amount - discount_applied, 2)
                applied_coupon = {'id': cpn['id'], 'code': cpn['code']}
                # If discount makes it free — enroll now, skip payment.
                if amount <= 0:
                    try:
                        db.execute(
                            'INSERT INTO user_enrollments (id, user_id, course_id, enrolled_at, progress) VALUES (?,?,?,CURRENT_TIMESTAMP,0)',
                            (str(uuid.uuid4()), uid, cid)
                        )
                        # Record a zero-value transaction with the coupon
                        import uuid as _uuid
                        tx_id = str(_uuid.uuid4())
                        receipt_id = f'LA-{tx_id[:8].upper()}'
                        db.execute(
                            '''INSERT INTO transactions
                               (id, receipt_id, type, user_id, user_name, user_email,
                                course_id, course_title, instructor_id, amount, currency,
                                instructor_share, platform_share, status, provider, provider_ref,
                                payment_method, payment_details, payout_status,
                                coupon_code, discount_applied, original_amount)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                            (tx_id, receipt_id, 'purchase',
                             uid, user_row['name'], user_row['email'],
                             cid, course['title'], course['instructor_id'],
                             0.0, 'GHS', 0.0, 0.0, 'success', 'coupon_free', receipt_id,
                             'coupon', json.dumps({'coupon_code': applied_coupon['code']}),
                             'n/a', applied_coupon['code'], discount_applied, original_amount)
                        )
                        # Increment coupon uses
                        db.execute(
                            'UPDATE coupons SET current_uses = COALESCE(current_uses,0) + 1 WHERE id=?',
                            (applied_coupon['id'],)
                        )
                        db.commit()
                        return jsonify({
                            'transaction_id': tx_id,
                            'receipt_id': receipt_id,
                            'status': 'success',
                            'provider': 'coupon_free',
                            'amount': 0.0,
                            'currency': 'GHS',
                            'payment_method': 'coupon',
                            'enrolled': True,
                            'coupon_code': applied_coupon['code'],
                            'discount_applied': discount_applied,
                            'original_amount': original_amount,
                            'message': f'Coupon {applied_coupon["code"]} applied — you are enrolled for free!'
                        })
                    except Exception as _cf_err:
                        app.logger.warning(f'coupon-free enrollment failed: {_cf_err}')
                        # Fall through to normal flow if enrollment fails

            # ── SPLIT RULES ──────────────────────────────────────────────────
            # If the course's instructor is an admin/superadmin, the full
            # amount stays with the admin (100% instructor share, 0% platform
            # share, payout_status='n/a' because admin already has the money).
            # Otherwise, use the configured split (e.g. 80/20).
            instructor_row = db.execute(
                'SELECT role FROM users WHERE id=?', (course['instructor_id'],)
            ).fetchone()
            instructor_is_admin = bool(instructor_row) and instructor_row['role'] in ('admin', 'superadmin')

            if instructor_is_admin:
                instr_share = float(amount)
                plat_share  = 0.0
                payout_status = 'n/a'
            else:
                instructor_pct, _admin_pct = get_revenue_split(db)
                instr_share, plat_share = compute_split(amount, instructor_pct)
                payout_status = 'pending'

            # Initiate via payment provider abstraction
            pay = initiate_payment(
                user={'id': uid, 'name': user_row['name'], 'email': user_row['email']},
                course={'id': cid, 'title': course['title']},
                amount=amount, currency='GHS',
                payment_method=payment_method, payment_details=payment_details,
            )

            # If the provider returned a hard error (e.g. Paystack init failed),
            # bail here with a real error message. Do NOT save a stuck-pending row.
            if pay.get('error') or (pay.get('provider') == 'paystack' and not pay.get('checkout_url')):
                error_msg = pay.get('error') or 'Payment gateway did not return a checkout URL.'
                app.logger.error(f'Payment init failed for user={uid} course={cid}: {error_msg}')
                return jsonify({
                    'error': 'Could not start payment. Please try again or contact support.',
                    'detail': _err_detail(error_msg),
                }), 502

            db.execute(
                '''INSERT INTO transactions
                   (id, receipt_id, type, user_id, user_name, user_email,
                    course_id, course_title, instructor_id, amount, currency,
                    instructor_share, platform_share, status, provider, provider_ref,
                    payment_method, payment_details, payout_status,
                    coupon_code, discount_applied, original_amount)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                (pay['id'], pay['receipt_id'], 'purchase',
                 uid, user_row['name'], user_row['email'],
                 cid, course['title'], course['instructor_id'],
                 amount, 'GHS', instr_share, plat_share,
                 pay['status'], pay['provider'], pay['provider_ref'],
                 payment_method, json.dumps(payment_details), payout_status,
                 applied_coupon['code'] if applied_coupon else None,
                 discount_applied, original_amount)
            )

            # Increment coupon uses if a coupon was applied
            if applied_coupon:
                try:
                    db.execute(
                        'UPDATE coupons SET current_uses = COALESCE(current_uses,0) + 1 WHERE id=?',
                        (applied_coupon['id'],)
                    )
                except Exception as _cu_err:
                    app.logger.warning(f'coupon usage increment failed: {_cu_err}')

            # If payment succeeded immediately (mock or verified Paystack) —
            # enroll the student NOW so they can access the course.
            if pay['status'] == 'success':
                try:
                    db.execute(
                        'INSERT INTO user_enrollments (id, user_id, course_id, enrolled_at, progress) VALUES (?,?,?,CURRENT_TIMESTAMP,0)',
                        (str(uuid.uuid4()), uid, cid)
                    )
                except Exception as enroll_err:
                    app.logger.warning(f'enroll after purchase failed (non-fatal): {enroll_err}')

            db.commit()

            return jsonify({
                'transaction_id': pay['id'],
                'receipt_id':     pay['receipt_id'],
                'checkout_url':   pay.get('checkout_url') or '',
                'status':         pay['status'],
                'provider':       pay['provider'],
                'amount':         amount,
                'original_amount': original_amount,
                'discount_applied': discount_applied,
                'coupon_code':    applied_coupon['code'] if applied_coupon else None,
                'currency':       'GHS',
                'payment_method': payment_method,
                'enrolled':       pay['status'] == 'success',
                'message': (
                    'Payment successful! You are now enrolled.'
                    if pay['status'] == 'success'
                    else 'Redirecting to payment gateway...' if pay.get('checkout_url')
                    else 'Payment recorded as pending.'
                ),
            })
        except Exception as e:
            import traceback
            app.logger.error(f'purchase_course FAILED: {e}\n{traceback.format_exc()}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Payment initiation failed', 'detail': _err_detail(e)}), 500

    # ────────────────────────────────────────────────────────────────────────
    # ── PAYSTACK WEBHOOK (called by Paystack when real payments settle)
    # ────────────────────────────────────────────────────────────────────────
    # In mock mode this endpoint is never called — payment succeeds inline.
    # In Paystack mode, configure this URL in the Paystack dashboard:
    #   https://<your-domain>/api/payments/paystack/webhook
    @app.route('/api/payments/paystack/webhook', methods=['POST'])
    def paystack_webhook():
        """Receive Paystack event notifications (charge.success, transfer.success, etc)."""
        try:
            import hashlib, hmac
            secret = os.environ.get('PAYSTACK_SECRET_KEY') or ''
            payload = request.get_data()

            # Verify signature (Paystack sends x-paystack-signature header).
            # If no secret is configured we MUST reject: otherwise anyone could
            # POST a forged charge.success and get a free enrollment.
            if not secret:
                app.logger.error('Paystack webhook received but PAYSTACK_SECRET_KEY is not set')
                return jsonify({'error': 'Payment provider not configured'}), 503
            signature = request.headers.get('x-paystack-signature', '')
            computed = hmac.new(secret.encode(), payload, hashlib.sha512).hexdigest()
            if not hmac.compare_digest(signature, computed):
                app.logger.warning('Paystack webhook: bad signature')
                return jsonify({'error': 'Invalid signature'}), 401

            body = request.get_json(silent=True) or {}
            event = body.get('event') or ''
            data  = body.get('data') or {}
            ref   = data.get('reference') or ''
            db    = get_db()
            ensure_transactions_table(db)

            # charge.success — a course purchase completed
            if event == 'charge.success' and ref:
                pstatus = data.get('status')
                if pstatus == 'success':
                    # Update the transaction to success and enroll the student
                    tx = db.execute(
                        "SELECT id, user_id, course_id, status FROM transactions WHERE id=? OR provider_ref=?",
                        (ref, ref)
                    ).fetchone()
                    if tx and tx['status'] != 'success':
                        db.execute(
                            "UPDATE transactions SET status='success', updated_at=CURRENT_TIMESTAMP WHERE id=?",
                            (tx['id'],)
                        )
                        # Enroll if not already
                        if tx['user_id'] and tx['course_id']:
                            already = db.execute(
                                'SELECT 1 FROM user_enrollments WHERE user_id=? AND course_id=?',
                                (tx['user_id'], tx['course_id'])
                            ).fetchone()
                            if not already:
                                try:
                                    db.execute(
                                        'INSERT INTO user_enrollments (id, user_id, course_id, enrolled_at, progress) VALUES (?,?,?,CURRENT_TIMESTAMP,0)',
                                        (str(uuid.uuid4()), tx['user_id'], tx['course_id'])
                                    )
                                except Exception as e:
                                    app.logger.warning(f'webhook enroll failed: {e}')
                        db.commit()
                        app.logger.info(f'Paystack charge.success processed for {ref}')

            # transfer.success / transfer.failed — a payout to an instructor completed
            elif event in ('transfer.success', 'transfer.failed', 'transfer.reversed') and ref:
                new_status = 'success' if event == 'transfer.success' else 'failed'
                tx = db.execute(
                    "SELECT id FROM transactions WHERE type='payout' AND (id=? OR provider_ref=?)",
                    (ref, ref)
                ).fetchone()
                if tx:
                    db.execute(
                        "UPDATE transactions SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                        (new_status, tx['id'])
                    )
                    # If the transfer failed, revert the purchase rows to 'pending' so admin can retry
                    if new_status == 'failed':
                        db.execute(
                            """UPDATE transactions SET payout_status='pending', payout_transaction_id=NULL
                               WHERE payout_transaction_id=?""",
                            (tx['id'],)
                        )
                    db.commit()
                    app.logger.info(f'Paystack {event} processed for {ref}')

            return jsonify({'ok': True})
        except Exception as e:
            app.logger.error(f'paystack_webhook error: {e}')
            # Always return 200 to Paystack so they don't retry endlessly on our bugs
            return jsonify({'ok': False, 'error': 'Webhook processing failed'})

    # ────────────────────────────────────────────────────────────────────────
    # ── COUPONS: create, list, update, delete, validate
    # ────────────────────────────────────────────────────────────────────────
    def _serialize_coupon(row):
        d = safe_dict(row)
        # Normalise types for the frontend
        d['discount_value'] = float(d.get('discount_value') or 0)
        d['current_uses']   = int(d.get('current_uses') or 0)
        if d.get('max_uses') is not None:
            try: d['max_uses'] = int(d['max_uses'])
            except Exception: d['max_uses'] = None
        d['active'] = bool(int(d.get('active') or 0))
        return d

    def _coupon_can_manage(db, coupon_row, user):
        """A coupon can be managed by:
        - Admin/superadmin (any coupon)
        - Its creator (created_by matches user)
        - Instructor whose course_id matches (for course-specific coupons)
        """
        if not coupon_row:
            return False
        role = user.get('role')
        uid  = user.get('user_id')
        if role in ('admin', 'superadmin'):
            return True
        if coupon_row['created_by'] == uid:
            return True
        # If it targets a specific course this instructor owns, allow
        if coupon_row['course_id']:
            c = db.execute('SELECT instructor_id FROM courses WHERE id=?', (coupon_row['course_id'],)).fetchone()
            if c and c['instructor_id'] == uid:
                return True
        return False

    @app.route('/api/coupons', methods=['POST'])
    @token_required
    def create_coupon():
        _ensure_new_tables()
        """Create a new coupon. Instructor OR admin.
        Body: { code, discount_type ('percent'|'fixed'), discount_value,
                applies_to ('all'|'course'|'instructor'), course_id?,
                max_uses?, expires_at? }
        Instructors can only create 'course' coupons for their own courses,
        or 'instructor' coupons (all their courses). Admins can create 'all'.
        """
        try:
            user = g.current_user
            role = user.get('role')
            if role not in ('admin', 'superadmin', 'instructor'):
                return jsonify({'error': 'Only instructors or admins can create coupons.'}), 403

            body = request.get_json() or {}
            code = (body.get('code') or '').strip().upper()
            if not code or len(code) < 3:
                return jsonify({'error': 'Code must be at least 3 characters.'}), 400
            import re as _re
            if not _re.match(r'^[A-Z0-9_-]+$', code):
                return jsonify({'error': 'Code can only contain letters, numbers, - and _.'}), 400
            if len(code) > 40:
                return jsonify({'error': 'Code is too long (max 40 chars).'}), 400

            dtype = (body.get('discount_type') or 'percent').lower()
            if dtype not in ('percent', 'fixed'):
                return jsonify({'error': "discount_type must be 'percent' or 'fixed'."}), 400
            try:
                dval = float(body.get('discount_value'))
            except (TypeError, ValueError):
                return jsonify({'error': 'discount_value is required and must be a number.'}), 400
            if dval <= 0:
                return jsonify({'error': 'discount_value must be greater than 0.'}), 400
            if dtype == 'percent' and dval > 100:
                return jsonify({'error': 'Percentage discount cannot exceed 100.'}), 400

            applies_to = (body.get('applies_to') or 'all').lower()
            if applies_to not in ('all', 'course', 'instructor'):
                return jsonify({'error': "applies_to must be 'all', 'course', or 'instructor'."}), 400
            course_id = (body.get('course_id') or '').strip() or None

            db = get_db()
            # Instructor restrictions:
            if role == 'instructor':
                if applies_to == 'all':
                    return jsonify({'error': "Instructors can't create platform-wide coupons. Use 'course' or 'instructor'."}), 403
                if applies_to == 'course':
                    if not course_id:
                        return jsonify({'error': 'course_id is required for course-specific coupon.'}), 400
                    owned = db.execute('SELECT 1 FROM courses WHERE id=? AND instructor_id=?', (course_id, user['user_id'])).fetchone()
                    if not owned:
                        return jsonify({'error': 'You can only create coupons for courses you own.'}), 403

            # Uniqueness of code
            existing = db.execute('SELECT id FROM coupons WHERE UPPER(code)=?', (code,)).fetchone()
            if existing:
                return jsonify({'error': f'Code "{code}" already exists. Pick a different one.'}), 400

            max_uses_raw = body.get('max_uses')
            try:
                max_uses = int(max_uses_raw) if max_uses_raw not in (None, '', 0) else None
                if max_uses is not None and max_uses <= 0:
                    max_uses = None
            except (TypeError, ValueError):
                max_uses = None

            expires_at = body.get('expires_at') or None
            if expires_at:
                # Accept ISO date or datetime — store as-is
                expires_at = str(expires_at).strip()
                if not expires_at:
                    expires_at = None

            cid = str(uuid.uuid4())
            db.execute(
                '''INSERT INTO coupons
                   (id, code, discount_type, discount_value, applies_to, course_id,
                    max_uses, current_uses, expires_at, active, created_by, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)''',
                (cid, code, dtype, dval, applies_to, course_id,
                 max_uses, 0, expires_at, 1, user['user_id'])
            )
            db.commit()
            row = db.execute('SELECT * FROM coupons WHERE id=?', (cid,)).fetchone()
            audit('coupon_create', 'coupon', cid, code,
                  {'discount_type': dtype, 'discount_value': dval, 'applies_to': applies_to})
            return jsonify({'coupon': _serialize_coupon(row)}), 201
        except Exception as e:
            import traceback
            app.logger.error(f'create_coupon FAILED: {e}\n{traceback.format_exc()}')
            try:
                if hasattr(get_db(), '_conn'): get_db()._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed to create coupon', 'detail': _err_detail(e)}), 500

    @app.route('/api/coupons', methods=['GET'])
    @token_required
    def list_coupons():
        _ensure_new_tables()
        """List coupons visible to the current user.
        - Admin/superadmin: sees all coupons
        - Instructor: sees only their own (created_by = them, or course_id owned by them)
        - Others: 403
        """
        try:
            user = g.current_user
            role = user.get('role')
            if role not in ('admin', 'superadmin', 'instructor'):
                return jsonify({'error': 'Forbidden'}), 403
            db = get_db()
            if role in ('admin', 'superadmin'):
                rows = db.execute('SELECT * FROM coupons ORDER BY created_at DESC').fetchall()
            else:
                rows = db.execute(
                    'SELECT * FROM coupons WHERE created_by=? '
                    'OR course_id IN (SELECT id FROM courses WHERE instructor_id=?) '
                    'ORDER BY created_at DESC',
                    (user['user_id'], user['user_id'])
                ).fetchall()
            return jsonify({'coupons': [_serialize_coupon(r) for r in rows]})
        except Exception as e:
            app.logger.error(f'list_coupons FAILED: {e}')
            return jsonify({'error': 'Failed to load coupons'}), 500

    @app.route('/api/coupons/<coupon_id>', methods=['PUT'])
    @token_required
    def update_coupon(coupon_id):
        _ensure_new_tables()
        try:
            user = g.current_user
            db = get_db()
            row = db.execute('SELECT * FROM coupons WHERE id=?', (coupon_id,)).fetchone()
            if not row:
                return jsonify({'error': 'Coupon not found'}), 404
            if not _coupon_can_manage(db, row, user):
                return jsonify({'error': 'Forbidden'}), 403

            body = request.get_json() or {}
            # Only allow safe fields to be updated. The `code`, `applies_to`,
            # `course_id`, and `created_by` are immutable to prevent abuse.
            fields = []
            values = []
            if 'discount_type' in body:
                dt = (body['discount_type'] or '').lower()
                if dt not in ('percent', 'fixed'):
                    return jsonify({'error': "discount_type must be 'percent' or 'fixed'"}), 400
                fields.append('discount_type=?'); values.append(dt)
            if 'discount_value' in body:
                try:
                    dv = float(body['discount_value'])
                    if dv <= 0: raise ValueError()
                except (TypeError, ValueError):
                    return jsonify({'error': 'discount_value must be > 0'}), 400
                fields.append('discount_value=?'); values.append(dv)
            if 'max_uses' in body:
                mu = body['max_uses']
                try:
                    mu = int(mu) if mu not in (None, '', 0) else None
                    if mu is not None and mu <= 0: mu = None
                except (TypeError, ValueError):
                    mu = None
                fields.append('max_uses=?'); values.append(mu)
            if 'expires_at' in body:
                fields.append('expires_at=?'); values.append(body['expires_at'] or None)
            if 'active' in body:
                fields.append('active=?'); values.append(1 if body['active'] else 0)

            if not fields:
                return jsonify({'error': 'No fields to update.'}), 400

            values.append(coupon_id)
            db.execute(f'UPDATE coupons SET {", ".join(fields)} WHERE id=?', tuple(values))
            db.commit()
            row = db.execute('SELECT * FROM coupons WHERE id=?', (coupon_id,)).fetchone()
            audit('coupon_update', 'coupon', coupon_id, row['code'] if row else None,
                  {'fields': [f.split('=')[0] for f in fields]})
            return jsonify({'coupon': _serialize_coupon(row)})
        except Exception as e:
            app.logger.error(f'update_coupon FAILED: {e}')
            return jsonify({'error': 'Failed to update coupon', 'detail': _err_detail(e)}), 500

    @app.route('/api/coupons/<coupon_id>', methods=['DELETE'])
    @token_required
    def delete_coupon(coupon_id):
        _ensure_new_tables()
        try:
            user = g.current_user
            db = get_db()
            row = db.execute('SELECT * FROM coupons WHERE id=?', (coupon_id,)).fetchone()
            if not row:
                return jsonify({'error': 'Coupon not found'}), 404
            if not _coupon_can_manage(db, row, user):
                return jsonify({'error': 'Forbidden'}), 403
            code = row['code']
            db.execute('DELETE FROM coupons WHERE id=?', (coupon_id,))
            db.commit()
            audit('coupon_delete', 'coupon', coupon_id, code, {})
            return jsonify({'message': 'Coupon deleted', 'id': coupon_id})
        except Exception as e:
            app.logger.error(f'delete_coupon FAILED: {e}')
            return jsonify({'error': 'Failed to delete coupon'}), 500

    @app.route('/api/coupons/validate', methods=['POST'])
    def validate_coupon():
        _ensure_new_tables()
        """Public preview endpoint. Given a code + course_id, returns whether
        the coupon is valid and what the discount would be. Does NOT increment
        usage — that only happens on actual purchase.
        Body: { code, course_id }
        """
        try:
            body = request.get_json() or {}
            code = (body.get('code') or '').strip().upper()
            course_id = (body.get('course_id') or '').strip()
            if not code:
                return jsonify({'valid': False, 'error': 'No code provided.'}), 400
            if not course_id:
                return jsonify({'valid': False, 'error': 'course_id is required.'}), 400

            db = get_db()
            course = db.execute(
                'SELECT id, price, is_free, instructor_id FROM courses WHERE id=?',
                (course_id,)
            ).fetchone()
            if not course:
                return jsonify({'valid': False, 'error': 'Course not found.'}), 404
            if int(course['is_free'] or 0):
                return jsonify({'valid': False, 'error': 'This course is free — no coupon needed.'}), 400

            cpn = db.execute(
                'SELECT * FROM coupons WHERE UPPER(code)=? AND COALESCE(active,1)=1',
                (code,)
            ).fetchone()
            if not cpn:
                return jsonify({'valid': False, 'error': 'Coupon code not found or inactive.'})
            # Expiry
            if cpn['expires_at']:
                try:
                    from datetime import datetime as _dt
                    exp = cpn['expires_at']
                    if isinstance(exp, str):
                        exp = _dt.fromisoformat(exp.replace('Z','+00:00'))
                    if exp < _dt.now(exp.tzinfo if hasattr(exp,'tzinfo') else None):
                        return jsonify({'valid': False, 'error': 'This coupon has expired.'})
                except Exception:
                    pass
            # Max uses
            if cpn['max_uses'] and int(cpn['current_uses'] or 0) >= int(cpn['max_uses']):
                return jsonify({'valid': False, 'error': 'This coupon has reached its usage limit.'})
            # Applicability
            applies_to = (cpn['applies_to'] or 'all').lower()
            if applies_to == 'course' and cpn['course_id'] and cpn['course_id'] != course_id:
                return jsonify({'valid': False, 'error': "This coupon doesn't apply to this course."})
            if applies_to == 'instructor':
                # Check the coupon's creator is the instructor of this course
                if cpn['created_by'] != course['instructor_id']:
                    return jsonify({'valid': False, 'error': "This coupon doesn't apply to this course."})

            amount = float(course['price'] or 0)
            dtype = (cpn['discount_type'] or 'percent').lower()
            dval  = float(cpn['discount_value'] or 0)
            if dtype == 'percent':
                discount = round(amount * (dval / 100.0), 2)
            else:
                discount = round(min(dval, amount), 2)
            if discount > amount: discount = amount
            final_amount = round(amount - discount, 2)
            return jsonify({
                'valid': True,
                'code':  cpn['code'],
                'discount_type':   dtype,
                'discount_value':  dval,
                'discount_amount': discount,
                'original_amount': amount,
                'final_amount':    final_amount,
            })
        except Exception as e:
            app.logger.error(f'validate_coupon FAILED: {e}')
            return jsonify({'valid': False, 'error': 'Failed to validate coupon'}), 500

    # ────────────────────────────────────────────────────────────────────────
    # ── MANUAL VERIFY (student returns from Paystack checkout)
    # ────────────────────────────────────────────────────────────────────────
    @app.route('/api/payments/verify/<reference>', methods=['GET'])
    @token_required
    def verify_transaction(reference):
        """Called from the frontend after redirect from Paystack checkout.
        Verifies the payment status and enrolls the student if successful.
        Safe to call multiple times — idempotent."""
        try:
            from .payments import verify_payment
            db = get_db()
            ensure_transactions_table(db)
            tx = db.execute(
                "SELECT * FROM transactions WHERE id=? OR provider_ref=? OR receipt_id=?",
                (reference, reference, reference)
            ).fetchone()
            if not tx:
                return jsonify({'error': 'Transaction not found'}), 404
            # Only the buyer or an admin can verify
            role = g.current_user['role']
            if tx['user_id'] != g.current_user['user_id'] and role not in ('admin', 'superadmin'):
                return jsonify({'error': 'Forbidden'}), 403

            if tx['status'] == 'success':
                # Already settled — just return current state
                return jsonify({
                    'status': 'success',
                    'receipt_id': tx['receipt_id'],
                    'amount': float(tx['amount'] or 0),
                    'enrolled': True,
                })

            # Ask provider for real status
            result = verify_payment(tx['provider_ref'] or tx['id'], tx['provider'] or 'mock')
            new_status = result.get('status', 'pending')

            if new_status == 'success':
                db.execute("UPDATE transactions SET status='success', updated_at=CURRENT_TIMESTAMP WHERE id=?", (tx['id'],))
                # Enroll if needed
                if tx['user_id'] and tx['course_id']:
                    already = db.execute(
                        'SELECT 1 FROM user_enrollments WHERE user_id=? AND course_id=?',
                        (tx['user_id'], tx['course_id'])
                    ).fetchone()
                    if not already:
                        try:
                            db.execute(
                                'INSERT INTO user_enrollments (id, user_id, course_id, enrolled_at, progress) VALUES (?,?,?,CURRENT_TIMESTAMP,0)',
                                (str(uuid.uuid4()), tx['user_id'], tx['course_id'])
                            )
                        except Exception as e:
                            app.logger.warning(f'verify enroll failed: {e}')
                db.commit()
                return jsonify({
                    'status': 'success',
                    'receipt_id': tx['receipt_id'],
                    'amount': float(tx['amount'] or 0),
                    'enrolled': True,
                })
            elif new_status == 'failed':
                db.execute("UPDATE transactions SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE id=?", (tx['id'],))
                db.commit()
            return jsonify({
                'status': new_status,
                'receipt_id': tx['receipt_id'],
                'amount': float(tx['amount'] or 0),
                'message': result.get('message', ''),
            })
        except Exception as e:
            app.logger.error(f'verify_transaction: {e}')
            return jsonify({'error': 'Verify failed', 'detail': _err_detail(e)}), 500

    # ────────────────────────────────────────────────────────────────────────
    # ── PROVIDER STATUS (which provider is active — for admin dashboards)
    # ────────────────────────────────────────────────────────────────────────
    @app.route('/api/payments/provider-status', methods=['GET'])
    def public_payment_provider_status():
        """Public endpoint — anyone can check whether we're in mock or live mode.
        Used by the payment page to show the right banner and behavior."""
        from .payments import _provider_name
        try:
            active = _provider_name()
        except RuntimeError:
            # Production without PAYSTACK_SECRET_KEY: payments are disabled, not
            # silently free. Report that clearly instead of a 500.
            return jsonify({'provider': 'unconfigured', 'is_live': False,
                            'is_mock': False, 'is_configured': False})
        return jsonify({
            'provider': active,
            'is_live':  active == 'paystack',
            'is_mock':  active == 'mock',
            'is_configured': True,
        })

    @app.route('/api/admin/payments/provider-status', methods=['GET'])
    @admin_required
    def admin_payment_provider_status():
        """Returns which payment provider is currently active + configuration hints."""
        from .payments import _provider_name
        try:
            active = _provider_name()
        except RuntimeError:
            active = 'unconfigured'
        return jsonify({
            'provider': active,
            'is_live':  active == 'paystack',
            'is_mock':  active == 'mock',
            'has_secret_key':   bool(os.environ.get('PAYSTACK_SECRET_KEY')),
            'has_callback_url': bool(os.environ.get('PAYSTACK_CALLBACK_URL')),
            'webhook_url':      '/api/payments/paystack/webhook',
            'setup_hint': (
                'Set PAYSTACK_SECRET_KEY environment variable and configure the webhook URL in your '
                'Paystack dashboard to switch from mock to live payments.'
                if active == 'mock' else
                'Paystack is active. Verify the webhook URL is configured in your Paystack dashboard.'
            ),
        })

    # ────────────────────────────────────────────────────────────────────────
    # ── PLATFORM SETTINGS (revenue split) — admin only
    # ────────────────────────────────────────────────────────────────────────
    @app.route('/api/admin/platform-settings', methods=['GET'])
    @admin_required
    def get_platform_settings():
        try:
            db = get_db()
            rows = db.execute('SELECT key, value FROM platform_config').fetchall()
            cfg = {r['key']: r['value'] for r in rows}
            return jsonify({
                'instructor_share': float(cfg.get('instructor_share', 50.0)),
                'admin_share': float(cfg.get('admin_share', 50.0)),
                'require_payout_before_courses': _setting_flag(db, 'require_payout_before_courses', True),
                'require_payout_before_approval': _setting_flag(db, 'require_payout_before_approval', False),
                'homepage_stats_enabled': _setting_flag(db, 'homepage_stats_enabled', True),
                'homepage_stats_values': _homepage_stats_values(db),
            })
        except Exception as e:
            app.logger.error(f'get_platform_settings: {e}')
            return jsonify({'instructor_share': 50.0, 'admin_share': 50.0,
                            'require_payout_before_courses': True,
                            'require_payout_before_approval': False,
                            'homepage_stats_enabled': True,
                            'homepage_stats_values': {'courses': 50, 'students': 2500, 'instructors': 40}})

    @app.route('/api/admin/platform-settings', methods=['PUT'])
    @admin_required
    def update_platform_settings():
        try:
            d = request.get_json() or {}
            instr = float(d.get('instructor_share', 50))
            admin_pct = float(d.get('admin_share', 50))
            if not (0 <= instr <= 100) or not (0 <= admin_pct <= 100):
                return jsonify({'error': 'Shares must be 0-100'}), 400
            if abs(instr + admin_pct - 100) > 0.01:
                return jsonify({'error': 'Shares must total exactly 100'}), 400

            db = get_db()
            for key, val in [('instructor_share', str(instr)), ('admin_share', str(admin_pct))]:
                # Upsert
                existing = db.execute('SELECT key FROM platform_config WHERE key=?', (key,)).fetchone()
                if existing:
                    db.execute('UPDATE platform_config SET value=? WHERE key=?', (val, key))
                else:
                    db.execute('INSERT INTO platform_config (key, value) VALUES (?,?)', (key, val))
            # Optional boolean toggles — only written when the caller sends them
            for key in ('require_payout_before_courses', 'require_payout_before_approval',
                        'homepage_stats_enabled'):
                if key in d:
                    val = '1' if d.get(key) else '0'
                    existing = db.execute('SELECT key FROM platform_config WHERE key=?', (key,)).fetchone()
                    if existing:
                        db.execute('UPDATE platform_config SET value=? WHERE key=?', (val, key))
                    else:
                        db.execute('INSERT INTO platform_config (key, value) VALUES (?,?)', (key, val))
            # Admin-chosen display numbers for the landing page stats strip
            if 'homepage_stats_values' in d and isinstance(d.get('homepage_stats_values'), dict):
                vals = {}
                for k in ('courses', 'students', 'instructors'):
                    try:
                        n = int(d['homepage_stats_values'].get(k, 0) or 0)
                    except (TypeError, ValueError):
                        return jsonify({'error': f'homepage stats {k} must be a whole number'}), 400
                    if n < 0:
                        return jsonify({'error': f'homepage stats {k} cannot be negative'}), 400
                    vals[k] = n
                payload = json.dumps(vals)
                existing = db.execute("SELECT key FROM platform_config WHERE key='homepage_stats_values'").fetchone()
                if existing:
                    db.execute("UPDATE platform_config SET value=? WHERE key='homepage_stats_values'", (payload,))
                else:
                    db.execute("INSERT INTO platform_config (key, value) VALUES ('homepage_stats_values', ?)", (payload,))
            db.commit()
            return jsonify({'message': 'Saved', 'instructor_share': instr, 'admin_share': admin_pct})
        except Exception as e:
            app.logger.error(f'update_platform_settings: {e}')
            try:
                db = getattr(g, '_db', None)
                if db and hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return jsonify({'error': 'Failed'}), 500

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

    # ═══════════════════════════════════════════════════════════════════════════════
    # ── PLATFORM SETTINGS (admin-toggleable global settings) ────────────────────
    # ═══════════════════════════════════════════════════════════════════════════════
    def _get_platform_setting(key, default=None):
        """Read a platform setting from the DB. Returns default if missing."""
        try:
            db = get_db()
            db.execute("""CREATE TABLE IF NOT EXISTS platform_settings (
                key TEXT PRIMARY KEY, value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_by TEXT
            )""")
            row = db.execute('SELECT value FROM platform_settings WHERE key=?', (key,)).fetchone()
            return row['value'] if row else default
        except Exception as e:
            app.logger.warning(f'_get_platform_setting({key}) failed: {e}')
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass
            return default

    def _set_platform_setting(key, value, updated_by=None):
        """Write a platform setting to the DB."""
        db = get_db()
        db.execute("""CREATE TABLE IF NOT EXISTS platform_settings (
            key TEXT PRIMARY KEY, value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_by TEXT
        )""")
        # UPSERT works differently on SQLite vs Postgres
        existing = db.execute('SELECT key FROM platform_settings WHERE key=?', (key,)).fetchone()
        if existing:
            db.execute("UPDATE platform_settings SET value=?, updated_at=CURRENT_TIMESTAMP, updated_by=? WHERE key=?",
                       (value, updated_by, key))
        else:
            db.execute("INSERT INTO platform_settings (key, value, updated_by) VALUES (?, ?, ?)",
                       (key, value, updated_by))
        db.commit()

    @app.route('/api/admin/settings/signup-verification', methods=['GET'])
    @admin_required
    def get_signup_verification_mode():
        """Returns which verification mode is currently active for signups.
        Modes: 'none' (default), 'email_otp'."""
        mode = _get_platform_setting('signup_verification_mode', 'none')
        return jsonify({'mode': mode})

    @app.route('/api/admin/settings/signup-verification', methods=['PUT'])
    @admin_required
    def set_signup_verification_mode():
        d = request.get_json() or {}
        mode = (d.get('mode') or '').strip().lower()
        if mode not in ('none', 'email_otp'):
            return jsonify({'error': "mode must be 'none' or 'email_otp'"}), 400
        try:
            _set_platform_setting('signup_verification_mode', mode, g.current_user.get('user_id'))
            return jsonify({'mode': mode, 'message': 'Signup verification mode updated'})
        except Exception as e:
            app.logger.error(f'set_signup_verification_mode error: {e}')
            return jsonify({'error': 'Failed to update setting', 'detail': _err_detail(e)}), 500

    # ═══════════════════════════════════════════════════════════════════════════════
    # ── EMAIL SENDERS (Gmail 1 / Gmail 2 / SendPulse) ────────────────────────────
    # ═══════════════════════════════════════════════════════════════════════════════
    # The admin connects up to three senders and picks which one sends the
    # application's transactional email. Secrets (OAuth refresh tokens, client
    # secrets) live server-side only and are never returned by the API.

    def _google_oauth_client():
        return (os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '').strip(),
                os.environ.get('GOOGLE_OAUTH_CLIENT_SECRET', '').strip())

    def _email_oauth_redirect_uri():
        base = os.environ.get('BACKEND_URL', '').strip().rstrip('/')
        if not base:
            base = request.host_url.rstrip('/')
        return f'{base}/api/admin/email/oauth/callback'

    @app.route('/api/admin/email/config', methods=['GET'])
    @admin_required
    def get_email_config():
        db = get_db()
        cfg = email_service.load_email_config(db)
        return jsonify(email_service.public_config(cfg))

    @app.route('/api/admin/email/config', methods=['PUT'])
    @admin_required
    def update_email_config():
        d = request.get_json() or {}
        db = get_db()
        cfg = email_service.load_email_config(db)
        if 'enabled' in d:
            cfg['enabled'] = bool(d['enabled'])
        if d.get('selected') in email_service.PROVIDERS:
            cfg['selected'] = d['selected']
        # SendPulse credentials are still editable (and act as the env fallback).
        sp = cfg['sendpulse']
        for src, dst in (('sendpulse_client_id', 'client_id'),
                         ('sendpulse_client_secret', 'client_secret'),
                         ('sendpulse_sender_email', 'sender_email'),
                         ('sendpulse_sender_name', 'sender_name')):
            if d.get(src) is not None and str(d.get(src)).strip():
                sp[dst] = str(d[src]).strip()
        sp['connected'] = bool(sp.get('client_id') and sp.get('client_secret') and sp.get('sender_email'))
        try:
            email_service.save_email_config(db, cfg, g.current_user.get('user_id'),
                                            app.config.get('USE_POSTGRES'))
        except Exception as e:
            app.logger.error(f'update_email_config error: {e}')
            return jsonify({'error': 'Failed to save email settings'}), 500
        audit('email_config', 'platform', 'email', 'email settings',
              {'enabled': cfg['enabled'], 'selected': cfg['selected']})
        return jsonify(email_service.public_config(cfg))

    @app.route('/api/admin/email/oauth/url', methods=['GET'])
    @admin_required
    def email_oauth_url():
        """Return the Google consent URL for connecting a Gmail slot."""
        slot = (request.args.get('slot') or '').strip()
        if slot not in ('gmail1', 'gmail2'):
            return jsonify({'error': 'slot must be gmail1 or gmail2'}), 400
        cid, csecret = _google_oauth_client()
        if not cid or not csecret:
            return jsonify({'error': 'Google OAuth is not configured on the server. '
                                     'Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.'}), 400
        # Signed short-lived state binds this consent to the slot and admin.
        state = jwt.encode(
            {'slot': slot, 'uid': g.current_user['user_id'],
             'exp': datetime.utcnow() + timedelta(minutes=15)},
            app.config['JWT_SECRET'], algorithm='HS256')
        params = {
            'client_id': cid,
            'redirect_uri': _email_oauth_redirect_uri(),
            'response_type': 'code',
            'scope': 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
            'access_type': 'offline',
            'prompt': 'consent',
            'include_granted_scopes': 'true',
            'state': state,
        }
        url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urlencode(params)
        return jsonify({'url': url, 'redirect_uri': _email_oauth_redirect_uri()})

    @app.route('/api/admin/email/oauth/callback', methods=['GET'])
    def email_oauth_callback():
        """Google redirects here after the admin grants access. Exchanges the
        code for a refresh token and stores it against the chosen slot."""
        code = (request.args.get('code') or '').strip()
        state = (request.args.get('state') or '').strip()
        if not code or not state:
            return 'Missing code or state. You can close this window.', 400
        try:
            payload = jwt.decode(state, app.config['JWT_SECRET'], algorithms=['HS256'])
        except Exception:
            return 'This link has expired. Please start the connection again.', 400
        slot = payload.get('slot')
        uid = payload.get('uid')
        if slot not in ('gmail1', 'gmail2'):
            return 'Invalid slot.', 400
        cid, csecret = _google_oauth_client()
        if not cid or not csecret:
            return 'Google OAuth is not configured on the server.', 400
        try:
            r = requests.post('https://oauth2.googleapis.com/token', data={
                'code': code,
                'client_id': cid,
                'client_secret': csecret,
                'redirect_uri': _email_oauth_redirect_uri(),
                'grant_type': 'authorization_code',
            }, timeout=15)
            if r.status_code != 200:
                return f'Google rejected the connection: {r.text[:200]}', 400
            data = r.json() or {}
            refresh = data.get('refresh_token')
            access = data.get('access_token')
            if not refresh:
                return ('Google did not return a refresh token. Remove LearnAfrica from your '
                        'Google account permissions and connect again.'), 400
            # Read the authorised address straight from Google.
            addr = None
            if access:
                try:
                    pr = requests.get('https://www.googleapis.com/oauth2/v2/userinfo',
                                      headers={'Authorization': f'Bearer {access}'}, timeout=10)
                    if pr.status_code == 200:
                        addr = (pr.json() or {}).get('email')
                except Exception:
                    addr = None
            db = get_db()
            cfg = email_service.load_email_config(db)
            acct = cfg[slot]
            acct['client_id'] = cid
            acct['client_secret'] = csecret
            acct['refresh_token'] = refresh
            acct['sender_email'] = addr or acct.get('sender_email') or ''
            acct['connected'] = bool(addr)
            acct['last_error'] = None
            acct['connected_at'] = datetime.utcnow().isoformat()
            email_service.save_email_config(db, cfg, uid, app.config.get('USE_POSTGRES'))
            try:
                audit('email_connect', 'platform', slot, addr, {'slot': slot})
            except Exception:
                pass
            return (f'<html><body style="font-family:system-ui;padding:40px">'
                    f'<h2 style="color:#22c55e">Gmail connected</h2>'
                    f'<p>{slot} is now connected as <strong>{addr or "your account"}</strong>.</p>'
                    f'<p>You can close this window and return to the Admin Dashboard.</p>'
                    f'</body></html>'), 200
        except Exception as ex:
            return f'Could not complete the Google connection: {ex}', 500

    @app.route('/api/admin/email/connect', methods=['POST'])
    @admin_required
    def email_connect_manual():
        """Manual connect: store a Gmail refresh token the admin already has, or
        an email-only SendPulse-style config. Secrets stay server-side."""
        d = request.get_json() or {}
        slot = (d.get('slot') or '').strip()
        if slot not in ('gmail1', 'gmail2'):
            return jsonify({'error': 'slot must be gmail1 or gmail2'}), 400
        refresh = (d.get('refresh_token') or '').strip()
        cid = (d.get('client_id') or '').strip()
        csecret = (d.get('client_secret') or '').strip()
        sender = (d.get('sender_email') or '').strip()
        if not refresh:
            return jsonify({'error': 'A refresh token is required'}), 400
        db = get_db()
        cfg = email_service.load_email_config(db)
        acct = cfg[slot]
        acct.update({'refresh_token': refresh,
                     'client_id': cid or os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '').strip(),
                     'client_secret': csecret or os.environ.get('GOOGLE_OAUTH_CLIENT_SECRET', '').strip(),
                     'sender_email': sender or acct.get('sender_email') or '',
                     'sender_name': (d.get('sender_name') or acct.get('sender_name') or 'LearnAfrica').strip()})
        addr, err = email_service.verify_gmail_account(acct)
        if err:
            acct['connected'] = False
            acct['last_error'] = err
            email_service.save_email_config(db, cfg, g.current_user.get('user_id'), app.config.get('USE_POSTGRES'))
            return jsonify({'error': err}), 400
        acct['sender_email'] = addr
        acct['connected'] = True
        acct['last_error'] = None
        acct['connected_at'] = datetime.utcnow().isoformat()
        email_service.save_email_config(db, cfg, g.current_user.get('user_id'), app.config.get('USE_POSTGRES'))
        audit('email_connect', 'platform', slot, addr, {'slot': slot, 'method': 'manual'})
        return jsonify({'message': f'{slot} connected as {addr}', **email_service.public_config(cfg)})

    @app.route('/api/admin/email/disconnect', methods=['POST'])
    @admin_required
    def email_disconnect():
        d = request.get_json() or {}
        slot = (d.get('slot') or '').strip()
        if slot not in ('gmail1', 'gmail2'):
            return jsonify({'error': 'slot must be gmail1 or gmail2'}), 400
        db = get_db()
        cfg = email_service.load_email_config(db)
        cfg[slot] = email_service._empty_account()
        if cfg.get('selected') == slot:
            cfg['selected'] = 'sendpulse'
        email_service.save_email_config(db, cfg, g.current_user.get('user_id'), app.config.get('USE_POSTGRES'))
        audit('email_disconnect', 'platform', slot, None, {})
        return jsonify(email_service.public_config(cfg))

    @app.route('/api/admin/email/test', methods=['POST'])
    @admin_required
    def email_test():
        d = request.get_json() or {}
        slot = (d.get('slot') or '').strip()
        to = (d.get('to') or '').strip() or (g.current_user.get('email') or '')
        if slot not in email_service.PROVIDERS:
            return jsonify({'error': 'slot must be gmail1, gmail2 or sendpulse'}), 400
        if not to or '@' not in to:
            return jsonify({'error': 'A valid test recipient is required'}), 400
        db = get_db()
        ok, err = email_service.send_email(
            db, to, '', 'LearnAfrica test email',
            "<div style='font-family:system-ui,sans-serif;padding:24px'>"
            "<h2 style='color:#22c55e'>LearnAfrica</h2>"
            f"<p>This is a test email sent from <strong>{slot}</strong>.</p>"
            "<p>If you received this, that sender is working.</p></div>",
            f'LearnAfrica test email sent from {slot}.', provider=slot,
            use_postgres=app.config.get('USE_POSTGRES'))
        if not ok:
            return jsonify({'error': err or 'Send failed'}), 400
        return jsonify({'message': f'Test email sent via {slot} to {to}'})


    # ═══════════════════════════════════════════════════════════════════════════════
    # ── FORGOT PASSWORD (user request -> admin-generated one-time reset link) ────
    # ═══════════════════════════════════════════════════════════════════════════════
    # A user submits a request; an administrator reviews it and generates a
    # single-use, time-limited link to hand to the user. Nothing is emailed from
    # the request itself, so the flow works even when outgoing email is off.

    def _hash_reset_token(raw):
        import hashlib
        return hashlib.sha256(raw.encode('utf-8')).hexdigest()

    def _dt_expired(exp):
        """True if a stored expiry timestamp is in the past (handles str/datetime)."""
        if exp is None:
            return True
        try:
            if isinstance(exp, str):
                s2 = exp.replace('Z', '').split('.')[0]
                for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S'):
                    try:
                        exp = datetime.strptime(s2, fmt)
                        break
                    except ValueError:
                        continue
            if isinstance(exp, datetime):
                return exp < datetime.utcnow()
        except Exception:
            pass
        return True

    def _reset_link_base():
        """Base URL for user-facing reset links (no trailing slash)."""
        try:
            row = get_db().execute(
                "SELECT value FROM platform_settings WHERE key='frontend_url'").fetchone()
            if row and row['value']:
                return str(row['value']).strip().rstrip('/')
        except Exception:
            pass
        for key in ('FRONTEND_URL', 'APP_URL'):
            v = (os.environ.get(key) or '').strip()
            if v:
                return v.rstrip('/')
        origins = (os.environ.get('ALLOWED_ORIGINS') or '').strip()
        if origins:
            first = origins.split(',')[0].strip()
            if first and first != '*':
                return first.rstrip('/')
        return 'http://localhost:5173'

    # Reset links are single-use and time-limited. 12 hours suits an
    # administrator handing the link over by hand; a leaked link dies quickly.
    RESET_LINK_HOURS = 12

    def _create_reset_token(db, user_id, request_id=None, created_by=None):
        """Mint a fresh reset token for one account. Supersedes older unused
        tokens so only the newest link works. Returns (raw_token, expires_at);
        only the hash is written to the database."""
        try:
            db.execute('UPDATE password_reset_tokens SET used=1 WHERE user_id=? AND used=0',
                       (user_id,))
        except Exception:
            pass
        raw = secrets.token_urlsafe(32)
        expires = datetime.utcnow() + timedelta(hours=RESET_LINK_HOURS)
        db.execute('INSERT INTO password_reset_tokens '
                   '(id,request_id,user_id,token_hash,expires_at,created_by) VALUES (?,?,?,?,?,?)',
                   (str(uuid.uuid4()), request_id, user_id, _hash_reset_token(raw), expires,
                    created_by))
        return raw, expires

    def _send_reset_email(db, to_email, link):
        """Email a reset link using the active sender. Returns (ok, err)."""
        return email_service.send_email(
            db, to_email, '', 'Reset your LearnAfrica password',
            "<div style='font-family:system-ui,sans-serif;padding:24px'>"
            "<h2 style='color:#22c55e'>LearnAfrica</h2>"
            "<p>We received a request to reset your password.</p>"
            f"<p><a href=\"{link}\">Reset your password</a></p>"
            f"<p>This link expires in {RESET_LINK_HOURS} hours and can be used once. "
            "If you did not ask for this, you can ignore this email.</p></div>",
            f'Reset your LearnAfrica password: {link}',
            use_postgres=app.config.get('USE_POSTGRES'))

    @app.route('/api/auth/password-reset-mode', methods=['GET'])
    def password_reset_mode():
        # Public: tells the forgot-password UI whether email is switched on, so
        # it can show the normal self-service form or the manual request modal.
        # Reveals nothing sensitive.
        try:
            cfg = email_service.load_email_config(get_db())
            enabled = bool(cfg.get('enabled'))
        except Exception:
            enabled = False
        return jsonify({'email_enabled': enabled})

    @app.route('/api/auth/forgot-password', methods=['POST'])
    def forgot_password():
        """Record a password-reset request for an administrator to review.

        Always returns the same generic message, so it never reveals whether an
        account exists for the address. Nothing is emailed here.
        """
        if not request.is_json:
            return jsonify({'error': 'JSON required'}), 400
        d = request.get_json() or {}
        email = (d.get('email') or '').strip().lower()
        reason = (d.get('reason') or 'Forgot Password').strip()[:120]
        generic = ('If an account exists for that address, your request has been '
                   'recorded and an administrator will follow up.')
        if not email or '@' not in email or len(email) > 254:
            return jsonify({'error': 'Enter a valid email address'}), 400
        ip = _client_ip()
        if not _rate_limit(f'forgot:ip:{ip}', 5, 900) or \
                not _rate_limit(f'forgot:acct:{email}', 3, 3600):
            return jsonify({'error': 'Too many requests. Please try again later.'}), 429
        db = get_db()
        try:
            u = db.execute('SELECT id FROM users WHERE LOWER(email)=?', (email,)).fetchone()
        except Exception:
            u = None
        uid = u['id'] if u else None
        try:
            existing = db.execute(
                "SELECT id FROM password_reset_requests WHERE LOWER(email)=? "
                "AND status IN ('pending','link_sent')", (email,)).fetchone()
        except Exception:
            existing = None
        rid = None
        if not existing:
            rid = str(uuid.uuid4())
            try:
                db.execute(
                    'INSERT INTO password_reset_requests (id,email,user_id,reason,status) '
                    'VALUES (?,?,?,?,?)', (rid, email, uid, reason, 'pending'))
                db.commit()
                audit('password_reset_request', 'user', uid or email, email,
                      {'reason': reason, 'request_id': rid})
            except Exception as e:
                app.logger.error(f'forgot_password insert failed: {e}')

        # When outgoing email is ON, the normal self-service flow applies: send
        # the reset link straight away using the active sender. When it is OFF,
        # we stop here and let an administrator generate and share the link.
        auto_sent = False
        try:
            cfg = email_service.load_email_config(db)
        except Exception:
            cfg = {'enabled': False}
        if cfg.get('enabled') and uid and rid:
            try:
                raw, _ = _create_reset_token(db, uid, request_id=rid, created_by='auto')
                link = f'{_reset_link_base()}/reset-password?token={raw}'
                ok, err = _send_reset_email(db, email, link)
                if ok:
                    db.execute("UPDATE password_reset_requests SET status='link_sent' WHERE id=?",
                               (rid,))
                    db.commit()
                    audit('password_reset_link_emailed', 'user', uid, email,
                          {'request_id': rid, 'auto': True})
                    auto_sent = True
                else:
                    app.logger.warning(f'auto reset email failed for {email}: {err}')
            except Exception as e:
                app.logger.error(f'forgot_password auto-send failed: {e}')

        # Response is identical either way, so it never reveals account existence.
        msg = ('A password reset link has been sent to your email.' if auto_sent else generic)
        return jsonify({'message': msg, 'email_sent': auto_sent})

    @app.route('/api/auth/reset-password/validate', methods=['GET'])
    def validate_reset_token():
        """Public check so the reset page can show a clear message up front."""
        raw = (request.args.get('token') or '').strip()
        if not raw:
            return jsonify({'valid': False, 'error': 'Missing token'}), 400
        db = get_db()
        row = db.execute('SELECT * FROM password_reset_tokens WHERE token_hash=?',
                         (_hash_reset_token(raw),)).fetchone()
        if not row or int(row['used'] or 0) or _dt_expired(row['expires_at']):
            return jsonify({'valid': False,
                            'error': 'This reset link is invalid or has expired.'}), 400
        u = db.execute('SELECT email FROM users WHERE id=?', (row['user_id'],)).fetchone()
        return jsonify({'valid': True, 'email': (u['email'] if u else None)})

    @app.route('/api/auth/reset-password', methods=['POST'])
    def reset_password_with_token():
        """Set a new password using a valid one-time token, then invalidate it."""
        if not request.is_json:
            return jsonify({'error': 'JSON required'}), 400
        d = request.get_json() or {}
        raw = (d.get('token') or '').strip()
        pw = d.get('password') or ''
        pw2 = d.get('confirm_password') or ''
        if not raw:
            return jsonify({'error': 'Missing reset token'}), 400
        minlen = int(app.config.get('PASS_MIN_LENGTH', 8))
        if len(pw) < minlen:
            return jsonify({'error': f'Password must be at least {minlen} characters'}), 400
        if pw != pw2:
            return jsonify({'error': 'Passwords do not match'}), 400
        ip = _client_ip()
        if not _rate_limit(f'reset:ip:{ip}', 10, 900):
            return jsonify({'error': 'Too many attempts. Please try again later.'}), 429
        db = get_db()
        row = db.execute('SELECT * FROM password_reset_tokens WHERE token_hash=?',
                         (_hash_reset_token(raw),)).fetchone()
        if not row or int(row['used'] or 0) or _dt_expired(row['expires_at']):
            return jsonify({'error': 'This reset link is invalid or has expired.'}), 400
        u = db.execute('SELECT id, token_version FROM users WHERE id=?',
                       (row['user_id'],)).fetchone()
        if not u:
            return jsonify({'error': 'Account not found'}), 404
        try:
            tv = int(u['token_version'] or 0)
        except Exception:
            tv = 0
        db.execute('UPDATE users SET password_hash=?, token_version=?, '
                   'updated_at=CURRENT_TIMESTAMP WHERE id=?',
                   (generate_password_hash(pw), tv + 1, u['id']))
        db.execute('UPDATE password_reset_tokens SET used=1 WHERE id=?', (row['id'],))
        db.execute("UPDATE password_reset_requests SET status='completed', resolved_at=? "
                   "WHERE user_id=? AND status IN ('pending','link_sent')",
                   (datetime.utcnow(), u['id']))
        db.commit()
        audit('password_reset_completed', 'user', u['id'], None, {})
        return jsonify({'message': 'Password updated. You can now sign in.'})

    @app.route('/api/admin/password-reset-requests', methods=['GET'])
    @admin_required
    def list_password_reset_requests():
        db = get_db()
        status = (request.args.get('status') or '').strip()
        try:
            if status and status != 'all':
                rows = db.execute('SELECT * FROM password_reset_requests '
                                  'WHERE status=? ORDER BY created_at DESC', (status,)).fetchall()
            else:
                rows = db.execute('SELECT * FROM password_reset_requests '
                                  'ORDER BY created_at DESC').fetchall()
        except Exception as e:
            app.logger.error(f'list_password_reset_requests: {e}')
            return jsonify({'requests': []})
        out = []
        for r in rows:
            item = dict(r)
            item['has_active_link'] = False
            try:
                toks = db.execute('SELECT expires_at, used FROM password_reset_tokens '
                                  'WHERE request_id=?', (item['id'],)).fetchall()
                for t in toks:
                    if not int(t['used'] or 0) and not _dt_expired(t['expires_at']):
                        item['has_active_link'] = True
                        break
            except Exception:
                pass
            out.append(item)
        return jsonify({'requests': out})

    @app.route('/api/admin/password-reset-requests/<rid>/generate-link', methods=['POST'])
    @admin_required
    def generate_password_reset_link(rid):
        """Create a one-time, time-limited link for the account behind a request."""
        db = get_db()
        req = db.execute('SELECT * FROM password_reset_requests WHERE id=?', (rid,)).fetchone()
        if not req:
            return jsonify({'error': 'Request not found'}), 404
        email = (req['email'] or '').strip().lower()
        u = db.execute('SELECT id, email FROM users WHERE LOWER(email)=?', (email,)).fetchone()
        if not u:
            return jsonify({'error': 'No account exists for this email address.'}), 404
        raw, expires = _create_reset_token(db, u['id'], request_id=rid,
                                           created_by=g.current_user.get('user_id'))
        db.execute("UPDATE password_reset_requests SET status='link_sent' WHERE id=?", (rid,))
        db.commit()
        link = f'{_reset_link_base()}/reset-password?token={raw}'
        audit('password_reset_link_generated', 'user', u['id'], email,
              {'request_id': rid})
        return jsonify({'link': link, 'email': email,
                        'expires_at': expires.isoformat() + 'Z',
                        'expires_hours': RESET_LINK_HOURS})

    @app.route('/api/admin/password-reset-requests/<rid>/email-link', methods=['POST'])
    @admin_required
    def email_password_reset_link(rid):
        """Email the generated link. Refused when outgoing email is switched off."""
        d = request.get_json() or {}
        link = (d.get('link') or '').strip()
        if not link:
            return jsonify({'error': 'Generate a link first'}), 400
        db = get_db()
        cfg = email_service.load_email_config(db)
        if not cfg.get('enabled'):
            return jsonify({'error': 'Email sending is turned off. '
                                     'Copy the link and share it manually.'}), 400
        req = db.execute('SELECT * FROM password_reset_requests WHERE id=?', (rid,)).fetchone()
        if not req:
            return jsonify({'error': 'Request not found'}), 404
        to = (req['email'] or '').strip()
        ok, err = _send_reset_email(db, to, link)
        if not ok:
            return jsonify({'error': err or 'Could not send email'}), 400
        audit('password_reset_link_emailed', 'user', None, to, {'request_id': rid})
        return jsonify({'message': f'Reset link emailed to {to}'})

    @app.route('/api/admin/password-reset-requests/<rid>/dismiss', methods=['POST'])
    @admin_required
    def dismiss_password_reset_request(rid):
        db = get_db()
        req = db.execute('SELECT id FROM password_reset_requests WHERE id=?', (rid,)).fetchone()
        if not req:
            return jsonify({'error': 'Request not found'}), 404
        db.execute("UPDATE password_reset_requests SET status='dismissed', resolved_at=?, "
                   "resolved_by=? WHERE id=?",
                   (datetime.utcnow(), g.current_user.get('user_id'), rid))
        db.commit()
        audit('password_reset_dismissed', 'request', rid, None, {})
        return jsonify({'message': 'Request dismissed'})


    # ═══════════════════════════════════════════════════════════════════════════════
    # ── FOOTER / SITE CONTACT CONFIG (admin-editable, public read) ───────────────
    # ═══════════════════════════════════════════════════════════════════════════════
    # One JSON blob stored under a single platform_settings key. The footer loads
    # it on the public site (no auth) and the admin Footer tab edits it.

    _FOOTER_DEFAULTS = {
        'email':    'support@learnafrica.com',
        'phone':    '+233 256 411 155',
        'location': 'Western Region, Ghana',
        'tagline':  ('Practical, affordable learning for Africans, built in Ghana. '
                     'Learn at your own pace, earn a certificate you can verify, and '
                     'grow with people who understand your journey.'),
        'socials': {
            'facebook':  {'enabled': False, 'url': '', 'icon_url': ''},
            'twitter':   {'enabled': False, 'url': '', 'icon_url': ''},
            'linkedin':  {'enabled': False, 'url': '', 'icon_url': ''},
            'instagram': {'enabled': False, 'url': '', 'icon_url': ''},
        },
        # audience: 'all' | 'guest' | 'student' | 'instructor' | 'admin'
        'platform_links': [
            {'label': 'Browse Courses',      'url': '/courses',   'enabled': True, 'audience': 'all'},
            {'label': 'Become an Instructor','url': '/signup',    'enabled': True, 'audience': 'guest'},
            {'label': 'Sign In',             'url': '/login',     'enabled': True, 'audience': 'guest'},
            {'label': 'My Dashboard',        'url': '/dashboard', 'enabled': True, 'audience': 'student'},
            {'label': 'My Receipts',         'url': '/receipts',  'enabled': True, 'audience': 'student'},
            {'label': 'Admin Panel',         'url': '/admin',     'enabled': True, 'audience': 'admin'},
            {'label': 'Manage Courses',      'url': '/instructor/courses', 'enabled': True, 'audience': 'admin'},
            {'label': 'Receipts',            'url': '/receipts',  'enabled': True, 'audience': 'admin'},
            {'label': 'Instructor Dashboard','url': '/instructor','enabled': True, 'audience': 'instructor'},
            {'label': 'My Courses',          'url': '/instructor/courses', 'enabled': True, 'audience': 'instructor'},
            {'label': 'Receipts',            'url': '/instructor/receipts','enabled': True, 'audience': 'instructor'},
        ],
        'support_links': [
            {'label': 'Email support',        'url': 'mailto:support@learnafrica.com', 'enabled': True},
            {'label': 'Call or WhatsApp',     'url': 'tel:+233256411155',              'enabled': True},
            {'label': 'Verify a certificate', 'url': '/#verify-section',               'enabled': True},
        ],
    }

    _FOOTER_AUDIENCES = ('all', 'guest', 'student', 'instructor', 'admin')

    def _footer_url_ok(url, allow_mailto=False, allow_tel=False):
        """Accept http(s), site-relative paths, and optionally mailto:/tel:."""
        if not url:
            return True
        u = url.strip()
        low = u.lower()
        if low.startswith(('javascript:', 'data:', 'vbscript:')):
            return False
        if allow_mailto and low.startswith('mailto:'):
            return True
        if allow_tel and low.startswith('tel:'):
            return True
        return u.startswith(('http://', 'https://', '/'))

    def _footer_email_ok(email):
        import re
        return bool(re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', (email or '').strip()))

    def _footer_clean_links(raw, with_audience):
        out = []
        if not isinstance(raw, list):
            return out
        for item in raw[:40]:
            if not isinstance(item, dict):
                continue
            label = str(item.get('label', '')).strip()[:80]
            url   = str(item.get('url', '')).strip()[:500]
            if not label:
                continue
            if not _footer_url_ok(url, allow_mailto=True, allow_tel=True):
                raise ValueError(f'Invalid URL for link "{label}"')
            row = {'label': label, 'url': url, 'enabled': bool(item.get('enabled', True))}
            if with_audience:
                aud = str(item.get('audience', 'all')).strip().lower()
                row['audience'] = aud if aud in _FOOTER_AUDIENCES else 'all'
            out.append(row)
        return out

    def _footer_repair_support_links(cfg):
        """Re-point Support links that still carry the built-in defaults.

        The Support column is derived from the contact details. Admins who
        change the email/phone but leave the Support rows untouched used to keep
        the old `support@learnafrica.com` / `+233 256 411 155` links live. Only
        rows still holding the exact defaults are rewritten, so a deliberately
        custom Support link is never clobbered.
        """
        email = (cfg.get('email') or '').strip()
        phone = (cfg.get('phone') or '').strip()
        phone_digits = re.sub(r'\D', '', phone)
        for link in cfg.get('support_links') or []:
            if not isinstance(link, dict):
                continue
            url = (link.get('url') or '').strip()
            low = url.lower()
            if low.startswith('mailto:') or ('@' in url and ':' not in url.split('@')[0]):
                if email and low in ('mailto:support@learnafrica.com', 'support@learnafrica.com'):
                    link['url'] = 'mailto:' + email
            elif low.startswith('tel:'):
                if phone_digits and re.sub(r'\D', '', url) == '233256411155':
                    link['url'] = 'tel:' + ('+' if phone.startswith('+') else '') + phone_digits
        return cfg

    def _load_footer_config():
        """Read stored config, merged over defaults (shallow-merge lists)."""
        import json as _json, copy
        cfg = copy.deepcopy(_FOOTER_DEFAULTS)
        raw = _get_platform_setting('footer_config', None)
        if raw:
            try:
                stored = _json.loads(raw)
            except Exception:
                stored = None
            if isinstance(stored, dict):
                for k in ('email', 'phone', 'location', 'tagline'):
                    if isinstance(stored.get(k), str) and stored[k].strip():
                        cfg[k] = stored[k].strip()
                if isinstance(stored.get('socials'), dict):
                    for name, row in cfg['socials'].items():
                        s = stored['socials'].get(name)
                        if isinstance(s, dict):
                            row['enabled']  = bool(s.get('enabled', row['enabled']))
                            row['url']      = str(s.get('url', ''))[:500]
                            row['icon_url'] = str(s.get('icon_url', ''))[:500]
                for key in ('platform_links', 'support_links'):
                    if isinstance(stored.get(key), list):
                        cfg[key] = stored[key]
        _footer_repair_support_links(cfg)
        # Tell the admin UI whether the Support links are hand-written (so it can
        # offer to keep them) or merely derived from the contact details. It is
        # "derived" only when the rows are exactly the built-in set, in order,
        # with urls matching the contact details — any renamed/reordered/extra
        # row counts as customized and is preserved verbatim.
        email = (cfg.get('email') or '').strip().lower()
        phone_digits = re.sub(r'\D', '', cfg.get('phone') or '')
        links = cfg.get('support_links') or []
        defaults = _FOOTER_DEFAULTS['support_links']
        derived = len(links) == len(defaults)
        if derived:
            for link, dflt in zip(links, defaults):
                if (link.get('label') or '').strip() != dflt['label']:
                    derived = False
                    break
                url = (link.get('url') or '').strip().lower()
                if url.startswith('mailto:'):
                    if not email or url != 'mailto:' + email:
                        derived = False
                        break
                elif url.startswith('tel:'):
                    if not phone_digits or re.sub(r'\D', '', url) != phone_digits:
                        derived = False
                        break
                elif url != dflt['url']:
                    derived = False
                    break
        cfg['_support_links_customized'] = not derived
        return cfg

    @app.route('/api/site/footer', methods=['GET'])
    def public_footer_config():
        """Public footer config — safe for guests, no auth required."""
        return jsonify(_load_footer_config())

    @app.route('/api/admin/footer', methods=['GET'])
    @admin_required
    def get_admin_footer_config():
        return jsonify(_load_footer_config())

    @app.route('/api/admin/footer', methods=['PUT'])
    @admin_required
    def update_admin_footer_config():
        import json as _json
        d = request.get_json() or {}
        try:
            email = str(d.get('email', '')).strip()[:200]
            if email and not _footer_email_ok(email):
                return jsonify({'error': 'Invalid support email address'}), 400

            # The admin UI sends `_keep_support_links` when the Support rows are
            # only the auto-derived email/phone (untouched by the admin). In that
            # case we leave them out so _load_footer_config keeps them in sync
            # with the contact details instead of re-saving the stale defaults.
            keep_support = bool(d.get('_keep_support_links'))
            cfg = {
                'email':    email,
                'phone':    str(d.get('phone', '')).strip()[:60],
                'location': str(d.get('location', '')).strip()[:120],
                'tagline':  str(d.get('tagline', '')).strip()[:500],
                'socials':  {},
                'platform_links': _footer_clean_links(d.get('platform_links'), with_audience=True),
            }
            if not keep_support:
                cfg['support_links'] = _footer_clean_links(d.get('support_links'), with_audience=False)

            socials_in = d.get('socials') or {}
            if not isinstance(socials_in, dict):
                socials_in = {}
            for name in ('facebook', 'twitter', 'linkedin', 'instagram'):
                s = socials_in.get(name) or {}
                if not isinstance(s, dict):
                    s = {}
                url      = str(s.get('url', '')).strip()[:500]
                icon_url = str(s.get('icon_url', '')).strip()[:500]
                if url and not _footer_url_ok(url):
                    return jsonify({'error': f'Invalid {name} link URL'}), 400
                if icon_url and not _footer_url_ok(icon_url):
                    return jsonify({'error': f'Invalid {name} icon URL'}), 400
                cfg['socials'][name] = {
                    'enabled': bool(s.get('enabled', False)),
                    'url': url, 'icon_url': icon_url,
                }

            _set_platform_setting('footer_config', _json.dumps(cfg),
                                  g.current_user.get('user_id'))
            return jsonify({'message': 'Footer updated', 'config': cfg})
        except ValueError as ve:
            return jsonify({'error': str(ve)}), 400
        except Exception as e:
            app.logger.error(f'update_admin_footer_config error: {e}')
            return jsonify({'error': 'Failed to update footer', 'detail': _err_detail(e)}), 500


    # ═══════════════════════════════════════════════════════════════════════════════
    # ── EMAIL OTP VERIFICATION (SendPulse integration) ──────────────────────────
    # ═══════════════════════════════════════════════════════════════════════════════
    def _send_via_sendpulse(to_email, to_name, subject, html_body, text_body):
        """Back-compat shim. Sending now goes through email_service, which
        honours the admin-selected sender (Gmail 1, Gmail 2 or SendPulse) and
        the Email System ON/OFF switch. Returns (ok, error_message)."""
        try:
            db = get_db()
            return email_service.send_email(db, to_email, to_name, subject, html_body, text_body,
                                            use_postgres=app.config.get('USE_POSTGRES'))
        except Exception as ex:
            return False, f'email send exception: {ex}'

    def _hash_code(code):
        import hashlib
        return hashlib.sha256(str(code).encode('utf-8')).hexdigest()

    def _generate_and_send_code(email, name=''):
        """Generate a 6-digit code, save it hashed, email it via SendPulse.
        Returns (ok, message)."""
        import secrets
        from datetime import datetime, timedelta
        db = get_db()
        # Invalidate previous unused codes for this email
        try:
            db.execute("UPDATE email_verification_codes SET used=1 WHERE email=? AND used=0", (email.lower(),))
        except Exception:
            try:
                if hasattr(db, '_conn'): db._conn.rollback()
            except Exception: pass

        # Cryptographically secure code — `random` is seeded from the clock and
        # is not suitable for an account-security token.
        code = f'{secrets.randbelow(1000000):06d}'
        code_id = str(uuid.uuid4())
        expires = datetime.utcnow() + timedelta(minutes=15)
        db.execute("""INSERT INTO email_verification_codes
                      (id, email, code_hash, expires_at)
                      VALUES (?, ?, ?, ?)""",
                   (code_id, email.lower(), _hash_code(code), expires.isoformat()))
        db.commit()

        html_body = (
            f"<div style='font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px'>"
            f"<h2 style='color:#22c55e'>LearnAfrica — Verify your email</h2>"
            f"<p>Hi {name or 'there'},</p>"
            f"<p>Your verification code is:</p>"
            f"<p style='font-size:32px;font-weight:800;letter-spacing:6px;background:#f4f4f5;padding:16px;border-radius:8px;text-align:center'>{code}</p>"
            f"<p style='color:#71717a;font-size:14px'>This code expires in 15 minutes.</p>"
            f"<p style='color:#71717a;font-size:14px'>If you did not request this, you can ignore this email.</p>"
            f"</div>"
        )
        text_body = (
            f"LearnAfrica verification code: {code}\n\n"
            f"This code expires in 15 minutes.\n"
            f"If you did not request this, ignore this email."
        )
        ok, err = _send_via_sendpulse(email, name, 'Your LearnAfrica verification code', html_body, text_body)
        if not ok:
            app.logger.error(f'SendPulse OTP send failed for {email}: {err}')
            return False, err
        return True, None

    @app.route('/api/auth/send-verification-code', methods=['POST'])
    def send_verification_code():
        """Send a 6-digit OTP to the given email. Used during signup + resend flows."""
        d = request.get_json() or {}
        email = (d.get('email') or '').strip().lower()
        name  = (d.get('name') or '').strip()
        if not email or '@' not in email:
            return jsonify({'error': 'A valid email is required'}), 400
        # Throttle so this endpoint cannot be used to spam an address (and burn
        # through SendPulse credits): per IP and per recipient email.
        if not _rate_limit(f'otp:ip:{_client_ip()}', 10, 3600) or \
                not _rate_limit(f'otp:email:{email}', 5, 3600):
            return jsonify({'error': 'Too many verification requests. Please try again later.'}), 429
        ok, err = _generate_and_send_code(email, name)
        if ok:
            return jsonify({'message': 'Verification code sent'})
        app.logger.error(f'send_verification_code failed for {email}: {err}')
        return jsonify({'error': 'Failed to send verification code. Please try again later or contact support.'}), 500

    @app.route('/api/auth/verify-code', methods=['POST'])
    def verify_code():
        """Verify the OTP for a given email. On success, marks email as verified
        and creates the user account if signup data was passed."""
        d = request.get_json() or {}
        email = (d.get('email') or '').strip().lower()
        code  = (d.get('code') or '').strip()
        if not email or not code:
            return jsonify({'error': 'Email and code are required'}), 400

        # Throttle guessing: codes are short, so limit attempts per IP too.
        if not _rate_limit(f'otpverify:ip:{_client_ip()}', 30, 900) or \
                not _rate_limit(f'otpverify:email:{email}', 10, 900):
            return jsonify({'error': 'Too many attempts. Please request a new code later.'}), 429

        try:
            db = get_db()
            from datetime import datetime
            row = db.execute("""SELECT id, code_hash, expires_at, attempts, used
                                FROM email_verification_codes
                                WHERE email=? AND used=0
                                ORDER BY created_at DESC LIMIT 1""", (email,)).fetchone()
            if not row:
                return jsonify({'error': 'No pending verification found. Request a new code.'}), 400

            # Rate limit: max 5 attempts per code
            attempts = int(row['attempts'] or 0)
            if attempts >= 5:
                db.execute("UPDATE email_verification_codes SET used=1 WHERE id=?", (row['id'],))
                db.commit()
                return jsonify({'error': 'Too many failed attempts. Request a new code.'}), 429

            # Check expiry
            try:
                exp_val = row['expires_at']
                if hasattr(exp_val, 'isoformat'): expires = exp_val
                else: expires = datetime.fromisoformat(str(exp_val).replace('Z',''))
                if datetime.utcnow() > expires:
                    return jsonify({'error': 'Code has expired. Request a new one.'}), 400
            except Exception:
                pass

            if _hash_code(code) != row['code_hash']:
                db.execute("UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=?", (row['id'],))
                db.commit()
                return jsonify({'error': 'Incorrect code. Please try again.'}), 400

            # Success: mark used
            db.execute("UPDATE email_verification_codes SET used=1 WHERE id=?", (row['id'],))
            # Mark user's email as verified (if the user exists)
            db.execute("UPDATE users SET email_verified=1 WHERE LOWER(email)=?", (email,))
            db.commit()
            # If a user account exists for this email, issue a login token so the
            # frontend can go straight into the dashboard after verification.
            u = db.execute("SELECT id, email, role, token_version FROM users WHERE LOWER(email)=?", (email,)).fetchone()
            if u:
                try:
                    _tv = int(u['token_version'] or 0)
                except Exception:
                    _tv = 0
                token = generate_token(u['id'], u['email'], u['role'], _tv)
                return jsonify({
                    'message': 'Email verified successfully',
                    'verified': True,
                    'token': token,
                    'user': full_user(db, u['id'], app.config.get('USE_POSTGRES')),
                })
            return jsonify({'message': 'Email verified successfully', 'verified': True})
        except Exception as e:
            app.logger.error(f'verify_code error: {e}')
            return jsonify({'error': 'Verification failed', 'detail': _err_detail(e)}), 500

    # ═══════════════════════════════════════════════════════════════════════════════
    # ── DATABASE BACKUP + RESTORE (admin only) ────────────────────────────────────
    # ═══════════════════════════════════════════════════════════════════════════════
    # Signature written into every export so imports can validate they're
    # importing a real LearnAfrica backup, not some arbitrary JSON file.
    BACKUP_SIGNATURE = 'LEARNAFRICA_BACKUP_V1'

    # Tables to include in backup — order matters for restore (dependencies first)
    BACKUP_TABLES = [
        'users', 'user_stats',
        'courses', 'course_tags', 'course_outcomes', 'course_perks',
        'course_resources', 'curriculum_sections', 'section_lessons',
        'lessons', 'lesson_resources',
        'quizzes', 'quiz_questions',
        'user_enrollments', 'user_progress', 'time_tracking',
        'transactions', 'payments',
        'issued_badges', 'notifications',
        'course_reviews', 'community_messages',
        'lesson_discussions', 'instructor_guide',
        'coupons', 'live_sessions', 'live_session_rsvps',
        'platform_settings', 'email_verification_codes',
    ]

    # Columns that must never be written by a restore. The superadmin is the
    # account that owns the platform; a backup file (or a tampered one) must not
    # be able to demote it, suspend it, or replace its password. Only the
    # env-configured ADMIN_EMAIL/ADMIN_PASSWORD run the account.
    RESTORE_PROTECTED_USER_COLS = {'role', 'is_active', 'password_hash'}

    def _safe_ident(name):
        """Return `name` only if it is a plain SQL identifier, else raise.

        Identifiers cannot be parameterised, so they are interpolated into SQL
        directly. This rejects anything that is not `[A-Za-z_][A-Za-z0-9_]*`,
        which is every table/column this app defines."""
        if not isinstance(name, str) or not re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', name):
            raise ValueError(f'unsafe SQL identifier: {name!r}')
        return name

    def _q_ident(name):
        """Double-quote a validated identifier for interpolation."""
        return '"' + _safe_ident(name) + '"'

    @app.route('/api/admin/database/export', methods=['GET'])
    @admin_required
    def admin_database_export():
        """Export the entire database as a JSON file. Admin only."""
        try:
            db = get_db()
            from datetime import datetime as _dt
            export = {
                'signature': BACKUP_SIGNATURE,
                'exported_at': _dt.utcnow().isoformat() + 'Z',
                'exported_by': g.current_user.get('user_id'),
                'tables': {},
            }
            errors = []
            for table in BACKUP_TABLES:
                try:
                    rows = db.execute(f'SELECT * FROM {_q_ident(table)}').fetchall()
                    export['tables'][table] = [dict(r) for r in rows]
                except Exception as ex:
                    # Some tables may not exist on older schemas; skip them
                    errors.append(f'{table}: {ex}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
                    export['tables'][table] = []
            export['errors'] = errors

            # Convert Python datetime/etc to JSON-serializable strings
            def _json_safe(obj):
                if isinstance(obj, dict):
                    return {k: _json_safe(v) for k, v in obj.items()}
                if isinstance(obj, list):
                    return [_json_safe(v) for v in obj]
                if hasattr(obj, 'isoformat'):
                    return obj.isoformat()
                return obj
            safe_export = _json_safe(export)

            from flask import Response
            import json as _json
            filename = f"learnafrica-backup-{_dt.utcnow().strftime('%Y%m%d-%H%M%S')}.json"
            return Response(
                _json.dumps(safe_export, indent=2, default=str),
                mimetype='application/json',
                headers={'Content-Disposition': f'attachment; filename="{filename}"'},
            )
        except Exception as e:
            import traceback
            app.logger.error('database_export error: ' + traceback.format_exc())
            return jsonify({'error': 'Backup failed', 'detail': _err_detail(e)}), 500

    @app.route('/api/admin/database/import', methods=['POST'])
    @admin_required
    def admin_database_import():
        """Restore the database from a JSON backup file. Admin only.
        Requires: admin password re-confirmation + confirm='CONFIRM' string.
        Automatically exports a fresh backup before proceeding."""
        try:
            # Password re-confirmation (JSON body)
            d = request.get_json() or {}
            password = d.get('password') or ''
            confirm  = (d.get('confirm') or '').strip()
            backup   = d.get('backup')

            if confirm != 'CONFIRM':
                return jsonify({'error': 'You must send confirm="CONFIRM" to proceed with restore'}), 400
            if not password:
                return jsonify({'error': 'Admin password re-confirmation is required'}), 400
            if not backup or not isinstance(backup, dict):
                return jsonify({'error': 'Backup JSON must be provided in the "backup" field'}), 400
            if backup.get('signature') != BACKUP_SIGNATURE:
                return jsonify({'error': 'This file is not a valid LearnAfrica backup (signature missing/wrong)'}), 400

            db = get_db()
            # Verify admin password
            user_row = db.execute('SELECT password_hash FROM users WHERE id=?',
                                  (g.current_user['user_id'],)).fetchone()
            if not user_row:
                return jsonify({'error': 'Admin user not found'}), 403
            if not check_password_hash(user_row['password_hash'], password):
                return jsonify({'error': 'Password does not match. Restore cancelled.'}), 403

            # 1. Snapshot a fresh pre-restore backup into a file (rollback safety)
            from datetime import datetime as _dt
            import json as _json, tempfile, os as _os
            pre_restore = {}
            for table in BACKUP_TABLES:
                try:
                    rows = db.execute(f'SELECT * FROM {_q_ident(table)}').fetchall()
                    pre_restore[table] = [dict(r) for r in rows]
                except Exception:
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass
            snapshot_path = _os.path.join(
                tempfile.gettempdir(),
                f'learnafrica-pre-restore-{_dt.utcnow().strftime("%Y%m%d-%H%M%S")}.json'
            )
            try:
                with open(snapshot_path, 'w') as f:
                    _json.dump(pre_restore, f, indent=2, default=str)
                app.logger.info(f'Pre-restore snapshot saved to {snapshot_path}')
            except Exception as ex:
                app.logger.warning(f'Failed to save pre-restore snapshot: {ex}')

            # 2. Delete existing data (in reverse dependency order).
            #    The live superadmin row is never deleted — the env-configured
            #    admin account must survive any restore. Capture its identity
            #    first so the insert pass can also refuse to overwrite it.
            protected_user_ids = set()
            protected_user_emails = set()
            admin_email_env = (os.environ.get('ADMIN_EMAIL') or '').strip().lower()
            try:
                for prow in db.execute(
                    "SELECT id, email FROM users WHERE role='superadmin' OR LOWER(email)=?",
                    (admin_email_env,)
                ).fetchall():
                    protected_user_ids.add(prow['id'])
                    if prow['email']:
                        protected_user_emails.add(str(prow['email']).lower())
            except Exception as ex:
                app.logger.warning(f'Restore: could not read protected users: {ex}')
                try:
                    if hasattr(db, '_conn'): db._conn.rollback()
                except Exception: pass
            if admin_email_env:
                protected_user_emails.add(admin_email_env)

            errors_delete = []
            for table in reversed(BACKUP_TABLES):
                try:
                    if table == 'users':
                        db.execute("DELETE FROM users WHERE role <> 'superadmin'")
                    else:
                        db.execute(f'DELETE FROM {_q_ident(table)}')
                    db.commit()
                except Exception as ex:
                    errors_delete.append(f'{table}: {ex}')
                    try:
                        if hasattr(db, '_conn'): db._conn.rollback()
                    except Exception: pass

            # 3. Insert backup data (in dependency order)
            errors_insert = []
            rows_inserted = 0
            skipped_protected = []
            tables_data = backup.get('tables', {})
            for table in BACKUP_TABLES:
                rows = tables_data.get(table, []) or []
                if not rows: continue
                for row in rows:
                    if not isinstance(row, dict): continue
                    cols = list(row.keys())
                    if not cols: continue
                    # Never let a backup recreate, demote, suspend or re-key the
                    # superadmin, nor shadow the env admin email. This is the
                    # "env admin supersedes everything" guarantee — a restore can
                    # never remove your access to the top account.
                    if table == 'users':
                        row_id    = str(row.get('id') or '')
                        row_email = str(row.get('email') or '').strip().lower()
                        if row_id in protected_user_ids or row_email in protected_user_emails:
                            skipped_protected.append(row_id or row_email or '?')
                            continue
                    placeholders = ','.join(['?'] * len(cols))
                    try:
                        col_list = ','.join(_q_ident(c) for c in cols)
                        db.execute(f'INSERT INTO {_q_ident(table)} ({col_list}) VALUES ({placeholders})',
                                   tuple(row[c] for c in cols))
                        rows_inserted += 1
                    except Exception as ex:
                        errors_insert.append(f'{table}: {ex}')
                        try:
                            if hasattr(db, '_conn'): db._conn.rollback()
                        except Exception: pass
                try:
                    db.commit()
                except Exception: pass

            return jsonify({
                'message': 'Database restore complete',
                'rows_inserted': rows_inserted,
                'pre_restore_snapshot_path': snapshot_path,
                'skipped_protected_users': skipped_protected[:20],
                'errors_delete': errors_delete[:10],
                'errors_insert': errors_insert[:20],
            })
        except Exception as e:
            import traceback
            app.logger.error('database_import error: ' + traceback.format_exc())
            return jsonify({'error': 'Restore failed', 'detail': _err_detail(e)}), 500

    return app
