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
    Mock mode: fake payments succeed immediately, no real money moves.
    Set PAYSTACK_SECRET_KEY env var to switch to real Paystack.
    """
    if os.environ.get('PAYSTACK_SECRET_KEY'):
        return 'paystack'
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
        }

    # Mock: record as immediately successful (mimics Paystack behavior)
    return {
        'id': txn_id,
        'receipt_id': receipt_id,
        'provider': 'mock',
        'provider_ref': f'MOCK-PAYOUT-{receipt_id}',
        'status': 'success',
    }


# ── Paystack-specific implementations (only used when PAYSTACK_SECRET_KEY set)─

def _paystack_initialize(user, course, amount, currency, txn_id, payment_method=None, payment_details=None):
    """TODO when activating Paystack:
    POST https://api.paystack.co/transaction/initialize
    Body: {
        email: user['email'],
        amount: int(amount * 100),  # Paystack uses pesewas for GHS
        reference: txn_id,
        currency: currency,
        channels: _paystack_channels_for(payment_method),  # ['mobile_money'] or ['card']
        metadata: {course_id: course['id'], payment_method: payment_method}
    }
    Headers: { Authorization: Bearer <PAYSTACK_SECRET_KEY> }
    Return: { authorization_url, reference }

    Payment method mapping:
        'mtn_momo' / 'vodafone_cash' / 'airteltigo_money' → channels=['mobile_money']
        'card' → channels=['card']
    """
    return {'authorization_url': '', 'reference': f'PAYSTACK-PENDING-{txn_id}'}


def _paystack_verify(reference):
    """TODO when activating Paystack:
    GET https://api.paystack.co/transaction/verify/{reference}
    Parse response.data.status ('success' | 'failed' | 'abandoned' | ...)
    """
    return {'status': 'pending', 'verified': False, 'message': 'Paystack not yet implemented.'}


def _paystack_transfer(instructor, amount, currency, txn_id):
    """TODO when activating Paystack:
    1. POST /transferrecipient (with instructor.payment_details)
    2. POST /transfer (with recipient_code + amount in pesewas)
    Return: { reference, status }
    """
    return {'reference': f'PAYSTACK-PENDING-{txn_id}', 'status': 'pending'}
