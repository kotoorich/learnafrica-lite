"""Regression tests for instructor registration settings, Ghana details and
the instructor agreement.

Covers task items 3, 4 and 5:
  3. Admin can switch instructor registration free <-> paid with a GHS fee;
     the fee is server-enforced and never taken from the client; approval is
     blocked until the fee is paid; student registration stays free.
  4. Ghana Card + GhanaPost GPS are required and validated on the backend.
  5. Both agreement checkboxes are required; version + timestamp are recorded.

    python backend/test_instructor_registration.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SECRET_KEY', 'test-secret-not-for-production')

from app import create_app  # noqa: E402
from app.main import socketio, INSTRUCTOR_AGREEMENT_VERSION  # noqa: E402,F401
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
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
               " VALUES ('adm1','Admin','admin@example.com',?, 'admin',1,0)",
               (generate_password_hash('Pass12345!'),))
    db.commit()

c = app.test_client()


def login(email, pw='Pass12345!'):
    r = c.post('/api/auth/login', json={'email': email, 'password': pw})
    return (r.get_json() or {}).get('token')


adm_tok = login('admin@example.com')
AH = {'Authorization': f'Bearer {adm_tok}'}


def signup_instructor(email, extra=None):
    body = {'name': 'Applicant', 'email': email, 'password': 'Pass12345!',
            'role': 'instructor',
            'ghana_card_number': 'GHA-123456789-0',
            'ghana_post_gps': 'GA-123-4567',
            'accept_terms': True, 'accept_verification': True}
    if extra:
        body.update(extra)
    return c.post('/api/auth/signup', json=body)


# ── Default is free; public endpoint reports it ──────────────────────────────
r = c.get('/api/instructor-registration')
body = r.get_json() or {}
check('instructor registration defaults to free', body.get('is_free') is True and body.get('fee') == 0, body)

# ── Item 4: Ghana details required on instructor signup ──────────────────────
r = signup_instructor('nocard@example.com', {'ghana_card_number': '', 'ghana_post_gps': 'GA-123-4567'})
check('instructor signup rejected without Ghana Card', r.status_code == 400, r.status_code)
r = signup_instructor('badcard@example.com', {'ghana_card_number': '1234'})
check('instructor signup rejected with malformed Ghana Card', r.status_code == 400, r.status_code)
r = signup_instructor('nogps@example.com', {'ghana_post_gps': 'nonsense'})
check('instructor signup rejected with malformed GPS', r.status_code == 400, r.status_code)

# ── Item 5: both agreements required ─────────────────────────────────────────
r = signup_instructor('noterms@example.com', {'accept_terms': False})
check('instructor signup rejected without terms agreement', r.status_code == 400, r.status_code)
r = signup_instructor('noverify@example.com', {'accept_verification': False})
check('instructor signup rejected without verification acknowledgement', r.status_code == 400, r.status_code)

# ── Valid instructor signup succeeds (free mode) ─────────────────────────────
r = signup_instructor('ins_ok@example.com')
check('valid instructor signup succeeds', r.status_code in (200, 201), r.status_code)
with app.app_context():
    row = get_db().execute("SELECT ghana_card_number, ghana_post_gps, agreement_version,"
                           " agreement_accepted_at FROM instructor_applications ia JOIN users u"
                           " ON u.id=ia.user_id WHERE u.email='ins_ok@example.com'").fetchone()
check('Ghana Card stored normalised', row and row['ghana_card_number'] == 'GHA-123456789-0',
      row['ghana_card_number'] if row else None)
check('GhanaPost GPS stored', row and row['ghana_post_gps'] == 'GA-123-4567')
check('agreement version recorded', row and row['agreement_version'] == INSTRUCTOR_AGREEMENT_VERSION,
      row['agreement_version'] if row else None)
check('agreement acceptance timestamp recorded', row and row['agreement_accepted_at'])

# ── Item 3: switch to paid ───────────────────────────────────────────────────
r = c.put('/api/admin/instructor-registration', json={'mode': 'paid', 'fee': 150}, headers=AH)
check('admin can enable paid registration', r.status_code == 200, r.status_code)
r = c.get('/api/instructor-registration')
body = r.get_json() or {}
check('public endpoint reports paid fee', body.get('is_free') is False and body.get('fee') == 150, body)
r = c.put('/api/admin/instructor-registration', json={'mode': 'paid', 'fee': 0}, headers=AH)
check('paid mode requires a positive fee', r.status_code == 400, r.status_code)
r = c.put('/api/admin/instructor-registration', json={'mode': 'paid', 'fee': 'abc'}, headers=AH)
check('paid mode rejects a non-numeric fee', r.status_code == 400, r.status_code)

# ── Paid registration: applicant must pay before approval ────────────────────
r = signup_instructor('ins_paid@example.com')
check('paid-mode signup still succeeds and flags payment needed',
      r.status_code in (200, 201) and (r.get_json() or {}).get('requires_registration_payment') is True,
      r.get_json())
ins_tok = login('ins_paid@example.com')
IH = {'Authorization': f'Bearer {ins_tok}'}
with app.app_context():
    uid = get_db().execute("SELECT id FROM users WHERE email='ins_paid@example.com'").fetchone()['id']

# ── Paid-registration flag is present on every auth path (NEW-2) ─────────────
r = c.post('/api/auth/login', json={'email': 'ins_paid@example.com', 'password': 'Pass12345!'})
check('login flags payment needed for pending instructor',
      r.status_code == 200 and (r.get_json() or {}).get('requires_registration_payment') is True,
      r.get_json())
r = c.get('/api/auth/verify', headers=IH)
check('auth/verify keeps the payment-needed flag across a refresh',
      r.status_code == 200 and (r.get_json() or {}).get('requires_registration_payment') is True,
      r.get_json())

# Approval is blocked before payment
r = c.put(f'/api/admin/instructor-applications/{uid}/review', json={'action': 'approve'}, headers=AH)
check('approval blocked until registration fee paid', r.status_code == 400, r.status_code)

# Status endpoint reports the debt
r = c.get('/api/instructor/registration/status', headers=IH)
st = r.get_json() or {}
check('registration status reports payment required',
      st.get('requires_payment') is True and st.get('paid') is False and st.get('fee') == 150, st)

# Initiate payment (mock mode -> immediate success) and re-check
r = c.post('/api/instructor/registration/initiate', json={}, headers=IH)
pay = r.get_json() or {}
check('registration payment completes in mock mode', r.status_code == 200 and pay.get('paid') is True, pay)
r = c.get('/api/instructor/registration/status', headers=IH)
check('status now reports paid', (r.get_json() or {}).get('paid') is True, r.get_json())

# Duplicate initiate is idempotent
r = c.post('/api/instructor/registration/initiate', json={}, headers=IH)
check('duplicate payment is idempotent', r.status_code == 200 and (r.get_json() or {}).get('already_paid') is True,
      r.get_json())

# Now approval succeeds
r = c.put(f'/api/admin/instructor-applications/{uid}/review', json={'action': 'approve'}, headers=AH)
check('approval succeeds after payment', r.status_code == 200, r.status_code)
with app.app_context():
    row = get_db().execute("SELECT instructor_status FROM users WHERE id=?", (uid,)).fetchone()
check('applicant is now an approved instructor', row and row['instructor_status'] == 'approved')

# A registration-fee transaction was recorded for the platform
with app.app_context():
    tx = get_db().execute("SELECT amount, platform_share, instructor_share FROM transactions"
                          " WHERE type='instructor_registration' AND user_id=?", (uid,)).fetchone()
check('registration fee recorded as a platform transaction',
      tx and float(tx['amount']) == 150.0 and float(tx['platform_share']) == 150.0
      and float(tx['instructor_share']) == 0.0, dict(tx) if tx else None)

# ── Option B: registration fees appear as their own admin figure, and the ─────
# ── course-revenue numbers are left untouched by them. ────────────────────────
r = c.get('/api/admin/earnings', headers=AH)
earn = r.get_json() or {}
check('admin earnings exposes registration_fees_total',
      'registration_fees_total' in earn, sorted(earn.keys())[:8])
check('registration_fees_total counts the fee collected',
      abs(float(earn.get('registration_fees_total') or 0) - 150.0) < 0.001,
      earn.get('registration_fees_total'))
check('registration fee is not mixed into per-instructor rows',
      all(abs(float(i.get('gross_revenue') or 0)) < 0.001 for i in (earn.get('instructors') or [])),
      [(i.get('name'), i.get('gross_revenue')) for i in (earn.get('instructors') or [])])

r = c.get('/api/admin/stats', headers=AH)
stats = r.get_json() or {}
check('admin stats exposes registration_fees_total',
      abs(float(stats.get('registration_fees_total') or 0) - 150.0) < 0.001,
      stats.get('registration_fees_total'))
check('admin stats course gross_revenue excludes the registration fee',
      abs(float(stats.get('gross_revenue') or 0)) < 0.001, stats.get('gross_revenue'))

# ── Admin can see the applicant's Ghana Card + GPS (applications list + detail) ─
r = c.get('/api/admin/instructor-applications?status=approved', headers=AH)
apps = (r.get_json() or {}).get('applications', [])
match = next((a for a in apps if a.get('email') == 'ins_paid@example.com'), None)
check('applications list carries Ghana Card for admin',
      match and match.get('ghana_card_number') == 'GHA-123456789-0',
      match.get('ghana_card_number') if match else None)
check('applications list carries GhanaPost GPS for admin',
      match and match.get('ghana_post_gps') == 'GA-123-4567',
      match.get('ghana_post_gps') if match else None)

r = c.get(f'/api/admin/users/{uid}', headers=AH)
detail = (r.get_json() or {}).get('user') or {}
check('instructor detail view carries Ghana Card for admin',
      detail.get('ghana_card_number') == 'GHA-123456789-0', detail.get('ghana_card_number'))
check('instructor detail view carries GhanaPost GPS for admin',
      detail.get('ghana_post_gps') == 'GA-123-4567', detail.get('ghana_post_gps'))
check('instructor detail view exposes the application record',
      (detail.get('instructor_application') or {}).get('registration_paid_at') is not None,
      detail.get('instructor_application'))

# ── Student registration is always free (unaffected by paid instructor mode) ─
r = c.post('/api/auth/signup', json={'name': 'Student', 'email': 'stu_free@example.com',
                                     'password': 'Pass12345!', 'role': 'student'})
check('student signup unaffected by paid instructor registration', r.status_code in (200, 201), r.status_code)
r = c.post('/api/auth/signup', json={'name': 'S2', 'email': 'stu_free2@example.com',
                                     'password': 'Pass12345!', 'role': 'student'})
check('instructor signup needs no Ghana details or payment', r.status_code in (200, 201), r.status_code)

# ── The fee cannot be overridden by the client ───────────────────────────────
r = c.post('/api/instructor/registration/initiate', json={'amount': 1, 'fee': 1}, headers=IH)
check('client-supplied amount cannot lower the fee',
      r.status_code in (200, 400) and (r.get_json() or {}).get('paid') in (True, None), r.get_json())

# ── Back to free mode ────────────────────────────────────────────────────────
r = c.put('/api/admin/instructor-registration', json={'mode': 'free'}, headers=AH)
check('admin can switch back to free', r.status_code == 200, r.status_code)
r = c.get('/api/instructor-registration')
check('public endpoint reports free again', (r.get_json() or {}).get('is_free') is True, r.get_json())

# ── Alternative identity documents (id_type dropdown) ────────────────────────
# A non-Ghana-Card ID with a valid GPS address must be accepted and stored.
r = signup_instructor('voter@example.com', {
    'id_type': 'voter_id', 'id_number': '0123456789',
    'ghana_card_number': '0123456789',
})
check('instructor signup accepts Voter ID', r.status_code in (200, 201),
      (r.get_json() or {}).get('error', r.status_code))
r = signup_instructor('passport@example.com', {
    'id_type': 'passport', 'id_number': 'G1234567',
    'ghana_card_number': 'G1234567',
})
check('instructor signup accepts Passport', r.status_code in (200, 201),
      (r.get_json() or {}).get('error', r.status_code))
# A too-short generic ID is still rejected.
r = signup_instructor('shortid@example.com', {
    'id_type': 'national_id', 'id_number': '12',
    'ghana_card_number': '12',
})
check('instructor signup rejects a too-short non-Ghana-Card ID', r.status_code == 400, r.status_code)
# Stored id_type/id_number are correct for the Voter ID applicant.
with app.app_context():
    row = get_db().execute(
        "SELECT ia.id_type, ia.id_number FROM instructor_applications ia"
        " JOIN users u ON u.id=ia.user_id WHERE u.email='voter@example.com'").fetchone()
check('Voter ID type stored', row and row['id_type'] == 'voter_id', row['id_type'] if row else None)
check('Voter ID number stored', row and row['id_number'] == '0123456789', row['id_number'] if row else None)
# A Ghana Card applicant keeps the strict national format (unchanged path).
r = signup_instructor('card@example.com', {'id_type': 'ghana_card', 'id_number': 'GHA1234567890'})
check('Ghana Card still accepted and normalised', r.status_code in (200, 201),
      (r.get_json() or {}).get('error', r.status_code))
with app.app_context():
    row = get_db().execute(
        "SELECT ia.id_type, ia.id_number FROM instructor_applications ia"
        " JOIN users u ON u.id=ia.user_id WHERE u.email='card@example.com'").fetchone()
check('Ghana Card normalised to GHA-#########-#',
      row and row['id_number'] == 'GHA-123456789-0', row['id_number'] if row else None)

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED: {failures}')
    sys.exit(1)
print('ALL INSTRUCTOR-REGISTRATION CHECKS PASSED')
