"""Regression tests for the Clear-All-Notifications feature (task item 6).

Boots the real app on a throwaway SQLite database and exercises the real routes.

    python backend/test_notifications_clear.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SECRET_KEY', 'test-secret-not-for-production')

from app import create_app  # noqa: E402
from app.main import socketio  # noqa: E402,F401
from app.database import init_db, get_db  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402

_tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_tmp.close()
os.environ['DATABASE_PATH'] = _tmp.name

app = create_app()
app.config['TESTING'] = True
app.config['USE_POSTGRES'] = False

failures = []


def check(name, cond, extra=''):
    print(('PASS' if cond else 'FAIL') + f' - {name}' + (f' [{extra}]' if extra else ''))
    if not cond:
        failures.append(name)


with app.app_context():
    init_db(app)
    db = get_db()
    try:
        db.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 1")
    except Exception:
        pass
    for uid, email in (('u1', 'owner@example.com'), ('u2', 'other@example.com')):
        db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
                   " VALUES (?,?,?,?, 'student',1,0)",
                   (uid, uid, email, generate_password_hash('Pass12345!')))
    for nid in ('n1', 'n2'):
        db.execute('INSERT INTO user_notifications (id,user_id,type,title,message,"read",created_at)'
                   ' VALUES (?,?,?,?,?,FALSE,CURRENT_TIMESTAMP)', (nid, 'u1', 'info', 'T', 'M'))
    db.execute('INSERT INTO user_notifications (id,user_id,type,title,message,"read",created_at)'
               ' VALUES (?,?,?,?,?,FALSE,CURRENT_TIMESTAMP)', ('n3', 'u2', 'info', 'T', 'M'))
    db.commit()

c = app.test_client()


def login(email):
    return (c.post('/api/auth/login', json={'email': email, 'password': 'Pass12345!'}).get_json() or {}).get('token')


t1 = login('owner@example.com')
t2 = login('other@example.com')
h1 = {'Authorization': f'Bearer {t1}'}
h2 = {'Authorization': f'Bearer {t2}'}

before = len(c.get('/api/notifications', headers=h1).get_json()['notifications'])
check('owner starts with their own notifications', before == 2, before)

# Clearing requires authentication.
check('unauthenticated clear is rejected', c.delete('/api/notifications').status_code == 401)

# Clear all removes only the caller's rows.
r = c.delete('/api/notifications', headers=h1)
check('clear all returns 200', r.status_code == 200, r.get_json())
after = c.get('/api/notifications', headers=h1).get_json()['notifications']
check('owner notifications are gone', len(after) == 0, len(after))
other = c.get('/api/notifications', headers=h2).get_json()['notifications']
check("another user's notifications are untouched", len(other) == 1, len(other))

# Clearing an already-empty list is a graceful no-op.
r = c.delete('/api/notifications', headers=h1)
check('clearing an empty list is a graceful no-op', r.status_code == 200, r.status_code)

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED: {failures}')
    sys.exit(1)
print('ALL CLEAR-NOTIFICATIONS CHECKS PASSED')
