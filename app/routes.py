"""JSON API for the attendance app."""
import csv
import io
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

from flask import Blueprint, Response, jsonify, request
from PIL import Image, ImageOps, UnidentifiedImageError

from . import config, notifier
from .db import (blank_stats, get_db, get_settings, percentage, school_days,
                 stats_for_students, today_iso)

api = Blueprint("api", __name__, url_prefix="/api")


# ----------------------------------------------------------------- helpers
class ApiError(Exception):
    def __init__(self, message, code=400):
        super().__init__(message)
        self.message, self.code = message, code


@api.errorhandler(ApiError)
def _api_error(err):
    return jsonify(error=err.message), err.code


def parse_date(value, default=None):
    if not value:
        return default
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise ApiError("Invalid date: %r (use YYYY-MM-DD)" % value)


def photo_url(name):
    return "/uploads/" + name if name else None


def student_dict(row, stats=None):
    d = {k: row[k] for k in ("id", "roll", "name", "class_name", "parent_name", "parent_phone")}
    d["photo"] = photo_url(row["photo"])
    d["stats"] = stats or blank_stats()
    return d


def band(pct, threshold):
    if pct is None:
        return "none"
    if pct >= threshold:
        return "good"
    return "warn" if pct >= threshold - 10 else "critical"


def save_photo(file_storage):
    """Validate, square-crop and re-encode an uploaded image as JPEG."""
    try:
        img = Image.open(file_storage.stream)
        img.load()
    except (UnidentifiedImageError, OSError):
        raise ApiError("That file is not a valid image")
    img = ImageOps.exif_transpose(img).convert("RGB")
    img = ImageOps.fit(img, (480, 480), Image.LANCZOS)
    name = uuid.uuid4().hex + ".jpg"
    img.save(os.path.join(config.UPLOAD_DIR, name), "JPEG", quality=86, optimize=True)
    return name


def remove_photo(name):
    if name:
        try:
            os.remove(os.path.join(config.UPLOAD_DIR, os.path.basename(name)))
        except OSError:
            pass


def message_dict(r):
    return {
        "id": r["id"], "student_id": r["student_id"], "student_name": r["student_name"],
        "kind": r["kind"], "date": r["date"], "phone": r["phone"], "body": r["body"],
        "provider": r["provider"], "status": r["status"], "error": r["error"],
        "created_at": r["created_at"],
        "link": notifier.wa_link(r["phone"], r["body"]) if r["phone"] else None,
    }


def compose(db, student, kind, on_date, settings, pct):
    template = settings["absent_template"] if kind == "absent" else settings["low_template"]
    params = {
        "parent": student["parent_name"] or "Parent/Guardian",
        "student": student["name"], "class_name": student["class_name"],
        "date": on_date, "percentage": "—" if pct is None else ("%g" % pct),
        "school": settings["school_name"], "threshold": settings["threshold"],
    }
    return notifier.render(template, **params), params


def dispatch(db, items, settings):
    """items: [(student_row, kind, date, pct)] -> list of stored message dicts."""
    provider = settings["provider"]
    prepared = []
    for student, kind, on_date, pct in items:
        body, params = compose(db, student, kind, on_date, settings, pct)
        phone = notifier.normalize_phone(student["parent_phone"], settings["country_code"])
        prepared.append((student, kind, on_date, phone, body, params))
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda p: notifier.send(provider, p[3], p[4], p[5]), prepared))
    out = []
    for (student, kind, on_date, phone, body, _), (status, error) in zip(prepared, results):
        cur = db.execute(
            "INSERT INTO messages(student_id, student_name, kind, date, phone, body, provider,"
            " status, error) VALUES (?,?,?,?,?,?,?,?,?)",
            (student["id"], student["name"], kind, on_date, phone, body, provider, status, error))
        out.append(message_dict(db.execute("SELECT * FROM messages WHERE id=?", (cur.lastrowid,)).fetchone()))
    return out


