"""
Payment provider abstraction layer.

This module defines a single interface for all payment operations.
Switching to Paystack (or any other provider) later only requires
implementing this interface — no other application code changes.

Current implementation: 'stub' — records the intent in DB but does not
hit any external provider. Status starts as 'pending'; admin can mark
it 'success' via the admin verify endpoint until Paystack is configured.

To enable Paystack later, set env var PAYSTACK_SECRET_KEY and add Paystack
calls to _paystack_initialize / _paystack_verify below.
"""
import os
import uuid


def _provider_name():
    """Return 'paystack' if configured, otherwise 'mock'.

    Mock mode: fake payments succeed immediately, no real money moves. It is
    useful for local development but must NEVER run in production — a missing
    PAYSTACK_SECRET_KEY would silently make every purchase free and accept
    forged Paystack notifications. So we refuse to select it in production.
    """
    if os.environ.get('PAYSTACK_SECRET_KEY'):
        return 'paystack'
    if os.environ.get('FLASK_ENV') == 'production':
        raise RuntimeError(
            'PAYSTACK_SECRET_KEY is not set. Refusing to run payments in mock '
            'mode in production — purchases would be free and unverified.'
        )
    return 'mock'


def generate_receipt_id():
    """Short uppercase receipt ID, e.g. LA-RCPT-A1B2-C3D4."""
    raw = uuid.uuid4().hex.upper()
    return f"LA-RCPT-{raw[:4]}-{raw[4:8]}"


def compute_split(amount, instructor_share_pct):
    """Compute instructor + platform share from total amount.

    Args:
        amount: float total transaction amount.
        instructor_share_pct: 0-100 percentage going to instructor.

    Returns:
        (instructor_amount, platform_amount) as floats rounded to 2 dp.
    """
    try:
        amt = float(amount or 0)
        pct = float(instructor_share_pct or 0)
        pct = max(0.0, min(100.0, pct))  # clamp to 0-100
    except (TypeError, ValueError):
        return (0.0, 0.0)
    instr = round(amt * pct / 100.0, 2)
    plat = round(amt - instr, 2)
    return (instr, plat)


# ── Payment initiation ─────────────────────────────────────────────────────

def initiate_payment(user, course, amount, currency='GHS', payment_method='card', payment_details=None):
    """Begin a payment. Returns a dict ready to be stored as a transaction.

    Args:
        user: dict with id, name, email
        course: dict with id, title
        amount: total amount in the currency's main unit (e.g. GHS)
        currency: 'GHS' (Ghana Cedis) by default
        payment_method: one of 'mtn_momo', 'vodafone_cash', 'airteltigo_money', 'card'
        payment_details: dict — {phone: "024..."} for momo, {card_last4: "1234"} for card

    Returns a dict containing everything needed to persist the transaction.
    Provider-specific URLs (e.g. Paystack checkout URL) are stored in
    `provider_ref` field.
    """
    provider = _provider_name()
    receipt_id = generate_receipt_id()
    txn_id = str(uuid.uuid4())

    if provider == 'paystack':
        # When configured: call Paystack API. Otherwise we still fall back to stub
        # so nothing breaks if PAYSTACK_SECRET_KEY is set but not yet wired.
        checkout = _paystack_initialize(user, course, amount, currency, txn_id, payment_method, payment_details)
        return {
            'id': txn_id,
            'receipt_id': receipt_id,
            'provider': 'paystack',
            'provider_ref': checkout.get('reference', ''),
            'checkout_url': checkout.get('authorization_url', ''),
            'status': 'pending',  # Paystack: pending until webhook confirms
            'payment_method': payment_method,
            'payment_details': payment_details or {},
            'error': checkout.get('error'),  # Propagate Paystack error if any
        }

    # ── Stub / Mock provider ──
    # For mock mode, treat every payment as immediately successful so the flow
    # mimics what Paystack will do once configured. NO REAL MONEY MOVES.
    return {
        'id': txn_id,
        'receipt_id': receipt_id,
        'provider': 'mock',
        'provider_ref': f'MOCK-{receipt_id}',
        'checkout_url': '',  # No redirect in mock mode
        'status': 'success',  # Mock: instantly successful
        'payment_method': payment_method,
        'payment_details': payment_details or {},
    }


def verify_payment(provider_ref, provider='mock'):
    """Verify a transaction by provider reference. Returns dict with
    'status': 'success' | 'failed' | 'pending' and 'verified': bool.
    """
    if provider == 'paystack':
        return _paystack_verify(provider_ref)

    # Mock: always success (mimics Paystack success outcome)
    return {'status': 'success', 'verified': True, 'message': 'Mock mode — no real charge.'}


