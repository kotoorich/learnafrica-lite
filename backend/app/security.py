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
def generate_token(user_id: str, email: str, role: str) -> str:
    """Create a signed JWT token that expires after JWT_EXPIRATION_HOURS."""
    hours = int(current_app.config.get('JWT_EXPIRATION_HOURS', 24))
    exp = datetime.utcnow() + timedelta(hours=hours)
    return jwt.encode(
        {'user_id': user_id, 'email': email, 'role': role, 'exp': exp},
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
def token_required(f):
    """
    Decorator for routes that need any logged-in user.
    Sets g.current_user = {'user_id': ..., 'email': ..., 'role': ...}
    Returns 401 if no valid token is provided.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = _get_token()
        if not token:
            return jsonify({'error': 'Authentication required'}), 401
        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401
        g.current_user = payload
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """
    Decorator for admin-only routes.
    User must be logged in AND have role 'admin' or 'superadmin'.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = _get_token()
        if not token:
            return jsonify({'error': 'Authentication required'}), 401
        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401
        if payload.get('role') not in ('admin', 'superadmin'):
            return jsonify({'error': 'Admin access required'}), 403
        g.current_user = payload
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
        token = _get_token()
        if not token:
            return jsonify({'error': 'Authentication required'}), 401
        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401
        role = payload.get('role')
        if role not in ('instructor', 'admin', 'superadmin'):
            return jsonify({'error': 'Instructor access required'}), 403
        # Only the 'instructor' role needs an approved status; admins always pass
        if role == 'instructor':
            try:
                from flask import current_app
                from .database import get_db
                db = get_db()
                u = db.execute('SELECT instructor_status FROM users WHERE id=?',
                               (payload.get('user_id'),)).fetchone()
                status = u['instructor_status'] if u else None
                if status != 'approved':
                    return jsonify({
                        'error': 'Application Pending',
                        'detail': 'Your instructor application is still being reviewed. You will be notified once approved.',
                        'instructor_status': status or 'none'
                    }), 403
            except Exception:
                # If the DB check fails, default to denying rather than allowing
                return jsonify({'error': 'Could not verify instructor status'}), 503
        g.current_user = payload
        return f(*args, **kwargs)
    return decorated
