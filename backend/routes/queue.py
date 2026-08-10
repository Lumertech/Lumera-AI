"""OPD Queue Engine — token generation, status pipeline and Waiting Room feed.

Status pipeline: scheduled → checked_in → in_consultation → completed
                                                       ↓
                                                   no_show / cancelled

Tokens are auto-assigned at check-in in the form "A-01", "A-02" per doctor per day.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone, date as _date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from shared import db, get_current_user, resolve_owner_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/queue", tags=["queue"])

VALID_TRANSITIONS = {
    "scheduled": {"checked_in", "no_show", "cancelled"},
    "checked_in": {"in_consultation", "no_show", "cancelled"},
    "in_consultation": {"completed"},
    "completed": set(),  # terminal
    "no_show": {"checked_in"},  # allow re-check-in if patient shows up late
    "cancelled": set(),
}


class StatusUpdate(BaseModel):
    status: str
    note: Optional[str] = None


class WaitingRoomTokenCreate(BaseModel):
    doctor_id: Optional[str] = None  # override; else current user


async def _next_token(owner_id: str, today: str) -> str:
    """Compute the next token number for the doctor on the given day."""
    count = await db.appointments.count_documents({
        "professional_id": owner_id,
        "appointment_date": today,
        "token_number": {"$exists": True, "$ne": None},
    })
    return f"A-{count + 1:02d}"


def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


@router.get("/today")
async def today_queue(
    doctor_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Live queue for today. Polyclinic admins can pass ?doctor_id=… to scope to one doctor."""
    role = current_user.get("role")
    if role == "polyclinic_admin":
        # Polyclinic admins pass an explicit doctor_id
        if not doctor_id:
            # Aggregate for all their doctors
            pc = await db.polyclinics.find_one({"admin_user_id": current_user["id"]}, {"_id": 0})
            if not pc:
                raise HTTPException(status_code=404, detail="Polyclinic not found")
            doctor_ids = [
                d["id"] async for d in db.users.find(
                    {"polyclinic_id": pc["id"], "role": {"$in": ["user", "doctor"]}}, {"_id": 0, "id": 1}
                )
            ]
            match = {"professional_id": {"$in": doctor_ids}}
        else:
            match = {"professional_id": doctor_id}
    else:
        owner_id = resolve_owner_id(current_user)
        match = {"professional_id": owner_id}

    match["appointment_date"] = _today_iso()

    rows = await db.appointments.find(match, {"_id": 0}).to_list(500)

    # sort: assigned tokens first (ascending), then unchecked appointments by start_time
    def sort_key(a):
        tok = a.get("token_number") or ""
        if tok.startswith("A-"):
            try: return (0, int(tok.split("-")[1]))
            except Exception: return (0, 999)
        return (1, a.get("start_time") or "")
    rows.sort(key=sort_key)

    # counts by status
    counts = {s: 0 for s in ["scheduled", "checked_in", "in_consultation", "completed", "no_show", "cancelled"]}
    for a in rows:
        s = a.get("status", "scheduled")
        counts[s] = counts.get(s, 0) + 1

    now_serving = next((a for a in rows if a.get("status") == "in_consultation"), None)
    return {
        "date": _today_iso(),
        "appointments": rows,
        "counts": counts,
        "now_serving": now_serving,
        "total": len(rows),
    }


@router.post("/{appointment_id}/check-in")
async def check_in(appointment_id: str, current_user: dict = Depends(get_current_user)):
    """Assign a token and move the appointment into the queue."""
    owner_id = resolve_owner_id(current_user)
    appt = await db.appointments.find_one({"id": appointment_id, "professional_id": owner_id})
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appt.get("status") not in VALID_TRANSITIONS or "checked_in" not in VALID_TRANSITIONS.get(appt.get("status"), set()):
        raise HTTPException(status_code=400, detail=f"Cannot check in from status '{appt.get('status')}'")

    today = _today_iso()
    token = appt.get("token_number") or await _next_token(owner_id, today)
    now = datetime.now(timezone.utc).isoformat()
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {
            "status": "checked_in",
            "token_number": token,
            "checked_in_at": now,
            "appointment_date": appt.get("appointment_date") or today,
        }},
    )
    return {"message": "Checked in", "token_number": token, "status": "checked_in"}


