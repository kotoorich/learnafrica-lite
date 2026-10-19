"""Smoke test for the SEO public-directory endpoints and the admin audit trail.

Boots the real Flask app against a throwaway SQLite database, seeds a couple of
admins/blog posts and asserts the new endpoints behave. Run with the project
venv:

    python backend/test_seo_audit.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Isolate this run from any developer .env values.
os.environ.setdefault('SECRET_KEY', 'test-secret-not-for-production')

from app import create_app  # noqa: E402
from app.main import socketio  # noqa: E402,F401
from app.database import init_db, get_db  # noqa: E402

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
    # The audit helper needs a current_user on `g`; the test client requests
    # supply it via a token, but for the read endpoint we insert directly.
    db.execute(
        "INSERT INTO audit_log (id,actor_id,actor_name,actor_role,action,"
        "target_type,target_id,target_label,details,ip) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('a1', 'u1', 'Admin One', 'admin', 'suspend_user', 'user', 'u2',
         'bob@example.com', '{"is_active": false}', '127.0.0.1'))
    db.execute(
        "INSERT INTO blog_posts (id,slug,title,excerpt,cover,body,author_id,"
        "author_name,is_published) VALUES (?,?,?,?,?,?,?,?,?)",
        ('b1', 'hello-world', 'Hello World', 'First post', '', '<p>Hi</p>',
         'u1', 'Admin One', 1))
    db.commit()

c = app.test_client()
failures = []


def check(name, cond, extra=''):
    print(('PASS' if cond else 'FAIL') + f' — {name}' + (f' [{extra}]' if extra else ''))
    if not cond:
        failures.append(name)


# Public directory
r = c.get('/api/instructors')
check('GET /api/instructors 200', r.status_code == 200, r.status_code)
check('instructors payload has list', isinstance(r.get_json().get('instructors'), list))

r = c.get('/api/blog')
check('GET /api/blog 200', r.status_code == 200, r.status_code)
posts = r.get_json().get('posts', [])
check('blog lists the published post', any(p['slug'] == 'hello-world' for p in posts))

r = c.get('/api/blog/hello-world')
check('GET /api/blog/<slug> 200', r.status_code == 200, r.status_code)
check('blog post body present', r.get_json()['post']['body'] == '<p>Hi</p>')

r = c.get('/api/blog/does-not-exist')
check('missing blog slug 404', r.status_code == 404, r.status_code)

r = c.get('/api/sitemap.xml')
check('GET /api/sitemap.xml 200', r.status_code == 200, r.status_code)
check('sitemap is XML', 'urlset' in r.get_data(as_text=True))

# Audit endpoints must be admin-protected.
r = c.get('/api/admin/audit-log')
check('audit-log requires auth', r.status_code in (401, 403), r.status_code)
r = c.get('/api/admin/blog')
check('admin blog requires auth', r.status_code in (401, 403), r.status_code)

# ── Credential revocation ─────────────────────────────────────────────────────
# Seed a superadmin, a plain admin and an issued certificate + badge. The public
# verify endpoint must report a revoked credential as invalid.
from app.security import generate_token  # noqa: E402

with app.app_context():
    db = get_db()
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active) VALUES (?,?,?,?,?,1)",
               ('sa1', 'Super Admin', 'sa@example.com', 'x', 'superadmin'))
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active) VALUES (?,?,?,?,?,1)",
               ('ad1', 'Plain Admin', 'ad@example.com', 'x', 'admin'))
    db.execute("INSERT INTO issued_certificates (id,cert_id,user_id,course_id,user_name,"
               "course_name,instructor_name) VALUES (?,?,?,?,?,?,?)",
               ('c1', 'LA-CERT-TEST-0001', 'u2', 'crs1', 'Bob Student', 'Python', 'Jane Inst'))
    db.execute("INSERT INTO issued_badges (badge_id,user_id,user_name,badge_key,badge_title)"
               " VALUES (?,?,?,?,?)",
               ('LA-BADGE-TEST-0002', 'u2', 'Bob Student', 'PATHFINDER', 'Pathfinder'))
    db.commit()

with app.app_context():
    _sa = generate_token("sa1", "sa@example.com", "superadmin")
    _ad = generate_token("ad1", "ad@example.com", "admin")
sa_hdr = {'Authorization': f'Bearer {_sa}'}
ad_hdr = {'Authorization': f'Bearer {_ad}'}

r = c.get('/api/verify?id=LA-CERT-TEST-0001')
check('verify active certificate valid', r.get_json().get('valid') is True, r.get_json())

r = c.post('/api/admin/credentials/revoke', headers=ad_hdr,
          json={'id': 'LA-CERT-TEST-0001', 'type': 'certificate', 'reason': 'test'})
check('plain admin cannot revoke credential', r.status_code == 403, r.status_code)

r = c.post('/api/admin/credentials/revoke', headers=sa_hdr,
           json={'id': 'LA-CERT-TEST-0001', 'type': 'certificate', 'reason': 'test'})
check('superadmin revokes certificate 200', r.status_code == 200, r.status_code)

r = c.get('/api/verify?id=LA-CERT-TEST-0001')
j = r.get_json()
check('verify revoked certificate invalid', j.get('valid') is False and j.get('revoked') is True, j)

r = c.post('/api/admin/credentials/restore', headers=sa_hdr,
           json={'id': 'LA-CERT-TEST-0001', 'type': 'certificate'})
check('superadmin restores certificate 200', r.status_code == 200, r.status_code)
r = c.get('/api/verify?id=LA-CERT-TEST-0001')
check('verify restored certificate valid', r.get_json().get('valid') is True, r.get_json())

r = c.post('/api/admin/credentials/revoke', headers=sa_hdr,
           json={'id': 'LA-BADGE-TEST-0002', 'type': 'badge', 'reason': 'fraud'})
check('superadmin revokes badge 200', r.status_code == 200, r.status_code)
r = c.get('/api/verify?id=LA-BADGE-TEST-0002')
j = r.get_json()
check('verify revoked badge invalid', j.get('valid') is False and j.get('revoked') is True, j)

r = c.get('/api/admin/credentials', headers=ad_hdr)
check('admin credentials list 200', r.status_code == 200, r.status_code)
check('credentials list returns items', len(r.get_json().get('credentials', [])) >= 2)

r = c.get('/api/admin/credentials')
check('credentials list requires auth', r.status_code in (401, 403), r.status_code)

# Audit log now records role changes, credential and coupon actions.
with app.app_context():
    db = get_db()
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active) VALUES"
               " (?,?,?,?,?,1)", ('st1', 'Stu Dent', 'st@example.com', 'x', 'student'))
    db.commit()

r = c.put('/api/admin/users/st1/role', headers=sa_hdr, json={'role': 'instructor'})
check('superadmin changes role 200', r.status_code == 200, r.status_code)

r = c.post('/api/coupons', headers=sa_hdr,
           json={'code': 'TESTCODE1', 'discount_type': 'percent', 'discount_value': 10,
                 'applies_to': 'all'})
check('create coupon 201', r.status_code == 201, r.status_code)
_cid = r.get_json()['coupon']['id']
r = c.delete(f'/api/coupons/{_cid}', headers=sa_hdr)
check('delete coupon 200', r.status_code == 200, r.status_code)

with app.app_context():
    db = get_db()
    actions = {row['action'] for row in db.execute('SELECT action FROM audit_log').fetchall()}
check('audit log has credential_revoke entry', 'credential_revoke' in actions, sorted(actions))
check('audit log has credential_restore entry', 'credential_restore' in actions, sorted(actions))
check('audit log has role_change entry', 'role_change' in actions, sorted(actions))
check('audit log has coupon_create entry', 'coupon_create' in actions, sorted(actions))
check('audit log has coupon_delete entry', 'coupon_delete' in actions, sorted(actions))

# ── Restore hardening: identifier validation + superadmin protection ──────────
# A restore file must not be able to demote/suspend/replace the superadmin, and
# must not smuggle SQL through a table/column name.
TEST_RESTORE_PW = 'RestoreTestPass123!'
with app.app_context():
    db = get_db()
    # Baseline: superadmin is active, with a real password for re-confirmation.
    from werkzeug.security import generate_password_hash as _gph  # noqa: E402
    db.execute("UPDATE users SET role='superadmin', is_active=1, password_hash=? WHERE id='sa1'",
               (_gph(TEST_RESTORE_PW),))
    db.commit()

_bad_backup = {
    'signature': 'LEARNAFRICA_BACKUP_V1',
    'tables': {
        # A malicious column name with a quote/statement — must be rejected,
        # not executed.
        'users': [{'id': 'x1', 'name': 'Mallory', 'email': 'm@evil.com',
                   'password_hash': 'x', 'role': 'superadmin', 'is_active': 1,
                   'name" FROM users; DROP TABLE users; --': 'boom'}],
    },
}
r = c.post('/api/admin/database/import', headers=sa_hdr,
           json={'password': TEST_RESTORE_PW, 'confirm': 'CONFIRM', 'backup': _bad_backup})
check('restore with unsafe column name does not 500', r.status_code == 200, r.status_code)
check('restore reports rejected unsafe column',
      any('unsafe SQL identifier' in e for e in r.get_json().get('errors_insert', [])),
      r.get_json().get('errors_insert'))

with app.app_context():
    db = get_db()
    row = db.execute("SELECT role, is_active FROM users WHERE id='sa1'").fetchone()
check('superadmin survives a restore', row is not None and row['role'] == 'superadmin'
      and int(row['is_active']) == 1, dict(row) if row else None)
# The malicious row must not have been created.
with app.app_context():
    db = get_db()
    rogue = db.execute("SELECT id FROM users WHERE email='m@evil.com'").fetchone()
check('unsafe backup row not inserted', rogue is None, rogue)

# A well-formed backup that tries to demote the superadmin is skipped.
_good_but_evil = {
    'signature': 'LEARNAFRICA_BACKUP_V1',
    'tables': {
        'users': [{'id': 'sa1', 'name': 'Super Admin', 'email': 'sa@example.com',
                   'password_hash': 'hacked', 'role': 'student', 'is_active': 0}],
    },
}
r = c.post('/api/admin/database/import', headers=sa_hdr,
           json={'password': TEST_RESTORE_PW, 'confirm': 'CONFIRM', 'backup': _good_but_evil})
check('restore that demotes superadmin returns 200', r.status_code == 200, r.status_code)
check('demoting row skipped as protected',
      'sa1' in (r.get_json().get('skipped_protected_users') or []),
      r.get_json().get('skipped_protected_users'))
with app.app_context():
    db = get_db()
    row = db.execute("SELECT role, password_hash, is_active FROM users WHERE id='sa1'").fetchone()
check('superadmin still superadmin after demote attempt',
      row is not None and row['role'] == 'superadmin', dict(row) if row else None)
check('superadmin password not overwritten by restore',
      row is not None and row['password_hash'] != 'hacked', dict(row) if row else None)

# ── Environment admin supersedes database state ───────────────────────────────
# On boot, seed_admin() must force the ADMIN_EMAIL account back to superadmin +
# active, and re-assert the ADMIN_PASSWORD, so a demotion or suspension can never
# lock the owner out of the top account.
os.environ['ADMIN_EMAIL'] = 'sa@example.com'
os.environ['ADMIN_PASSWORD'] = 'BrandNewPass123!'
with app.app_context():
    db = get_db()
    db.execute("UPDATE users SET role='student', is_active=0, password_hash='oldhash' WHERE id='sa1'")
    db.commit()
    from app.crud import seed_admin  # noqa: E402
    seed_admin(app, db)
    row = db.execute("SELECT role, is_active, password_hash FROM users WHERE id='sa1'").fetchone()
from werkzeug.security import check_password_hash  # noqa: E402
check('env ADMIN_EMAIL forced back to superadmin',
      row is not None and row['role'] == 'superadmin', dict(row) if row else None)
check('env ADMIN_EMAIL forced active',
      row is not None and int(row['is_active']) == 1, dict(row) if row else None)
check('env ADMIN_PASSWORD re-asserted',
      row is not None and check_password_hash(row['password_hash'] or '', 'BrandNewPass123!'),
      dict(row) if row else None)

print()
if failures:
    print(f'{len(failures)} FAILURE(S): {failures}')
    sys.exit(1)
print('All checks passed.')
