"""Post-consult patient feedback and Google Review routing.

Flow:
  1. Doctor completes prescription (or appointment).
  2. We schedule a WhatsApp trigger 2h later asking the patient to rate 1-5.
  3. Patient replies with a number (or clicks a link that hits /feedback/submit).
  4. If rating >= 4 and doctor has google_review_url configured, we reply with
     that link inviting them to leave a public review.
  5. Otherwise we thank them and store the private feedback for the doctor.
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from shared import db, get_current_user, send_whatsapp_message, resolve_owner_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/feedback", tags=["feedback"])


# ---------- Models ----------
class FeedbackTriggerCreate(BaseModel):
    prescription_id: Optional[str] = None
    appointment_id: Optional[str] = None
    client_phone: str
    client_name: str
    delay_hours: int = Field(default=2, ge=0, le=72)


class FeedbackSubmit(BaseModel):
    token: str
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


class GoogleReviewUpdate(BaseModel):
    google_review_url: Optional[str] = None


# ---------- Helpers ----------
async def _persist_trigger(doctor_id: str, appointment_id: Optional[str], prescription_id: Optional[str],
                          client_phone: str, client_name: str, scheduled_time: datetime) -> dict:
    trigger = {
        "id": str(uuid.uuid4()),
        "token": str(uuid.uuid4()),
        "doctor_id": doctor_id,
        "appointment_id": appointment_id,
        "prescription_id": prescription_id,
        "client_phone": client_phone,
        "client_name": client_name,
        "scheduled_time": scheduled_time.isoformat(),
        "status": "pending",  # pending | sent | responded | expired
        "rating": None,
        "comment": None,
        "sent_at": None,
        "responded_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.feedback_triggers.insert_one(trigger.copy())
    return trigger


async def _send_feedback_message(trigger: dict) -> bool:
    """Send the WhatsApp feedback prompt for a trigger."""
    doctor = await db.users.find_one({"id": trigger["doctor_id"]}, {"_id": 0}) or {}
    doctor_name = doctor.get("name", "your doctor")
    portal_base = (doctor.get("public_portal_base") or "").rstrip("/")
    link = f"{portal_base}/feedback/{trigger['token']}" if portal_base else ""
    link_line = f"\n\nOr tap this link: {link}" if link else ""
    msg = (
        f"Hi {trigger['client_name']}, thanks for visiting Dr. {doctor_name} today. "
        f"How was your experience?\n\n"
        f"Reply with a number from 1 to 5 (5 = excellent).{link_line}\n\n"
        f"Your feedback helps us improve. — {doctor_name}"
    )
    ok = await send_whatsapp_message(trigger["client_phone"], msg)
    if ok:
        await db.feedback_triggers.update_one(
            {"id": trigger["id"]},
            {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}},
        )
    return bool(ok)


async def dispatch_due_feedback_triggers():
    """Called by the background scheduler — sends any pending triggers whose time has come."""
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor = db.feedback_triggers.find({"status": "pending", "scheduled_time": {"$lte": now_iso}}, {"_id": 0})
    async for trig in cursor:
        try:
            await _send_feedback_message(trig)
        except Exception as e:
            logger.warning(f"feedback dispatch failed for {trig.get('id')}: {e}")


# ---------- Endpoints ----------
@router.post("/schedule")
async def schedule_feedback(body: FeedbackTriggerCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can schedule feedback")
    scheduled_time = datetime.now(timezone.utc) + timedelta(hours=body.delay_hours)
    trigger = await _persist_trigger(
        doctor_id=current_user["id"],
        appointment_id=body.appointment_id,
        prescription_id=body.prescription_id,
        client_phone=body.client_phone,
        client_name=body.client_name,
        scheduled_time=scheduled_time,
    )
    return {"message": f"Feedback scheduled in {body.delay_hours}h", "trigger": trigger}


@router.get("/triggers")
async def list_triggers(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    q = {"doctor_id": owner_id}
    if status:
        q["status"] = status
    rows = await db.feedback_triggers.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows


@router.get("/recent")
async def recent_feedback(limit: int = 10, current_user: dict = Depends(get_current_user)):
    """Latest responded feedback ratings for the current doctor / polyclinic scope."""
    owner_id = resolve_owner_id(current_user)
    rows = await db.feedback_triggers.find(
        {"doctor_id": owner_id, "status": "responded"},
        {"_id": 0, "id": 1, "client_name": 1, "client_phone": 1, "rating": 1,
         "comment": 1, "responded_at": 1, "appointment_id": 1},
    ).sort("responded_at", -1).to_list(max(1, min(limit, 50)))
    return rows


@router.get("/summary")
async def feedback_summary(current_user: dict = Depends(get_current_user)):
    """Overall rating summary for the current doctor / polyclinic scope."""
    owner_id = resolve_owner_id(current_user)
    pipeline = [
        {"$match": {"doctor_id": owner_id, "rating": {"$ne": None}}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}},
    ]
    avg = 0.0; count = 0
    async for row in db.feedback_triggers.aggregate(pipeline):
        avg = float(row.get("avg") or 0)
        count = int(row.get("count") or 0)
    # distribution
    dist = {}
    for r in range(1, 6):
        dist[r] = await db.feedback_triggers.count_documents({"doctor_id": owner_id, "rating": r})
    positive = dist[4] + dist[5]
    return {"average": round(avg, 2), "count": count, "distribution": dist, "positive_pct": round((positive / count * 100) if count else 0, 1)}


# ------- Public patient-facing --------
@router.get("/{token}")
async def get_trigger_public(token: str):
    trig = await db.feedback_triggers.find_one({"token": token}, {"_id": 0, "doctor_id": 0})
    if not trig:
        raise HTTPException(status_code=404, detail="Feedback link not found")
    return trig


@router.post("/submit")
async def submit_feedback(body: FeedbackSubmit):
    trig = await db.feedback_triggers.find_one({"token": body.token}, {"_id": 0})
    if not trig:
        raise HTTPException(status_code=404, detail="Feedback link invalid")
    now = datetime.now(timezone.utc).isoformat()
    await db.feedback_triggers.update_one(
        {"token": body.token},
        {"$set": {
            "status": "responded",
            "rating": body.rating,
            "comment": body.comment or "",
            "responded_at": now,
        }},
    )
    # Route positive feedback to Google Review link (if set)
    doctor = await db.users.find_one({"id": trig["doctor_id"]}, {"_id": 0}) or {}
    review_url = doctor.get("google_review_url")
    followup = None
    if body.rating >= 4 and review_url:
        followup = (
            f"Thanks for the {body.rating}-star rating! 🌟 "
            f"If you have a moment, please leave a public review — it means the world to us: {review_url}"
        )
    elif body.rating >= 4:
        followup = f"Thank you for the {body.rating}-star rating! We're delighted you had a good visit."
    else:
        followup = (
            "Thank you for sharing your honest feedback. "
            f"Dr. {doctor.get('name','')} will personally review this and reach out if needed."
        )
    # Fire-and-forget WhatsApp follow-up (best-effort)
    try:
        await send_whatsapp_message(trig["client_phone"], followup)
    except Exception as e:
        logger.warning(f"feedback follow-up whatsapp failed: {e}")
    return {"message": "Thanks for your feedback", "positive": body.rating >= 4, "review_url": review_url if body.rating >= 4 else None}


# ------- Doctor settings: Google Business Profile URL --------
@router.get("/settings/google-review")
async def get_google_review(current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    user = await db.users.find_one({"id": owner_id}, {"_id": 0, "google_review_url": 1}) or {}
    return {"google_review_url": user.get("google_review_url", "")}


@router.put("/settings/google-review")
async def set_google_review(body: GoogleReviewUpdate, current_user: dict = Depends(get_current_user)):
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can update this setting")
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"google_review_url": (body.google_review_url or "").strip() or None,
                  "google_review_updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"message": "Saved", "google_review_url": (body.google_review_url or "").strip()}
