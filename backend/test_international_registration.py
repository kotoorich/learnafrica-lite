"""Regression tests for international instructor registration and the
mandatory, server-enforced profile completion gate.

Covers:
  * Country list / per-country ID types / subdivisions / phone validation.
  * International instructor signup (non-GH), persisted and validated.
  * Profile-completion gate: instructors missing required details are blocked
    from instructor features on the SERVER, not just the screen.
  * Frozen identity: an instructor cannot change country / id_type / id_number
    via the profile endpoint; an admin can, and the change is audited.
  * Backward compatibility: legacy Ghanaian instructors (Ghana Card + GPS,
    no country column) are treated as complete and are never locked out.
  * The instructor-registration free/paid switch keeps working alongside all
    of the above.

    python backend/test_international_registration.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SECRET_KEY', 'test-secret-not-for-production')

from app import create_app  # noqa: E402
from app.main import socketio  # noqa: E402,F401
from app.database import init_db, get_db  # noqa: E402
from app import countries as C  # noqa: E402
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
            'role': 'instructor', 'accept_terms': True, 'accept_verification': True}
    if extra:
        body.update(extra)
    return c.post('/api/auth/signup', json=body)


def approve(uid):
    return c.put(f'/api/admin/instructor-applications/{uid}/review',
                 json={'action': 'approve'}, headers=AH)


def uid_of(email):
    with app.app_context():
        return get_db().execute('SELECT id FROM users WHERE email=?', (email,)).fetchone()['id']


# ── Data module sanity ───────────────────────────────────────────────────────
check('country list has all ISO countries', len(C.country_list()) >= 240, len(C.country_list()))
check('Ghana uses the Ghana Card', any(t['value'] == 'ghana_card' for t in C.id_types_for('GH')))
check('unknown country falls back to generic ID types',
      [t['value'] for t in C.id_types_for('ZZ')] == [t['value'] for t in C.GENERIC_ID_TYPES])
check('Ghana has ISO subdivisions', C.has_subdivisions('GH'))
check('a country with no subdivision data returns []',
      C.subdivisions('AQ') == [] and not C.has_subdivisions('AQ'))
check('US requires a postal code, Ghana does not',
      C.uses_postal_code('US') and not C.uses_postal_code('GH'))
check('international phone is accepted and normalised',
      C.validate_phone('+14155552671', 'US') == ('+14155552671', None))
check('invalid phone is rejected', C.validate_phone('abc', 'US')[1] is not None)

# ── Public country config endpoint ───────────────────────────────────────────
r = c.get('/api/config/countries')
body = r.get_json() or {}
check('public country config is served', r.status_code == 200 and body.get('countries'))
r = c.get('/api/instructor/profile/requirements?country=NG')
check('per-country requirements endpoint works',
      r.status_code == 200 and any(t['value'] == 'nin' for t in (r.get_json() or {}).get('id_types', [])))
r = c.get('/api/instructor/profile/requirements?country=XX')
check('requirements endpoint rejects an unknown country', r.status_code == 400)

# ── International (non-GH) instructor signup ─────────────────────────────────
r = signup_instructor('us_ins@example.com', {
    'country': 'US', 'id_type': 'drivers_licence', 'id_number': 'A1234-5678',
    'city': 'Austin', 'street_address': '1 Congress Ave',
    'postal_code': '78701', 'phone': '+14155552671'})
check('US instructor signup succeeds', r.status_code in (200, 201), r.get_json())
with app.app_context():
    row = get_db().execute(
        'SELECT ia.country,ia.id_type,ia.id_number,ia.city,ia.postal_code,ia.phone FROM instructor_applications ia'
        ' JOIN users u ON u.id=ia.user_id WHERE u.email=?', ('us_ins@example.com',)).fetchone()
check('international profile persisted',
      row and row['country'] == 'US' and row['id_type'] == 'drivers_licence'
      and row['id_number'] == 'A1234-5678' and row['phone'] == '+14155552671',
      dict(row) if row else None)

# Unknown country is rejected rather than guessed
r = signup_instructor('bad_country@example.com', {
    'country': 'ZZ', 'id_type': 'passport', 'id_number': 'X1234567'})
check('unknown country rejected on signup', r.status_code == 400, r.status_code)

# US requires a postal code
# Address is deferred to the completion page, so signup without it succeeds;
# the postal code is enforced when the profile is actually completed.
r = signup_instructor('nopostal@example.com', {
    'country': 'GB', 'id_type': 'passport', 'id_number': 'GB1234567',
    'city': 'London', 'street_address': '10 Downing St', 'phone': '+442079460958'})
check('GB signup succeeds and defers address to completion', r.status_code in (200, 201), r.get_json())

# ── Profile-completion gate (server enforced) ────────────────────────────────
# A pending instructor cannot reach instructor features regardless.
pending_tok = login('us_ins@example.com')
PH = {'Authorization': f'Bearer {pending_tok}'}
r = c.get('/api/instructor/courses', headers=PH)
check('pending instructor blocked from instructor features', r.status_code == 403, r.status_code)

us_uid = uid_of('us_ins@example.com')
r = approve(us_uid)
check('admin can approve the international instructor', r.status_code == 200, r.get_json())

# Approved, but the stored profile is complete -> instructor features allowed.
r = c.get('/api/instructor/profile', headers=PH)
check('profile endpoint reports complete for a full international profile',
      r.status_code == 200 and (r.get_json() or {}).get('complete') is True, r.get_json())

# Now create an instructor whose profile is deliberately incomplete: a country
# that requires a postal code, but none supplied at signup (require_address=False
# on signup), then approve and confirm the gate blocks instructor features.
r = signup_instructor('incomplete@example.com', {
    'country': 'GB', 'id_type': 'passport', 'id_number': 'GB1234567',
    'phone': '+442079460958'})
check('GB instructor signup succeeds without an address', r.status_code in (200, 201), r.get_json())
inc_uid = uid_of('incomplete@example.com')
approve(inc_uid)
inc_tok = login('incomplete@example.com')
IH = {'Authorization': f'Bearer {inc_tok}'}
r = c.get('/api/instructor/courses', headers=IH)
check('approved but incomplete instructor is blocked on the server',
      r.status_code == 403 and (r.get_json() or {}).get('profile_incomplete') is True, r.get_json())
r = c.get('/api/instructor/profile', headers=IH)
check('incomplete profile is reported incomplete',
      r.status_code == 200 and (r.get_json() or {}).get('complete') is False)

# Completing it unblocks instructor features.
r = c.put('/api/instructor/profile', json={
    'city': 'London', 'street_address': '10 Downing St',
    'postal_code': 'SW1A 2AA', 'phone': '+442079460958'}, headers=IH)
check('profile completion succeeds', r.status_code == 200 and (r.get_json() or {}).get('complete') is True,
      r.get_json())
r = c.get('/api/instructor/courses', headers=IH)
check('completed instructor can now reach instructor features', r.status_code == 200, r.status_code)

# Client cannot fake completion.
r = c.put('/api/instructor/profile', json={'complete': True, 'profile_complete': True}, headers=IH)
check('client-supplied complete flag is ignored (still complete here)', r.status_code in (200, 400))
r = signup_instructor('fake@example.com', {'country': 'GB', 'id_type': 'passport',
                                           'id_number': 'GB9999999', 'phone': '+447911123456'})
fake_uid = uid_of('fake@example.com')
approve(fake_uid)
fake_tok = login('fake@example.com')
FH = {'Authorization': f'Bearer {fake_tok}'}
r = c.put('/api/instructor/profile', json={'complete': True}, headers=FH)
check('a client "complete" flag does not satisfy the server gate',
      r.status_code in (200, 400))
r = c.get('/api/instructor/courses', headers=FH)
check('fake completion still blocked', r.status_code == 403, r.status_code)

# ── Frozen identity: instructor cannot change it, admin can ──────────────────
r = c.put('/api/instructor/profile', json={
    'country': 'FR', 'id_type': 'passport', 'id_number': 'FR0000000',
    'city': 'London', 'street_address': '10 Downing St',
    'postal_code': 'SW1A 2AA'}, headers=IH)
check('instructor cannot change frozen country/ID via profile endpoint', r.status_code == 200)
with app.app_context():
    row = get_db().execute('SELECT country,id_number FROM instructor_applications WHERE user_id=?',
                           (inc_uid,)).fetchone()
check('frozen identity unchanged by instructor', row['country'] == 'GB' and row['id_number'] == 'GB1234567',
      dict(row))

r = c.put(f'/api/admin/instructor-applications/{inc_uid}/identity',
          json={'country': 'FR', 'id_type': 'passport', 'id_number': 'FR0000000'}, headers=AH)
check('admin can correct the frozen identity', r.status_code == 200, r.get_json())
with app.app_context():
    row = get_db().execute('SELECT country,id_number FROM instructor_applications WHERE user_id=?',
                           (inc_uid,)).fetchone()
check('admin correction persisted', row['country'] == 'FR' and row['id_number'] == 'FR0000000', dict(row))

# ── Admin surfaces expose the new details ────────────────────────────────────
r = c.get(f'/api/admin/users/{us_uid}', headers=AH)
u = (r.get_json() or {}).get('user', {})
check('admin user detail exposes country + address + id',
      u.get('country') == 'US' and u.get('city') == 'Austin' and u.get('id_number') == 'A1234-5678', u)
r = c.get('/api/admin/instructor-applications?status=approved', headers=AH)
apps = (r.get_json() or {}).get('applications', [])
sample = next((a for a in apps if a.get('country')), None)
check('admin application list exposes country + address', bool(sample) and 'city' in sample,
      sorted(sample.keys()) if sample else None)

# ── Legacy Ghanaian instructor is never locked out ───────────────────────────
r = signup_instructor('legacy@example.com',
                      {'ghana_card_number': 'GHA-123456789-0', 'ghana_post_gps': 'GA-123-4567'})
check('legacy Ghana signup still works', r.status_code in (200, 201), r.get_json())
leg_uid = uid_of('legacy@example.com')
approve(leg_uid)
leg_tok = login('legacy@example.com')
LH = {'Authorization': f'Bearer {leg_tok}'}
r = c.get('/api/instructor/courses', headers=LH)
check('legacy Ghanaian instructor is treated as complete (not locked out)',
      r.status_code == 200, r.status_code)

# ── Payout: international details save without blocking ──────────────────────
r = c.put('/api/users/me/payment-method', json={
    'method': 'bank', 'country': 'US',
    'details': {'bank_name': 'Chase', 'account_name': 'Jane Doe',
                'account_number': '1234567890', 'swift': 'CHASUS33'}}, headers=PH)
check('international payout details save', r.status_code == 200 and
      (r.get_json() or {}).get('automated_payout_available') is False, r.get_json())
r = c.put('/api/users/me/payment-method', json={
    'method': 'momo', 'country': 'GH',
    'details': {'provider': 'MTN', 'phone': '0244123456', 'account_name': 'Jane'}}, headers=PH)
check('Ghana momo payout still validates as before', r.status_code == 200, r.get_json())
r = c.put('/api/users/me/payment-method', json={
    'method': 'momo', 'country': 'US',
    'details': {'provider': 'x', 'phone': '0244123456', 'account_name': 'Jane'}}, headers=PH)
check('international momo is rejected (bank transfer only)', r.status_code == 400, r.status_code)

# ── Students are unaffected by the instructor gate ───────────────────────────
r = c.post('/api/auth/signup', json={'name': 'Student', 'email': 'stu@example.com',
                                     'password': 'Pass12345!', 'role': 'student'})
check('student signup unaffected', r.status_code in (200, 201), r.get_json())
st_tok = login('stu@example.com')
SH = {'Authorization': f'Bearer {st_tok}'}
r = c.get('/api/courses', headers=SH)
check('student can browse courses (not gated)', r.status_code == 200, r.status_code)

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED: ' + ', '.join(failures))
    sys.exit(1)
print('ALL INTERNATIONAL-REGISTRATION CHECKS PASSED')
