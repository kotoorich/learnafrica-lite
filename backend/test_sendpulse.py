"""
test_sendpulse.py — check your SendPulse credentials and optionally send a test email.

Usage:
    python test_sendpulse.py                 # only checks the credentials
    python test_sendpulse.py you@email.com   # also sends a real test email

Reads the same env vars the app uses:
    SENDPULSE_CLIENT_ID, SENDPULSE_CLIENT_SECRET,
    SENDPULSE_SENDER_EMAIL, SENDPULSE_SENDER_NAME
"""
import base64
import os
import sys

from dotenv import load_dotenv

load_dotenv()


def main():
    client_id     = os.environ.get('SENDPULSE_CLIENT_ID', '').strip()
    client_secret = os.environ.get('SENDPULSE_CLIENT_SECRET', '').strip()
    sender_email  = os.environ.get('SENDPULSE_SENDER_EMAIL', '').strip()
    sender_name   = os.environ.get('SENDPULSE_SENDER_NAME', 'LearnAfrica').strip()

    missing = [k for k, v in {
        'SENDPULSE_CLIENT_ID': client_id,
        'SENDPULSE_CLIENT_SECRET': client_secret,
        'SENDPULSE_SENDER_EMAIL': sender_email,
    }.items() if not v]
    if missing:
        print('Missing env var(s): ' + ', '.join(missing))
        print('Set them in backend/.env (local) or the Render dashboard.')
        return 1

    import requests

    print('1. Requesting access token...')
    t = requests.post(
        'https://api.sendpulse.com/oauth/access_token',
        json={'grant_type': 'client_credentials',
              'client_id': client_id, 'client_secret': client_secret},
        timeout=15,
    )
    if t.status_code != 200:
        print(f'   FAILED: {t.status_code} {t.text[:300]}')
        return 1
    token = t.json().get('access_token')
    if not token:
        print('   FAILED: no access_token in response')
        return 1
    print('   OK — got an access token.')

    if len(sys.argv) < 2:
        print('\nCredentials are valid. Pass an email address to send a real test:')
        print('   python test_sendpulse.py you@email.com')
        return 0

    to_email = sys.argv[1].strip()
    print(f'\n2. Sending a test email to {to_email} (from {sender_email})...')
    html = ('<div style="font-family:system-ui,sans-serif;padding:24px">'
            '<h2 style="color:#22c55e">LearnAfrica — SendPulse test</h2>'
            '<p>If you can read this, your SendPulse setup works.</p></div>')
    payload = {'email': {
        'subject': 'LearnAfrica SendPulse test',
        'html': base64.b64encode(html.encode('utf-8')).decode('ascii'),
        'text': 'If you can read this, your SendPulse setup works.',
        'from': {'name': sender_name, 'email': sender_email},
        'to': [{'name': to_email, 'email': to_email}],
    }}
    s = requests.post('https://api.sendpulse.com/smtp/emails', json=payload,
                      headers={'Authorization': f'Bearer {token}'}, timeout=20)
    if s.status_code in (200, 201):
        print('   OK — SendPulse accepted the email. Check the inbox (and spam).')
        return 0
    print(f'   FAILED: {s.status_code} {s.text[:300]}')
    print('   If this mentions the sender, verify SENDPULSE_SENDER_EMAIL in SendPulse.')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
