"""End-to-end tests for the Forgot Password feature.

Boots the real Flask app against a throwaway SQLite database and exercises:

  * user submits a request (public, generic response, no email sent)
  * request appears in the admin list
  * admin generates a one-time, time-limited link bound to the user
  * the token is stored only as a hash (never in clear)
  * the link resets the password, bumps token_version, and is single-use
  * the admin "email link" endpoint is refused while email sending is off
  * an unknown email yields the same generic response (no enumeration)

    python backend/test_forgot_password.py
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
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
               " VALUES (?,?,?,?,?,1,0)",
               ('ad1', 'Admin', 'ad@example.com', generate_password_hash('AdminPass123!'), 'admin'))
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
               " VALUES (?,?,?,?,?,1,0)",
               ('st1', 'Sam Student', 'sam@example.com', generate_password_hash('OldPass123!'), 'student'))
    db.commit()

c = app.test_client()
failures = []


def check(name, cond, extra=''):
    print(('PASS' if cond else 'FAIL') + f' - {name}' + (f' [{extra}]' if extra else ''))
    if not cond:
        failures.append(name)


def admin_headers():
    with app.app_context():
        t = generate_token('ad1', 'ad@example.com', 'admin', 0)
    return {'Authorization': f'Bearer {t}'}


# 1. Public request for a known email -> generic success, no enumeration
r = c.post('/api/auth/forgot-password', json={'email': 'sam@example.com',
                                              'reason': 'Forgot Password'})
check('request accepted (200)', r.status_code == 200, str(r.status_code))
check('generic message returned', 'recorded' in (r.get_json() or {}).get('message', ''))

# 2. Public request for an unknown email -> identical generic response
r2 = c.post('/api/auth/forgot-password', json={'email': 'nobody@example.com'})
check('unknown email same response (no enumeration)',
      r2.status_code == 200 and r2.get_json().get('message') == r.get_json().get('message'))

# 3. Invalid email rejected
r3 = c.post('/api/auth/forgot-password', json={'email': 'not-an-email'})
check('invalid email rejected (400)', r3.status_code == 400, str(r3.status_code))

# 4. Admin list shows the request with status
r = c.get('/api/admin/password-reset-requests', headers=admin_headers())
reqs = (r.get_json() or {}).get('requests', [])
check('admin list requires auth', c.get('/api/admin/password-reset-requests').status_code in (401, 403))
check('request listed', any(x['email'] == 'sam@example.com' for x in reqs), str(len(reqs)))
rid = next(x['id'] for x in reqs if x['email'] == 'sam@example.com')
check('status is pending', next(x['status'] for x in reqs if x['id'] == rid) == 'pending')

# 5. Admin generates a one-time link
r = c.post(f'/api/admin/password-reset-requests/{rid}/generate-link', headers=admin_headers())
check('generate link (200)', r.status_code == 200, str(r.status_code))
link = (r.get_json() or {}).get('link', '')
check('link returned', '/reset-password?token=' in link, link[:60])
raw_token = link.split('token=')[-1]

# 6. Only the hash is stored (raw token not persisted)
with app.app_context():
    db = get_db()
    row = db.execute('SELECT token_hash FROM password_reset_tokens WHERE request_id=?', (rid,)).fetchone()
    check('token stored as hash only', row is not None and row['token_hash'] != raw_token)
    check('hash length 64 (sha256)', len(row['token_hash']) == 64)

# 7. Validate endpoint accepts the token
r = c.get(f'/api/auth/reset-password/validate?token={raw_token}')
check('token validates', r.status_code == 200 and r.get_json().get('valid') is True)

# 8. Reset the password
r = c.post('/api/auth/reset-password', json={'token': raw_token,
                                             'password': 'BrandNewPass123!',
                                             'confirm_password': 'BrandNewPass123!'})
check('password reset (200)', r.status_code == 200, str(r.status_code))

# 9. New password works, old one fails
r = c.post('/api/auth/login', json={'email': 'sam@example.com', 'password': 'BrandNewPass123!'})
check('login with new password', r.status_code == 200, str(r.status_code))
r = c.post('/api/auth/login', json={'email': 'sam@example.com', 'password': 'OldPass123!'})
check('old password rejected', r.status_code == 401, str(r.status_code))

# 10. Token is single-use
r = c.post('/api/auth/reset-password', json={'token': raw_token,
                                             'password': 'Another123!',
                                             'confirm_password': 'Another123!'})
check('token cannot be reused', r.status_code == 400, str(r.status_code))

# 11. Request marked completed
r = c.get('/api/admin/password-reset-requests', headers=admin_headers())
check('request completed',
      next((x['status'] for x in r.get_json()['requests'] if x['id'] == rid), None) == 'completed')

# 12. Email-link refused while email sending is off
with app.app_context():
    db = get_db()
    from app import email_service
    cfg = email_service.load_email_config(db)
    cfg['enabled'] = False
    email_service.save_email_config(db, cfg, 'ad1', False)
r = c.post(f'/api/admin/password-reset-requests/{rid}/email-link',
           headers=admin_headers(), json={'link': link})
check('email-link refused when email off (400)', r.status_code == 400, str(r.status_code))

# 13. Expired token rejected
with app.app_context():
    db = get_db()
    import uuid as _uuid
    from datetime import datetime, timedelta
    expired_raw = 'expiredtoken123'
    import hashlib
    db.execute('INSERT INTO password_reset_tokens (id,request_id,user_id,token_hash,expires_at)'
               ' VALUES (?,?,?,?,?)',
               (str(_uuid.uuid4()), rid, 'st1', hashlib.sha256(expired_raw.encode()).hexdigest(),
                datetime.utcnow() - timedelta(minutes=5)))
    db.commit()
r = c.get(f'/api/auth/reset-password/validate?token={expired_raw}')
check('expired token rejected', r.status_code == 400, str(r.status_code))

# 14. token_version bumped by the reset (old sessions revoked)
with app.app_context():
    db = get_db()
    tv = db.execute('SELECT token_version FROM users WHERE id=?', ('st1',)).fetchone()['token_version']
    check('token_version bumped', int(tv) >= 1, str(tv))

print()
if failures:
    print(f'{len(failures)} FAILURE(S): {failures}')
    sys.exit(1)
print('ALL FORGOT-PASSWORD CHECKS PASSED')
