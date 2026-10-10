"""Test the email-ON path: a forgot-password request auto-emails a reset link.

Boots the real app on SQLite, enables the email master switch, and replaces
only the network call (email_service.send_email) with a recorder so we can
assert on what would have been sent. Every other path is real code.

    python backend/test_forgot_password_email_on.py
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
    from werkzeug.security import generate_password_hash
    db.execute("INSERT INTO users (id,name,email,password_hash,role,is_active,token_version)"
               " VALUES (?,?,?,?,?,1,0)",
               ('on1', 'On User', 'on@example.com', generate_password_hash('OldPass123!'), 'student'))
    db.commit()
    # Turn outgoing email ON.
    cfg = email_service.load_email_config(db)
    cfg['enabled'] = True
    email_service.save_email_config(db, cfg, None, False)

c = app.test_client()
failures = []
sent = []


def check(name, cond, extra=''):
    print(('PASS' if cond else 'FAIL') + f' - {name}' + (f' [{extra}]' if extra else ''))
    if not cond:
        failures.append(name)


# Record instead of calling the network.
def fake_send(db, to, name, subject, html, text, provider=None, use_postgres=False):
    sent.append({'to': to, 'subject': subject, 'text': text, 'html': html})
    return True, None


orig_send = email_service.send_email
email_service.send_email = fake_send
# main.py imported email_service as a module, so patching the module attribute works.
try:
    r = c.post('/api/auth/forgot-password', json={'email': 'on@example.com',
                                                  'reason': 'Forgot Password'})
    body = r.get_json() or {}
    check('request accepted (200)', r.status_code == 200, str(r.status_code))
    check('email_sent flag true', body.get('email_sent') is True, str(body))
    check('one email sent', len(sent) == 1, str(len(sent)))
    check('sent to the right address', sent and sent[0]['to'] == 'on@example.com')
    check('email contains reset link', sent and '/reset-password?token=' in sent[0]['text'])
finally:
    email_service.send_email = orig_send

# A token row was created and marked link_sent.
with app.app_context():
    db = get_db()
    tok = db.execute('SELECT token_hash, used FROM password_reset_tokens WHERE user_id=?',
                     ('on1',)).fetchone()
    check('token created for auto-send', tok is not None)
    check('only hash stored', tok is not None and len(tok['token_hash']) == 64)
    req = db.execute("SELECT status FROM password_reset_requests WHERE LOWER(email)='on@example.com'"
                     ).fetchone()
    check('request status link_sent', req is not None and req['status'] == 'link_sent',
          str(req['status'] if req else None))

print()
if failures:
    print(f'{len(failures)} FAILURE(S): {failures}')
    sys.exit(1)
print('ALL EMAIL-ON CHECKS PASSED')
