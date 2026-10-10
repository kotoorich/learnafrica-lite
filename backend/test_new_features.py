"""Tests for the three new features:

  1. Emergency instructor password reset (superadmin-only, revokes sessions).
  2. Email senders: Gmail 1 / Gmail 2 / SendPulse selector + ON/OFF switch.
  3. Google sign-up / login.

Boots the real app against a throwaway SQLite database. Google's tokeninfo
endpoint is replaced with a fake because it is an external service we cannot
call from a test; every other path runs real code.

    python backend/test_new_features.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SECRET_KEY', 'test-secret-not-for-production')

from app import create_app  # noqa: E402
from app.main import socketio  # noqa: E402,F401
from app.database import init_db, get_db  # noqa: E402
from app.security import generate_token  # noqa: E402

_tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_tmp.close()
os.environ['DATABASE_PATH'] = _tmp.name

app = create_app()
app.config['TESTING'] = True
app.config['DATABASE'] = _tmp.name
app.config['USE_POSTGRES'] = False

with app.app_context():
    init_db(app)
    db = get_db()
    from werkzeug.security import generate_password_hash
    # Superadmin (real password for re-auth), plain admin, instructor, student.
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
               " VALUES (?,?,?,?,?,1,0)",
               ('sa1', 'Super Admin', 'sa@example.com', generate_password_hash('AdminPass123!'), 'superadmin'))
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
               " VALUES (?,?,?,?,?,1,0)",
               ('ad1', 'Plain Admin', 'ad@example.com', generate_password_hash('AdminPass123!'), 'admin'))
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version,instructor_status)"
               " VALUES (?,?,?,?,?,1,0,?)",
               ('ins1', 'Jane Instructor', 'jane@example.com', generate_password_hash('OldInstPass123!'),
                'instructor', 'approved'))
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
               " VALUES (?,?,?,?,?,1,0)",
               ('st1', 'Sam Student', 'sam@example.com', generate_password_hash('StuPass123!'), 'student'))
    db.commit()

c = app.test_client()
failures = []


def check(name, cond, extra=''):
    print(('PASS' if cond else 'FAIL') + f' — {name}' + (f' [{extra}]' if extra else ''))
    if not cond:
        failures.append(name)


with app.app_context():
    _sa = generate_token('sa1', 'sa@example.com', 'superadmin', 0)
    _ad = generate_token('ad1', 'ad@example.com', 'admin', 0)
sa_hdr = {'Authorization': f'Bearer {_sa}'}
ad_hdr = {'Authorization': f'Bearer {_ad}'}

# ── 1. Emergency password reset ───────────────────────────────────────────────
base = {'reason': 'Instructor engaged in unlawful conduct on the platform',
        'incident': 'Repeated attempts to defraud students and share stolen material.',
        'confirm': 'RESET', 'acknowledged': True,
        'admin_password': 'AdminPass123!',
        'new_password': 'BrandNewPass456!', 'confirm_password': 'BrandNewPass456!'}

r = c.post('/api/admin/instructors/ins1/emergency-password-reset', json=base)
check('emergency reset requires auth', r.status_code in (401, 403), r.status_code)

r = c.post('/api/admin/instructors/ins1/emergency-password-reset', headers=ad_hdr, json=base)
check('plain admin cannot emergency reset', r.status_code == 403, r.status_code)

# Validation: short reason must fail even for superadmin.
r = c.post('/api/admin/instructors/ins1/emergency-password-reset', headers=sa_hdr,
           json={**base, 'reason': 'bad'})
check('short reason rejected', r.status_code == 400, r.status_code)

r = c.post('/api/admin/instructors/ins1/emergency-password-reset', headers=sa_hdr,
           json={**base, 'confirm': 'nope'})
check('wrong confirmation rejected', r.status_code == 400, r.status_code)

r = c.post('/api/admin/instructors/ins1/emergency-password-reset', headers=sa_hdr,
           json={**base, 'admin_password': 'wrong'})
check('wrong admin password rejected', r.status_code == 403, r.status_code)

# Old instructor password works before the reset.
r = c.post('/api/auth/login', json={'email': 'jane@example.com', 'password': 'OldInstPass123!'})
check('instructor can log in before reset', r.status_code == 200, r.status_code)

r = c.post('/api/admin/instructors/ins1/emergency-password-reset', headers=sa_hdr, json=base)
check('superadmin emergency reset succeeds', r.status_code == 200, r.status_code)

# Old password no longer works; new one does.
r = c.post('/api/auth/login', json={'email': 'jane@example.com', 'password': 'OldInstPass123!'})
check('old password no longer works', r.status_code == 401, r.status_code)
r = c.post('/api/auth/login', json={'email': 'jane@example.com', 'password': 'BrandNewPass456!'})
check('new password works', r.status_code == 200, r.status_code)

# Session revocation: a token minted before the reset is now rejected.
with app.app_context():
    db = get_db()
    tv = int(db.execute("SELECT token_version FROM users WHERE id='ins1'").fetchone()['token_version'])
check('token_version bumped after reset', tv == 1, tv)
with app.app_context():
    stale = generate_token('ins1', 'jane@example.com', 'instructor', 0)  # old counter
r = c.get('/api/users/me', headers={'Authorization': f'Bearer {stale}'})
check('stale session token rejected', r.status_code == 401, r.status_code)

# Audit + notification recorded; notification must not contain the password.
with app.app_context():
    db = get_db()
    actions = [row['action'] for row in db.execute('SELECT action FROM audit_log').fetchall()]
    notif = db.execute(
        "SELECT title, message FROM user_notifications WHERE user_id='ins1' ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
check('audit log records emergency reset', 'emergency_password_reset' in actions, actions)
check('instructor notified of password change', notif is not None and 'Password' in (notif['title'] or ''))
check('notification does not contain the new password',
      notif is not None and 'BrandNewPass456!' not in (notif['message'] or ''))

# ── 2. Email senders ──────────────────────────────────────────────────────────
r = c.get('/api/admin/email/config')
check('email config requires auth', r.status_code in (401, 403), r.status_code)

r = c.get('/api/admin/email/config', headers=ad_hdr)
check('email config GET 200', r.status_code == 200, r.status_code)
cfg = r.get_json()
check('config lists three senders',
      all(k in cfg for k in ('gmail1', 'gmail2', 'sendpulse')), list(cfg.keys()))
check('config never leaks a refresh token', 'refresh_token' not in str(cfg))
check('config never leaks a client secret', 'client_secret' not in str(cfg))

# Turning email OFF must stop ordinary sending.
r = c.put('/api/admin/email/config', headers=ad_hdr, json={'enabled': False})
check('email config PUT 200', r.status_code == 200, r.status_code)
check('email now disabled', r.get_json().get('enabled') is False, r.get_json())
with app.app_context():
    db = get_db()
    from app import email_service
    ok, err = email_service.send_email(db, 'someone@example.com', 'X', 's', '<p>h</p>', 't')
check('sending blocked while OFF', ok is False and 'turned off' in (err or ''), err)

# Turning it back ON and selecting a sender.
r = c.put('/api/admin/email/config', headers=ad_hdr,
          json={'enabled': True, 'selected': 'gmail1'})
check('email re-enabled', r.get_json().get('enabled') is True, r.get_json())
check('selected sender is gmail1', r.get_json().get('selected') == 'gmail1', r.get_json())

# Test send against an unconnected sender fails clearly.
r = c.post('/api/admin/email/test', headers=ad_hdr, json={'slot': 'gmail1', 'to': 'x@example.com'})
check('test send on unconnected gmail fails clearly', r.status_code == 400, r.status_code)

# Selecting the still-available SendPulse sender works.
r = c.put('/api/admin/email/config', headers=ad_hdr, json={'selected': 'sendpulse'})
check('can select sendpulse as sender', r.get_json().get('selected') == 'sendpulse', r.get_json())

# ── 3. Google sign-up / login ─────────────────────────────────────────────────
r = c.post('/api/auth/google', json={'credential': 'x'})
check('google auth needs server config', r.status_code == 400, r.status_code)

# With config + a successful (faked) Google verification.
os.environ['GOOGLE_OAUTH_CLIENT_ID'] = 'test-client.apps.googleusercontent.com'


class _FakeResp:
    def __init__(self, status, data):
        self.status_code = status
        self._data = data
        self.text = str(data)

    def json(self):
        return self._data


import app.main as m  # noqa: E402

_orig_get = m.requests.get


def _fake_get(url, *a, **k):
    if 'tokeninfo' in url:
        return _FakeResp(200, {
            'aud': 'test-client.apps.googleusercontent.com',
            'email': 'newstudent@gmail.com',
            'email_verified': 'true',
            'name': 'New Student',
            'picture': 'http://img/x.png',
        })
    return _orig_get(url, *a, **k)


m.requests.get = _fake_get

r = c.post('/api/auth/google', json={'credential': 'ok', 'role': 'student'})
check('google student signup 201', r.status_code == 201, r.status_code)
j = r.get_json()
check('google signup returns token', bool(j.get('token')))
check('google signup role is student', j.get('user', {}).get('role') == 'student', j.get('user'))

# A client cannot claim instructor for an existing student account.
r = c.post('/api/auth/google', json={'credential': 'ok', 'role': 'instructor'})
check('google login does not change existing role', r.get_json().get('user', {}).get('role') == 'student')

# New instructor via Google is pending, never auto-approved.
def _fake_instr(url, *a, **k):
    if 'tokeninfo' in url:
        return _FakeResp(200, {
            'aud': 'test-client.apps.googleusercontent.com',
            'email': 'newinstructor@gmail.com',
            'email_verified': 'true',
            'name': 'New Instructor',
        })
    return _orig_get(url, *a, **k)


m.requests.get = _fake_instr
r = c.post('/api/auth/google', json={'credential': 'ok', 'role': 'instructor'})
check('google instructor signup 201', r.status_code == 201, r.status_code)
u = r.get_json().get('user', {})
check('google instructor is not auto-approved', u.get('instructor_status') == 'pending', u.get('instructor_status'))
check('google instructor role is instructor', u.get('role') == 'instructor', u.get('role'))

# Unverified Google email is rejected.
m.requests.get = lambda url, *a, **k: _FakeResp(200, {
    'aud': 'test-client.apps.googleusercontent.com', 'email': 'x@gmail.com',
    'email_verified': 'false'}) if 'tokeninfo' in url else _orig_get(url, *a, **k)
r = c.post('/api/auth/google', json={'credential': 'ok'})
check('unverified google email rejected', r.status_code == 401, r.status_code)

# A token for another application (aud mismatch) is rejected.
m.requests.get = lambda url, *a, **k: _FakeResp(200, {
    'aud': 'someone-else', 'email': 'x@gmail.com', 'email_verified': 'true'}) \
    if 'tokeninfo' in url else _orig_get(url, *a, **k)
r = c.post('/api/auth/google', json={'credential': 'ok'})
check('google token for another app rejected', r.status_code == 401, r.status_code)

# Email/password login still works (unchanged).
r = c.post('/api/auth/login', json={'email': 'sam@example.com', 'password': 'StuPass123!'})
check('existing email/password login still works', r.status_code == 200, r.status_code)

print()
if failures:
    print(f'{len(failures)} check(s) FAILED:', failures)
    sys.exit(1)
print('All checks passed.')
