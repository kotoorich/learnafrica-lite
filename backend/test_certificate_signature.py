"""End-to-end tests for the certificate signatory + public verification label.

The certificate must be signed by the platform's authorised signatory (set by an
admin), never by the course instructor. The admin configures THREE independent
values: the printed display name, the handwritten-style signature text, and an
optional signature image; a mode chooses text vs image. The public /api/verify
page must report the course as "Instructor-led" instead of leaking the
instructor's personal name.

Boots the real app on a throwaway SQLite database, issues a real certificate
through the app's own code path, then exercises the real routes:

  * an admin can read/save the signatory; the save is validated and sanitised;
  * display name and signature text are independent;
  * text vs image mode is respected and persisted;
  * a blank signature text falls back to the display name (backward compatible);
  * non-admins cannot read the admin view or write the signatory at all;
  * the certificate API returns the saved signatory and never the instructor's
    name as the signatory;
  * the public signatory endpoint exposes only the signatory fields;
  * /api/verify returns delivery="Instructor-led" and no instructor name.

    python backend/test_certificate_signature.py
"""
import os
import sys
import base64
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


# A real 1x1 transparent PNG (valid magic bytes) for the image-mode tests.
PNG_1PX = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
PNG_DATA_URL = 'data:image/png;base64,' + base64.b64encode(PNG_1PX).decode('ascii')

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
check('unset signature defaults to text mode', d.get('mode') == 'text', d.get('mode'))

# ── 2. Non-admins cannot read the admin view or write the signatory ──────────
check('student cannot read the admin signature view',
      c.get('/api/admin/certificate-signature', headers={'Authorization': f'Bearer {stu}'}).status_code == 403)
check('instructor cannot read the admin signature view',
      c.get('/api/admin/certificate-signature', headers={'Authorization': f'Bearer {ins}'}).status_code == 403)
check('anonymous cannot read the admin signature view',
      c.get('/api/admin/certificate-signature').status_code in (401, 403))
r = c.put('/api/admin/certificate-signature', json={'name': 'Hacker', 'mode': 'text'},
          headers={'Authorization': f'Bearer {stu}'})
check('student cannot write the signatory', r.status_code == 403, r.status_code)
r = c.put('/api/admin/certificate-signature', json={'name': 'Hacker', 'mode': 'text'},
          headers={'Authorization': f'Bearer {ins}'})
check('instructor cannot write the signatory', r.status_code == 403, r.status_code)

# ── 3. Validation ────────────────────────────────────────────────────────────
r = c.put('/api/admin/certificate-signature', json={'name': '', 'mode': 'text'},
          headers={'Authorization': f'Bearer {adm}'})
check('empty signatory name is rejected', r.status_code == 400, r.status_code)
r = c.put('/api/admin/certificate-signature', json={'name': 'X', 'mode': 'text'},
          headers={'Authorization': f'Bearer {adm}'})