@router.post("/{appointment_id}/status")
async def transition_status(
    appointment_id: str,
    body: StatusUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Move an appointment to a new status. Enforces the state machine."""
    owner_id = resolve_owner_id(current_user)
    appt = await db.appointments.find_one({"id": appointment_id, "professional_id": owner_id})
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    current = appt.get("status", "scheduled")
    if body.status not in VALID_TRANSITIONS.get(current, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from '{current}' to '{body.status}'",
        )
    ts_field_map = {
        "checked_in": "checked_in_at",
        "in_consultation": "consultation_started_at",
        "completed": "completed_at",
        "no_show": "marked_no_show_at",
        "cancelled": "cancelled_at",
    }
    now = datetime.now(timezone.utc).isoformat()
    updates = {"status": body.status, ts_field_map.get(body.status, "updated_at"): now}
    if body.note:
        updates["queue_note"] = body.note
    # Auto-token if going to checked_in without one
    if body.status == "checked_in" and not appt.get("token_number"):
        updates["token_number"] = await _next_token(owner_id, _today_iso())
    await db.appointments.update_one({"id": appointment_id}, {"$set": updates})
    return {"message": f"Status updated to {body.status}", **updates}


# ---------- Waiting Room public feed --------
# The doctor generates a share token; the /waiting-room page fetches by token so
# a lobby TV doesn't need to log in.

@router.post("/waiting-room/token")
async def create_or_get_wr_token(current_user: dict = Depends(get_current_user)):
    """Return (creating if absent) a public token that maps to this doctor's queue."""
    owner_id = resolve_owner_id(current_user)
    doctor = await db.users.find_one({"id": owner_id}, {"_id": 0})
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    token = doctor.get("waiting_room_token")
    if not token:
        token = secrets.token_urlsafe(12)
        await db.users.update_one({"id": owner_id}, {"$set": {"waiting_room_token": token}})
    return {"waiting_room_token": token, "public_url": f"/waiting-room/{token}"}


@router.get("/waiting-room/public/{token}")
async def waiting_room_feed(token: str) -> dict:
    """Public feed for the lobby TV — no auth. Returns only tokens + statuses,
    NEVER exposes patient names or phone numbers."""
    doctor = await db.users.find_one({"waiting_room_token": token}, {"_id": 0})
    if not doctor:
        raise HTTPException(status_code=404, detail="Waiting room not found")
    today = _today_iso()
    rows = await db.appointments.find(
        {"professional_id": doctor["id"], "appointment_date": today,
         "status": {"$in": ["checked_in", "in_consultation", "completed"]}},
        {"_id": 0, "token_number": 1, "status": 1, "client_name": 1,
         "consultation_started_at": 1, "checked_in_at": 1},
    ).to_list(200)

    # Mask names — show only first name initial for privacy
    def mask(name: str) -> str:
        if not name: return ""
        parts = name.strip().split()
        if not parts: return ""
        first = parts[0]
        return first[0].upper() + "." + (" " + parts[-1][0].upper() + "." if len(parts) > 1 else "")

    for r in rows:
        r["masked_name"] = mask(r.pop("client_name", ""))

    def sort_key(a):
        tok = a.get("token_number") or ""
        if tok.startswith("A-"):
            try: return int(tok.split("-")[1])
            except Exception: return 999
        return 999
    rows.sort(key=sort_key)

    now_serving = next((r for r in rows if r.get("status") == "in_consultation"), None)
    up_next = [r for r in rows if r.get("status") == "checked_in"][:5]

    doctor_display = doctor.get('name', '').strip()
    if not doctor_display.lower().startswith('dr'):
        doctor_display = f"Dr. {doctor_display}"

    return {
        "clinic_name": doctor.get("clinic_name") or doctor_display,
        "doctor_name": doctor_display,
        "profession": doctor.get("profession", ""),
        "now_serving": now_serving,
        "up_next": up_next,
        "completed_count": sum(1 for r in rows if r.get("status") == "completed"),
        "total_waiting": len([r for r in rows if r.get("status") == "checked_in"]),
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
