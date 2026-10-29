"""SQLite access and attendance statistics."""
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta

from .config import DB_PATH, DEFAULT_SETTINGS

SCHEMA = """
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll INTEGER NOT NULL,
    name TEXT NOT NULL,
    class_name TEXT NOT NULL,
    parent_name TEXT NOT NULL DEFAULT '',
    parent_phone TEXT NOT NULL DEFAULT '',
    photo TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present','absent','late','leave')),
    UNIQUE (student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(date);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    student_name TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'absent',
    date TEXT NOT NULL,
    phone TEXT NOT NULL,
    body TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def get_db():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as db:
        db.executescript(SCHEMA)
        for key, value in DEFAULT_SETTINGS.items():
            db.execute("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (key, value))


def get_settings(db):
    return {r["key"]: r["value"] for r in db.execute("SELECT key, value FROM settings")}


def percentage(present, late, absent):
    """Attendance % = (present + late) / (present + late + absent). Leave is excused."""
    counted = present + late + absent
    return round(100.0 * (present + late) / counted, 1) if counted else None


def _empty():
    return {"present": 0, "late": 0, "absent": 0, "leave": 0}


def stats_for_students(db, student_ids=None, start=None, end=None):
    """Return {student_id: {present, late, absent, leave, total, percentage}}."""
    sql = "SELECT student_id, status, COUNT(*) AS n FROM attendance WHERE 1=1"
    args = []
    if start:
        sql += " AND date >= ?"
        args.append(start)
    if end:
        sql += " AND date <= ?"
        args.append(end)
    if student_ids is not None:
        if not student_ids:
            return {}
        sql += " AND student_id IN (%s)" % ",".join("?" * len(student_ids))
        args += list(student_ids)
    sql += " GROUP BY student_id, status"
    out = {}
    for r in db.execute(sql, args):
        out.setdefault(r["student_id"], _empty())[r["status"]] = r["n"]
    for s in out.values():
        s["total"] = sum(s[k] for k in ("present", "late", "absent", "leave"))
        s["percentage"] = percentage(s["present"], s["late"], s["absent"])
    return out


def blank_stats():
    s = _empty()
    s.update(total=0, percentage=None)
    return s


def school_days(start, end, weekend_day):
    d, out = start, []
    while d <= end:
        if d.weekday() != weekend_day:
            out.append(d)
        d += timedelta(days=1)
    return out


def today_iso():
    return date.today().isoformat()