# ── Payout processing ──────────────────────────────────────────────────────

def process_payout(instructor, amount, currency='GHS'):
    """Begin a payout to an instructor. Returns dict to persist as a transaction.

    The instructor.payment_method ('momo' | 'bank') and instructor.payment_details
    (JSON-encoded dict) determine where the money goes.
    """
    provider = _provider_name()
    receipt_id = generate_receipt_id()
    txn_id = str(uuid.uuid4())

    if provider == 'paystack':
        result = _paystack_transfer(instructor, amount, currency, txn_id)
        return {
            'id': txn_id,
            'receipt_id': receipt_id,
            'provider': 'paystack',
            'provider_ref': result.get('reference', ''),
            'status': result.get('status', 'pending'),
            'message': result.get('message', ''),
        }

    # Mock: record as immediately successful (mimics Paystack behavior)
    return {
        'id': txn_id,
        'receipt_id': receipt_id,
        'provider': 'mock',
        'provider_ref': f'MOCK-PAYOUT-{receipt_id}',
        'status': 'success',
    }


# ── Paystack-specific implementations ───────────────────────────────────────
# These run when PAYSTACK_SECRET_KEY is set. Until then, the mock provider is
# used and none of these functions execute. Set PAYSTACK_SECRET_KEY in the
# environment and Paystack takes over automatically — no code changes needed.

def _paystack_channels_for(payment_method):
    """Map our payment_method IDs to Paystack channels.

    These are a *preference* — we restrict the hosted checkout to the channel
    the student picked, but they can still switch method on Paystack's page if
    we pass more than one. Card and bank transfer are available in Ghana;
    mobile money maps to the single `mobile_money` channel.
    """
    if payment_method in ('mtn_momo', 'vodafone_cash', 'airteltigo_money'):
        return ['mobile_money']
    if payment_method == 'card':
        return ['card']
    if payment_method == 'bank_transfer':
        return ['bank_transfer']
    # 'any' (or unknown): let the student choose card, mobile money or bank on
    # Paystack's page — they pick and enter their number there, once.
    return ['card', 'mobile_money', 'bank_transfer']


def _paystack_initialize(user, course, amount, currency, txn_id,
                         payment_method=None, payment_details=None):
    """Initialize a Paystack checkout. Returns {authorization_url, reference}.

    On success the frontend redirects the student to authorization_url.
    Paystack collects the payment and calls our webhook /api/payments/paystack/webhook
    with the final status.
    """
    import requests, json as _json
    secret_key = os.environ.get('PAYSTACK_SECRET_KEY')
    if not secret_key:
        return {'authorization_url': '', 'reference': f'NO-KEY-{txn_id}'}

    # Callback URL — Paystack redirects here after payment.
    # PAYSTACK_CALLBACK_URL should be the frontend page that reads ?reference=... and shows success.
    callback = os.environ.get('PAYSTACK_CALLBACK_URL') or ''

    pd = payment_details or {}
    body = {
        'email':     user.get('email') or f"guest+{txn_id[:8]}@learnafrica.app",
        'amount':    int(round(float(amount) * 100)),  # pesewas
        'reference': txn_id,
        'currency':  currency or 'GHS',
        'channels':  _paystack_channels_for(payment_method),
        'metadata':  {
            'course_id':      course.get('id'),
            'course_title':   course.get('title'),
            'user_id':        user.get('id'),
            'user_name':      user.get('name'),
            'payment_method': payment_method,
            'student_name':   pd.get('name') or '',
            'student_phone':  pd.get('phone') or '',
            'student_city':   pd.get('city') or '',
        },
    }
    if callback:
        body['callback_url'] = callback

    try:
        r = requests.post(
            'https://api.paystack.co/transaction/initialize',
            headers={
                'Authorization': f'Bearer {secret_key}',
                'Content-Type':  'application/json',
            },
            data=_json.dumps(body),
            timeout=15,
        )
        rj = r.json()
        if not r.ok or not rj.get('status'):
            # Log the full Paystack error so it's visible in Render logs.
            import logging
            logging.error(
                f'[PAYSTACK INIT FAILED] status={r.status_code} '
                f'response={rj} body_sent={body}'
            )
            return {
                'authorization_url': '',
                'reference': txn_id,
                'error': rj.get('message') or f'Paystack initialize failed (HTTP {r.status_code}).',
            }
        data = rj.get('data') or {}
        return {
            'authorization_url': data.get('authorization_url') or '',
            'reference':         data.get('reference') or txn_id,
        }
    except Exception as e:
        import logging, traceback
        logging.error(f'[PAYSTACK INIT EXCEPTION] {e}\n{traceback.format_exc()}')
        return {'authorization_url': '', 'reference': txn_id, 'error': f'Paystack error: {e}'}


