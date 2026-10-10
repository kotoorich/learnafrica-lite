"""
email_service.py — Outbound email, with a choosable sender.

The admin connects up to three accounts and picks which one sends the
application's transactional email (signup verification codes, password resets,
notifications, payout messages):

  * gmail1    — a Gmail account, via the official Gmail API + OAuth 2.0
  * gmail2    — a second, independent Gmail account (its own credentials)
  * sendpulse — the existing SendPulse REST sender

The chosen sender is used for every transactional email. Recipients are always
their registered address; only the "from" account changes.

Security notes:
  * OAuth refresh tokens and client secrets are stored server-side only
    (platform_settings, key 'email_config') and are never returned to the
    frontend. GET responses expose only connection status and the sender email.
  * Nothing here trusts a caller-supplied role or address; callers pass the
    intended recipient explicitly and the gate below decides whether to send.
"""
import os
import json
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import requests


CONFIG_KEY = 'email_config'
PROVIDERS = ('gmail1', 'gmail2', 'sendpulse')


def _empty_account():
    return {
        'client_id': '',
        'client_secret': '',
        'refresh_token': '',
        'sender_email': '',
        'sender_name': 'LearnAfrica',
        'connected': False,
        'connected_at': None,
        'last_error': None,
    }


def default_config():
    return {
        'enabled': True,
        'selected': 'sendpulse',   # preserves existing behaviour until changed
        'gmail1': _empty_account(),
        'gmail2': _empty_account(),
        'sendpulse': {
            'client_id': '',
            'client_secret': '',
            'sender_email': '',
            'sender_name': 'LearnAfrica',
            'connected': False,
        },
    }


def load_email_config(db):
    """Read the email config, filling in defaults for anything missing.

    Env-based SendPulse credentials are used as a starting point so an existing
    deployment keeps working after the upgrade without re-entering them.
    """
    cfg = default_config()
    stored = {}
    try:
        row = db.execute('SELECT value FROM platform_settings WHERE key=?', (CONFIG_KEY,)).fetchone()
        if row and row['value']:
            data = row['value']
            stored = json.loads(data) if isinstance(data, str) else data
            if not isinstance(stored, dict):
                stored = {}
    except Exception:
        stored = {}

    if 'enabled' in stored:
        cfg['enabled'] = bool(stored['enabled'])
    if stored.get('selected') in PROVIDERS:
        cfg['selected'] = stored['selected']
    for slot in ('gmail1', 'gmail2'):
        acct = stored.get(slot) or {}
        if isinstance(acct, dict):
            for k in _empty_account().keys():
                if k in acct:
                    cfg[slot][k] = acct[k]
    sp = stored.get('sendpulse') or {}
    if isinstance(sp, dict):
        for k in cfg['sendpulse'].keys():
            if k in sp:
                cfg['sendpulse'][k] = sp[k]

    # Bridge existing env credentials so nothing breaks on upgrade.
    if not cfg['sendpulse']['client_id']:
        cfg['sendpulse']['client_id'] = os.environ.get('SENDPULSE_CLIENT_ID', '').strip()
    if not cfg['sendpulse']['client_secret']:
        cfg['sendpulse']['client_secret'] = os.environ.get('SENDPULSE_CLIENT_SECRET', '').strip()
    if not cfg['sendpulse']['sender_email']:
        cfg['sendpulse']['sender_email'] = os.environ.get('SENDPULSE_SENDER_EMAIL', '').strip()
    if not cfg['sendpulse']['sender_name']:
        cfg['sendpulse']['sender_name'] = os.environ.get('SENDPULSE_SENDER_NAME', 'LearnAfrica').strip() or 'LearnAfrica'
    cfg['sendpulse']['connected'] = bool(
        cfg['sendpulse']['client_id'] and cfg['sendpulse']['client_secret'] and cfg['sendpulse']['sender_email'])
    return cfg