def student_form(db):
    form = request.form
    name = (form.get("name") or "").strip()
    cls = (form.get("class_name") or "").strip()
    if not name or not cls:
        raise ApiError("Name and class are required")
    try:
        roll = int(form.get("roll") or 0)
    except ValueError:
        raise ApiError("Roll number must be a number")
    phone = (form.get("parent_phone") or "").strip()
    cc = get_settings(db)["country_code"]
    if phone and not notifier.normalize_phone(phone, cc):
        raise ApiError("Parent phone number looks invalid")
    return dict(name=name, class_name=cls, roll=roll,
                parent_name=(form.get("parent_name") or "").strip(), parent_phone=phone)


# --------------------------------------------------------------- bootstrap
@api.get("/bootstrap")
def bootstrap():
    with get_db() as db:
        s = get_settings(db)
        classes = [r[0] for r in db.execute(
            "SELECT DISTINCT class_name FROM students WHERE active=1 ORDER BY class_name")]
    return jsonify(settings=s, classes=classes, today=today_iso())


# --------------------------------------------------------------- dashboard
@api.get("/dashboard")
def dashboard():
    on = parse_date(request.args.get("date"), today_iso())
    with get_db() as db:
        s = get_settings(db)
        threshold = float(s["threshold"])
        students = db.execute("SELECT * FROM students WHERE active=1").fetchall()
        ids = [r["id"] for r in students]
        overall = stats_for_students(db, ids)
        today_rows = {r["student_id"]: r["status"] for r in db.execute(
            "SELECT student_id, status FROM attendance WHERE date=?", (on,))}

        by_class = {}
        for st in students:
            c = by_class.setdefault(st["class_name"], {
                "class_name": st["class_name"], "students": 0, "present": 0, "late": 0,
                "absent": 0, "leave": 0, "marked": 0, "att": [0, 0, 0]})
            c["students"] += 1
            status = today_rows.get(st["id"])
            if status:
                c[status] += 1
                c["marked"] += 1
            o = overall.get(st["id"])
            if o:
                c["att"][0] += o["present"]; c["att"][1] += o["late"]; c["att"][2] += o["absent"]
        classes = []
        for c in sorted(by_class.values(), key=lambda x: x["class_name"]):
            a = c.pop("att")
            c["today_rate"] = percentage(c["present"], c["late"], c["absent"])
            c["overall"] = percentage(*a)
            classes.append(c)

        t = {k: sum(c[k] for c in classes) for k in ("students", "present", "late", "absent", "leave", "marked")}
        t["rate"] = percentage(t["present"], t["late"], t["absent"])

        # 7 most recent school days up to `on`
        end = date.fromisoformat(on)
        days = school_days(end - timedelta(days=12), end, int(s["weekend_day"]))[-7:]
        trend = []
        for d in days:
            r = {x["status"]: x["n"] for x in db.execute(
                "SELECT status, COUNT(*) n FROM attendance WHERE date=? GROUP BY status", (d.isoformat(),))}
            trend.append({"date": d.isoformat(), "rate": percentage(r.get("present", 0), r.get("late", 0), r.get("absent", 0))})

        a = [sum(o[k] for o in overall.values()) for k in ("present", "late", "absent")]
        risk = []
        for st in students:
            o = overall.get(st["id"])
            if o and o["total"] >= 5 and o["percentage"] is not None and o["percentage"] < threshold:
                risk.append(student_dict(st, o))
        risk.sort(key=lambda x: x["stats"]["percentage"])
        msgs = [message_dict(r) for r in db.execute("SELECT * FROM messages ORDER BY id DESC LIMIT 5")]
        total_msgs = db.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    return jsonify(date=on, today=t, classes=classes, trend=trend, overall=percentage(*a),
                   at_risk=risk[:6], at_risk_count=len(risk), messages=msgs, message_count=total_msgs)


# ---------------------------------------------------------------- students
@api.get("/students")
def list_students():
    cls, q = request.args.get("class"), (request.args.get("q") or "").strip().lower()
    with get_db() as db:
        sql, args = "SELECT * FROM students WHERE active=1", []
        if cls:
            sql += " AND class_name=?"; args.append(cls)
        rows = db.execute(sql + " ORDER BY class_name, roll, name", args).fetchall()
        stats = stats_for_students(db, [r["id"] for r in rows])
    out = [student_dict(r, stats.get(r["id"])) for r in rows
           if not q or q in r["name"].lower() or q in str(r["roll"])]
    return jsonify(out)


