"""
wsgi.py — WSGI entry point for production servers (gunicorn).

Render and other deployment platforms look for a 'app' or 'application'
variable in this file to start the server.

Command used by Render (see render.yaml):
  gunicorn --worker-class geventwebsocket.gunicorn.workers.GeventWebSocketWorker
           --workers 1 --bind 0.0.0.0:$PORT wsgi:app
"""
from dotenv import load_dotenv
load_dotenv()  # Load .env file (ignored in production where env vars are set directly)

from app import create_app

# Create the Flask app
flask_app = create_app()

# Get the SocketIO instance (needed for gunicorn WebSocket support)
from app.main import socketio

# gunicorn looks for 'app' — give it the SocketIO-wrapped WSGI app
app = socketio.app  # This is the actual WSGI app gunicorn will serve

if __name__ == '__main__':
    # Local development fallback
    import os
    port  = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV', 'development') != 'production'
    socketio.run(flask_app, host='0.0.0.0', port=port, debug=debug,
                 allow_unsafe_werkzeug=True)
