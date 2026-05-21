"""
database.py — Database connection and table creation.

Supports TWO databases:
  • Neon Postgres  (production)  — when DATABASE_URL starts with 'postgres'
  • SQLite         (development) — when DATABASE_URL is empty

Both are accessed through the same get_db() interface so ALL routes work
identically regardless of which database is being used.
"""
import os, re
import sqlite3 as _sq
from flask import g

# ── Row class ─────────────────────────────────────────────────────────────────
class _Row(dict):
    """
    A dict that also allows attribute-style access.
    row['name']  and  row.name  both work.
    This makes Postgres rows behave like SQLite rows everywhere in the code.
    """
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name)


# ── Postgres cursor wrapper ───────────────────────────────────────────────────
class _PgResult:
    """Holds ALL rows from a Postgres query immediately after execution."""
    def __init__(self, cur):
        self._cols = []
        self._rows = []
        if cur.description:
            self._cols = [d[0] for d in cur.description]
            self._rows = cur.fetchall()  # fetch everything immediately
        # rowcount for affected rows (INSERT/UPDATE/DELETE)
        self._rowcount = cur.rowcount if hasattr(cur, 'rowcount') else 0

    def fetchone(self):
        if not self._rows:
            return None
        return _Row(zip(self._cols, self._rows[0]))

    def fetchall(self):
        return [_Row(zip(self._cols, r)) for r in self._rows]

    def __iter__(self):
        for row in self._rows:
            yield _Row(zip(self._cols, row))

    @property
    def lastrowid(self):
        # For compatibility - not used with Postgres UUID PKs
        return None


class _PgCursor:
    """
    Wraps a psycopg2 connection to look exactly like a sqlite3.Connection.
    Creates a FRESH cursor for every execute() call so nested queries work correctly.
    This is critical — Postgres cursors cannot be reused across nested iterations.
    """
    def __init__(self, conn):
        self._conn = conn
        self._last_result = None

    # ── SQL translation ───────────────────────────────────────────────────────
    def _adapt(self, sql, params=None):
        """Translate SQLite-dialect SQL to Postgres-dialect SQL automatically."""
        adapted = sql.replace('?', '%s')
        # INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
        adapted = re.sub(
            r'INSERT\s+OR\s+IGNORE\s+INTO',
            'INSERT INTO',
            adapted,
            flags=re.IGNORECASE
        )
        if ('INSERT INTO' in adapted.upper()
                and 'ON CONFLICT' not in adapted.upper()
                and adapted.rstrip()[-1:] in (')', "'", '"', 's')):
            adapted = adapted.rstrip() + ' ON CONFLICT DO NOTHING'
        # INSERT OR REPLACE → upsert
        adapted = re.sub(
            r'INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)',
            r'INSERT INTO \1',
            adapted,
            flags=re.IGNORECASE
        )
        # strftime → EXTRACT
        adapted = re.sub(
            r"strftime\('%m',\s*(\w+)\)",
            r'EXTRACT(MONTH FROM \1)::int',
            adapted
        )
        adapted = re.sub(
            r"strftime\('%Y',\s*(\w+)\)",
            r'EXTRACT(YEAR FROM \1)::int',
            adapted
        )
        # DATE('now') → CURRENT_DATE
        adapted = re.sub(r"DATE\('now'\)", 'CURRENT_DATE', adapted, flags=re.IGNORECASE)
        adapted = re.sub(r'DATE\("now"\)', 'CURRENT_DATE', adapted, flags=re.IGNORECASE)
        return adapted, params

    # ── Core methods ──────────────────────────────────────────────────────────
    def execute(self, sql, params=None):
        """Execute a query using a fresh cursor — safe for nested queries."""
        sql, params = self._adapt(sql, params)
        cur = self._conn.cursor()
        try:
            cur.execute(sql, params or ())
            self._last_result = _PgResult(cur)
            cur.close()
            return self._last_result
        except Exception as e:
            cur.close()
            # Rollback so the connection is usable again for subsequent queries
            try:
                self._conn.rollback()
            except Exception:
                pass
            raise  # re-raise so Flask's error handler catches it and returns JSON

    def executemany(self, sql, seq):
        sql, _ = self._adapt(sql)
        cur = self._conn.cursor()
        try:
            cur.executemany(sql, seq)
            cur.close()
        except Exception as e:
            cur.close()
            try:
                self._conn.rollback()
            except Exception:
                pass
            raise

    def commit(self):
        try:
            self._conn.commit()
        except Exception as e:
            try:
                self._conn.rollback()
            except Exception:
                pass
            raise

    def rollback(self):
        try:
            self._conn.rollback()
        except Exception:
            pass

    def close(self):
        pass  # individual cursors are closed after each execute

    def fetchone(self):
        return self._last_result.fetchone() if self._last_result else None

    def fetchall(self):
        return self._last_result.fetchall() if self._last_result else []

    def __iter__(self):
        return iter(self._last_result) if self._last_result else iter([])

    @property
    def lastrowid(self):
        return self._last_result.lastrowid if self._last_result else None


