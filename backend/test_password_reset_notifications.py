"""Test password-reset notifications and the admin tab counters.

Boots the real app on SQLite and exercises the real routes. The admin
notification on a new request, the user notification when a link is generated,
the security notice on completion, and the /api/admin/tab-counts badge counts.

    python backend/test_password_reset_notifications.py
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

with app.app_context():
    init_db(app)
    db = get_db()
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
               " VALUES (?,?,?,?,?,1,0)",
               ('adm1', 'Admin', 'admin@example.com',
                generate_password_hash('AdminPass123!'), 'admin'))
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
               " VALUES (?,?,?,?,?,1,0)",
               ('stu1', 'Student', 'stu@example.com',
                generate_password_hash('OldPass123!'), 'student'))
    db.commit()

c = app.test_client()
failures = []


def check(name, cond, extra=''):
    print(('PASS' if cond else 'FAIL') + f' - {name}' + (f' [{extra}]' if extra else ''))
    if not cond:
        failures.append(name)


def notifs(uid):
    with app.app_context():
        db = get_db()
        return [dict(r) for r in db.execute(
            'SELECT * FROM user_notifications WHERE user_id=? ORDER BY created_at',
            (uid,)).fetchall()]


# Email is OFF by default, so the manual flow applies.
r = c.post('/api/auth/forgot-password', json={'email': 'stu@example.com',
                                              'reason': 'Lost access to email'})
check('request accepted', r.status_code == 200, str(r.status_code))

admin_notes = notifs('adm1')
check('admin got a notification', len(admin_notes) == 1, str(len(admin_notes)))
if admin_notes:
    n = admin_notes[0]
    check('subject mentions the user email', 'stu@example.com' in n['message'])
    check('subject mentions the reason', 'Lost access to email' in n['message'])
    check('no token/link in admin notice',
          'token=' not in n['message'] and '/reset-password' not in n['message'])

# Log in as admin and fetch the request id.
r = c.post('/api/auth/login', json={'email': 'admin@example.com',
                                    'password': 'AdminPass123!'})
tok = (r.get_json() or {}).get('token')
check('admin login', bool(tok), str(r.status_code))
H = {'Authorization': f'Bearer {tok}'}

r = c.get('/api/admin/tab-counts', headers=H)
counts = (r.get_json() or {}).get('counts', {})
check('tab-counts reachable', r.status_code == 200, str(r.status_code))
check('pending reset count is 1', counts.get('password_reset_requests') == 1, str(counts))

r = c.get('/api/admin/password-reset-requests', headers=H)
reqs = (r.get_json() or {}).get('requests', [])
check('request listed', len(reqs) == 1, str(len(reqs)))
rid = reqs[0]['id'] if reqs else None

# Generate a link -> the user should be notified (without the link).
r = c.post(f'/api/admin/password-reset-requests/{rid}/generate-link', headers=H)
check('link generated', r.status_code == 200, str(r.status_code))
link = (r.get_json() or {}).get('link', '')
user_notes = notifs('stu1')
check('user got a link-ready notification', len(user_notes) == 1, str(len(user_notes)))
if user_notes:
    check('link-ready notice does not contain the link',
          link not in user_notes[0]['message'] and 'token=' not in user_notes[0]['message'])

# Badge should clear once the request is no longer pending.
r = c.get('/api/admin/tab-counts', headers=H)
counts = (r.get_json() or {}).get('counts', {})
check('pending count clears after link sent',
      counts.get('password_reset_requests') == 0, str(counts))

# Complete the reset -> security notice to the user.
raw = link.split('token=')[-1] if 'token=' in link else ''
r = c.post('/api/auth/reset-password', json={'token': raw, 'password': 'NewPass123!',
                                             'confirm_password': 'NewPass123!'})
check('password reset', r.status_code == 200, str(r.status_code))
user_notes = notifs('stu1')
titles = [n['title'] for n in user_notes]
check('user got a password-changed notice',
      any('password was changed' in t.lower() for t in titles), str(titles))

# No secrets anywhere in any notification.
all_msgs = ' '.join(n['message'] for n in notifs('stu1') + notifs('adm1'))
check('no raw token in any notification', 'token=' not in all_msgs)
check('no new password in any notification', 'NewPass123!' not in all_msgs)

print()
if failures:
    print(f'{len(failures)} FAILURE(S): {failures}')
    sys.exit(1)
print('ALL NOTIFICATION + TAB-COUNT CHECKS PASSED')
