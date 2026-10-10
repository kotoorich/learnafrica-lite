"""
security.py — Authentication and authorisation.

Handles:
  - JWT token generation and decoding
  - Request decorators: @token_required, @admin_required, @instructor_required
  - Password utilities (via werkzeug)
"""
import os, jwt
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, g, current_app


# ── Token helpers ─────────────────────────────────────────────────────────────
def generate_token(user_id: str, email: str, role: str, token_version: int = 0) -> str:
    """Create a signed JWT token that expires after JWT_EXPIRATION_HOURS.

    `token_version` is a per-account counter. When an account's counter is
    bumped (e.g. an emergency password reset), every token carrying the old
    value is rejected immediately, so existing sessions are revoked.
    """
    hours = int(current_app.config.get('JWT_EXPIRATION_HOURS', 24))
    exp = datetime.utcnow() + timedelta(hours=hours)
    return jwt.encode(
        {'user_id': user_id, 'email': email, 'role': role,
         'tv': int(token_version or 0), 'exp': exp},
        current_app.config['JWT_SECRET'],
        algorithm='HS256'
    )


def decode_token(token: str):
    """
    Decode and verify a JWT token.
    Returns the payload dict on success, or None if invalid/expired.
    """
    try:
        return jwt.decode(
            token,
            current_app.config['JWT_SECRET'],
            algorithms=['HS256']
        )
    except Exception:
        return None


def _get_token() -> str:
    """Extract the Bearer token from the Authorization header."""
    header = request.headers.get('Authorization', '')
    return header[7:] if header.startswith('Bearer ') else header


# ── Route decorators ──────────────────────────────────────────────────────────
def _resolve_user(payload):
    """
    Re-validate a decoded token against the live database on every request.

    The JWT carries a snapshot of the user's role, so without this a role change,
    suspension, or deletion would not take effect until the token expired (up to
    24h). Returns (user_dict, None) on success or (None, (response, status)).
    """
    try:
        from .database import get_db, ensure_column as _ensure_column
        db = get_db()
        try:
            _ensure_column(db, 'users', 'token_version', 'INTEGER DEFAULT 0')
        except Exception:
            pass
        row = db.execute(
            'SELECT id, name, email, role, is_active, instructor_status, token_version FROM users WHERE id=?',
            (payload.get('user_id'),)
        ).fetchone()
    except Exception:
        return None, (jsonify({'error': 'Could not verify account'}), 503)

    if not row:
        return None, (jsonify({'error': 'Invalid or expired token'}), 401)
    # is_active may be NULL on legacy rows — only an explicit 0 means suspended.
    if row['is_active'] is not None and not int(row['is_active']):
        return None, (jsonify({'error': 'This account has been suspended.'}), 403)
    # Session revocation: a token minted before the account's counter was bumped
    # (e.g. an emergency password reset) is no longer valid.
    try:
        current_tv = int(row['token_version'] or 0)
    except (KeyError, TypeError, ValueError):
        current_tv = 0
    if int(payload.get('tv', 0) or 0) != current_tv:
        return None, (jsonify({'error': 'Your session has ended. Please sign in again.'}), 401)
    return {
        'user_id':           row['id'],
        'name':              row['name'],
        'email':             row['email'],
        'role':              row['role'],
        'instructor_status': row['instructor_status'],
    }, None


def _authenticate():
    """Validate the bearer token and load the fresh user. Returns (user, err)."""
    token = _get_token()
    if not token:
        return None, (jsonify({'error': 'Authentication required'}), 401)
    payload = decode_token(token)
    if not payload:
        return None, (jsonify({'error': 'Invalid or expired token'}), 401)
    return _resolve_user(payload)


def token_required(f):
    """
    Decorator for routes that need any logged-in user.
    Sets g.current_user = {'user_id': ..., 'email': ..., 'role': ...}
    Returns 401 if no valid token is provided.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        user, err = _authenticate()
        if err:
            return err
        g.current_user = user
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """
    Decorator for admin-only routes.
    User must be logged in AND have role 'admin' or 'superadmin'.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        user, err = _authenticate()
        if err:
            return err
        if user.get('role') not in ('admin', 'superadmin'):
            return jsonify({'error': 'Admin access required'}), 403
        g.current_user = user
        return f(*args, **kwargs)
    return decorated


def superadmin_required(f):
    """
    Decorator for superadmin-only routes.
    Used for high-impact actions such as revoking an earned credential.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        user, err = _authenticate()
        if err:
            return err
        if user.get('role') != 'superadmin':
            return jsonify({'error': 'Superadmin access required'}), 403
        g.current_user = user
        return f(*args, **kwargs)
    return decorated


def instructor_required(f):
    """
    Decorator for instructor-only routes.
    User must be logged in AND have role 'instructor', 'admin', or 'superadmin'.
    For pure 'instructor' role, also requires instructor_status='approved'.
    Admins/superadmins bypass the status check (they always have implicit instructor access).
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        user, err = _authenticate()
        if err:
            return err
        role = user.get('role')
        if role not in ('instructor', 'admin', 'superadmin'):
            return jsonify({'error': 'Instructor access required'}), 403
        # Only the 'instructor' role needs an approved status; admins always pass
        if role == 'instructor' and user.get('instructor_status') != 'approved':
            return jsonify({
                'error': 'Application Pending',
                'detail': 'Your instructor application is still being reviewed. You will be notified once approved.',
                'instructor_status': user.get('instructor_status') or 'none'
            }), 403
        g.current_user = user
        return f(*args, **kwargs)
    return decorated