def save_email_config(db, cfg, updated_by=None, use_postgres=False):
    payload = json.dumps(cfg)
    existing = db.execute('SELECT key FROM platform_settings WHERE key=?', (CONFIG_KEY,)).fetchone()
    if existing:
        db.execute('UPDATE platform_settings SET value=?, updated_at=CURRENT_TIMESTAMP, updated_by=? WHERE key=?',
                   (payload, updated_by, CONFIG_KEY))
    else:
        db.execute('INSERT INTO platform_settings (key, value, updated_by) VALUES (?,?,?)',
                   (CONFIG_KEY, payload, updated_by))
    db.commit()


def public_config(cfg):
    """A safe view for the frontend — no secrets leave the server."""
    def _acct(a):
        return {
            'connected': bool(a.get('connected')),
            'sender_email': a.get('sender_email') or '',
            'sender_name': a.get('sender_name') or '',
            'last_error': a.get('last_error'),
            'has_credentials': bool(a.get('refresh_token')),
        }
    sp = cfg['sendpulse']
    return {
        'enabled': bool(cfg['enabled']),
        'selected': cfg['selected'],
        'gmail1': _acct(cfg['gmail1']),
        'gmail2': _acct(cfg['gmail2']),
        'sendpulse': {
            'connected': bool(sp.get('connected')),
            'sender_email': sp.get('sender_email') or '',
            'sender_name': sp.get('sender_name') or '',
            'last_error': sp.get('last_error'),
            'has_credentials': bool(sp.get('client_id') and sp.get('client_secret')),
        },
    }


# ── Senders ───────────────────────────────────────────────────────────────────
def gmail_access_token(account):
    """Exchange a stored refresh token for a short-lived access token.

    Returns (access_token, error_message). Uses Google's official token
    endpoint; the refresh token itself is long-lived and stays server-side.
    """
    cid = (account.get('client_id') or '').strip()
    secret = (account.get('client_secret') or '').strip()
    refresh = (account.get('refresh_token') or '').strip()
    if not cid:      return None, 'Gmail client ID not set'
    if not secret:   return None, 'Gmail client secret not set'
    if not refresh:  return None, 'Gmail refresh token not set'
    try:
        r = requests.post('https://oauth2.googleapis.com/token', data={
            'client_id': cid,
            'client_secret': secret,
            'refresh_token': refresh,
            'grant_type': 'refresh_token',
        }, timeout=15)
        if r.status_code != 200:
            return None, f'Google token refresh failed: {r.status_code} {r.text[:200]}'
        tok = (r.json() or {}).get('access_token')
        if not tok:
            return None, 'Google returned no access token'
        return tok, None
    except Exception as ex:
        return None, f'Google token request failed: {ex}'


def verify_gmail_account(account):
    """Check the credentials work and return the account's own address.

    Returns (email, error_message). The address is read from the Gmail profile
    so we do not have to trust a value typed into a form.
    """
    token, err = gmail_access_token(account)
    if err:
        return None, err
    try:
        r = requests.get('https://gmail.googleapis.com/gmail/v1/users/me/profile',
                         headers={'Authorization': f'Bearer {token}'}, timeout=15)
        if r.status_code != 200:
            return None, f'Gmail profile check failed: {r.status_code} {r.text[:200]}'
        addr = (r.json() or {}).get('emailAddress')
        if not addr:
            return None, 'Gmail returned no email address'
        return addr, None
    except Exception as ex:
        return None, f'Gmail profile request failed: {ex}'


