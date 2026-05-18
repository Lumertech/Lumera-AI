"""Medication reminders — auto-scheduled WhatsApp pings based on prescription frequency.

Parses each prescription medication into structured reminder times and stores
entries in `medication_reminders`. A scheduled job picks up due reminders and
sends WhatsApp messages via shared.send_whatsapp_message.
"""
import logging
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Tuple

from shared import db, send_whatsapp_message


# Default dose-times for a given frequency bucket (Indian outpatient norm).
DEFAULT_TIMES = {
    1: ["09:00"],
    2: ["09:00", "21:00"],
    3: ["08:00", "14:00", "20:00"],
    4: ["08:00", "12:00", "16:00", "20:00"],
}


def parse_frequency(freq: str) -> int:
    """Returns number of doses per day. Default 1 if unrecognised."""
    if not freq:
        return 1
    f = freq.lower().strip()
    if "once" in f or "1 time" in f or "od" in f.split() or f == "qd":
        return 1
    if "twice" in f or "2 time" in f or "bd" in f.split() or "bid" in f.split():
        return 2
    if ("three" in f or "thrice" in f or "3 time" in f
            or "tds" in f.split() or "tid" in f.split()):
        return 3
    if ("four" in f or "4 time" in f
            or "qid" in f.split() or "qds" in f.split()):
        return 4
    m = re.search(r"every\s+(\d+)\s*hour", f)
    if m:
        try:
            h = max(1, int(m.group(1)))
            return max(1, min(4, 24 // h))
        except Exception:
            pass
    return 1


def parse_duration_days(duration: str) -> int:
    """Parse duration string into number of days. Default 7."""
    if not duration:
        return 7
    d = duration.lower().strip()
    m = re.search(r"(\d+)\s*day", d)
    if m:
        return max(1, int(m.group(1)))
    m = re.search(r"(\d+)\s*week", d)
    if m:
        return max(1, int(m.group(1)) * 7)
    m = re.search(r"(\d+)\s*month", d)
    if m:
        return max(1, int(m.group(1)) * 30)
    if "sos" in d or "as needed" in d or "prn" in d:
        return 1  # one-off / on-demand
    return 7


async def schedule_reminders_for_prescription(prescription: Dict[str, Any]) -> int:
    """Generate medication reminder docs for each medication in a prescription.
    Returns the number of reminders created. Idempotent per prescription_id.
    """
    pid = prescription.get("id")
    if not pid:
        return 0
    # Idempotency: skip if any reminders already exist for this prescription
    existing = await db.medication_reminders.count_documents({"prescription_id": pid})
    if existing > 0:
        return 0

    today = datetime.now(timezone.utc).date()
    created = 0
    for med in (prescription.get("medications") or []):
        doses_per_day = parse_frequency(med.get("frequency", ""))
        duration_days = parse_duration_days(med.get("duration", ""))
        times = DEFAULT_TIMES.get(doses_per_day, ["09:00"])
        end_date = (today + timedelta(days=duration_days)).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "prescription_id": pid,
            "professional_id": prescription.get("professional_id"),
            "doctor_name": prescription.get("doctor_name"),
            "client_phone": prescription.get("client_phone"),
            "client_name": prescription.get("client_name"),
            "medicine_name": med.get("medicine_name"),
            "dosage": med.get("dosage"),
            "instructions": med.get("instructions", ""),
            "times": times,
            "doses_per_day": doses_per_day,
            "start_date": today.isoformat(),
            "end_date": end_date,
            "status": "active",
            "sent_log": [],  # list of {date, time} strings already sent
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.medication_reminders.insert_one(doc.copy())
        created += 1
    return created


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _now_hm() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M")


async def _process_one(reminder: Dict[str, Any], now_hm: str, today: str) -> bool:
    """Send WhatsApp for a single due reminder. Returns True if sent.
    Caller (send_due_medication_reminders) is responsible for skipping
    expired reminders before invoking this."""
    # Idempotency: do not send twice for same date+time
    sent_log = reminder.get("sent_log", [])
    key = f"{today} {now_hm}"
    if any(s == key for s in sent_log):
        return False

    msg = (
        f"\U0001f48a Medicine reminder\n"
        f"Hi {reminder.get('client_name','')}, time for your dose:\n\n"
        f"{reminder.get('medicine_name','')} — {reminder.get('dosage','')}"
    )
    if reminder.get("instructions"):
        msg += f"\n({reminder['instructions']})"
    msg += f"\n\nPrescribed by Dr. {reminder.get('doctor_name','')}."

    try:
        await send_whatsapp_message(reminder["client_phone"], msg)
    except Exception as e:
        logging.error(f"Medication reminder send failed: {e}")
        return False

    await db.medication_reminders.update_one(
        {"id": reminder["id"]},
        {"$push": {"sent_log": key}, "$set": {"last_sent_at": datetime.now(timezone.utc).isoformat()}},
    )
    return True


async def send_due_medication_reminders() -> int:
    """Scheduled job: find active reminders whose dose time matches the current
    HH:MM (or matched in the last 5 minutes) and send WhatsApp messages."""
    today = _today_str()
    now = datetime.now(timezone.utc)
    # Allow up to a 5-minute window to catch missed minutes
    candidate_times = set()
    for delta in range(0, 6):
        candidate_times.add((now - timedelta(minutes=delta)).strftime("%H:%M"))

    cur = db.medication_reminders.find({"status": "active", "start_date": {"$lte": today}})
    count = 0
    async for rem in cur:
        rem.pop("_id", None)
        if rem.get("end_date") and today > rem["end_date"]:
            # Past end date — mark completed and skip
            await db.medication_reminders.update_one(
                {"id": rem["id"]}, {"$set": {"status": "completed"}}
            )
            continue
        for t in rem.get("times", []):
            if t in candidate_times:
                sent = await _process_one(rem, t, today)
                if sent:
                    count += 1
                break
    if count > 0:
        logging.info(f"Sent {count} medication reminders")
    # Record successful run for /api/health/scheduler observability
    try:
        from shared import record_scheduler_run
        record_scheduler_run("medication_reminders")
    except Exception:
        pass
    return count
