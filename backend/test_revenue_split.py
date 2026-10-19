"""Regression tests for the revenue-sharing fix.

The bug: some analytics / financial summaries kept using a hardcoded 50/50
after the admin changed the split, because /api/instructor/stats never returned
the configured percentages and the dashboards fell back to `|| 50`.

These checks boot the real app on a throwaway SQLite database and drive the real
routes, so a regression that reintroduces a hardcoded split fails here.

    python backend/test_revenue_split.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('SECRET_KEY', 'test-secret-not-for-production')

from app import create_app  # noqa: E402
from app.main import socketio  # noqa: E402,F401
from app.database import init_db, get_db  # noqa: E402
from app.crud import resolve_revenue_split, get_revenue_split  # noqa: E402
from app.payments import compute_split  # noqa: E402
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
        ('ins1', 'Instructor', 'ins@example.com', 'instructor'),
    ]:
        db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
                   " VALUES (?,?,?,?,?,1,0)",
                   (uid, name, email, generate_password_hash('Pass12345!'), role))
    db.execute("UPDATE users SET instructor_status='approved', payment_method='bank',"
               " payment_details='acct' WHERE id='ins1'")
    db.execute("INSERT INTO courses (id,title,description,instructor_id,instructor_name,category,"
               "difficulty,price,is_free,is_published,is_visible)"
               " VALUES ('c1','Course','d','ins1','Instructor','Tech','beginner',10000,0,1,1)")
    # A successful purchase: 100.00 gross, recorded at the old 50/50 for history.
    db.execute("INSERT INTO transactions (id,receipt_id,type,user_id,user_name,user_email,"
               "course_id,course_title,instructor_id,amount,currency,instructor_share,"
               "platform_share,status,provider,payout_status)"
               " VALUES ('t1','R1','purchase','x','S','s@e.com','c1','Course','ins1',100.0,'GHS',"
               "50.0,50.0,'success','mock','pending')")
    db.commit()

c = app.test_client()


def login(email, pw='Pass12345!'):
    r = c.post('/api/auth/login', json={'email': email, 'password': pw})
    return (r.get_json() or {}).get('token')


adm_tok = login('admin@example.com')
ins_tok = login('ins@example.com')
AH = {'Authorization': f'Bearer {adm_tok}'}
IH = {'Authorization': f'Bearer {ins_tok}'}

# ── Admin changes the split to 80/20 ─────────────────────────────────────────
r = c.put('/api/admin/revenue-split', json={'instructor_share': 80}, headers=AH)
check('PUT revenue-split accepts 80/20', r.status_code == 200, r.status_code)
check('PUT response echoes 80/20', (r.get_json() or {}).get('instructor_share') == 80
      and (r.get_json() or {}).get('admin_share') == 20, r.get_json())

# ── GET returns the saved config ─────────────────────────────────────────────
r = c.get('/api/admin/revenue-split', headers=AH)
body = r.get_json() or {}
check('GET revenue-split returns 80/20 from config', body.get('instructor_share') == 80
      and body.get('admin_share') == 20, body)
check('GET revenue-split marks config as configured', body.get('configured') is True, body)

# ── Instructor stats must now report 80/20, not a hardcoded 50 ───────────────
r = c.get('/api/instructor/stats', headers=IH)
s = r.get_json() or {}
check('instructor stats reports configured instructor pct (80)', s.get('instructor_share_pct') == 80, s.get('instructor_share_pct'))
check('instructor stats reports configured platform pct (20)', s.get('platform_share_pct') == 20, s.get('platform_share_pct'))
check('instructor stats flags split as configured', s.get('split_configured') is True, s.get('split_configured'))
check('instructor stats gross equals recorded sales', s.get('gross_revenue') == 100.0, s.get('gross_revenue'))
check('instructor stats platform share reconciles (gross - earnings)',
      round((s.get('gross_revenue') or 0) - (s.get('total_earnings') or 0), 2) == s.get('platform_share'),
      f"gross={s.get('gross_revenue')} earnings={s.get('total_earnings')} platform={s.get('platform_share')}")

# ── Admin platform stats must report 80/20 too ───────────────────────────────
r = c.get('/api/admin/stats', headers=AH)
a = r.get_json() or {}
check('admin stats reports configured instructor pct (80)', a.get('instructor_share_pct') == 80, a.get('instructor_share_pct'))
check('admin stats reports configured admin pct (20)', a.get('admin_share_pct') == 20, a.get('admin_share_pct'))

# ── Admin platform-settings reflects the same numbers ────────────────────────
r = c.get('/api/admin/platform-settings', headers=AH)
p = r.get_json() or {}
check('platform-settings reports 80/20', p.get('instructor_share') == 80 and p.get('admin_share') == 20, p)

# ── Historical transaction allocation is preserved ───────────────────────────
with app.app_context():
    row = get_db().execute("SELECT instructor_share, platform_share FROM transactions"
                           " WHERE id='t1'").fetchone()
check('historical transaction keeps its recorded 50/50 allocation',
      float(row['instructor_share']) == 50.0 and float(row['platform_share']) == 50.0,
      dict(row))

# ── Future purchases use the new split (compute_split) ───────────────────────
with app.app_context():
    pct, _ = get_revenue_split(get_db())
instr, plat = compute_split(100.0, pct)
check('future purchase split uses configured 80/20', instr == 80.0 and plat == 20.0, (instr, plat))
# Rounding: platform is the exact remainder, so the two always sum to the total.
i2, p2 = compute_split(33.33, 33)
check('split rounds with no lost cent', round(i2 + p2, 2) == 33.33, (i2, p2))

# ── Missing config is reported, not silently 50/50 ───────────────────────────
with app.app_context():
    db = get_db()
    db.execute("DELETE FROM platform_config WHERE key IN ('instructor_share','admin_share')")
    db.commit()
    res = resolve_revenue_split(db)
check('unconfigured split is flagged (not presented as an admin choice)',
      res['configured'] is False and res['source'] == 'default', res)

# ── Invalid config is detected ───────────────────────────────────────────────
with app.app_context():
    db = get_db()
    db.execute("INSERT INTO platform_config (key,value) VALUES ('instructor_share','150')")
    db.execute("INSERT INTO platform_config (key,value) VALUES ('admin_share','-50')")
    db.commit()
    res = resolve_revenue_split(db)
check('out-of-range config is detected', res['configured'] is False and res['error'], res)

# ── Validation: shares must total 100, and the field is required ─────────────
r = c.put('/api/admin/revenue-split', json={'instructor_share': 60, 'admin_share': 60}, headers=AH)
check('PUT rejects shares that do not total 100', r.status_code == 400, r.status_code)
r = c.put('/api/admin/revenue-split', json={}, headers=AH)
check('PUT rejects a missing split instead of assuming 50', r.status_code == 400, r.status_code)
r = c.put('/api/admin/revenue-split', json={'instructor_share': 'abc'}, headers=AH)
check('PUT rejects non-numeric shares', r.status_code == 400, r.status_code)

# ── Restore a sane split and confirm round-trip ──────────────────────────────
c.put('/api/admin/revenue-split', json={'instructor_share': 70}, headers=AH)
r = c.get('/api/instructor/stats', headers=IH)
check('changing the split again is reflected immediately',
      (r.get_json() or {}).get('instructor_share_pct') == 70, (r.get_json() or {}).get('instructor_share_pct'))

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED: {failures}')
    sys.exit(1)
print('ALL REVENUE-SPLIT CHECKS PASSED')