def _paystack_verify(reference):
    """Verify a Paystack transaction. Returns {status, verified, message, amount?}.
    Called from the webhook or from a manual admin verify.
    """
    import requests
    secret_key = os.environ.get('PAYSTACK_SECRET_KEY')
    if not secret_key:
        return {'status': 'pending', 'verified': False, 'message': 'PAYSTACK_SECRET_KEY not set.'}

    try:
        r = requests.get(
            f'https://api.paystack.co/transaction/verify/{reference}',
            headers={'Authorization': f'Bearer {secret_key}'},
            timeout=15,
        )
        rj = r.json()
        if not r.ok or not rj.get('status'):
            return {'status': 'failed', 'verified': False,
                    'message': rj.get('message') or 'Paystack verify failed.'}
        data = rj.get('data') or {}
        pstat = data.get('status')  # 'success' | 'failed' | 'abandoned' | 'reversed'
        return {
            'status':   'success' if pstat == 'success' else ('failed' if pstat in ('failed', 'reversed') else 'pending'),
            'verified': pstat == 'success',
            'amount':   float(data.get('amount', 0)) / 100.0,  # convert pesewas → GHS
            'currency': data.get('currency', 'GHS'),
            'channel':  data.get('channel', ''),
            'message':  f'Paystack status: {pstat}',
        }
    except Exception as e:
        return {'status': 'pending', 'verified': False, 'message': f'Verify error: {e}'}


def _momo_bank_code(provider):
    """Map a saved mobile money provider label (e.g. 'MTN MoMo', 'Vodafone Cash',
    'Telecel Cash', 'AirtelTigo Money') to its Paystack bank code."""
    p = (provider or '').strip().lower()
    if 'mtn' in p:
        return 'MTN'
    if 'vodafone' in p or 'telecel' in p or p == 'vod':
        return 'VOD'
    if 'airtel' in p or 'tigo' in p or p == 'atl':
        return 'ATL'
    return None


