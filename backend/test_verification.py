"""End-to-end tests for public credential verification.

Boots the real app on a throwaway SQLite database, issues a real certificate and
a real badge through the same code paths the app uses, then exercises the public
/api/verify endpoint the QR code points at:

  * a freshly issued certificate verifies as valid, with the correct holder,
    course and id — i.e. the QR really resolves to the right credential;
  * the same for a badge (holder, achievement, id);
  * an unknown id verifies as invalid (no false positives);
  * a revoked certificate/badge verifies as invalid with revoked=True, while
    still reporting who/what it was (so a scan shows a real revocation, not a
    "not found").

    python backend/test_verification.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SECRET_KEY', 'test-secret-not-for-production')

from app import create_app  # noqa: E402
from app.main import socketio  # noqa: E402,F401
from app.database import init_db, get_db  # noqa: E402
from app.models import get_or_issue_certificate  # noqa: E402
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
               " VALUES ('sup1','Super','super@example.com',?, 'superadmin',1,0)",
               (generate_password_hash('Pass12345!'),))
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
               " VALUES ('stu1','Ama Mensah','stu@example.com',?, 'student',1,0)",
               (generate_password_hash('Pass12345!'),))
    # A course with a certificate enabled and a final exam.
    db.execute("INSERT INTO courses (id,title,description,instructor_id,instructor_name,category,"
               "difficulty,price,is_free,is_published,is_visible,has_certificate)"
               " VALUES ('c1','Python for Data Science','d','sup1','Super','Tech','beginner',0,1,1,1,1)")
    db.execute("INSERT INTO lessons (id,course_id,title,type,content,video_url,\"order\",is_final)"
               " VALUES ('fin1','c1','Final Exam','quiz','',NULL,9,1)")
    db.execute("INSERT INTO user_enrollments (id,user_id,course_id,progress)"
               " VALUES ('e1','stu1','c1',100)")
    db.execute("INSERT INTO user_progress (user_id,course_id,lesson_id,is_completed,quiz_score)"
               " VALUES ('stu1','c1','fin1',1,90)")
    # Certificate is enabled via course_perks, exactly as the app configures it.
    db.execute("INSERT INTO course_perks (course_id,has_certificate,lifetime_access,has_resources)"
               " VALUES ('c1',1,1,0)")
    # A badge the student has earned.
    db.execute("INSERT INTO user_badges (user_id,badge_key) VALUES ('stu1','FIRST_STEPS')")
    db.commit()

c = app.test_client()


def login(email, pw='Pass12345!'):
    r = c.post('/api/auth/login', json={'email': email, 'password': pw})
    return (r.get_json() or {}).get('token')


# ── Issue a real certificate through the app's own function ──────────────────
with app.app_context():
    db = get_db()
    cert, err = get_or_issue_certificate(db, 'stu1', 'c1', False)
    cert_id = cert['cert_id'] if cert else None
check('certificate issued for a completed course', cert is not None and bool(cert_id), err or cert_id)

# ── Issue a real badge through the public endpoint ───────────────────────────
stu_tok = login('stu@example.com')
r = c.post('/api/badges/issue', json={'badge_key': 'FIRST_STEPS', 'badge_title': 'First Steps'},
           headers={'Authorization': f'Bearer {stu_tok}'})
badge_id = (r.get_json() or {}).get('badge_id')
check('badge issued for an earned achievement', bool(badge_id), badge_id)

# ── 1. A fresh certificate verifies as valid, with the right details ─────────
r = c.get(f'/api/verify?id={cert_id}')
d = r.get_json() or {}
check('certificate verifies valid (public, no login)', d.get('valid') is True, d)
check('certificate verify returns type=certificate', d.get('type') == 'certificate', d.get('type'))
check('certificate verify returns the right holder', d.get('holder') == 'Ama Mensah', d.get('holder'))
check('certificate verify returns the right course', d.get('course') == 'Python for Data Science', d.get('course'))
check('certificate verify returns the exact stored id', d.get('id') == cert_id, d.get('id'))

# Whitespace / hyphen tolerance — a scanned or transcribed id must still work.
loose = cert_id.replace('-', ' ').lower()
r = c.get(f'/api/verify?id={loose}')
d = r.get_json() or {}
check('certificate verify tolerates spaces and case', d.get('valid') is True and d.get('id') == cert_id, d)

# ── 2. A fresh badge verifies as valid, with the right details ───────────────
r = c.get(f'/api/verify?id={badge_id}')
d = r.get_json() or {}
check('badge verifies valid (public, no login)', d.get('valid') is True, d)
check('badge verify returns type=badge', d.get('type') == 'badge', d.get('type'))
check('badge verify returns the right holder', d.get('holder') == 'Ama Mensah', d.get('holder'))
check('badge verify returns the right achievement', d.get('badge') == 'First Steps', d.get('badge'))
check('badge verify returns the exact stored id', d.get('id') == badge_id, d.get('id'))

# ── 3. An unknown id is invalid (no false positive) ──────────────────────────
r = c.get('/api/verify?id=LA-CERT-DOESNOTEXIST')
d = r.get_json() or {}
check('unknown id verifies invalid', d.get('valid') is False, d)
r = c.get('/api/verify?id=')
check('missing id is rejected', r.status_code == 400, r.status_code)

# ── 4. Revoked credentials report invalid AND revoked ────────────────────────
sup_tok = login('super@example.com')
r = c.post('/api/admin/credentials/revoke',
           json={'id': cert_id, 'type': 'certificate', 'reason': 'test'},
           headers={'Authorization': f'Bearer {sup_tok}'})
check('superadmin can revoke a certificate', r.status_code == 200, r.status_code)
r = c.get(f'/api/verify?id={cert_id}')
d = r.get_json() or {}
check('revoked certificate verifies invalid', d.get('valid') is False, d)
check('revoked certificate reports revoked=True', d.get('revoked') is True, d)
check('revoked certificate still names the holder', d.get('holder') == 'Ama Mensah', d.get('holder'))

r = c.post('/api/admin/credentials/revoke',
           json={'id': badge_id, 'type': 'badge', 'reason': 'test'},
           headers={'Authorization': f'Bearer {sup_tok}'})
check('superadmin can revoke a badge', r.status_code == 200, r.status_code)
r = c.get(f'/api/verify?id={badge_id}')
d = r.get_json() or {}
check('revoked badge verifies invalid', d.get('valid') is False, d)
check('revoked badge reports revoked=True', d.get('revoked') is True, d)

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED: {failures}')
    sys.exit(1)
print('ALL VERIFICATION CHECKS PASSED')
