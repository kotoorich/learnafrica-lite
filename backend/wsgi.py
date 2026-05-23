import eventlet
eventlet.monkey_patch()

import os
from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.main import socketio
from app.database import get_db
from app.crud import seed_admin, seed_demo_courses

# Create the Flask app (also runs init_db)
flask_app = create_app()

# Seed data on every startup (seed functions check if data exists first)
with flask_app.app_context():
    db = get_db()
    seed_admin(flask_app, db)
    seed_demo_courses(flask_app, db)

app = flask_app
