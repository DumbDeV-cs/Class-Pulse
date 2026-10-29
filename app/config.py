"""Paths and environment configuration (secrets come only from the environment)."""
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_dotenv(path):
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(os.path.join(BASE_DIR, ".env"))

DB_PATH = os.environ.get("ATTENDANCE_DB", os.path.join(BASE_DIR, "data", "attendance.db"))
UPLOAD_DIR = os.environ.get("ATTENDANCE_UPLOADS", os.path.join(BASE_DIR, "uploads"))
STATIC_DIR = os.path.join(BASE_DIR, "static")

DEFAULT_SETTINGS = {
    "school_name": "Himalayan Public School",
    "threshold": "75",              # minimum healthy attendance %
    "country_code": "977",          # Nepal
    "provider": "dryrun",           # dryrun | link | cloud | twilio
    "weekend_day": "5",             # Python weekday(): Saturday = 5
    "absent_template": (
        "Namaste {parent}, this is {school}. {student} ({class_name}) was marked ABSENT "
        "on {date}. Current attendance: {percentage}%. Please contact the school if this "
        "is unexpected."
    ),
    "low_template": (
        "Namaste {parent}, {student}'s attendance at {school} is {percentage}%, which is "
        "below the required {threshold}%. Please help ensure regular attendance."
    ),
}

STATUSES = ("present", "absent", "late", "leave")
