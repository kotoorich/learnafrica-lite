import eventlet
eventlet.monkey_patch()

import os
from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.main import socketio
from app.database import get_db
from app.crud import seed_admin, seed_demo_courses, seed_instructor_guide

flask_app = create_app()

with flask_app.app_context():
    # SOLUTION: Ensure all tables are created BEFORE running seeds
    # Try common db import locations
    try:
        from app import db as models_db
    except ImportError:
        try:
            from app.models import db as models_db
        except ImportError:
            from app.database import db as models_db
    
    print("Creating database tables...")
    models_db.create_all()
    print("Tables created successfully.")
    
    # Now run seeds
    db = get_db()
    seed_admin(flask_app, db)
    seed_demo_courses(flask_app, db)
    seed_instructor_guide(flask_app, db)

app = flask_app