@api.post("/students")
def create_student():
    with get_db() as db:
        f = student_form(db)
        photo = save_photo(request.files["photo"]) if request.files.get("photo") else None
        cur = db.execute(
            "INSERT INTO students(roll, name, class_name, parent_name, parent_phone, photo)"
            " VALUES (:roll,:name,:class_name,:parent_name,:parent_phone,:photo)", dict(f, photo=photo))
        row = db.execute("SELECT * FROM students WHERE id=?", (cur.lastrowid,)).fetchone()
    return jsonify(student_dict(row)), 201


@api.put("/students/<int:sid>")
def update_student(sid):
    with get_db() as db:
        row = db.execute("SELECT * FROM students WHERE id=?", (sid,)).fetchone()
        if not row:
            raise ApiError("Student not found", 404)
        f = student_form(db)
        photo = row["photo"]
        if request.files.get("photo"):
            new = save_photo(request.files["photo"])
            remove_photo(photo)
            photo = new
        elif request.form.get("remove_photo") == "1":
            remove_photo(photo)
            photo = None
        db.execute("UPDATE students SET roll=:roll, name=:name, class_name=:class_name,"
                   " parent_name=:parent_name, parent_phone=:parent_phone, photo=:photo WHERE id=:id",
                   dict(f, photo=photo, id=sid))
        row = db.execute("SELECT * FROM students WHERE id=?", (sid,)).fetchone()
        stats = stats_for_students(db, [sid]).get(sid)
    return jsonify(student_dict(row, stats))


@api.delete("/students/<int:sid>")
def delete_student(sid):
    with get_db() as db:
        row = db.execute("SELECT photo FROM students WHERE id=?", (sid,)).fetchone()
        if not row:
            raise ApiError("Student not found", 404)
        db.execute("DELETE FROM students WHERE id=?", (sid,))
    remove_photo(row["photo"])
    return jsonify(ok=True)


@api.get("/students/<int:sid>")
def student_profile(sid):
    with get_db() as db:
        row = db.execute("SELECT * FROM students WHERE id=?", (sid,)).fetchone()
        if not row:
            raise ApiError("Student not found", 404)
        s = get_settings(db)
        stats = stats_for_students(db, [sid]).get(sid)
        start = (date.today() - timedelta(days=89)).isoformat()
        history = {r["date"]: r["status"] for r in db.execute(
            "SELECT date, status FROM attendance WHERE student_id=? AND date>=? ORDER BY date", (sid, start))}
        # current streak of consecutive present/late school days, newest first
        streak = 0
        for r in db.execute("SELECT status FROM attendance WHERE student_id=? ORDER BY date DESC", (sid,)):
            if r["status"] in ("present", "late"):
                streak += 1
            elif r["status"] == "leave":
                continue
            else:
                break
        rank = db.execute("SELECT * FROM students WHERE active=1 AND class_name=?", (row["class_name"],)).fetchall()
        cstats = stats_for_students(db, [r["id"] for r in rank])
        ordered = sorted((r["id"] for r in rank),
                         key=lambda i: -(cstats.get(i, {}).get("percentage") or -1))
        msgs = [message_dict(r) for r in db.execute(
            "SELECT * FROM messages WHERE student_id=? ORDER BY id DESC LIMIT 8", (sid,))]
    d = student_dict(row, stats)
    d.update(history=history, streak=streak, class_rank=ordered.index(sid) + 1,
             class_size=len(ordered), messages=msgs, band=band(stats and stats["percentage"], float(s["threshold"])))
    return jsonify(d)


# -------------------------------------------------------------- attendance
@api.get("/attendance")
def get_attendance():
    cls, on = request.args.get("class"), parse_date(request.args.get("date"), today_iso())
    if not cls:
        raise ApiError("class is required")
    with get_db() as db:
        rows = db.execute("SELECT * FROM students WHERE active=1 AND class_name=? ORDER BY roll, name", (cls,)).fetchall()
        ids = [r["id"] for r in rows]
        marked = {r["student_id"]: r["status"] for r in db.execute(
            "SELECT student_id, status FROM attendance WHERE date=?", (on,)) if r["student_id"] in ids}
        notified = {r["student_id"] for r in db.execute(
            "SELECT student_id FROM messages WHERE kind='absent' AND date=? AND status!='failed'", (on,))}
        stats = stats_for_students(db, ids)
        s = get_settings(db)
    out = []
    for r in rows:
        d = student_dict(r, stats.get(r["id"]))
        d["status"] = marked.get(r["id"])
        d["notified"] = r["id"] in notified
        out.append(d)
    weekend = date.fromisoformat(on).weekday() == int(s["weekend_day"])
    return jsonify(date=on, class_name=cls, students=out, taken=bool(marked), weekend=weekend)