# ── SQLite adapter (development) ──────────────────────────────────────────────
class _SQLiteAdapter:
    """Wraps sqlite3 connection to match our interface."""
    def __init__(self, conn):
        self._c = conn

    def execute(self, sql, p=None):
        return self._c.execute(sql, p) if p is not None else self._c.execute(sql)

    def executemany(self, sql, seq):
        return self._c.executemany(sql, seq)

    def fetchone(self):
        return self._c.fetchone()

    def fetchall(self):
        return self._c.fetchall()

    def commit(self):
        self._c.commit()

    def close(self):
        self._c.close()

    def __getattr__(self, name):
        return getattr(self._c, name)


# ── Connection factory ────────────────────────────────────────────────────────
def get_db():
    """
    Return the database connection for the current request.
    Creates a new connection if one doesn't exist yet.
    The connection is stored on Flask's g object and closed automatically
    at the end of each request by close_db().
    """
    from flask import current_app
    db = getattr(g, '_db', None)
    if db is None:
        if current_app.config.get('USE_POSTGRES'):
            import psycopg2
            conn = psycopg2.connect(current_app.config['DATABASE_URL'])
            conn.autocommit = False
            g._db = _PgCursor(conn)
        else:
            conn = _sq.connect(current_app.config['DATABASE'])
            conn.row_factory = _sq.Row
            conn.execute("PRAGMA foreign_keys = ON")
            g._db = _SQLiteAdapter(conn)
    return g._db


def close_db(e=None):
    """Close the database connection at the end of the request."""
    db = getattr(g, '_db', None)
    if db:
        try:
            db.commit()
        except Exception:
            # Rollback if commit fails (e.g. transaction in failed state)
            try:
                if hasattr(db, '_conn'):
                    db._conn.rollback()
            except Exception:
                pass
        try:
            if hasattr(db, '_conn'):
                db._conn.close()
            elif hasattr(db, '_c'):
                db._c.close()
        except Exception:
            pass


