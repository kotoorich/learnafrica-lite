"""
schema.py — Request validation and response shaping.

Contains:
  - Input validators for signup, login, course creation, etc.
  - Response builders (full_user, settings_dict, etc.)
  - Shared constants (allowed file types, categories, etc.)

No database calls happen here — this is pure data shaping.
"""
import re
from typing import Optional

# ── Constants ─────────────────────────────────────────────────────────────────
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'webm', 'ogg', 'mov', 'avi'}
ALLOWED_RESOURCE_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS | {
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'txt', 'csv'
}

COURSE_CATEGORIES = [
    'Web Development', 'Data Science', 'Mobile Development', 'Marketing',
    'Design', 'Cybersecurity', 'Business', 'Finance', 'Health & Wellness',
    'Photography', 'Music', 'Language Learning', 'Personal Development', 'Other'
]

COURSE_DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced']

USER_ROLES = ('student', 'instructor', 'admin', 'superadmin')


# ── File helpers ──────────────────────────────────────────────────────────────
def allowed_image(filename: str) -> bool:
    return ('.' in filename and
            filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS)


def allowed_file(filename: str) -> bool:
    return ('.' in filename and
            filename.rsplit('.', 1)[1].lower() in ALLOWED_RESOURCE_EXTENSIONS)


# ── Request validators ────────────────────────────────────────────────────────
def validate_signup(data: dict) -> Optional[str]:
    """
    Validate signup request data.
    Returns an error string if invalid, or None if OK.
    """
    if not data.get('name') or len(data['name'].strip()) < 2:
        return 'Name must be at least 2 characters'
    if not data.get('email') or '@' not in data['email']:
        return 'Valid email is required'
    if not data.get('password') or len(data['password']) < 6:
        return 'Password must be at least 6 characters'
    return None


def validate_course(data: dict) -> Optional[str]:
    """Validate course creation/update data."""
    if not data.get('title') or len(data['title'].strip()) < 3:
        return 'Course title must be at least 3 characters'
    if not data.get('description') or len(data['description'].strip()) < 10:
        return 'Course description must be at least 10 characters'
    if not data.get('category'):
        return 'Category is required'
    if not data.get('difficulty') or data['difficulty'] not in COURSE_DIFFICULTIES:
        return f'Difficulty must be one of: {", ".join(COURSE_DIFFICULTIES)}'
    return None


def validate_review(data: dict) -> Optional[str]:
    """Validate a course review."""
    rating = data.get('rating')
    if rating is None or not (1 <= int(rating) <= 5):
        return 'Rating must be between 1 and 5'
    if not data.get('content') or len(data['content'].strip()) < 5:
        return 'Review content must be at least 5 characters'
    return None


# ── Response builders ─────────────────────────────────────────────────────────
def settings_dict(row) -> dict:
    """
    Convert a user_settings database row to a clean dict.
    Handles the case where settings don't exist yet (returns defaults).
    """
    if not row:
        return {
            'emailNotifications': True,
            'pushNotifications': True,
            'language': 'en',
            'timezone': 'UTC',
        }
    return {
        'emailNotifications': bool(row.get('email_notifications', True)),
        'pushNotifications':  bool(row.get('push_notifications',  True)),
        'language':           row.get('language', 'en'),
        'timezone':           row.get('timezone', 'UTC'),
    }


def upsert_settings(db, uid: str, s: dict, use_postgres: bool) -> None:
    """
    Save user settings. Creates a new row if none exists, updates if it does.
    Works with both Postgres and SQLite.
    """
    ph = '%s' if use_postgres else '?'
    existing = db.execute(
        'SELECT user_id FROM user_settings WHERE user_id=' + ph, (uid,)
    ).fetchone()

    if existing:
        db.execute(
            'UPDATE user_settings SET'
            ' email_notifications=' + ph + ', push_notifications=' + ph + ','
            ' language=' + ph + ', timezone=' + ph +
            ' WHERE user_id=' + ph,
            (
                int(s.get('emailNotifications', True)),
                int(s.get('pushNotifications', True)),
                s.get('language', 'en'),
                s.get('timezone', 'UTC'),
                uid
            )
        )
    else:
        if use_postgres:
            db.execute(
                'INSERT INTO user_settings'
                ' (user_id, email_notifications, push_notifications, language, timezone)'
                ' VALUES (' + ','.join([ph]*5) + ')'
                ' ON CONFLICT (user_id) DO UPDATE SET'
                ' email_notifications=EXCLUDED.email_notifications,'
                ' push_notifications=EXCLUDED.push_notifications,'
                ' language=EXCLUDED.language,'
                ' timezone=EXCLUDED.timezone',
                (uid,
                 int(s.get('emailNotifications', True)),
                 int(s.get('pushNotifications', True)),
                 s.get('language', 'en'),
                 s.get('timezone', 'UTC'))
            )
        else:
            db.execute(
                'INSERT OR IGNORE INTO user_settings'
                ' (user_id, email_notifications, push_notifications, language, timezone)'
                ' VALUES (' + ','.join([ph]*5) + ')',
                (uid,
                 int(s.get('emailNotifications', True)),
                 int(s.get('pushNotifications', True)),
                 s.get('language', 'en'),
                 s.get('timezone', 'UTC'))
            )
    db.commit()


def full_user(db, uid: str, use_postgres: bool) -> dict:
    """
    Build the complete user object that gets returned from /api/auth/verify.
    Includes stats, badges, and settings.
    """
    ph = '%s' if use_postgres else '?'
    u = db.execute(
        'SELECT * FROM users WHERE id=' + ph, (uid,)
    ).fetchone()
    if not u:
        return {}

    stats = db.execute(
        'SELECT * FROM user_stats WHERE user_id=' + ph, (uid,)
    ).fetchone()

    badges = db.execute(
        'SELECT badge_key, earned_at FROM user_badges WHERE user_id=' + ph, (uid,)
    ).fetchall()

    # Fetch enrollments so frontend knows which courses student is enrolled in
    enrollments = db.execute(
        'SELECT course_id, progress, enrolled_at FROM user_enrollments WHERE user_id=' + ph,
        (uid,)
    ).fetchall()

    result = {
        'id':               u['id'],
        'name':             u['name'],
        'email':            u['email'],
        'role':             u['role'],
        'avatar':           u.get('avatar') or '',
        'bio':              u.get('bio') or '',
        'location':         u.get('location') or '',
        'website':          u.get('website') or '',
        'instructor_title': u.get('instructor_title') or '',
        'instructor_status':u.get('instructor_status') or 'none',
        'enrollments': [
            {'course_id': e['course_id'],
             'progress':  e['progress'] or 0,
             'isEnrolled': True}
            for e in enrollments
        ],
        'stats': {
            'lessons_completed':  (stats['lessons_completed']  if stats else 0),
            'courses_completed':  (stats['courses_completed']  if stats else 0),
            'perfect_quizzes':    (stats['perfect_quizzes']    if stats else 0),
            'streak':             (stats['streak']             if stats else 0),
            'total_earnings':     float(stats['total_earnings'] if stats and stats.get('total_earnings') else 0),
            'average_rating':     float(stats['average_rating'] if stats and stats.get('average_rating') else 0),
        },
        'badges': [
            {'key': b['badge_key'], 'earned_at': str(b['earned_at'])}
            for b in badges
        ],
    }
    return result
