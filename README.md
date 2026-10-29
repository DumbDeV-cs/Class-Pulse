# Hajiri — Smart Attendance System

Take attendance in seconds, automatically WhatsApp the parents of absent students, and track attendance
percentages per student and class. Python (Flask + SQLite) backend with an app-style web UI that also
installs on a phone ("Add to Home Screen").

## Run it

```bash
pip install -r requirements.txt
python run.py --seed          # first run: loads 29 demo students + 6 weeks of history
python run.py                 # afterwards
```
Open http://127.0.0.1:5000 (change with `--port`). To start with your own students, run without
`--seed` and use **Students → Add student**.

To use it from phones on the school Wi-Fi, set a password first:
`ATTENDANCE_PASSWORD=yourpassword python run.py --host 0.0.0.0` (HTTP basic auth, any username).

## Features
- **Fast roll call** — everyone starts Present; tap exceptions (Late / Absent / Leave). Per class, per date, editable later.
- **WhatsApp to parents of absent students** on save. Re-saving never double-messages a parent.
- **Attendance %** per student (ring + 12-week heatmap), class and school.
  `% = (present + late) / (present + late + absent)`; leave is excused.
- **Student profiles with photos** — upload or drag-drop, auto square-cropped. Rank, streak, parent contact, message history.
- **Dashboard** — today's rate, 7-day trend, class cards, students below your threshold with a one-tap parent alert.
- **Reports** — date range + class filter, sortable, CSV export (spreadsheet-formula safe).
- **Message log** — status, error reason, resend, open in WhatsApp.
- **Settings** — threshold, country code (default 977), editable message templates with live preview, dark mode.

## WhatsApp setup (Settings → WhatsApp delivery)
| Mode | What it does | Needs |
|---|---|---|
| Demo | Logs messages only | nothing |
| Click-to-send | Save, tap "Send", WhatsApp opens with the message filled in | a phone or WhatsApp Web |
| WhatsApp Cloud API | Fully automatic | Meta business account; `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` in `.env` |
| Twilio | Fully automatic | `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM` in `.env` |

Copy `.env.example` to `.env`. Credentials are never stored in the database.

**Important:** WhatsApp only lets a business message someone first using an *approved template*. For automatic
sending to parents, set `WHATSAPP_TEMPLATE` to your approved template (body variables in order:
parent, student, date, class, percentage). Use Settings → "Send test message" before going live.
The automatic providers were not tested against live accounts (no credentials here); demo and click-to-send were.

## Layout
```
run.py            start server        app/routes.py    JSON API
app/db.py         schema + stats      app/notifier.py  WhatsApp providers
app/seed.py       demo data           static/          UI (HTML/CSS/JS, no build step)
```
The JSON API is app-agnostic, so a native Flutter client can be added later against the same endpoints.