check('one-character signatory name is rejected', r.status_code == 400, r.status_code)
r = c.put('/api/admin/certificate-signature',
          json={'name': 'John Mensah', 'mode': 'image', 'image': 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='},
          headers={'Authorization': f'Bearer {adm}'})
check('SVG signature image is rejected', r.status_code == 400, r.status_code)
r = c.put('/api/admin/certificate-signature',
          json={'name': 'John Mensah', 'mode': 'image'},
          headers={'Authorization': f'Bearer {adm}'})
check('image mode without an image is rejected', r.status_code == 400, r.status_code)
r = c.put('/api/admin/certificate-signature',
          json={'name': 'John Mensah', 'mode': 'nonsense'},
          headers={'Authorization': f'Bearer {adm}'})
check('an unknown signature mode is rejected', r.status_code == 400, r.status_code)

# ── 4. Admin saves a valid TEXT signatory (independent name + text) ──────────
r = c.put('/api/admin/certificate-signature',
          json={'name': 'Dr. Kwame Mensah', 'text': 'K. Mensah',
                'role': 'Authorized Signatory', 'mode': 'text'},
          headers={'Authorization': f'Bearer {adm}'})
d = r.get_json() or {}
check('admin can save a valid signatory', r.status_code == 200, r.status_code)
check('saved display name is echoed', d.get('name') == 'Dr. Kwame Mensah', d.get('name'))
check('saved signature text is independent of the name', d.get('text') == 'K. Mensah', d.get('text'))
check('saved signature text differs from the display name', d.get('text') != d.get('name'), d)
check('saved mode is text', d.get('mode') == 'text', d.get('mode'))
check('saved signatory is now configured', d.get('configured') is True, d)

r = c.get('/api/admin/certificate-signature', headers={'Authorization': f'Bearer {adm}'})
d = r.get_json() or {}
check('saved signatory persists',
      d.get('name') == 'Dr. Kwame Mensah' and d.get('text') == 'K. Mensah' and d.get('configured') is True, d)

# Control characters are stripped and whitespace collapsed.
r = c.put('/api/admin/certificate-signature',
          json={'name': '  John\x00   Mensah  ', 'text': '  J.\x00 Mensah ', 'mode': 'text'},
          headers={'Authorization': f'Bearer {adm}'})
d = r.get_json() or {}
check('control chars stripped and whitespace collapsed in the name',
      d.get('name') == 'John Mensah', repr(d.get('name')))
check('control chars stripped and whitespace collapsed in the signature text',
      d.get('text') == 'J. Mensah', repr(d.get('text')))

# ── 4b. Blank signature text falls back to the display name (compat) ─────────
r = c.put('/api/admin/certificate-signature',
          json={'name': 'Grace Owusu', 'text': '', 'mode': 'text'},
          headers={'Authorization': f'Bearer {adm}'})
d = r.get_json() or {}
check('blank signature text falls back to the display name', d.get('text') == 'Grace Owusu', d.get('text'))

# ── 4c. IMAGE mode: an image can be selected without changing the name ───────
r = c.put('/api/admin/certificate-signature',
          json={'name': 'Dr. Kwame Mensah', 'text': 'K. Mensah', 'mode': 'image', 'image': PNG_DATA_URL},
          headers={'Authorization': f'Bearer {adm}'})
d = r.get_json() or {}
check('admin can save in image mode with an image', r.status_code == 200, r.status_code)
check('image mode keeps the display name unchanged', d.get('name') == 'Dr. Kwame Mensah', d.get('name'))
check('image mode keeps the signature text stored', d.get('text') == 'K. Mensah', d.get('text'))
check('image mode is persisted', d.get('mode') == 'image', d.get('mode'))
check('image mode carries the stored image', bool(d.get('image')), (d.get('image') or '')[:32])

# ── 5. Certificate API carries the admin signatory, never the instructor ─────
r = c.get('/api/certificates/c1', headers={'Authorization': f'Bearer {stu}'})
d = r.get_json() or {}
cert = d.get('certificate') or {}
sig = cert.get('signatory') or {}
check('certificate API returns a signatory block', bool(sig), cert.keys())
check('certificate signatory is the admin name', sig.get('name') == 'Dr. Kwame Mensah', sig.get('name'))
check('certificate signatory carries the signature text', sig.get('text') == 'K. Mensah', sig.get('text'))
check('certificate signatory carries the mode', sig.get('mode') == 'image', sig.get('mode'))
check('certificate signatory is configured', sig.get('configured') is True, sig)
check('certificate signatory role is carried',
      sig.get('role') == 'Authorized Signatory', sig.get('role'))
check('certificate signatory is NOT the course instructor',
      sig.get('name') != cert.get('instructorName'),
      f"{sig.get('name')} vs {cert.get('instructorName')}")

# Switching back to text mode must be reflected everywhere.
c.put('/api/admin/certificate-signature',
      json={'name': 'Dr. Kwame Mensah', 'text': 'K. Mensah', 'mode': 'text', 'image': PNG_DATA_URL},
      headers={'Authorization': f'Bearer {adm}'})
r = c.get('/api/certificates/c1', headers={'Authorization': f'Bearer {stu}'})
sig = (r.get_json() or {}).get('certificate', {}).get('signatory', {})
check('switching back to text mode is reflected in the certificate',
      sig.get('mode') == 'text' and sig.get('text') == 'K. Mensah', sig)

# ── 6. Public signatory endpoint exposes only signatory fields ───────────────
r = c.get('/api/certificate-signature')
d = r.get_json() or {}
check('public signature endpoint is reachable without login', r.status_code == 200, r.status_code)
check('public signature exposes the name', d.get('name') == 'Dr. Kwame Mensah', d.get('name'))
check('public signature exposes the signature text', d.get('text') == 'K. Mensah', d.get('text'))
check('public signature exposes the mode', d.get('mode') == 'text', d.get('mode'))
check('public signature exposes the role', d.get('role') == 'Authorized Signatory', d.get('role'))
check('public signature leaks no extra fields',
      set(d.keys()) <= {'name', 'role', 'image', 'text', 'mode', 'configured'}, list(d.keys()))

# ── 7. /api/verify says "Instructor-led", not the instructor's name ──────────
r = c.get(f'/api/verify?id={cert_id}')
d = r.get_json() or {}
check('certificate still verifies valid', d.get('valid') is True, d)
check('verify reports delivery as Instructor-led', d.get('delivery') == 'Instructor-led', d.get('delivery'))
check('verify does not leak the instructor name', 'instructor' not in d, list(d.keys()))
check('verify does not contain the instructor name anywhere',
      'Kwame Boateng' not in str(d), str(d))
check('verify does not leak the signatory name',
      'Kwame Mensah' not in str(d), str(d))

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED')
    for f in failures:
        print('  -', f)
    sys.exit(1)
print('ALL CERTIFICATE SIGNATURE CHECKS PASSED')