def _paystack_transfer(instructor, amount, currency, txn_id):
    """Send money to the instructor's registered momo or bank account via Paystack Transfers.

    Two-step process:
      1. POST /transferrecipient — register the instructor's account as a recipient
      2. POST /transfer — trigger the actual transfer

    The instructor dict must have:
      - payment_method: 'momo' | 'bank'
      - payment_details: {
          # For momo:
          provider: 'MTN' | 'Vodafone' | 'AirtelTigo',
          phone: '0244123456',
          account_name: 'Kwame Asante',
          # For bank:
          bank_name: 'GCB Bank',
          bank_code: '030100',  # optional; if missing, we look it up via /bank
          account_number: '1234567890',
          account_name: 'Kwame Asante'
        }

    Returns { reference, status: 'success' | 'pending' | 'failed', message }.
    """
    import requests, json as _json

    secret_key = os.environ.get('PAYSTACK_SECRET_KEY')
    if not secret_key:
        return {'reference': f'NO-KEY-{txn_id}', 'status': 'failed',
                'message': 'PAYSTACK_SECRET_KEY not set.'}

    headers = {
        'Authorization': f'Bearer {secret_key}',
        'Content-Type':  'application/json',
    }

    method = instructor.get('payment_method')
    pd     = instructor.get('payment_details') or {}
    name   = instructor.get('name') or pd.get('account_name') or 'Instructor'
    email  = instructor.get('email') or ''

    # ── Step 1: Build the recipient body based on method ─────────────────
    if method == 'momo':
        # Paystack MoMo provider codes:
        #   MTN → 'MTN',  Vodafone → 'VOD',  AirtelTigo → 'ATL'
        prov_code = _momo_bank_code(pd.get('provider'))
        if not prov_code:
            return {'reference': f'BAD-PROVIDER-{txn_id}', 'status': 'failed',
                    'message': f"Unsupported mobile money provider: {pd.get('provider') or '(none)'}"}
        phone = (pd.get('phone') or '').replace(' ', '').replace('-', '')
        if not phone:
            return {'reference': f'NO-PHONE-{txn_id}', 'status': 'failed',
                    'message': 'Instructor has no phone number set for mobile money.'}
        # Paystack expects local format e.g. 0244123456
        recipient_body = {
            'type':           'mobile_money',
            'name':           name,
            'account_number': phone,
            'bank_code':      prov_code,
            'currency':       currency,
        }
    elif method == 'bank':
        acct = (pd.get('account_number') or '').replace(' ', '')
        # Prefer the bank code saved from the dropdown; fall back to a lookup by
        # name for older accounts saved before the dropdown existed.
        bank_code = pd.get('bank_code')
        if not bank_code:
            try:
                bl = requests.get(
                    'https://api.paystack.co/bank',
                    params={'country': 'ghana', 'currency': currency},
                    headers=headers, timeout=10,
                ).json()
                for b in (bl.get('data') or []):
                    if b.get('name', '').lower() == (pd.get('bank_name') or '').lower():
                        bank_code = b.get('code'); break
            except Exception:
                pass
        if not acct or not bank_code:
            return {'reference': f'NO-BANK-{txn_id}', 'status': 'failed',
                    'message': 'Instructor bank account is incomplete (missing bank code or account number).'}
        recipient_body = {
            'type':           'ghipss',  # for Ghana bank; use 'nuban' for Nigeria
            'name':           name,
            'account_number': acct,
            'bank_code':      bank_code,
            'currency':       currency,
        }
    else:
        return {'reference': f'BAD-METHOD-{txn_id}', 'status': 'failed',
                'message': f'Unknown payment_method: {method}'}

    try:
        # Create/get the transfer recipient
        rr = requests.post(
            'https://api.paystack.co/transferrecipient',
            headers=headers,
            data=_json.dumps(recipient_body),
            timeout=15,
        )
        rjson = rr.json()
        if not rr.ok or not rjson.get('status'):
            return {'reference': f'RECIPIENT-FAIL-{txn_id}',
                    'status': 'failed',
                    'message': rjson.get('message') or 'Failed to create recipient.'}
        recipient_code = rjson['data']['recipient_code']

        # Step 2: Trigger the transfer. Paystack amount is in the SMALLEST unit
        # of the currency — for GHS that's pesewas (multiply by 100).
        tr = requests.post(
            'https://api.paystack.co/transfer',
            headers=headers,
            data=_json.dumps({
                'source':    'balance',
                'amount':    int(round(float(amount) * 100)),
                'recipient': recipient_code,
                'reason':    f'LearnAfrica payout {txn_id[:8]}',
                'currency':  currency,
                'reference': txn_id,
            }),
            timeout=20,
        )
        tjson = tr.json()
        if not tr.ok or not tjson.get('status'):
            # Paystack returns code REQUIRES_OTP when transfer OTP is enabled.
            # Surface it distinctly so the caller does NOT treat it as paid.
            if (tjson.get('code') == 'REQUIRES_OTP'
                    or (tjson.get('data') or {}).get('status') == 'otp'):
                return {'reference': (tjson.get('data') or {}).get('reference') or f'OTP-{txn_id}',
                        'status': 'otp',
                        'message': 'Paystack requires an OTP to send this transfer.'}
            return {'reference': tjson.get('data', {}).get('reference') or f'TRANSFER-FAIL-{txn_id}',
                    'status':    'failed',
                    'message':   tjson.get('message') or 'Transfer failed.'}
        data = tjson.get('data') or {}
        pstatus = data.get('status')
        return {
            'reference': data.get('reference') or txn_id,
            # Paystack transfer statuses: 'success', 'pending', 'otp',
            # 'reversed', 'failed', 'abandoned'. 'pending' means OTP is disabled
            # and the transfer is processing; 'otp' means it is NOT sent yet and
            # must be finalized before the money moves.
            'status':    ('success' if pstatus == 'success'
                          else 'failed' if pstatus in ('failed', 'reversed', 'abandoned')
                          else 'otp' if pstatus == 'otp'
                          else 'pending'),
            'message':   'Transfer initiated. Webhook will confirm final status.',
        }
    except requests.exceptions.RequestException as e:
        return {'reference': f'NET-ERR-{txn_id}', 'status': 'failed',
                'message': f'Network error contacting Paystack: {e}'}
    except Exception as e:
        return {'reference': f'ERR-{txn_id}', 'status': 'failed',
                'message': f'Unexpected error: {e}'}
