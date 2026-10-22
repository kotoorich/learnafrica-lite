"""Tests for statement (transaction) deletion.

Statements are financial records, so deletion is a soft delete: the row stays,
hidden from the owner, and admins can still see it. These checks boot the real
app and exercise the real routes.

    python backend/test_statements_delete.py
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
        ('stu1', 'Ama', 'stu@example.com', 'student'),
        ('stu2', 'Kofi', 'kofi@example.com', 'student'),
    ]:
        db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
                   " VALUES (?,?,?,?,?,1,0)",
                   (uid, name, email, generate_password_hash('Pass12345!'), role))
    for tid, rid, uid in [('t1', 'LA-RCP-1', 'stu1'), ('t2', 'LA-RCP-2', 'stu2')]:
        db.execute("INSERT INTO transactions (id,receipt_id,type,user_id,user_name,user_email,"
                   "course_id,course_title,instructor_id,amount,currency,status,provider,deleted_by_user)"
                   " VALUES (?,?, 'purchase', ?,?,'x@y.z','c1','Python', 'adm1', 100, 'GHS', 'success','stub',0)",
                   (tid, rid, uid, uid))
    db.commit()

c = app.test_client()


def login(email, pw='Pass12345!'):
    r = c.post('/api/auth/login', json={'email': email, 'password': pw})
    return (r.get_json() or {}).get('token')


stu1 = login('stu@example.com')
stu2 = login('kofi@example.com')
adm = login('admin@example.com')

# ── Ownership enforced ───────────────────────────────────────────────────────
r = c.delete('/api/transactions/t1', headers={'Authorization': f'Bearer {stu2}'})
check('another user cannot delete your statement', r.status_code == 403, r.status_code)

# ── Owner deletes their own statement ────────────────────────────────────────
r = c.delete('/api/transactions/t1', headers={'Authorization': f'Bearer {stu1}'})
check('owner can delete their own statement', r.status_code == 200, r.status_code)

r = c.get('/api/transactions/t1', headers={'Authorization': f'Bearer {stu1}'})
check('deleted statement is no longer reachable by the owner', r.status_code == 404, r.status_code)

r = c.get('/api/transactions', headers={'Authorization': f'Bearer {stu1}'})
ids = [t['id'] for t in (r.get_json() or {}).get('transactions', [])]
check('deleted statement is gone from the owner list', 't1' not in ids, ids)

# ── Record is preserved, not physically deleted ──────────────────────────────
with app.app_context():
    db = get_db()
    row = db.execute("SELECT deleted_by_user FROM transactions WHERE id='t1'").fetchone()
check('row is preserved (soft delete, not hard delete)', row is not None)
check('row is flagged deleted_by_user=1', row is not None and int(row['deleted_by_user']) == 1)

r = c.get('/api/transactions/t1', headers={'Authorization': f'Bearer {adm}'})
check('admin can still open a deleted statement', r.status_code == 200, r.status_code)
r = c.get('/api/transactions', headers={'Authorization': f'Bearer {adm}'})
ids = [t['id'] for t in (r.get_json() or {}).get('transactions', [])]
check('admin list still includes the deleted statement', 't1' in ids, ids)

# ── The old ?hard=1 escape hatch no longer physically deletes ────────────────
r = c.delete('/api/transactions/t1?hard=1', headers={'Authorization': f'Bearer {adm}'})
with app.app_context():
    db = get_db()
    row = db.execute("SELECT id FROM transactions WHERE id='t1'").fetchone()
check('?hard=1 no longer destroys the financial record', row is not None)

# ── Idempotent: deleting again is still a success ────────────────────────────
r = c.delete('/api/transactions/t1', headers={'Authorization': f'Bearer {stu1}'})
check('repeat delete is idempotent (200)', r.status_code == 200, r.status_code)

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED: {failures}')
    sys.exit(1)
print('ALL STATEMENT-DELETE CHECKS PASSED')
