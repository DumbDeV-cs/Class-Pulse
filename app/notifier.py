"""WhatsApp delivery. Providers: dryrun, link (manual wa.me), cloud (Meta), twilio."""
import base64
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request


class _Safe(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def render(template, **ctx):
    return template.format_map(_Safe(**ctx))


def normalize_phone(raw, country_code="977"):
    """Return digits-only international number, or '' if it can't be made valid."""
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return ""
    if digits.startswith("00"):
        digits = digits[2:]
    elif digits.startswith("0"):
        digits = country_code + digits.lstrip("0")
    elif len(digits) <= 10:           # local number without country code
        digits = country_code + digits
    return digits if 8 <= len(digits) <= 15 else ""


def wa_link(phone, body):
    return "https://wa.me/%s?text=%s" % (phone, urllib.parse.quote(body))


def _post(url, data, headers):
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")


def send(provider, phone, body, params=None):
    """Return (status, error). status: sent | simulated | manual | failed."""
    params = params or {}
    if not phone:
        return "failed", "Invalid or missing parent phone number"
    if provider == "dryrun":
        return "simulated", None
    if provider == "link":
        return "manual", None
    try:
        if provider == "cloud":
            token, pid = os.environ.get("WHATSAPP_TOKEN"), os.environ.get("WHATSAPP_PHONE_ID")
            if not token or not pid:
                return "failed", "WHATSAPP_TOKEN / WHATSAPP_PHONE_ID not set"
            template = os.environ.get("WHATSAPP_TEMPLATE")
            if template:
                payload = {
                    "messaging_product": "whatsapp", "to": phone, "type": "template",
                    "template": {
                        "name": template,
                        "language": {"code": os.environ.get("WHATSAPP_TEMPLATE_LANG", "en")},
                        "components": [{"type": "body", "parameters": [
                            {"type": "text", "text": str(params.get(k, ""))}
                            for k in ("parent", "student", "date", "class_name", "percentage")
                        ]}],
                    },
                }
            else:
                payload = {"messaging_product": "whatsapp", "to": phone,
                           "type": "text", "text": {"body": body}}
            code, text = _post(
                "https://graph.facebook.com/v20.0/%s/messages" % pid,
                json.dumps(payload).encode(),
                {"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        elif provider == "twilio":
            sid, tok = os.environ.get("TWILIO_SID"), os.environ.get("TWILIO_TOKEN")
            sender = os.environ.get("TWILIO_FROM", "+14155238886")
            if not sid or not tok:
                return "failed", "TWILIO_SID / TWILIO_TOKEN not set"
            data = urllib.parse.urlencode({
                "From": "whatsapp:+" + sender.lstrip("+"), "To": "whatsapp:+" + phone, "Body": body,
            }).encode()
            auth = base64.b64encode(("%s:%s" % (sid, tok)).encode()).decode()
            code, text = _post(
                "https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json" % sid, data,
                {"Authorization": "Basic " + auth})
        else:
            return "failed", "Unknown provider: %s" % provider
    except Exception as exc:  # network errors must never break attendance saving
        return "failed", "%s: %s" % (type(exc).__name__, exc)
    if 200 <= code < 300:
        return "sent", None
    return "failed", "HTTP %s: %s" % (code, text[:300])
