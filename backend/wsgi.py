import eventlet
eventlet.monkey_patch()

import os, sys, traceback
from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.main import socketio
from app.database import init_db, get_db
from app.crud import seed_admin, seed_demo_courses, seed_instructor_guide

# Create the Flask app
flask_app = create_app()

# Initialise database (idempotent — creates tables IF NOT EXISTS, runs
# ADD COLUMN IF NOT EXISTS migrations) then seed baseline data.
#
# CRITICAL: each step is wrapped in try/except so a single failure (e.g.
# a bad column, a migration hitting an unexpected state) doesn't crash
# gunicorn on startup. Any errors are printed to the Render logs but the
# app still boots — so users can still hit endpoints while we investigate.
def _safe_step(label, fn):
    try:
        fn()
        print(f'✅ startup: {label}')
    except Exception as e:
        print(f'❌ startup: {label} FAILED — {e}')
        traceback.print_exc(file=sys.stdout)

with flask_app.app_context():
    _safe_step('init_db',              lambda: init_db(flask_app))
    _safe_step('seed_admin',           lambda: seed_admin(flask_app, get_db()))
    _safe_step('seed_demo_courses',    lambda: seed_demo_courses(flask_app, get_db()))
    _safe_step('seed_instructor_guide',lambda: seed_instructor_guide(flask_app, get_db()))

app = flask_app
