"""Medication reminder endpoints."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from shared import db, get_current_user, resolve_owner_id

router = APIRouter(prefix="/medication-reminders", tags=["medication-reminders"])


class ReminderUpdate(BaseModel):
    status: Optional[str] = None  # active | paused | completed


@router.get("")
async def list_reminders(current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    items = await db.medication_reminders.find(
        {"professional_id": owner_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return items


@router.get("/by-prescription/{prescription_id}")
async def list_by_prescription(prescription_id: str, current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    items = await db.medication_reminders.find(
        {"professional_id": owner_id, "prescription_id": prescription_id}, {"_id": 0}
    ).to_list(100)
    return items


@router.put("/{reminder_id}")
async def update_reminder(reminder_id: str, payload: ReminderUpdate, current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    if "status" in updates and updates["status"] not in {"active", "paused", "completed"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.medication_reminders.update_one(
        {"id": reminder_id, "professional_id": owner_id},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    item = await db.medication_reminders.find_one(
        {"id": reminder_id, "professional_id": owner_id}, {"_id": 0}
    )
    return item


@router.delete("/{reminder_id}")
async def delete_reminder(reminder_id: str, current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    result = await db.medication_reminders.delete_one(
        {"id": reminder_id, "professional_id": owner_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"success": True}
