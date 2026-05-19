"""
wsgi.py — Production entry point for gunicorn on Render.

Gunicorn command (set in Render's Start Command or Procfile):
  gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT wsgi:app
"""
import os
from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.main import socketio

# Create and configure the Flask app (also runs init_db + seeding)
flask_app = create_app()

# 'app' is what gunicorn imports — must be the SocketIO-wrapped WSGI app
# socketio.init_app() was called inside create_app, so socketio wraps flask_app
app = flask_app  # eventlet worker handles WebSocket upgrades automatically
