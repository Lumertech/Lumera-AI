"""Consultation Notes — open to non-doctor professions (therapists, spa,
lawyers, wellness pros). Simpler than prescription module: no medications,
no drug interactions. Optional WhatsApp delivery to the client.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from shared import (
    db,
    get_current_user,
    resolve_owner_id,
    send_whatsapp_message,
    insert_doc,
)

router = APIRouter(prefix="/consultation-notes", tags=["consultation-notes"])


class ConsultationNoteCreate(BaseModel):
    appointment_id: str
    client_name: str
    summary: str                     # client-facing summary
    recommendations: Optional[str] = ""
    private_notes: Optional[str] = ""   # practitioner-only, never sent
    send_to_client: Optional[bool] = True


class ConsultationNoteUpdate(BaseModel):
    summary: Optional[str] = None
    recommendations: Optional[str] = None
    private_notes: Optional[str] = None


@router.post("")
async def create_note(
    payload: ConsultationNoteCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') in ('receptionist', 'front_desk', 'assistant'):
        raise HTTPException(status_code=403, detail="Your role cannot write consultation notes")

    owner_id = resolve_owner_id(current_user)
    appointment = await db.appointments.find_one(
        {"id": payload.appointment_id, "professional_id": owner_id}, {"_id": 0}
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    doc = {
        "id": str(uuid.uuid4()),
        "professional_id": owner_id,
        "appointment_id": payload.appointment_id,
        "client_name": payload.client_name,
        "client_phone": appointment.get("client_phone"),
        "summary": payload.summary,
        "recommendations": payload.recommendations or "",
        "private_notes": payload.private_notes or "",
        "practitioner_profession": current_user.get('profession', 'practitioner'),
        "practitioner_name": current_user.get('name', ''),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await insert_doc(db.consultation_notes, doc)

    if payload.send_to_client and appointment.get("client_phone"):
        message = f"""\U0001f4dd Consultation Notes

For: {payload.client_name}
From: {current_user.get('name','')}
Date: {datetime.now().strftime('%d %b %Y')}

Summary:
{payload.summary}
"""
        if payload.recommendations:
            message += f"\nRecommendations:\n{payload.recommendations}\n"
        message += "\nIf you have any questions, please reply to this message."
        background_tasks.add_task(send_whatsapp_message, appointment["client_phone"], message)
        doc["whatsapp_queued"] = True
    return doc


@router.get("")
async def list_notes(current_user: dict = Depends(get_current_user)):
    if current_user.get('role') in ('receptionist', 'front_desk', 'assistant'):
        raise HTTPException(status_code=403, detail="Receptionists cannot view consultation notes")
    owner_id = resolve_owner_id(current_user)
    items = await db.consultation_notes.find(
        {"professional_id": owner_id}, {"_id": 0}
    ).sort("created_at", -1).limit(200).to_list(200)
    return items


@router.get("/by-appointment/{appointment_id}")
async def by_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') in ('receptionist', 'front_desk', 'assistant'):
        raise HTTPException(status_code=403, detail="Receptionists cannot view consultation notes")
    owner_id = resolve_owner_id(current_user)
    items = await db.consultation_notes.find(
        {"professional_id": owner_id, "appointment_id": appointment_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return items


@router.put("/{note_id}")
async def update_note(
    note_id: str,
    payload: ConsultationNoteUpdate,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') in ('receptionist', 'front_desk', 'assistant'):
        raise HTTPException(status_code=403, detail="Receptionists cannot edit consultation notes")
    owner_id = resolve_owner_id(current_user)
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    result = await db.consultation_notes.update_one(
        {"id": note_id, "professional_id": owner_id}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return await db.consultation_notes.find_one(
        {"id": note_id, "professional_id": owner_id}, {"_id": 0}
    )
