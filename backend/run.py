"""
run.py — Development server entry point.

Run this file locally during development:
  python run.py

Do NOT use this in production — use wsgi.py + gunicorn instead.
"""
import os
from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.main import socketio
from app.database import init_db
from app.crud import seed_admin, seed_demo_courses

# Create the app
flask_app = create_app()

# Initialise database and seed data
with flask_app.app_context():
    from app.database import get_db
    init_db(flask_app)
    db = get_db()
    seed_admin(flask_app, db)
    seed_demo_courses(flask_app, db)

if __name__ == '__main__':
    port  = int(os.environ.get('PORT', 5000))
    print(f"""
============================================================
🚀 LearnAfrica Lite  →  http://localhost:{port}
============================================================
📖 API Docs: http://localhost:{port}/api/health
============================================================
""")
    socketio.run(flask_app, host='0.0.0.0', port=port,
                 debug=True, allow_unsafe_werkzeug=True)
