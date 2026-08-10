"""Data-deletion self-service — Meta / GDPR compliance.

Public endpoint (no auth) that accepts a WhatsApp phone number and enqueues
deletion of all Lumera records tied to that number across every doctor tenant.
A ticket id is returned so the user can quote it in emails to ravee@lumer.me.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from shared import db

router = APIRouter(prefix="/data-deletion", tags=["compliance"])

PHONE_RE = re.compile(r"^\+?[0-9\-\s]{7,20}$")


class DeletionRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=25)
    email: str | None = None
    reason: str | None = None


@router.post("/request")
async def create_deletion_request(body: DeletionRequest):
    phone = body.phone.strip()
    if not PHONE_RE.match(phone):
        raise HTTPException(status_code=400, detail="Please enter a valid phone number")

    ticket_id = f"DEL-{uuid.uuid4().hex[:10].upper()}"
    await db.data_deletion_requests.insert_one({
        "ticket_id": ticket_id,
        "phone": phone,
        "email": (body.email or "").strip() or None,
        "reason": (body.reason or "").strip() or None,
        "status": "queued",
        "requested_at": datetime.now(timezone.utc).isoformat(),
    })
    return {
        "ticket_id": ticket_id,
        "status": "queued",
        "message": (
            "Your deletion request has been received. Lumera Solutions LLP will purge "
            "all data tied to this number across every doctor tenant within 30 days. "
            "You will receive a confirmation email if one was provided. For status "
            "updates quote your ticket id when writing to ravee@lumer.me."
        ),
    }


@router.get("/status/{ticket_id}")
async def get_deletion_status(ticket_id: str):
    doc = await db.data_deletion_requests.find_one({"ticket_id": ticket_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return doc