@api.post("/attendance")
def save_attendance():
    body = request.get_json(silent=True) or {}
    on = parse_date(body.get("date"))
    if not on:
        raise ApiError("date is required")
    if on > today_iso():
        raise ApiError("Cannot mark attendance for a future date")
    records = body.get("records") or []
    if not records:
        raise ApiError("No attendance records supplied")
    for r in records:
        if r.get("status") not in config.STATUSES:
            raise ApiError("Invalid status: %r" % r.get("status"))
    notify = bool(body.get("notify"))
    with get_db() as db:
        s = get_settings(db)
        ids = [int(r["student_id"]) for r in records]
        found = {r["id"]: r for r in db.execute(
            "SELECT * FROM students WHERE active=1 AND id IN (%s)" % ",".join("?" * len(ids)), ids)}
        if len(found) != len(set(ids)):
            raise ApiError("One or more students do not exist")
        for r in records:
            db.execute("INSERT INTO attendance(student_id, date, status) VALUES (?,?,?)"
                       " ON CONFLICT(student_id, date) DO UPDATE SET status=excluded.status",
                       (int(r["student_id"]), on, r["status"]))
        counts = {k: 0 for k in config.STATUSES}
        for r in records:
            counts[r["status"]] += 1
        sent = []
        if notify:
            already = {r["student_id"] for r in db.execute(
                "SELECT student_id FROM messages WHERE kind='absent' AND date=? AND status!='failed'", (on,))}
            stats = stats_for_students(db, ids)
            items = [(found[int(r["student_id"])], "absent", on,
                      stats.get(int(r["student_id"]), {}).get("percentage"))
                     for r in records if r["status"] == "absent" and int(r["student_id"]) not in already]
            sent = dispatch(db, items, s)
    return jsonify(ok=True, counts=counts, messages=sent)


# ----------------------------------------------------------------- reports
def report_rows(db, cls, start, end):
    s = get_settings(db)
    threshold = float(s["threshold"])
    sql, args = "SELECT * FROM students WHERE active=1", []
    if cls:
        sql += " AND class_name=?"; args.append(cls)
    rows = db.execute(sql + " ORDER BY class_name, roll", args).fetchall()
    stats = stats_for_students(db, [r["id"] for r in rows], start, end)
    out = []
    for r in rows:
        d = student_dict(r, stats.get(r["id"]))
        d["band"] = band(d["stats"]["percentage"], threshold)
        out.append(d)
    return out, threshold


@api.get("/reports")
def reports():
    cls = request.args.get("class") or None
    start, end = parse_date(request.args.get("start")), parse_date(request.args.get("end"))
    with get_db() as db:
        rows, threshold = report_rows(db, cls, start, end)
    tot = [sum(r["stats"][k] for r in rows) for k in ("present", "late", "absent")]
    summary = {
        "students": len(rows), "average": percentage(*tot), "threshold": threshold,
        "below": sum(1 for r in rows if r["band"] in ("warn", "critical")),
        "perfect": sum(1 for r in rows if r["stats"]["percentage"] == 100),
    }
    return jsonify(rows=rows, summary=summary)


