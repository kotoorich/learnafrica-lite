"""End-to-end tests for the certificate signatory + public verification label.

The certificate must be signed by the platform's authorised signatory (set by an
admin), never by the course instructor. The public /api/verify page must report
the course as "Instructor-led" instead of leaking the instructor's personal name.

Boots the real app on a throwaway SQLite database, issues a real certificate
through the app's own code path, then exercises the real routes:

  * an admin can read/save the signatory; the save is validated and sanitised;
  * non-admins cannot read the admin view or write the signatory at all;
  * the certificate API returns the saved signatory and never the instructor's
    name as the signatory;
  * the public signatory endpoint exposes only name/role/image;
  * /api/verify returns delivery="Instructor-led" and no instructor name.

    python backend/test_certificate_signature.py
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
    for uid, name, email, role in [
        ('adm1', 'Platform Admin', 'admin@example.com', 'admin'),
        ('ins1', 'Kwame Boateng', 'ins@example.com', 'instructor'),
        ('stu1', 'Ama Mensah', 'stu@example.com', 'student'),
    ]:
        db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
                   " VALUES (?,?,?,?,?,1,0)",
                   (uid, name, email, generate_password_hash('Pass12345!'), role))
    db.execute("UPDATE users SET instructor_status='approved' WHERE id='ins1'")
    db.execute("INSERT INTO courses (id,title,description,instructor_id,instructor_name,category,"
               "difficulty,price,is_free,is_published,is_visible,has_certificate)"
               " VALUES ('c1','Python for Data Science','d','ins1','Kwame Boateng','Tech','beginner',0,1,1,1,1)")
    db.execute("INSERT INTO lessons (id,course_id,title,type,content,video_url,\"order\",is_final)"
               " VALUES ('fin1','c1','Final Exam','quiz','',NULL,9,1)")
    db.execute("INSERT INTO user_enrollments (id,user_id,course_id,progress)"
               " VALUES ('e1','stu1','c1',100)")
    db.execute("INSERT INTO user_progress (user_id,course_id,lesson_id,is_completed,quiz_score)"
               " VALUES ('stu1','c1','fin1',1,90)")
    db.execute("INSERT INTO course_perks (course_id,has_certificate,lifetime_access,has_resources)"
               " VALUES ('c1',1,1,0)")
    db.commit()

c = app.test_client()


def login(email, pw='Pass12345!'):
    r = c.post('/api/auth/login', json={'email': email, 'password': pw})
    return (r.get_json() or {}).get('token')


adm = login('admin@example.com')
stu = login('stu@example.com')
ins = login('ins@example.com')

# ── Issue a real certificate through the app's own function ──────────────────
with app.app_context():
    db = get_db()
    cert, err = get_or_issue_certificate(db, 'stu1', 'c1', False)
    cert_id = cert['cert_id'] if cert else None
check('certificate issued for a completed course', cert is not None and bool(cert_id), err or cert_id)

# ── 1. Admin reads the (initially unset) signatory ───────────────────────────
r = c.get('/api/admin/certificate-signature', headers={'Authorization': f'Bearer {adm}'})
d = r.get_json() or {}
check('admin can read the certificate signature', r.status_code == 200, r.status_code)
check('signature starts unconfigured', d.get('configured') is False, d)
check('unset signature has an empty name', d.get('name') == '', d.get('name'))

# ── 2. Non-admins cannot read the admin view or write the signatory ──────────
check('student cannot read the admin signature view',
      c.get('/api/admin/certificate-signature', headers={'Authorization': f'Bearer {stu}'}).status_code == 403)
check('instructor cannot read the admin signature view',
      c.get('/api/admin/certificate-signature', headers={'Authorization': f'Bearer {ins}'}).status_code == 403)
check('anonymous cannot read the admin signature view',
      c.get('/api/admin/certificate-signature').status_code in (401, 403))
r = c.put('/api/admin/certificate-signature', json={'name': 'Hacker'},
          headers={'Authorization': f'Bearer {stu}'})
check('student cannot write the signatory', r.status_code == 403, r.status_code)
r = c.put('/api/admin/certificate-signature', json={'name': 'Hacker'},
          headers={'Authorization': f'Bearer {ins}'})
check('instructor cannot write the signatory', r.status_code == 403, r.status_code)

# ── 3. Validation ────────────────────────────────────────────────────────────
r = c.put('/api/admin/certificate-signature', json={'name': ''},
          headers={'Authorization': f'Bearer {adm}'})
check('empty signatory name is rejected', r.status_code == 400, r.status_code)
r = c.put('/api/admin/certificate-signature', json={'name': 'X'},
          headers={'Authorization': f'Bearer {adm}'})
check('one-character signatory name is rejected', r.status_code == 400, r.status_code)
r = c.put('/api/admin/certificate-signature',
          json={'name': 'John Mensah', 'image': 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='},
          headers={'Authorization': f'Bearer {adm}'})
check('SVG signature image is rejected', r.status_code == 400, r.status_code)

# ── 4. Admin saves a valid signatory ─────────────────────────────────────────
r = c.put('/api/admin/certificate-signature',
          json={'name': 'John Mensah', 'role': 'Authorized Signatory'},
          headers={'Authorization': f'Bearer {adm}'})
d = r.get_json() or {}
check('admin can save a valid signatory', r.status_code == 200, r.status_code)
check('saved signatory name is echoed', d.get('name') == 'John Mensah', d.get('name'))
check('saved signatory is now configured', d.get('configured') is True, d)

r = c.get('/api/admin/certificate-signature', headers={'Authorization': f'Bearer {adm}'})
d = r.get_json() or {}
check('saved signatory persists', d.get('name') == 'John Mensah' and d.get('configured') is True, d)

# Control characters are stripped and whitespace collapsed.
r = c.put('/api/admin/certificate-signature',
          json={'name': '  John\x00   Mensah  ', 'role': 'Authorized Signatory'},
          headers={'Authorization': f'Bearer {adm}'})
d = r.get_json() or {}
check('control chars stripped and whitespace collapsed',
      d.get('name') == 'John Mensah', repr(d.get('name')))

# ── 5. Certificate API carries the admin signatory, never the instructor ─────
r = c.get('/api/certificates/c1', headers={'Authorization': f'Bearer {stu}'})
d = r.get_json() or {}
cert = d.get('certificate') or {}
sig = cert.get('signatory') or {}
check('certificate API returns a signatory block', bool(sig), cert.keys())
check('certificate signatory is the admin name', sig.get('name') == 'John Mensah', sig.get('name'))
check('certificate signatory is configured', sig.get('configured') is True, sig)
check('certificate signatory role is carried',
      sig.get('role') == 'Authorized Signatory', sig.get('role'))
check('certificate signatory is NOT the course instructor',
      sig.get('name') != cert.get('instructorName'),
      f"{sig.get('name')} vs {cert.get('instructorName')}")

# ── 6. Public signatory endpoint exposes only name/role/image ────────────────
r = c.get('/api/certificate-signature')
d = r.get_json() or {}
check('public signature endpoint is reachable without login', r.status_code == 200, r.status_code)
check('public signature exposes the name', d.get('name') == 'John Mensah', d.get('name'))
check('public signature exposes the role', d.get('role') == 'Authorized Signatory', d.get('role'))
check('public signature leaks no extra fields',
      set(d.keys()) <= {'name', 'role', 'image', 'configured'}, list(d.keys()))

# ── 7. /api/verify says "Instructor-led", not the instructor's name ──────────
r = c.get(f'/api/verify?id={cert_id}')
d = r.get_json() or {}
check('certificate still verifies valid', d.get('valid') is True, d)
check('verify reports delivery as Instructor-led', d.get('delivery') == 'Instructor-led', d.get('delivery'))
check('verify does not leak the instructor name', 'instructor' not in d, list(d.keys()))
check('verify does not contain the instructor name anywhere',
      'Kwame Boateng' not in str(d), str(d))

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED')
    for f in failures:
        print('  -', f)
    sys.exit(1)
print('ALL CERTIFICATE SIGNATURE CHECKS PASSED')
