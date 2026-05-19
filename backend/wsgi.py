"""
wsgi.py — Production entry point for gunicorn on Render.

IMPORTANT: eventlet.monkey_patch() MUST be called before any other imports.
This is required for WebSocket support with the eventlet worker.

Gunicorn command:
  gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT wsgi:app
"""
# ── MUST BE FIRST — before any other imports ─────────────────────────────────
import eventlet
eventlet.monkey_patch()
# ─────────────────────────────────────────────────────────────────────────────

import os
from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.main import socketio

flask_app = create_app()

# gunicorn imports 'app' from this module
app = flask_app