@api.get("/reports/export.csv")
def export_csv():
    cls = request.args.get("class") or None
    start, end = parse_date(request.args.get("start")), parse_date(request.args.get("end"))
    with get_db() as db:
        rows, _ = report_rows(db, cls, start, end)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Class", "Roll", "Name", "Parent", "Parent phone", "Present", "Late", "Absent", "Leave", "Attendance %"])
    for r in rows:
        st = r["stats"]
        w.writerow([_safe(r["class_name"]), r["roll"], _safe(r["name"]), _safe(r["parent_name"]),
                    _safe(r["parent_phone"]), st["present"], st["late"], st["absent"], st["leave"],
                    "" if st["percentage"] is None else st["percentage"]])
    return Response("﻿" + buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=attendance-report.csv"})


def _safe(v):
    """Neutralise spreadsheet formula injection in exported text cells."""
    v = str(v or "")
    return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v


# ---------------------------------------------------------------- messages
@api.get("/messages")
def list_messages():
    with get_db() as db:
        rows = db.execute("SELECT * FROM messages ORDER BY id DESC LIMIT 200").fetchall()
    return jsonify([message_dict(r) for r in rows])


@api.post("/messages/<int:mid>/resend")
def resend(mid):
    with get_db() as db:
        m = db.execute("SELECT * FROM messages WHERE id=?", (mid,)).fetchone()
        if not m:
            raise ApiError("Message not found", 404)
        s = get_settings(db)
        st = db.execute("SELECT * FROM students WHERE id=?", (m["student_id"],)).fetchone()
        phone = notifier.normalize_phone(st["parent_phone"], s["country_code"]) if st else m["phone"]
        params = {"parent": (st["parent_name"] if st else "") or "Parent/Guardian",
                  "student": m["student_name"], "class_name": st["class_name"] if st else "",
                  "date": m["date"], "percentage": ""}
        status, error = notifier.send(s["provider"], phone, m["body"], params)
        db.execute("UPDATE messages SET status=?, error=?, phone=?, provider=? WHERE id=?",
                   (status, error, phone, s["provider"], mid))
        row = db.execute("SELECT * FROM messages WHERE id=?", (mid,)).fetchone()
    return jsonify(message_dict(row))


@api.post("/notify/low")
def notify_low():
    sid = (request.get_json(silent=True) or {}).get("student_id")
    with get_db() as db:
        st = db.execute("SELECT * FROM students WHERE id=? AND active=1", (sid,)).fetchone()
        if not st:
            raise ApiError("Student not found", 404)
        s = get_settings(db)
        pct = stats_for_students(db, [st["id"]]).get(st["id"], {}).get("percentage")
        sent = dispatch(db, [(st, "low", today_iso(), pct)], s)
    return jsonify(sent[0])


# ---------------------------------------------------------------- settings
EDITABLE = ("school_name", "threshold", "country_code", "provider", "absent_template", "low_template")


@api.get("/settings")
def get_settings_api():
    with get_db() as db:
        s = get_settings(db)
    creds = {"cloud": bool(os.environ.get("WHATSAPP_TOKEN") and os.environ.get("WHATSAPP_PHONE_ID")),
             "twilio": bool(os.environ.get("TWILIO_SID") and os.environ.get("TWILIO_TOKEN"))}
    return jsonify(settings={k: s[k] for k in EDITABLE}, credentials=creds)


@api.put("/settings")
def put_settings():
    body = request.get_json(silent=True) or {}
    with get_db() as db:
        for k in EDITABLE:
            if k not in body:
                continue
            v = str(body[k]).strip()
            if k == "provider" and v not in ("dryrun", "link", "cloud", "twilio"):
                raise ApiError("Unknown provider")
            if k == "threshold":
                try:
                    if not 1 <= float(v) <= 100:
                        raise ValueError
                except ValueError:
                    raise ApiError("Threshold must be between 1 and 100")
            if k == "country_code" and not v.isdigit():
                raise ApiError("Country code must be digits only, e.g. 977")
            if not v:
                raise ApiError("%s cannot be empty" % k.replace("_", " "))
            db.execute("UPDATE settings SET value=? WHERE key=?", (v, k))
    return get_settings_api()


@api.post("/settings/test")
def test_message():
    phone_raw = (request.get_json(silent=True) or {}).get("phone", "")
    with get_db() as db:
        s = get_settings(db)
    phone = notifier.normalize_phone(phone_raw, s["country_code"])
    if not phone:
        raise ApiError("Enter a valid phone number")
    body = "Test message from %s attendance system. WhatsApp delivery is working." % s["school_name"]
    status, error = notifier.send(s["provider"], phone, body, {})
    return jsonify(status=status, error=error, link=notifier.wa_link(phone, body))
