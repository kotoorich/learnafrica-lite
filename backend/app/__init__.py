"""
LearnAfrica Lite — Flask Backend
Package entry point. Import the create_app factory to get the Flask app instance.
"""
from .main import create_app

__all__ = ['create_app']
