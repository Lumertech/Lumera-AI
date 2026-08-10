"""Patient clinical safety — allergies + drug conflict checks."""
from __future__ import annotations

import re
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from shared import db, get_current_user, resolve_owner_id

router = APIRouter(prefix="/safety", tags=["safety"])


class AllergiesUpdate(BaseModel):
    client_phone: str
    allergies: List[str]


class DrugCheckRequest(BaseModel):
    client_phone: str
    medication_names: List[str]


@router.get("/allergies")
async def get_allergies(client_phone: str, current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    doc = await db.patient_safety.find_one(
        {"owner_id": owner_id, "client_phone": client_phone}, {"_id": 0}
    ) or {}
    return {"allergies": doc.get("allergies", []), "updated_at": doc.get("updated_at")}


@router.put("/allergies")
async def upsert_allergies(body: AllergiesUpdate, current_user: dict = Depends(get_current_user)):
    if current_user.get("profession") != "doctor" and current_user.get("role") not in ("assistant", "receptionist", "front_desk"):
        raise HTTPException(status_code=403, detail="Not allowed to update allergies")
    owner_id = resolve_owner_id(current_user)
    cleaned = [a.strip() for a in body.allergies if a and a.strip()]
    await db.patient_safety.update_one(
        {"owner_id": owner_id, "client_phone": body.client_phone},
        {"$set": {"allergies": cleaned, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"message": "Allergies saved", "allergies": cleaned}


@router.get("/timeline/{client_phone}")
async def patient_timeline(client_phone: str, current_user: dict = Depends(get_current_user)):
    """Unified per-patient timeline: appointments + prescriptions + invoices +
    ambient sessions, merged and sorted newest → oldest."""
    owner_id = resolve_owner_id(current_user)
    events = []

    async for a in db.appointments.find(
        {"professional_id": owner_id, "client_phone": client_phone}, {"_id": 0}
    ):
        events.append({"kind": "appointment", "when": a.get("created_at", ""),
                       "title": f"Appointment · {a.get('start_time','')}",
                       "meta": {"status": a.get("status"), "token": a.get("token_number")},
                       "id": a.get("id")})

    async for p in db.prescriptions.find(
        {"professional_id": owner_id, "client_phone": client_phone}, {"_id": 0}
    ):
        events.append({"kind": "prescription", "when": p.get("created_at", ""),
                       "title": f"Prescription · {len(p.get('medications', []))} meds",
                       "meta": {"medications": [m.get("medicine_name") for m in p.get("medications", [])],
                                "vitals": p.get("vitals") or {}},
                       "id": p.get("id")})

    async for inv in db.invoices.find(
        {"doctor_id": owner_id, "client_phone": client_phone}, {"_id": 0}
    ):
        events.append({"kind": "invoice", "when": inv.get("created_at", ""),
                       "title": f"Invoice #{inv.get('invoice_number','')} · ₹{inv.get('total',0)}",
                       "meta": {"status": inv.get("status"), "total": inv.get("total")},
                       "id": inv.get("id")})

    async for s in db.ambient_sessions.find(
        {"doctor_id": owner_id, "context": {"$regex": re.escape(client_phone), "$options": "i"}}, {"_id": 0}
    ):
        events.append({"kind": "ambient", "when": s.get("created_at", ""),
                       "title": s.get("extracted", {}).get("provisional_diagnosis") or "Ambient session",
                       "meta": {"symptoms": s.get("extracted", {}).get("symptoms")}, "id": s.get("id")})

    events.sort(key=lambda e: e.get("when", ""), reverse=True)
    return {"client_phone": client_phone, "count": len(events), "events": events}


@router.post("/drug-check")
async def drug_check(body: DrugCheckRequest, current_user: dict = Depends(get_current_user)):
    """Return conflicts: (a) patient allergies overlapping with meds, (b) duplicate
    meds already in an active recent prescription for the same patient."""
    owner_id = resolve_owner_id(current_user)
    doc = await db.patient_safety.find_one(
        {"owner_id": owner_id, "client_phone": body.client_phone}, {"_id": 0}
    ) or {}
    allergies = [a.lower() for a in doc.get("allergies", [])]

    med_names = [(m or "").strip() for m in body.medication_names if m]
    allergy_conflicts = []
    for m in med_names:
        ml = m.lower()
        for a in allergies:
            if a and (a in ml or ml in a):
                allergy_conflicts.append({"medication": m, "allergy": a})

    # Recent duplicates — last 14 days
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    duplicates = []
    async for rx in db.prescriptions.find(
        {"professional_id": owner_id, "client_phone": body.client_phone, "created_at": {"$gte": since}},
        {"_id": 0, "medications": 1, "created_at": 1},
    ):
        for existing in rx.get("medications", []):
            for m in med_names:
                if existing.get("medicine_name", "").lower() == m.lower():
                    duplicates.append({
                        "medication": m,
                        "existing_prescription_date": rx.get("created_at", "")[:10],
                    })

    return {
        "allergies": doc.get("allergies", []),
        "allergy_conflicts": allergy_conflicts,
        "duplicates": duplicates,
        "safe": len(allergy_conflicts) == 0 and len(duplicates) == 0,
    }