def send_via_gmail(account, to_email, to_name, subject, html_body, text_body):
    """Send one email through the official Gmail API. Returns (ok, error)."""
    token, err = gmail_access_token(account)
    if err:
        return False, err
    sender = (account.get('sender_email') or '').strip()
    sender_name = (account.get('sender_name') or 'LearnAfrica').strip()
    if not sender:
        return False, 'Gmail sender address not set'

    msg = MIMEMultipart('alternative')
    msg['To'] = f'{to_name} <{to_email}>' if to_name else to_email
    msg['From'] = f'{sender_name} <{sender}>'
    msg['Subject'] = subject
    msg.attach(MIMEText(text_body or '', 'plain'))
    if html_body:
        msg.attach(MIMEText(html_body, 'html'))
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode('ascii')

    try:
        r = requests.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
                          headers={'Authorization': f'Bearer {token}'},
                          json={'raw': raw}, timeout=20)
        if r.status_code in (200, 202):
            return True, None
        # 429 = per-user rate limit; 403 = quota / not authorised.
        if r.status_code == 429:
            return False, 'Gmail daily sending limit reached. Try again later.'
        return False, f'Gmail send failed: {r.status_code} {r.text[:200]}'
    except Exception as ex:
        return False, f'Gmail send exception: {ex}'


def send_via_sendpulse(sp, to_email, to_name, subject, html_body, text_body):
    """Send one email via SendPulse's REST API. Returns (ok, error)."""
    client_id = (sp.get('client_id') or '').strip()
    client_secret = (sp.get('client_secret') or '').strip()
    sender_email = (sp.get('sender_email') or '').strip()
    sender_name = (sp.get('sender_name') or 'LearnAfrica').strip()
    if not client_id:     return False, 'SendPulse client ID not set'
    if not client_secret: return False, 'SendPulse client secret not set'
    if not sender_email:  return False, 'SendPulse sender email not set'
    try:
        t = requests.post('https://api.sendpulse.com/oauth/access_token',
                          json={'grant_type': 'client_credentials',
                                'client_id': client_id,
                                'client_secret': client_secret}, timeout=15)
        if t.status_code != 200:
            return False, f'SendPulse auth failed: {t.status_code} {t.text[:200]}'
        token = (t.json() or {}).get('access_token')
        if not token:
            return False, 'SendPulse returned no access_token'
        html_b64 = base64.b64encode((html_body or '').encode('utf-8')).decode('ascii')
        payload = {'email': {
            'subject': subject,
            'html': html_b64,
            'text': text_body or '',
            'from': {'name': sender_name, 'email': sender_email},
            'to': [{'name': to_name or to_email, 'email': to_email}],
        }}
        s = requests.post('https://api.sendpulse.com/smtp/emails', json=payload,
                          headers={'Authorization': f'Bearer {token}'}, timeout=20)
        if s.status_code in (200, 201):
            return True, None
        return False, f'SendPulse send failed: {s.status_code} {s.text[:200]}'
    except Exception as ex:
        return False, f'SendPulse request exception: {ex}'


def _dispatch(cfg, provider, to_email, to_name, subject, html_body, text_body):
    if provider == 'sendpulse':
        acct = cfg['sendpulse']
        if not acct.get('connected') and not (acct.get('client_id') and acct.get('client_secret') and acct.get('sender_email')):
            return False, 'SendPulse is not configured'
        return send_via_sendpulse(acct, to_email, to_name, subject, html_body, text_body)
    acct = cfg.get(provider) or {}
    if not acct.get('connected'):
        return False, f'{provider} is not connected'
    return send_via_gmail(acct, to_email, to_name, subject, html_body, text_body)


def send_email(db, to_email, to_name, subject, html_body, text_body, provider=None):
    """Send a transactional email using the admin-selected sender.

    Returns (ok, error). Honours the Email System ON/OFF switch: when the admin
    has switched email off, nothing is sent and a clear reason is returned.
    """
    cfg = load_email_config(db)
    if not cfg.get('enabled'):
        return False, 'Email sending is turned off in the admin settings'
    chosen = provider or cfg.get('selected') or 'sendpulse'
    if chosen not in PROVIDERS:
        chosen = 'sendpulse'
    return _dispatch(cfg, chosen, to_email, to_name, subject, html_body, text_body)
