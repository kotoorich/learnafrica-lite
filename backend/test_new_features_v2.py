"""Tests for the new work: course visibility, email usage tracking, quota
alerts, and the instructor enrollment notification.

Boots the real app on SQLite and exercises the real routes/helpers.

    python backend/test_new_features_v2.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SECRET_KEY', 'test-secret-not-for-production')

from app import create_app  # noqa: E402
from app.main import socketio  # noqa: E402,F401
from app.database import init_db, get_db  # noqa: E402
from app import email_service  # noqa: E402
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
    for uid, name, email, role in [
        ('adm1', 'Admin', 'admin@example.com', 'admin'),
        ('ins1', 'Instructor', 'ins@example.com', 'instructor'),  # approved below
        ('stu1', 'Student', 'stu@example.com', 'student'),
    ]:
        db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
                   " VALUES (?,?,?,?,?,1,0)",
                   (uid, name, email, generate_password_hash('Pass12345!'), role))
    for _col in ('instructor_status', 'payment_method', 'payment_details'):
        try:
            db.execute("ALTER TABLE users ADD COLUMN %s TEXT" % _col)
        except Exception:
            pass
    db.execute("UPDATE users SET instructor_status='approved', payment_method='bank',"
               " payment_details='acct' WHERE id='ins1'")
    db.execute("UPDATE users SET instructor_status='approved', payment_method='bank',"
               " payment_details='acct' WHERE id='ins2'")
    # Two courses: one visible (legacy default) and one hidden.
    db.execute("INSERT INTO courses (id,title,description,instructor_id,instructor_name,category,"
               "difficulty,price,is_free,is_published,is_visible)"
               " VALUES ('cvis','Visible Course','d','ins1','Instructor','Tech','beginner',0,1,1,1)")
    db.execute("INSERT INTO courses (id,title,description,instructor_id,instructor_name,category,"
               "difficulty,price,is_free,is_published,is_visible)"
               " VALUES ('chim','Hidden Course','d','ins1','Instructor','Tech','beginner',0,1,1,0)")
    db.commit()

c = app.test_client()


def login(email, pw):
    r = c.post('/api/auth/login', json={'email': email, 'password': pw})
    return (r.get_json() or {}).get('token') or (r.get_json() or {}).get('access_token')


# ── 1. Public listing excludes hidden courses ────────────────────────────────
r = c.get('/api/courses')
ids = [x['id'] for x in (r.get_json() or {}).get('courses', [])]
check('public listing includes visible course', 'cvis' in ids, ids)
check('public listing excludes hidden course', 'chim' not in ids, ids)

# ── 2. Direct link to hidden course 404s for a student/visitor ───────────────
check('hidden course 404 for anonymous', c.get('/api/courses/chim').status_code == 404)
stu_tok = login('stu@example.com', 'Pass12345!')
check('hidden course 404 for student',
      c.get('/api/courses/chim', headers={'Authorization': f'Bearer {stu_tok}'}).status_code == 404)
check('visible course 200 for anonymous', c.get('/api/courses/cvis').status_code == 200)

# ── 3. Owner and admin can see a hidden course ───────────────────────────────
ins_tok = login('ins@example.com', 'Pass12345!')
adm_tok = login('admin@example.com', 'Pass12345!')
check('owner sees hidden course',
      c.get('/api/courses/chim', headers={'Authorization': f'Bearer {ins_tok}'}).status_code == 200)
check('admin sees hidden course',
      c.get('/api/courses/chim', headers={'Authorization': f'Bearer {adm_tok}'}).status_code == 200)

# ── 4. Visibility toggle ─────────────────────────────────────────────────────
r = c.put('/api/instructor/courses/chim/visibility', json={'visible': True},
          headers={'Authorization': f'Bearer {ins_tok}'})
check('owner can make course visible', r.status_code == 200 and r.get_json().get('is_visible') is True,
      r.get_json())
ids = [x['id'] for x in (c.get('/api/courses').get_json() or {}).get('courses', [])]
check('newly visible course now listed', 'chim' in ids)
r = c.put('/api/instructor/courses/chim/visibility', json={'visible': False},
          headers={'Authorization': f'Bearer {ins_tok}'})
check('owner can hide again', r.status_code == 200 and r.get_json().get('is_visible') is False)

# ── 5. A different instructor cannot toggle another's course ─────────────────
with app.app_context():
    db = get_db()
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
               " VALUES ('ins2','Other','ins2@example.com',?, 'instructor',1,0)",
               (generate_password_hash('Pass12345!'),))
    db.commit()
other_tok = login('ins2@example.com', 'Pass12345!')
r = c.put('/api/instructor/courses/chim/visibility', json={'visible': True},
          headers={'Authorization': f'Bearer {other_tok}'})
check('non-owner instructor forbidden', r.status_code == 403, r.status_code)

# ── 6. New courses default to hidden ─────────────────────────────────────────
r = c.post('/api/instructor/courses',
           json={'title': 'Brand New', 'description': 'd', 'category': 'Tech',
                 'difficulty': 'beginner', 'price': 0, 'is_free': True},
           headers={'Authorization': f'Bearer {ins_tok}'})
new_id = (r.get_json() or {}).get('course_id') or (r.get_json() or {}).get('id')
if new_id:
    with app.app_context():
        db = get_db()
        row = db.execute('SELECT is_visible FROM courses WHERE id=?', (new_id,)).fetchone()
    check('new instructor course starts hidden', int(row['is_visible']) == 0, dict(row) if row else None)
else:
    check('new instructor course created', False, r.get_json())

# ── 7. Enrollment blocked on hidden course ───────────────────────────────────
r = c.post('/api/courses/chim/enroll', json={}, headers={'Authorization': f'Bearer {stu_tok}'})
check('enroll blocked on hidden course', r.status_code == 404, r.status_code)

# ── 8. Email config gate ─────────────────────────────────────────────────────
r = c.put('/api/admin/email/config', json={'selected': 'gmail1'},
          headers={'Authorization': f'Bearer {adm_tok}'})
check('cannot select provider while email OFF', r.status_code == 400, r.get_json())
r = c.put('/api/admin/email/config', json={'enabled': True, 'course_email': False},
          headers={'Authorization': f'Bearer {adm_tok}'})
body = r.get_json() or {}
check('master switch on', r.status_code == 200 and body.get('enabled') is True)
check('course_email setting saved', body.get('course_email') is False, body.get('course_email'))

# ── 9. Usage tracking: success counts, failure does not ──────────────────────
with app.app_context():
    db = get_db()
    email_service.record_success(db, 'gmail1', False)
    email_service.record_success(db, 'gmail1', False)
    email_service.record_failure(db, 'gmail1', 'boom', False)
    rows = email_service.usage_for(db, None, False, refresh=False)
    g1 = [x for x in rows if x['provider'] == 'gmail1'][0]
    check('two successful sends counted', g1['sent_today'] == 2, g1['sent_today'])
    check('failure did not increment count', g1['sent_today'] == 2)
    check('last error recorded', g1['last_error'] == 'boom', g1['last_error'])

# ── 10. Threshold alert fires once and names the account ─────────────────────
with app.app_context():
    db = get_db()
    email_service.set_configured_limit(db, 'gmail1', 2, 'estimate', False)
    sent = []

    def hook(db_, provider, title, message, internal_id):
        sent.append((provider, title, message, internal_id))

    email_service.set_alert_hook(hook)
    email_service.evaluate_alerts(db, 'gmail1', False)
    check('alert fired at limit', len(sent) == 1, sent)
    check('alert names the account', sent and 'Gmail account 1' in sent[0][1], sent)
    email_service.evaluate_alerts(db, 'gmail1', False)
    check('same threshold does not repeat', len(sent) == 1, len(sent))
    # Recovery clears, then a new breach can alert again.
    db.execute("UPDATE email_usage SET sent_today=0, last_error=NULL WHERE provider='gmail1'")
    db.commit()
    email_service.evaluate_alerts(db, 'gmail1', False)
    db.execute("UPDATE email_usage SET sent_today=2 WHERE provider='gmail1'")
    db.commit()
    email_service.evaluate_alerts(db, 'gmail1', False)
    check('alert can re-fire after recovery', len(sent) == 2, len(sent))
    email_service.set_alert_hook(None)

# ── 11. Instructor notified when a student enrolls ───────────────────────────
c.put('/api/instructor/courses/chim/visibility', json={'visible': True},
      headers={'Authorization': f'Bearer {ins_tok}'})
r = c.post('/api/courses/chim/enroll', json={}, headers={'Authorization': f'Bearer {stu_tok}'})
check('student can enroll once visible', r.status_code == 200, r.get_json())
with app.app_context():
    db = get_db()
    ins_notifs = [dict(x) for x in db.execute(
        "SELECT * FROM user_notifications WHERE user_id='ins1'").fetchall()]
    titles = [n['title'] for n in ins_notifs]
    check('instructor got an enrollment notification',
          any('student' in t.lower() for t in titles), titles)
    stu_notifs = [dict(x) for x in db.execute(
        "SELECT * FROM user_notifications WHERE user_id='stu1'").fetchall()]
    check('student still gets their own enrollment notice',
          any(n['type'] == 'enrollment' for n in stu_notifs))

# ── 12. Notification click-through link ──────────────────────────────────────
r = c.get('/api/notifications', headers={'Authorization': f'Bearer {ins_tok}'})
links = [(n.get('type'), n.get('link')) for n in (r.get_json() or {}).get('notifications', [])]
check('instructor enrollment notification links to their courses',
      any(l == '/instructor/courses' for _, l in links), links)

# ── 13. Usage endpoint returns per-provider rows ─────────────────────────────
r = c.get('/api/admin/email/usage', headers={'Authorization': f'Bearer {adm_tok}'})
usage = (r.get_json() or {}).get('usage', [])
check('usage endpoint returns all providers', len(usage) == 3, len(usage))
check('usage rows carry estimate label', all('is_estimate' in u for u in usage))

# ── 14. Single master switch governs signup verification (edge case) ─────────
def set_email(on):
    return c.put('/api/admin/email/config', json={'enabled': on},
                 headers={'Authorization': f'Bearer {adm_tok}'})

def set_verify(mode):
    return c.put('/api/admin/settings/signup-verification', json={'mode': mode},
                 headers={'Authorization': f'Bearer {adm_tok}'})

with app.app_context():
    db = get_db()
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,"
               "token_version,email_verified) VALUES (?,?,?,?,?,?,?,?)",
               ('unv1', 'Unverified', 'unv@example.com',
                generate_password_hash('Pass12345!'), 'student', 1, 0, 0))
    db.commit()

set_verify('email_otp')
set_email(True)
r = c.post('/api/auth/login', json={'email': 'unv@example.com', 'password': 'Pass12345!'})
check('unverified user is blocked while email + verification are ON',
      r.status_code == 403, r.status_code)

set_email(False)
r = c.post('/api/auth/login', json={'email': 'unv@example.com', 'password': 'Pass12345!'})
check('unverified user can log in while email is OFF (not stranded)',
      r.status_code == 200, r.status_code)

set_email(True)
r = c.post('/api/auth/login', json={'email': 'unv@example.com', 'password': 'Pass12345!'})
check('unverified user is blocked again once email is back ON',
      r.status_code == 403, r.status_code)

set_email(False)
r = c.post('/api/auth/send-verification-code', json={'email': 'new@example.com'})
check('send-verification-code returns 403 (not 500) while email is OFF',
      r.status_code == 403, r.status_code)

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED: {failures}')
    sys.exit(1)
print('ALL NEW-FEATURE CHECKS PASSED')
