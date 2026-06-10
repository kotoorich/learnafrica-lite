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
    """Return 'paystack' if configured, otherwise 'stub'."""
    if os.environ.get('PAYSTACK_SECRET_KEY'):
        return 'paystack'
    return 'stub'


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

def initiate_payment(user, course, amount, currency='GHS', payment_method='card'):
    """Begin a payment. Returns a dict ready to be stored as a transaction.

    The dict contains everything needed to persist the record; the caller
    must save it to the `transactions` table and return the relevant
    fields to the frontend.

    Provider-specific URLs (e.g. Paystack checkout URL) are stored in
    `provider_ref` field as JSON or plain string.
    """
    provider = _provider_name()
    receipt_id = generate_receipt_id()
    txn_id = str(uuid.uuid4())

    if provider == 'paystack':
        # When configured: call Paystack API. For now we still return a stub
        # because we don't want to fail in production without keys.
        checkout = _paystack_initialize(user, course, amount, currency, txn_id)
        return {
            'id': txn_id,
            'receipt_id': receipt_id,
            'provider': 'paystack',
            'provider_ref': checkout.get('reference', ''),
            'checkout_url': checkout.get('authorization_url', ''),
            'status': 'pending',
        }

    # Stub provider — record only, no external call.
    return {
        'id': txn_id,
        'receipt_id': receipt_id,
        'provider': 'stub',
        'provider_ref': f'STUB-{receipt_id}',
        'checkout_url': '',  # frontend treats empty as "manual" / no redirect
        'status': 'pending',
    }


def verify_payment(provider_ref, provider='stub'):
    """Verify a transaction by provider reference. Returns dict with
    'status': 'success' | 'failed' | 'pending' and 'verified': bool.
    """
    if provider == 'paystack':
        return _paystack_verify(provider_ref)

    # Stub: always returns pending (admin must mark manually)
    return {'status': 'pending', 'verified': False, 'message': 'Stub provider — verify manually via admin panel.'}


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

    # Stub: record only
    return {
        'id': txn_id,
        'receipt_id': receipt_id,
        'provider': 'stub',
        'provider_ref': f'STUB-PAYOUT-{receipt_id}',
        'status': 'pending',
    }


# ── Paystack-specific implementations (only used when PAYSTACK_SECRET_KEY set)─

def _paystack_initialize(user, course, amount, currency, txn_id):
    """TODO when activating Paystack:
    POST https://api.paystack.co/transaction/initialize
    Body: { email, amount (in pesewas — multiply by 100), reference: txn_id, currency }
    Headers: { Authorization: Bearer <SECRET_KEY> }
    Return: { authorization_url, reference }
    """
    # Safe fallback — should not run unless this function is implemented.
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
