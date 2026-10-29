"""Demo data: students, placeholder portraits, 5 weeks of attendance and sample messages."""
import os
import random
import uuid
from datetime import date, timedelta

from PIL import Image, ImageDraw, ImageFilter

from . import config, notifier
from .db import get_db, get_settings, init_db, stats_for_students

STUDENTS = {
    "9-A": ["Aarav Sharma", "Anisha Thapa", "Bibek Gurung", "Kritika Shrestha", "Nirajan Karki",
            "Prisha Adhikari", "Sandesh Tamang", "Sneha Maharjan", "Rohan Bhandari", "Samikshya Rai"],
    "10-A": ["Aayush Poudel", "Bidhya Lama", "Dipesh Neupane", "Manisha Basnet", "Prabin Khadka",
             "Riya Joshi", "Sujal Magar", "Trishala Pandey", "Utsav Acharya", "Yamuna Ghimire"],
    "10-B": ["Abhishek Regmi", "Barsha Dahal", "Chirag Bista", "Dikshya Koirala", "Elina Shakya",
             "Hemant Oli", "Kabita Subedi", "Lokesh Rana", "Nabin Chaudhary"],
}
PARENTS = ["Ram", "Sita", "Hari", "Gita", "Krishna", "Radha", "Bishnu", "Laxmi", "Suresh", "Mina"]
PALETTES = [("#ffb199", "#ff0844"), ("#a1c4fd", "#c2e9fb"), ("#84fab0", "#8fd3f4"), ("#fbc2eb", "#a6c1ee"),
            ("#fddb92", "#d1fdff"), ("#cfd9df", "#e2ebf0"), ("#f6d365", "#fda085"), ("#96e6a1", "#d4fc79")]


def _hex(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def portrait(rng):
    """Soft gradient with a simple head-and-shoulders silhouette."""
    size = 480
    a, b = (_hex(x) for x in rng.choice(PALETTES))
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            px[x, y] = tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))
    fg = tuple(int(c * 0.45 + 255 * 0.0) for c in b)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse((90, 340, 390, 700), fill=fg + (200,))
    d.ellipse((165, 110, 315, 280), fill=fg + (225,))
    layer = layer.filter(ImageFilter.GaussianBlur(1.2))
    img.paste(layer, (0, 0), layer)
    name = uuid.uuid4().hex + ".jpg"
    img.save(os.path.join(config.UPLOAD_DIR, name), "JPEG", quality=85)
    return name


def seed():
    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    init_db()
    rng = random.Random(2026)
    with get_db() as db:
        if db.execute("SELECT COUNT(*) FROM students").fetchone()[0]:
            print("Database already has students - skipping seed.")
            return
        s = get_settings(db)
        profiles, ids = {}, {}
        for cls, names in STUDENTS.items():
            for roll, name in enumerate(names, 1):
                phone = "98%08d" % rng.randint(10000000, 99999999)
                parent = "%s %s" % (rng.choice(PARENTS), name.split()[-1])
                cur = db.execute(
                    "INSERT INTO students(roll,name,class_name,parent_name,parent_phone,photo) VALUES (?,?,?,?,?,?)",
                    (roll, name, cls, parent, phone, portrait(rng)))
                sid = cur.lastrowid
                ids[sid] = cls
                profiles[sid] = rng.choices([0.97, 0.90, 0.80, 0.66], weights=[8, 8, 4, 3])[0]

        today = date.today()
        days = [today - timedelta(days=i) for i in range(45, -1, -1)]
        days = [d for d in days if d.weekday() != int(s["weekend_day"])]
        for d in days:
            for sid, cls in ids.items():
                if d == today and cls == "10-B":
                    continue                      # leave one class untaken for the demo
                r = rng.random()
                p = profiles[sid]
                if r < p * 0.93:
                    st = "present"
                elif r < p:
                    st = "late"
                elif rng.random() < 0.18:
                    st = "leave"
                else:
                    st = "absent"
                db.execute("INSERT INTO attendance(student_id,date,status) VALUES (?,?,?)",
                           (sid, d.isoformat(), st))

        # sample message history for the last few school days
        recent = {d.isoformat() for d in days[-4:]}
        stats = stats_for_students(db, list(ids))
        rows = db.execute(
            "SELECT a.date, s.* FROM attendance a JOIN students s ON s.id=a.student_id "
            "WHERE a.status='absent' AND a.date IN (%s) ORDER BY a.date, s.id" % ",".join("?" * len(recent)),
            list(recent)).fetchall()
        for r in rows:
            pct = stats[r["id"]]["percentage"]
            body = notifier.render(
                s["absent_template"], parent=r["parent_name"], student=r["name"], school=s["school_name"],
                class_name=r["class_name"], date=r["date"], percentage="%g" % pct)
            db.execute(
                "INSERT INTO messages(student_id,student_name,kind,date,phone,body,provider,status) VALUES (?,?,?,?,?,?,?,?)",
                (r["id"], r["name"], "absent", r["date"], notifier.normalize_phone(r["parent_phone"]),
                 body, "dryrun", "simulated"))
    print("Seeded %d students." % len(ids))


if __name__ == "__main__":
    seed()
