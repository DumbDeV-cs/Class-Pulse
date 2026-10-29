import hmac
import os

from flask import Flask, Response, request, send_from_directory

from . import config
from .db import init_db


def create_app():
    os.makedirs(os.path.dirname(config.DB_PATH), exist_ok=True)
    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    init_db()

    app = Flask(__name__, static_folder=config.STATIC_DIR, static_url_path="/static")
    app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

    password = os.environ.get("ATTENDANCE_PASSWORD")
    if password:
        @app.before_request
        def _auth():
            auth = request.authorization
            if not auth or not hmac.compare_digest(auth.password or "", password):
                return Response("Login required", 401,
                                {"WWW-Authenticate": 'Basic realm="Attendance"'})

    from .routes import api
    app.register_blueprint(api)

    @app.get("/")
    def index():
        return send_from_directory(config.STATIC_DIR, "index.html")

    @app.get("/uploads/<path:name>")
    def uploads(name):
        return send_from_directory(config.UPLOAD_DIR, name, max_age=86400)

    return app