# ── Table definitions ─────────────────────────────────────────────────────────
# Each string is a CREATE TABLE IF NOT EXISTS statement.
# Written in Postgres syntax — SQLite auto-adapts SERIAL → INTEGER PRIMARY KEY AUTOINCREMENT.
TABLES = [
    """CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'student',
        avatar TEXT,
        bio TEXT,
        location TEXT,
        website TEXT,
        instructor_title TEXT,
        instructor_field TEXT,
        instructor_status TEXT DEFAULT 'none',
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS user_stats (
        user_id TEXT PRIMARY KEY,
        lessons_completed INTEGER DEFAULT 0,
        courses_completed INTEGER DEFAULT 0,
        perfect_quizzes INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        is_profile_complete INTEGER DEFAULT 0,
        last_activity DATE,
        total_earnings REAL DEFAULT 0,
        average_rating REAL DEFAULT 0
    )""",
    """CREATE TABLE IF NOT EXISTS user_badges (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        badge_key TEXT NOT NULL,
        earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, badge_key)
    )""",
    """CREATE TABLE IF NOT EXISTS user_notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        data TEXT,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        instructor_id TEXT NOT NULL,
        instructor_name TEXT NOT NULL,
        instructor_avatar TEXT,
        category TEXT,
        difficulty TEXT DEFAULT 'Beginner',
        duration TEXT,
        duration_weeks INTEGER DEFAULT 0,
        price REAL DEFAULT 0,
        is_free INTEGER DEFAULT 1,
        has_certificate INTEGER DEFAULT 0,
        has_lifetime_access INTEGER DEFAULT 1,
        has_resources INTEGER DEFAULT 0,
        thumbnail TEXT,
        rating REAL DEFAULT 4.5,
        num_reviews INTEGER DEFAULT 0,
        enrollments INTEGER DEFAULT 0,
        is_published INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS course_tags (
        id SERIAL PRIMARY KEY,
        course_id TEXT NOT NULL,
        tag TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS course_outcomes (
        id SERIAL PRIMARY KEY,
        course_id TEXT NOT NULL,
        outcome TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS course_perks (
        course_id TEXT PRIMARY KEY,
        has_certificate INTEGER DEFAULT 0,
        lifetime_access INTEGER DEFAULT 1,
        has_resources INTEGER DEFAULT 0
    )""",
    """CREATE TABLE IF NOT EXISTS curriculum_sections (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        title TEXT NOT NULL,
        "order" INTEGER DEFAULT 0
    )""",
    """CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        duration TEXT,
        video_url TEXT,
        video_file TEXT,
        content TEXT,
        "order" INTEGER DEFAULT 0,
        type TEXT DEFAULT 'video',
        is_final INTEGER DEFAULT 0
    )""",
    """CREATE TABLE IF NOT EXISTS lesson_resources (
        id TEXT PRIMARY KEY,
        lesson_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT,
        file_name TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS course_resources (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        file_type TEXT,
        file_size TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS section_lessons (
        section_id TEXT NOT NULL,
        lesson_id TEXT NOT NULL,
        "order" INTEGER DEFAULT 0,
        PRIMARY KEY (section_id, lesson_id)
    )""",
    """CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        lesson_id TEXT,
        title TEXT NOT NULL,
        duration TEXT DEFAULT 'No limit'
    )""",
    """CREATE TABLE IF NOT EXISTS quiz_questions (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        question_text TEXT NOT NULL,
        options TEXT,
        correct_answer INTEGER DEFAULT 0,
        question_type TEXT DEFAULT 'mcq',
        "order" INTEGER DEFAULT 0
    )""",
    """CREATE TABLE IF NOT EXISTS quiz_attempts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        quiz_id TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        answers TEXT,
        correct_answers TEXT,
        attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS user_enrollments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        expires_at TIMESTAMP,
        UNIQUE(user_id, course_id)
    )""",
    """CREATE TABLE IF NOT EXISTS user_progress (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        lesson_id TEXT NOT NULL,
        is_completed INTEGER DEFAULT 0,
        quiz_score INTEGER,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, course_id, lesson_id)
    )""",
    """CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        content TEXT,
        user_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS issued_certificates (
        id TEXT PRIMARY KEY,
        cert_id TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        course_name TEXT NOT NULL,
        instructor_name TEXT NOT NULL,
        issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS lesson_discussions (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        lesson_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        user_avatar TEXT,
        content TEXT NOT NULL,
        parent_id TEXT,
        upvotes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS discussion_upvotes (
        id SERIAL PRIMARY KEY,
        discussion_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        UNIQUE(discussion_id, user_id)
    )""",
    """CREATE TABLE IF NOT EXISTS homepage_comments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        user_avatar TEXT,
        content TEXT NOT NULL,
        parent_id TEXT,
        edited_at TIMESTAMP,
        likes_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS homepage_comment_likes (
        id SERIAL PRIMARY KEY,
        comment_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        UNIQUE(comment_id, user_id)
    )""",
    """CREATE TABLE IF NOT EXISTS platform_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS instructor_guide_steps (
        id SERIAL PRIMARY KEY,
        step_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        email_notifications INTEGER DEFAULT 1,
        push_notifications INTEGER DEFAULT 1,
        language TEXT DEFAULT 'en',
        timezone TEXT DEFAULT 'UTC'
    )""",
    """CREATE TABLE IF NOT EXISTS instructor_applications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        status TEXT DEFAULT 'pending',
        bio TEXT,
        title TEXT,
        field TEXT,
        experience TEXT,
        location TEXT,
        website TEXT,
        applied_at TIMESTAMP,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS instructor_guide (
        id SERIAL PRIMARY KEY,
        step_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        content TEXT,
        video_url TEXT,
        "order" INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS issued_badges (
        id SERIAL PRIMARY KEY,
        badge_id TEXT,
        user_id TEXT NOT NULL,
        user_name TEXT,
        badge_key TEXT NOT NULL,
        badge_title TEXT,
        earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, badge_key)
    )""",
    """CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        data TEXT,
        read INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        reference TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",
]

# Column migrations for existing databases
MIGRATIONS = [
    # instructor_guide missing columns
    "ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS description TEXT",
    "ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS content TEXT",
    "ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS video_url TEXT",
    'ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0',
    "ALTER TABLE instructor_guide ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    # reviews missing columns
    "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_avatar TEXT",
    "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_name TEXT",
    # instructor_applications missing columns
    "ALTER TABLE instructor_applications ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP",
    "ALTER TABLE instructor_applications ADD COLUMN IF NOT EXISTS location TEXT",
    "ALTER TABLE instructor_applications ADD COLUMN IF NOT EXISTS website TEXT",
    # users missing columns
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS instructor_title TEXT",
    "ALTER TABLE users ADD COLUMN instructor_field TEXT",
    "ALTER TABLE lessons ADD COLUMN is_final INTEGER DEFAULT 0",
    "ALTER TABLE homepage_comments ADD COLUMN parent_id TEXT",
    "ALTER TABLE homepage_comments ADD COLUMN edited_at TIMESTAMP",
    "ALTER TABLE homepage_comments ADD COLUMN likes_count INTEGER DEFAULT 0",
    "ALTER TABLE user_stats ADD COLUMN is_profile_complete INTEGER DEFAULT 0",
    "ALTER TABLE user_stats ADD COLUMN total_earnings REAL DEFAULT 0",
    "ALTER TABLE user_stats ADD COLUMN average_rating REAL DEFAULT 0",
    "ALTER TABLE courses ADD COLUMN is_published INTEGER DEFAULT 1",
    "ALTER TABLE reviews ADD COLUMN user_name TEXT",
    "ALTER TABLE lesson_discussions ADD COLUMN IF NOT EXISTS user_role TEXT DEFAULT 'student'",
    "ALTER TABLE lesson_discussions ADD COLUMN IF NOT EXISTS is_pinned INTEGER DEFAULT 0",
    "ALTER TABLE lesson_discussions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    # issued_badges missing columns (for old DBs created before badge_id/user_name/badge_title)
    "ALTER TABLE issued_badges ADD COLUMN IF NOT EXISTS badge_id TEXT",
    "ALTER TABLE issued_badges ADD COLUMN IF NOT EXISTS user_name TEXT",
    "ALTER TABLE issued_badges ADD COLUMN IF NOT EXISTS badge_title TEXT",
]


# ── init_db ───────────────────────────────────────────────────────────────────
def init_db(app):
    """
    Create all database tables and run migrations.
    Called once when the app starts.
    Works with both Neon Postgres and local SQLite.
    """
    use_pg = app.config.get('USE_POSTGRES')

    if use_pg:
        import psycopg2
        conn = psycopg2.connect(app.config['DATABASE_URL'])
        conn.autocommit = False
        cur = conn.cursor()

        for table_sql in TABLES:
            try:
                cur.execute(table_sql)
                conn.commit()
            except Exception as e:
                conn.rollback()
                # Table already exists — fine

        # Postgres migrations (ADD COLUMN IF NOT EXISTS)
        for m in MIGRATIONS:
            try:
                # Only add IF NOT EXISTS if migration doesn't already have it
                if 'IF NOT EXISTS' in m.upper():
                    pg_m = m
                else:
                    pg_m = m.replace('ADD COLUMN ', 'ADD COLUMN IF NOT EXISTS ')
                cur.execute(pg_m)
                conn.commit()
                print(f'✅ Migration OK: {pg_m[:80]}')
            except Exception as e:
                conn.rollback()
                print(f'⚠ Migration skipped ({type(e).__name__}): {m[:80]} — {str(e)[:120]}')

        # Seed default config
        for kv in [('instructor_share', '50'), ('admin_share', '50')]:
            try:
                cur.execute(
                    "INSERT INTO platform_config (key, value) VALUES (%s, %s) "
                    "ON CONFLICT (key) DO NOTHING",
                    kv
                )
                conn.commit()
            except Exception:
                conn.rollback()

        cur.close()
        conn.close()

    else:
        # SQLite — adapt SERIAL to INTEGER PRIMARY KEY AUTOINCREMENT
        import os as _os
        db_dir = _os.path.dirname(app.config['DATABASE'])
        if db_dir:
            _os.makedirs(db_dir, exist_ok=True)
        conn = _sq.connect(app.config['DATABASE'])
        conn.execute("PRAGMA foreign_keys = ON")
        c = conn.cursor()

        for table_sql in TABLES:
            lite_sql = (table_sql
                        .replace('SERIAL PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT')
                        .replace(' IF NOT EXISTS (', ' IF NOT EXISTS\n    ('))
            try:
                c.execute(lite_sql)
            except Exception:
                pass

        for m in MIGRATIONS:
            try:
                c.execute(m)
            except Exception:
                pass

        c.execute("INSERT OR IGNORE INTO platform_config (key,value) VALUES ('instructor_share','50')")
        c.execute("INSERT OR IGNORE INTO platform_config (key,value) VALUES ('admin_share','50')")
        conn.commit()
        conn.close()

    print("✅ Database ready")
