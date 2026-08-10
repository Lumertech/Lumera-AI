"""Appointments + Clients routes.

Extracted from server.py (Phase 14 router split, 2026-02-10).
Late-imported at the bottom of server.py so all models and shared symbols
are available when this module is loaded.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server import AppointmentCreate, PatientDetails
from shared import (
    db,
    get_current_user,
    resolve_owner_id,
    require_write_appointments,
    send_whatsapp_message,
)

router = APIRouter(tags=["appointments"])


class VitalsPayload(BaseModel):
    bp: Optional[str] = None
    pulse: Optional[str] = None
    spo2: Optional[str] = None
    temperature: Optional[str] = None
    weight: Optional[str] = None
    height: Optional[str] = None
    respiratory_rate: Optional[str] = None


# ---------- Appointments CRUD ----------

@router.post("/appointments")
async def create_appointment(appt: AppointmentCreate, current_user: dict = Depends(require_write_appointments)):
    owner_id = resolve_owner_id(current_user)
    owner = await db.users.find_one({"id": owner_id}, {"_id": 0}) if owner_id != current_user["id"] else current_user
    appointment_id = str(uuid.uuid4())
    appointment = {
        "id": appointment_id,
        "professional_id": owner_id,
        "client_name": appt.client_name,
        "client_phone": appt.client_phone,
        "client_email": appt.client_email,
        "appointment_date": appt.appointment_date,
        "start_time": appt.start_time,
        "end_time": appt.end_time,
        "consultation_mode": appt.consultation_mode,
        "status": "scheduled",
        "notes": appt.notes,
        "reminder_sent": False,
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"],
    }
    await db.appointments.insert_one(appointment.copy())

    # Update or create client record
    client = await db.clients.find_one(
        {"professional_id": owner_id, "phone": appt.client_phone}, {"_id": 0}
    )
    if client:
        await db.clients.update_one(
            {"id": client["id"]},
            {"$inc": {"total_appointments": 1}, "$set": {"last_appointment": datetime.now(timezone.utc).isoformat()}},
        )
    else:
        client_id = str(uuid.uuid4())
        await db.clients.insert_one({
            "id": client_id,
            "professional_id": owner_id,
            "name": appt.client_name,
            "phone": appt.client_phone,
            "email": appt.client_email,
            "total_appointments": 1,
            "last_appointment": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Send WhatsApp confirmation + 3-question pre-intake (best-effort)
    doctor_name = (owner or {}).get("name", "your doctor")
    pre_intake_msg = (
        f"Hi {appt.client_name}, your appointment with Dr. {doctor_name} is confirmed "
        f"for {appt.appointment_date} at {appt.start_time}.\n\n"
        f"To help Dr. {doctor_name} prepare, please reply with:\n"
        f"1️⃣ Your main symptoms in a line or two\n"
        f"2️⃣ How many days have you had them?\n"
        f"3️⃣ Any regular medications or allergies?\n\n"
        f"Just reply to this message — we'll capture it for your visit.\n- Lumera"
    )
    await send_whatsapp_message(appt.client_phone, pre_intake_msg)

    # Log the pre-intake dispatch so front desk can see it was sent
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {
            "pre_intake_dispatched_at": datetime.now(timezone.utc).isoformat(),
            "pre_intake_status": "sent",
        }},
    )

    return appointment


@router.put("/appointments/{appointment_id}/pre-intake")
async def save_pre_intake(
    appointment_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Front desk / doctor manually captures the patient's 3 answers (verbal or WA-relayed)."""
    owner_id = resolve_owner_id(current_user)
    updates = {
        "pre_intake": {
            "symptoms": str(body.get("symptoms") or "").strip(),
            "duration": str(body.get("duration") or "").strip(),
            "medications_allergies": str(body.get("medications_allergies") or "").strip(),
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "captured_by": current_user.get("name") or current_user.get("email"),
        },
        "pre_intake_status": "captured",
    }
    r = await db.appointments.update_one(
        {"id": appointment_id, "professional_id": owner_id},
        {"$set": updates},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Pre-intake saved", "pre_intake": updates["pre_intake"]}


@router.get("/appointments")
async def get_appointments(current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    appointments = await db.appointments.find(
        {"professional_id": owner_id}, {"_id": 0}
    ).sort("appointment_date", -1).to_list(100)
    return appointments


@router.get("/appointments/{appointment_id}")
async def get_appointment(appointment_id: str, current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    appt = await db.appointments.find_one(
        {"id": appointment_id, "professional_id": owner_id}, {"_id": 0}
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appt


@router.put("/appointments/{appointment_id}")
async def update_appointment(appointment_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    # Strip immutable / server-controlled fields to prevent mass assignment
    _IMMUTABLE = {"id", "professional_id", "created_at", "created_by"}
    updates = {k: v for k, v in updates.items() if k not in _IMMUTABLE}
    if not updates:
        raise HTTPException(status_code=400, detail="No updatable fields provided")

    # Assistants may ONLY change status
    if current_user.get("role") == "assistant":
        if set(updates.keys()) - {"status"}:
            raise HTTPException(status_code=403, detail="Assistants may only update appointment status")
    owner_id = resolve_owner_id(current_user)
    result = await db.appointments.update_one(
        {"id": appointment_id, "professional_id": owner_id},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Updated successfully"}


@router.delete("/appointments/{appointment_id}")
async def delete_appointment(appointment_id: str, current_user: dict = Depends(require_write_appointments)):
    owner_id = resolve_owner_id(current_user)
    result = await db.appointments.delete_one(
        {"id": appointment_id, "professional_id": owner_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Deleted successfully"}


# ---------- Clients ----------

@router.get("/clients")
async def get_clients(current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    clients = await db.clients.find(
        {"professional_id": owner_id}, {"_id": 0}
    ).to_list(1000)
    return clients


@router.get("/clients/{client_id}")
async def get_client(client_id: str, current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    client = await db.clients.find_one(
        {"id": client_id, "professional_id": owner_id}, {"_id": 0}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    appointments = await db.appointments.find(
        {"professional_id": owner_id, "client_phone": client["phone"]}, {"_id": 0}
    ).to_list(100)

    # Sub-users don't see prescriptions
    prescriptions = []
    if current_user.get("role") not in ("receptionist", "front_desk", "assistant"):
        prescriptions = await db.prescriptions.find(
            {"professional_id": owner_id, "client_phone": client["phone"]}, {"_id": 0}
        ).to_list(100)

    return {**client, "appointments": appointments, "prescriptions": prescriptions}


# ---------- Patient Details ----------

@router.put("/appointments/{appointment_id}/patient-details")
async def update_patient_details(
    appointment_id: str,
    patient_details: PatientDetails,
    current_user: dict = Depends(get_current_user),
):
    appointment = await db.appointments.find_one(
        {"id": appointment_id, "professional_id": current_user["id"]}, {"_id": 0}
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {
            "client_name": patient_details.name,
            "patient_details": patient_details.dict(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    await db.clients.update_one(
        {"professional_id": current_user["id"], "phone": appointment["client_phone"]},
        {"$set": {
            "name": patient_details.name,
            "patient_details": patient_details.dict(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    return {"message": "Patient details updated successfully"}


@router.get("/appointments/{appointment_id}/patient-details")
async def get_patient_details(appointment_id: str, current_user: dict = Depends(get_current_user)):
    appointment = await db.appointments.find_one(
        {"id": appointment_id, "professional_id": current_user["id"]}, {"_id": 0}
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appointment.get("patient_details", {})


# ---------- Vitals ----------

@router.get("/appointments/{appointment_id}/vitals")
async def get_appointment_vitals(appointment_id: str, current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    appt = await db.appointments.find_one(
        {"id": appointment_id, "professional_id": owner_id}, {"_id": 0}
    )
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {
        "vitals": appt.get("vitals") or {},
        "captured_by": appt.get("vitals_captured_by"),
        "captured_at": appt.get("vitals_captured_at"),
    }


@router.put("/appointments/{appointment_id}/vitals")
async def upsert_appointment_vitals(
    appointment_id: str,
    body: VitalsPayload,
    current_user: dict = Depends(get_current_user),
):
    """Assistants (nurses) and doctors can record vitals directly on the appointment."""
    role = current_user.get("role")
    if role not in ("user", "doctor", "assistant", "receptionist", "front_desk"):
        raise HTTPException(status_code=403, detail="Not allowed to capture vitals")
    owner_id = resolve_owner_id(current_user)
    appt = await db.appointments.find_one({"id": appointment_id, "professional_id": owner_id})
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {
            "vitals": payload,
            "vitals_captured_by": current_user.get("name") or current_user.get("email"),
            "vitals_captured_by_role": role,
            "vitals_captured_at": now_iso,
        }},
    )
    return {"message": "Vitals saved", "vitals": payload, "captured_by": current_user.get("name")}
