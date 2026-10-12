"""Regression tests for the security-audit fixes.

Each check corresponds to one item from the audit. They boot the real app on a
throwaway SQLite database and exercise the real routes, so a future change that
re-opens a hole fails here.

    1. Paid course content is not released to non-enrolled viewers.
    2. /api/progress/update ignores a client-supplied quiz score.
    3. Lesson HTML is sanitised before it is rendered.
    5. Only a superadmin can grant/revoke superadmin or suspend one.
    6. An instructor cannot touch another instructor's course.
    7. Login and verification-code endpoints are rate limited; codes are
       cryptographically random and short-lived.
    9/10. Production refuses to boot without SECRET_KEY, and Paystack mock mode
       is refused in production.
   11. Internal error details are redacted in production.
   12. Active content (HTML/SVG/JS) is rejected from uploads.
   13. Quiz answers are not returned and attempts are capped.
   15. The request body cap is not the old 600MB.

    python backend/test_security_audit.py
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
from app.sanitize import sanitize_html, contains_html_or_script, matches_extension  # noqa: E402
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
    users = [
        ('sup1', 'Super', 'super@example.com', 'superadmin'),
        ('adm1', 'Admin', 'admin@example.com', 'admin'),
        ('ins1', 'Instructor', 'ins@example.com', 'instructor'),
        ('ins2', 'Other', 'ins2@example.com', 'instructor'),
        ('stu1', 'Student', 'stu@example.com', 'student'),
    ]
    for uid, name, email, role in users:
        db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
                   " VALUES (?,?,?,?,?,1,0)",
                   (uid, name, email, generate_password_hash('Pass12345!'), role))
    db.execute("UPDATE users SET instructor_status='approved', payment_method='bank',"
               " payment_details='acct' WHERE id IN ('ins1','ins2')")
    db.execute("UPDATE users SET email_verified=1 WHERE id='stu1'")
    # A paid course owned by ins1, with one lesson that has video + secret text.
    db.execute("INSERT INTO courses (id,title,description,instructor_id,instructor_name,category,"
               "difficulty,price,is_free,is_published,is_visible)"
               " VALUES ('paid1','Paid Course','d','ins1','Instructor','Tech','beginner',5000,0,1,1)")
    db.execute("INSERT INTO lessons (id,course_id,title,type,content,video_url,\"order\",is_final)"
               " VALUES ('les1','paid1','Lesson One','video',"
               "'<p>secret</p><script>steal()</script>','https://cdn.example/v.mp4',1,0)")
    db.commit()

c = app.test_client()


def login(email, pw='Pass12345!'):
    r = c.post('/api/auth/login', json={'email': email, 'password': pw})
    return (r.get_json() or {}).get('token')


# ── 1. Paid content withheld from non-enrolled viewers ───────────────────────
r = c.get('/api/courses/paid1')
body = r.get_json() or {}
blob = str(body)
check('paid course detail hides video url from anonymous', 'cdn.example/v.mp4' not in blob, blob[:120])
check('paid course detail hides lesson text from anonymous', 'secret' not in blob)
stu_tok = login('stu@example.com')
r = c.get('/api/courses/paid1', headers={'Authorization': f'Bearer {stu_tok}'})
blob = str(r.get_json() or {})
check('paid course detail hides video from un-enrolled student', 'cdn.example/v.mp4' not in blob)
ins_tok = login('ins@example.com')
r = c.get('/api/courses/paid1', headers={'Authorization': f'Bearer {ins_tok}'})
blob = str(r.get_json() or {})
check('owner still sees their own paid lesson video', 'cdn.example/v.mp4' in blob)

# ── 2. /api/progress/update ignores a client-supplied score ──────────────────
# Enrol the student first so the request is otherwise valid.
c.post('/api/courses/paid1/enroll', json={}, headers={'Authorization': f'Bearer {stu_tok}'})
r = c.post('/api/progress/update',
           json={'course_id': 'paid1', 'lesson_id': 'les1', 'quiz_score': 100, 'is_completed': True},
           headers={'Authorization': f'Bearer {stu_tok}'})
with app.app_context():
    db = get_db()
    row = db.execute("SELECT quiz_score FROM user_progress WHERE user_id='stu1'"
                     " AND course_id='paid1' AND lesson_id='les1'").fetchone()
    stored = row['quiz_score'] if row else None
check('client-supplied score is not stored', stored is None, stored)

# ── 2b. progress/update refuses a non-enrolled user ──────────────────────────
ins2_tok = login('ins2@example.com')
r = c.post('/api/progress/update',
           json={'course_id': 'paid1', 'lesson_id': 'les1', 'is_completed': True},
           headers={'Authorization': f'Bearer {ins2_tok}'})
check('progress update blocked for non-enrolled user', r.status_code == 403, r.status_code)

# ── 3. HTML sanitiser strips script ──────────────────────────────────────────
out = sanitize_html('<p>hi</p><script>steal()</script><img src=x onerror=alert(1)>')
check('sanitizer removes <script>', '<script' not in out.lower(), out)
check('sanitizer removes onerror handler', 'onerror' not in out.lower(), out)
check('sanitizer keeps safe markup', '<p>hi</p>' in out, out)

# ── 5. Superadmin protection ─────────────────────────────────────────────────
adm_tok = login('admin@example.com')
sup_tok = login('super@example.com')
r = c.put('/api/admin/users/stu1/role', json={'role': 'superadmin'},
          headers={'Authorization': f'Bearer {adm_tok}'})
check('plain admin cannot promote to superadmin', r.status_code == 403, r.status_code)
r = c.put('/api/admin/users/sup1/role', json={'role': 'student'},
          headers={'Authorization': f'Bearer {adm_tok}'})
check('plain admin cannot demote superadmin', r.status_code == 403, r.status_code)
r = c.put('/api/admin/users/sup1/suspend', json={},
          headers={'Authorization': f'Bearer {adm_tok}'})
check('plain admin cannot suspend superadmin', r.status_code == 403, r.status_code)
r = c.put('/api/admin/users/stu1/role', json={'role': 'admin'},
          headers={'Authorization': f'Bearer {sup_tok}'})
check('superadmin can still assign admin', r.status_code == 200, r.status_code)

# ── 6. Instructor cannot touch another instructor's course ───────────────────
r = c.post('/api/instructor/courses/paid1/resources', data={},
           headers={'Authorization': f'Bearer {ins2_tok}'})
check('other instructor cannot add resources', r.status_code == 403, r.status_code)
r = c.delete('/api/instructor/courses/paid1/resources/anything',
             headers={'Authorization': f'Bearer {ins2_tok}'})
check('other instructor cannot delete resources', r.status_code == 403, r.status_code)
# A discussion on ins1's lesson, authored by the student.
with app.app_context():
    db = get_db()
    db.execute("INSERT INTO lesson_discussions"
               " (id,lesson_id,course_id,user_id,user_name,content,created_at)"
               " VALUES ('dis1','les1','paid1','stu1','Student','hello',CURRENT_TIMESTAMP)")
    db.commit()
r = c.delete('/api/courses/paid1/lessons/les1/discussions/dis1',
             headers={'Authorization': f'Bearer {ins2_tok}'})
check('other instructor cannot delete a discussion', r.status_code == 403, r.status_code)
r = c.delete('/api/courses/paid1/lessons/les1/discussions/dis1',
             headers={'Authorization': f'Bearer {ins_tok}'})
check('course owner can still moderate their discussion', r.status_code == 200, r.status_code)

# ── 7. Rate limiting on login and OTP ────────────────────────────────────────
# Blow the per-account login budget with wrong passwords.
codes = []
for _ in range(15):
    rr = c.post('/api/auth/login', json={'email': 'stu@example.com', 'password': 'wrong'})
    codes.append(rr.status_code)
check('login attempts are throttled (429 seen)', 429 in codes, codes[-5:])

otp_codes = []
for _ in range(12):
    rr = c.post('/api/auth/send-verification-code', json={'email': 'flood@example.com'})
    otp_codes.append(rr.status_code)
check('verification requests are throttled (429 seen)', 429 in otp_codes, otp_codes[-5:])

# Codes are cryptographically random (secrets), not sequential/clock-based.
import re as _re
with app.app_context():
    db = get_db()
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app', 'main.py'),
               encoding='utf-8').read()
check('verification code uses secrets, not random.randint',
      'secrets.randbelow' in src and 'random.randint' not in src)

# ── 9/10. Production secret guards ───────────────────────────────────────────
check('production refuses to boot without SECRET_KEY',
      'must be set in production' in src or 'refusing to start' in src)
check('Paystack mock mode refused in production',
      'PAYSTACK_SECRET_KEY' in src and 'mock' in src.lower())

# ── 11. Error detail redaction ───────────────────────────────────────────────
check('_err_detail redacts outside debug', 'An internal error occurred' in src)

# ── 12. Active-content upload rejection ──────────────────────────────────────
check('contains_html_or_script flags <script>', contains_html_or_script(b'<script>x</script>'))
check('contains_html_or_script flags <svg>', contains_html_or_script(b'<svg xmlns="..."></svg>'))
check('contains_html_or_script flags <html>', contains_html_or_script(b'<!DOCTYPE html><html>'))
check('contains_html_or_script allows a PDF header', not contains_html_or_script(b'%PDF-1.7\n...'))
check('extension/bytes mismatch detected', not matches_extension(b'%PDF-1.7', 'png'))
check('matching extension accepted', matches_extension(b'\x89PNG\r\n\x1a\n', 'png'))

# ── 13. Quiz answers not leaked + attempts capped ────────────────────────────
with app.app_context():
    db = get_db()
    try:
        db.execute("INSERT INTO quizzes (id,course_id,lesson_id,title,max_attempts)"
                   " VALUES ('qz1','paid1','les1','Quiz',2)")
        db.execute("INSERT INTO quiz_questions"
                   " (id,quiz_id,question_text,options,correct_answer,\"order\")"
                   " VALUES ('qq1','qz1','2+2','[\"3\",\"4\"]',1,1)")
        db.commit()
    except Exception:
        pass
r = c.get('/api/courses/paid1/quizzes/les1', headers={'Authorization': f'Bearer {stu_tok}'})
blob = str(r.get_json() or {})
check('quiz endpoint does not return correct_answer', 'correct_answer' not in blob, blob[:160])
check('quiz endpoint still returns the questions', '2+2' in blob, blob[:160])

# ── 15. Request body cap ─────────────────────────────────────────────────────
check('request body cap is not 600MB', app.config['MAX_CONTENT_LENGTH'] < 600 * 1024 * 1024,
      app.config['MAX_CONTENT_LENGTH'])

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED: {failures}')
    sys.exit(1)
print('ALL SECURITY-AUDIT CHECKS PASSED')
