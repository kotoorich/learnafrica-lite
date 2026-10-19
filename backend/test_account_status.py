"""End-to-end tests for account-status messaging on login.

Boots the real app on its own throwaway SQLite database (so the in-process login
rate limiter is not already saturated by another test file) and checks the three
distinct outcomes a login can have:

  * an email with no account  -> 404 "No account found ...", flagged
    account_not_found, so the UI can say so instead of blaming the password;
  * a real account, wrong password -> generic 401, and it must NOT leak whether
    the account is suspended;
  * a real account, correct password, but suspended -> 403 "Your account has
    been suspended ...", flagged suspended, so the user is told the truth.

    python backend/test_account_status.py
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
app.config['DATABASE'] = _tmp.name
app.config['USE_POSTGRES'] = False

failures = []


def check(name, cond, extra=''):
    print(('PASS' if cond else 'FAIL') + f' - {name}' + (f' [{extra}]' if extra else ''))
    if not cond:
        failures.append(name)


with app.app_context():
    init_db(app)
    db = get_db()
    for _col in ('instructor_status', 'payment_method', 'payment_details', 'email_verified'):
        try:
            db.execute("ALTER TABLE users ADD COLUMN %s TEXT" % _col)
        except Exception:
            pass
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
               " VALUES ('stu1','Ama','stu@example.com',?, 'student',1,0)",
               (generate_password_hash('Pass12345!'),))
    db.commit()

c = app.test_client()

# ── Unknown email: say the account was not found ─────────────────────────────
r = c.post('/api/auth/login', json={'email': 'nobody@example.com', 'password': 'Pass12345!'})
d = r.get_json() or {}
check('unknown email returns 404', r.status_code == 404, r.status_code)
check('unknown email message mentions no account',
      'No account found' in (d.get('error') or ''), d.get('error'))
check('unknown email is flagged account_not_found', d.get('account_not_found') is True, d)

# ── Wrong password: stay generic, leak nothing about status ──────────────────
r = c.post('/api/auth/login', json={'email': 'stu@example.com', 'password': 'WrongPass!'})
d = r.get_json() or {}
check('wrong password returns a generic 401', r.status_code == 401, r.status_code)
check('wrong password message does not mention suspension',
      'suspend' not in (d.get('error') or '').lower(), d.get('error'))

# ── Correct password but suspended: explain the suspension ───────────────────
with app.app_context():
    db = get_db()
    db.execute("UPDATE users SET is_active=0 WHERE id='stu1'")
    db.commit()
r = c.post('/api/auth/login', json={'email': 'stu@example.com', 'password': 'Pass12345!'})
d = r.get_json() or {}
check('suspended account with correct password returns 403', r.status_code == 403, r.status_code)
check('suspended message explains the suspension',
      'suspended' in (d.get('error') or '').lower(), d.get('error'))
check('suspended response is flagged suspended', d.get('suspended') is True, d)

# ── Reactivated: normal login works again ────────────────────────────────────
with app.app_context():
    db = get_db()
    db.execute("UPDATE users SET is_active=1 WHERE id='stu1'")
    db.commit()
r = c.post('/api/auth/login', json={'email': 'stu@example.com', 'password': 'Pass12345!'})
d = r.get_json() or {}
check('reactivated account logs in normally', r.status_code == 200 and bool(d.get('token')),
      r.status_code)

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED: {failures}')
    sys.exit(1)
print('ALL ACCOUNT-STATUS CHECKS PASSED')
