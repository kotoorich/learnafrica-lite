"""Tests for Google sign-up name handling.

Reproduces the bug where a Google account was named after the email local part
(e.g. 'kofi.owusu') when Google did not return the `name` claim, and checks the
fix: a readable fallback, given/family fallback, repair of existing bad names,
and that a user-chosen name is never overwritten.

Boots the real app on SQLite and calls the real /api/auth/google route with the
Google verification call stubbed out.

    python backend/test_google_signup.py
"""
import os
import sys
import tempfile
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SECRET_KEY', 'test-secret-not-for-production')
os.environ['GOOGLE_OAUTH_CLIENT_ID'] = 'test-client.apps.googleusercontent.com'

_tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_tmp.close()
os.environ['DATABASE_PATH'] = _tmp.name

from app import create_app  # noqa: E402
from app.main import socketio  # noqa: E402,F401
from app.database import init_db, get_db  # noqa: E402

app = create_app()
app.config['TESTING'] = True
app.config['DATABASE'] = _tmp.name
app.config['USE_POSTGRES'] = False
c = app.test_client()

failures = []


def check(name, cond, extra=''):
    print(('PASS' if cond else 'FAIL') + f' - {name}' + (f' [{extra}]' if extra else ''))
    if not cond:
        failures.append(name)


with app.app_context():
    init_db(app)

BASE = {'aud': 'test-client.apps.googleusercontent.com',
        'email_verified': 'true', 'picture': ''}


class _Resp:
    status_code = 200

    def __init__(self, payload):
        self._p = payload

    def json(self):
        return self._p


def google(payload):
    with patch('app.main.requests.get', return_value=_Resp(payload)):
        r = c.post('/api/auth/google', json={'credential': 'fake', 'role': 'student'})
        return r.status_code, (r.get_json() or {}).get('user', {})


# ── 1. A real name from Google is stored as-is ───────────────────────────────
s, u = google({**BASE, 'email': 'ama.mensah@gmail.com', 'name': 'Ama Mensah'})
check('Google name is stored as given', u.get('name') == 'Ama Mensah', repr(u.get('name')))

# ── 2. No name -> readable fallback, not the raw local part ──────────────────
s, u = google({**BASE, 'email': 'kofi.owusu@gmail.com'})
check('missing name falls back to a readable name, not the email local part',
      u.get('name') == 'Kofi Owusu', repr(u.get('name')))

# ── 3. given_name / family_name only ─────────────────────────────────────────
s, u = google({**BASE, 'email': 'x@y.com', 'given_name': 'Yaa', 'family_name': 'Boateng'})
check('given/family names are combined when name is absent',
      u.get('name') == 'Yaa Boateng', repr(u.get('name')))

# ── 4. An existing account named after its email is repaired ─────────────────
with app.app_context():
    db = get_db()
    db.execute("UPDATE users SET name='kofi.owusu' WHERE email='kofi.owusu@gmail.com'")
    db.commit()
s, u = google({**BASE, 'email': 'kofi.owusu@gmail.com', 'name': 'Kofi Owusu Mensah'})
check('existing bad name is repaired on next Google sign-in',
      u.get('name') == 'Kofi Owusu Mensah', repr(u.get('name')))

# ── 5. A name the user actually chose is never overwritten ───────────────────
with app.app_context():
    db = get_db()
    db.execute("UPDATE users SET name='My Custom Name' WHERE email='ama.mensah@gmail.com'")
    db.commit()
s, u = google({**BASE, 'email': 'ama.mensah@gmail.com', 'name': 'Ama Mensah'})
check('a user-chosen name is left untouched', u.get('name') == 'My Custom Name', repr(u.get('name')))

# ── 6. Google accounts still have no usable password ─────────────────────────
r = c.post('/api/auth/login', json={'email': 'kofi.owusu@gmail.com', 'password': 'anything'})
check('Google account cannot be logged into with a made-up password',
      r.status_code == 401, r.status_code)

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED: {failures}')
    sys.exit(1)
print('ALL GOOGLE SIGNUP CHECKS PASSED')
