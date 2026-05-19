import eventlet
eventlet.monkey_patch()

import os
from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.main import socketio

flask_app = create_app()
app = flask_app
