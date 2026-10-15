"""Regression tests for student payment statements.

Boots the real app on a throwaway SQLite database and exercises the real
routes, so the statement flow stays honest and private:

  * a student can read their own transaction, with the true status;
  * a student cannot read anyone else's transaction (404, not 403, so IDs
    cannot be probed);
  * the buyer's contact details are hidden from other users;
  * a pending/failed payment is never reported as successful;
  * a multi-course transaction is itemised with a correct total;
  * an admin can read any transaction.

    python backend/test_payment_statements.py
"""
import json
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
    for _col in ('email_verified',):
        try:
            db.execute("ALTER TABLE users ADD COLUMN %s TEXT" % _col)
        except Exception:
            pass
    for uid, name, email, role in [
        ('stuA', 'Ama Mensah', 'ama@example.com', 'student'),
        ('stuB', 'Kofi Owusu', 'kofi@example.com', 'student'),
        ('adm1', 'Admin User', 'admin@example.com', 'admin'),
    ]:
        db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
                   " VALUES (?,?,?,?,?,1,0)",
                   (uid, name, email, generate_password_hash('Pass12345!'), role))
    db.execute("UPDATE users SET email_verified=1 WHERE id IN ('stuA','stuB')")
    # transactions table (ensure_transactions_table adds the new columns).
    from app.database import ensure_transactions_table
    ensure_transactions_table(db)

    # Successful single-course purchase by stuA.
    db.execute(
        """INSERT INTO transactions
           (id, receipt_id, type, user_id, user_name, user_email, course_id, course_title,
            amount, currency, status, provider, provider_ref, payment_method,
            payment_details, coupon_code, discount_applied, original_amount, statement_no)
           VALUES ('tx_success','LA-RCPT-AAAA-0001','purchase','stuA','Ama Mensah','ama@example.com',
                   'c1','Python for Data Science', 80.0, 'GHS', 'success', 'paystack',
                   'PSK-REF-1', 'mtn_momo', ?, 'SAVE10', 20.0, 100.0, 'LA-STMT-AAAA-0001')""",
        (json.dumps({'name': 'Ama Mensah', 'phone': '0244123456', 'city': 'Accra'}),),
    )
    # Pending purchase by stuA — must never read as success.
    db.execute(
        """INSERT INTO transactions
           (id, receipt_id, type, user_id, user_name, user_email, course_id, course_title,
            amount, currency, status, provider, provider_ref, payment_method)
           VALUES ('tx_pending','LA-RCPT-BBBB-0002','purchase','stuA','Ama Mensah','ama@example.com',
                   'c2','Intro to Design', 50.0, 'GHS', 'pending', 'paystack', 'PSK-REF-2', 'card')"""
    )
    # Multi-course successful transaction owned by stuB (seeded directly, as a
    # cart checkout would produce).
    items = [
        {'course_id': 'c3', 'title': 'Web Development Basics', 'amount': 120.0},
        {'course_id': 'c4', 'title': 'Advanced CSS', 'amount': 80.0},
    ]
    db.execute(
        """INSERT INTO transactions
           (id, receipt_id, type, user_id, user_name, user_email, course_title,
            amount, currency, status, provider, provider_ref, line_items, statement_no)
           VALUES ('tx_multi','LA-RCPT-CCCC-0003','purchase','stuB','Kofi Owusu','kofi@example.com',
                   '2 courses', 200.0, 'GHS', 'success', 'paystack', 'PSK-REF-3', ?, 'LA-STMT-CCCC-0003')""",
        (json.dumps(items),),
    )
    db.commit()

c = app.test_client()


def login(email, pw='Pass12345!'):
    r = c.post('/api/auth/login', json={'email': email, 'password': pw})
    return (r.get_json() or {}).get('token')


tokA = login('ama@example.com')
tokB = login('kofi@example.com')
tokAdm = login('admin@example.com')


def get_tx(tok, tid):
    headers = {'Authorization': f'Bearer {tok}'} if tok else {}
    return c.get(f'/api/transactions/{tid}', headers=headers)


# ── 1. Owner reads their own successful statement ────────────────────────────
r = get_tx(tokA, 'tx_success')
tx = (r.get_json() or {}).get('transaction') or {}
check('owner can read their own transaction', r.status_code == 200, r.status_code)
check('status is the verified success', tx.get('status') == 'success', tx.get('status'))
check('receipt / statement numbers present',
      tx.get('receipt_id') == 'LA-RCPT-AAAA-0001' and tx.get('statement_no') == 'LA-STMT-AAAA-0001')
check('discount and original amount preserved',
      tx.get('discount_applied') == 20.0 and tx.get('original_amount') == 100.0 and tx.get('amount') == 80.0,
      (tx.get('discount_applied'), tx.get('original_amount'), tx.get('amount')))
check('buyer contact details visible to the buyer',
      (tx.get('buyer') or {}).get('contact', {}).get('phone') == '0244123456')

# ── 2. Cross-student access is blocked ───────────────────────────────────────
r = get_tx(tokB, 'tx_success')
check("another student cannot read someone else's transaction", r.status_code == 404, r.status_code)
r = get_tx(None, 'tx_success')
check('anonymous cannot read a transaction', r.status_code in (401, 403), r.status_code)

# ── 3. Pending is never shown as success ─────────────────────────────────────
r = get_tx(tokA, 'tx_pending')
tx = (r.get_json() or {}).get('transaction') or {}
check('a pending payment reads as pending, not success', tx.get('status') == 'pending', tx.get('status'))

# ── 4. Multi-course itemisation and total ────────────────────────────────────
r = get_tx(tokB, 'tx_multi')
tx = (r.get_json() or {}).get('transaction') or {}
items = tx.get('line_items') or []
check('multi-course transaction lists every course', len(items) == 2, len(items))
check('multi-course total equals the sum of the lines',
      round(sum(float(i.get('amount') or 0) for i in items), 2) == round(float(tx.get('amount') or 0), 2),
      (sum(float(i.get('amount') or 0) for i in items), tx.get('amount')))

# ── 5. Admin can read any transaction ────────────────────────────────────────
r = get_tx(tokAdm, 'tx_multi')
check('admin can read any transaction', r.status_code == 200, r.status_code)

# ── 6. Lookup by receipt_id also works for the owner ─────────────────────────
r = get_tx(tokA, 'LA-RCPT-AAAA-0001')
check('owner can open a transaction by its receipt id', r.status_code == 200, r.status_code)

print()
if failures:
    print(f'{len(failures)} CHECK(S) FAILED: {failures}')
    sys.exit(1)
print('ALL PAYMENT STATEMENT CHECKS PASSED')
