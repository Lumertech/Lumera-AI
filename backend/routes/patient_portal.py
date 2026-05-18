"""Patient Self-Service Portal — public, token-scoped endpoints.

Flow:
1. Doctor issues a magic link for a patient phone (token + expires_at stored).
2. Patient opens the link (`/p/<token>`); frontend calls these endpoints with
   the token in the URL path — no auth header needed.
3. All data returned is scoped to that patient's phone + the issuing doctor.
4. Private practitioner notes are always stripped before returning.
"""
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from shared import db, get_current_user, resolve_owner_id, insert_doc, require_doctor_or_owner

router = APIRouter(prefix="/patient-portal", tags=["patient-portal"])

DEFAULT_TTL_DAYS = 30
PRIVATE_FIELDS = {"private_doctor_notes", "private_notes"}


class IssueLinkRequest(BaseModel):
    client_phone: str
    client_name: Optional[str] = None
    ttl_days: Optional[int] = DEFAULT_TTL_DAYS


def _scrub(doc: dict) -> dict:
    return {k: v for k, v in (doc or {}).items() if k not in PRIVATE_FIELDS}


async def _resolve_token(token: str) -> dict:
    """Validate token, check expiry, return token document."""
    if not token or len(token) < 16:
        raise HTTPException(status_code=404, detail="Invalid link")
    record = await db.patient_portal_tokens.find_one({"token": token}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Link not found")
    expires_at = record.get("expires_at")
    try:
        if expires_at and datetime.fromisoformat(expires_at) < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Link has expired")
    except HTTPException:
        raise
    except Exception:
        pass
    if record.get("revoked"):
        raise HTTPException(status_code=410, detail="Link was revoked")
    return record


# ----- Doctor / owner endpoints -----

@router.post("/issue-link")
async def issue_link(
    payload: IssueLinkRequest,
    current_user: dict = Depends(require_doctor_or_owner),
):
    """Generate a time-limited portal token for a patient phone. Returns the
    full URL; the doctor can copy it or send via WhatsApp."""
    owner_id = current_user['id']
    ttl_days = max(1, min(180, int(payload.ttl_days or DEFAULT_TTL_DAYS)))
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "token": token,
        "professional_id": owner_id,
        "doctor_name": current_user.get('name', ''),
        "client_phone": payload.client_phone,
        "client_name": payload.client_name or "",
        "expires_at": (now + timedelta(days=ttl_days)).isoformat(),
        "created_at": now.isoformat(),
        "revoked": False,
    }
    await insert_doc(db.patient_portal_tokens, doc)
    return {
        "token": token,
        "path": f"/p/{token}",
        "expires_at": doc["expires_at"],
        "client_phone": payload.client_phone,
    }


@router.get("/links")
async def list_links(current_user: dict = Depends(require_doctor_or_owner)):
    """List recently-issued links for the doctor."""
    owner_id = current_user['id']
    items = await db.patient_portal_tokens.find(
        {"professional_id": owner_id}, {"_id": 0}
    ).sort("created_at", -1).limit(100).to_list(100)
    return items


@router.post("/revoke/{token}")
async def revoke_link(token: str, current_user: dict = Depends(require_doctor_or_owner)):
    owner_id = current_user['id']
    result = await db.patient_portal_tokens.update_one(
        {"token": token, "professional_id": owner_id},
        {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"success": True}


# ----- Public patient-facing endpoints (no auth) -----

@router.get("/{token}/profile")
async def portal_profile(token: str):
    rec = await _resolve_token(token)
    return {
        "client_name": rec.get("client_name"),
        "client_phone": rec.get("client_phone"),
        "doctor_name": rec.get("doctor_name"),
        "expires_at": rec.get("expires_at"),
    }


@router.get("/{token}/prescriptions")
async def portal_prescriptions(token: str):
    rec = await _resolve_token(token)
    items = await db.prescriptions.find(
        {"professional_id": rec["professional_id"], "client_phone": rec["client_phone"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    return [_scrub(p) for p in items]


@router.get("/{token}/consultation-notes")
async def portal_consultation_notes(token: str):
    rec = await _resolve_token(token)
    items = await db.consultation_notes.find(
        {"professional_id": rec["professional_id"], "client_phone": rec["client_phone"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    return [_scrub(n) for n in items]


@router.get("/{token}/appointments")
async def portal_appointments(token: str):
    rec = await _resolve_token(token)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    upcoming = await db.appointments.find(
        {"professional_id": rec["professional_id"], "client_phone": rec["client_phone"], "appointment_date": {"$gte": today}},
        {"_id": 0},
    ).sort("appointment_date", 1).to_list(50)
    past = await db.appointments.find(
        {"professional_id": rec["professional_id"], "client_phone": rec["client_phone"], "appointment_date": {"$lt": today}},
        {"_id": 0},
    ).sort("appointment_date", -1).limit(20).to_list(20)
    return {"upcoming": upcoming, "past": past}


@router.get("/{token}/medications")
async def portal_active_medications(token: str):
    rec = await _resolve_token(token)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    items = await db.medication_reminders.find(
        {
            "professional_id": rec["professional_id"],
            "client_phone": rec["client_phone"],
            "status": {"$in": ["active", "paused"]},
            "end_date": {"$gte": today},
        },
        {"_id": 0, "sent_log": 0},
    ).sort("created_at", -1).to_list(50)
    return items


@router.get("/{token}/payments")
async def portal_payments(token: str):
    rec = await _resolve_token(token)
    items = await db.payment_transactions.find(
        {"user_id": rec["professional_id"], "client_phone": rec["client_phone"]},
        {"_id": 0, "razorpay_signature": 0, "razorpay_key_secret": 0},
    ).sort("created_at", -1).limit(50).to_list(50)
    return items
