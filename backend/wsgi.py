import eventlet
eventlet.monkey_patch()

import os
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
with flask_app.app_context():
    init_db(flask_app)
    db = get_db()
    seed_admin(flask_app, db)
    seed_demo_courses(flask_app, db)
    seed_instructor_guide(flask_app, db)

app = flask_app
