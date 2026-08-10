"""Polyclinic Umbrella tier — one login manages multiple doctors + their staff.

Design decisions (defaults chosen for MVP; can be tuned later):
  - New role: `polyclinic_admin` — separate from the platform-wide `admin`
  - Polyclinic admin can browse aggregate stats + doctor list, but does NOT see
    PHI (prescriptions, private notes, consultations) — safer default
  - Each doctor keeps their own owner_id scope for their patient data (RBAC
    unchanged). We just attach a `polyclinic_id` reference on the doctor's user
    document so the umbrella can list & aggregate them.
  - Signup creates two DB rows: the polyclinic document and the admin user
    (role='polyclinic_admin'). Existing doctors can then be invited by email.
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from shared import db, pwd_context, get_current_user
import jwt as _jwt
import os as _os

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/polyclinic", tags=["polyclinic"])

_JWT_SECRET = _os.environ.get("JWT_SECRET_KEY", "your-secret-key")
_JWT_ALG = "HS256"


# ---------- Models ----------
class PolyclinicRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=200)
    phone_number: Optional[str] = None
    polyclinic_name: str = Field(..., min_length=2, max_length=200)
    polyclinic_address: Optional[str] = None


class PolyclinicUpdate(BaseModel):
    polyclinic_name: Optional[str] = None
    polyclinic_address: Optional[str] = None
    polyclinic_phone: Optional[str] = None
    polyclinic_email: Optional[EmailStr] = None


class DoctorInvite(BaseModel):
    email: EmailStr


# ---------- Guards ----------
async def require_polyclinic_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "polyclinic_admin":
        raise HTTPException(status_code=403, detail="Polyclinic admin access required.")
    return current_user


# ---------- Endpoints ----------
@router.post("/register")
async def register_polyclinic(data: PolyclinicRegister):
    """Public signup for a new polyclinic. Creates polyclinic doc + admin user."""
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    polyclinic_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    polyclinic = {
        "id": polyclinic_id,
        "name": data.polyclinic_name,
        "address": data.polyclinic_address,
        "admin_user_id": user_id,
        "created_at": now,
    }
    user = {
        "id": user_id,
        "name": data.name,
        "email": data.email,
        "hashed_password": pwd_context.hash(data.password),
        "phone_number": data.phone_number,
        "profession": "polyclinic_admin",
        "role": "polyclinic_admin",
        "polyclinic_id": polyclinic_id,
        "created_at": now,
    }

    await db.polyclinics.insert_one(polyclinic.copy())
    await db.users.insert_one(user.copy())

    token = _jwt.encode({"user_id": user_id, "email": data.email}, _JWT_SECRET, algorithm=_JWT_ALG)
    return {
        "token": token,
        "user": {k: v for k, v in user.items() if k not in ("hashed_password", "_id")},
        "polyclinic": {k: v for k, v in polyclinic.items() if k != "_id"},
    }


@router.get("/me")
async def get_my_polyclinic(current_user: dict = Depends(require_polyclinic_admin)):
    pc = await db.polyclinics.find_one({"admin_user_id": current_user["id"]}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="Polyclinic not found")
    return pc


@router.put("/me")
async def update_polyclinic(
    body: PolyclinicUpdate,
    current_user: dict = Depends(require_polyclinic_admin),
):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    # translate keys
    mapped = {}
    if "polyclinic_name" in update:
        mapped["name"] = update["polyclinic_name"]
    if "polyclinic_address" in update:
        mapped["address"] = update["polyclinic_address"]
    if "polyclinic_phone" in update:
        mapped["phone"] = update["polyclinic_phone"]
    if "polyclinic_email" in update:
        mapped["email"] = update["polyclinic_email"]
    mapped["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.polyclinics.update_one({"admin_user_id": current_user["id"]}, {"$set": mapped})
    return await db.polyclinics.find_one({"admin_user_id": current_user["id"]}, {"_id": 0})


@router.post("/doctors/invite")
async def invite_doctor(
    invite: DoctorInvite,
    current_user: dict = Depends(require_polyclinic_admin),
):
    """Attach an existing doctor to this polyclinic. Doctor must already have an
    account on Lumera. (Email-based invitation flow can be layered on top later.)"""
    pc = await db.polyclinics.find_one({"admin_user_id": current_user["id"]}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="Polyclinic not found")

    doctor = await db.users.find_one({"email": invite.email}, {"_id": 0})
    if not doctor:
        raise HTTPException(status_code=404, detail="No Lumera account found for this email")

    # Only pull in independent practitioners; block admins, staff, other polyclinics
    if doctor.get("role") not in ("user", "doctor"):
        raise HTTPException(status_code=400, detail=f"Cannot add: this user's role is '{doctor.get('role')}'")
    if doctor.get("polyclinic_id") and doctor["polyclinic_id"] != pc["id"]:
        raise HTTPException(status_code=409, detail="This doctor already belongs to another polyclinic")

    await db.users.update_one(
        {"id": doctor["id"]},
        {"$set": {"polyclinic_id": pc["id"], "polyclinic_joined_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"message": f"Dr. {doctor.get('name', doctor['email'])} added to polyclinic", "doctor_id": doctor["id"]}


@router.get("/doctors")
async def list_doctors(current_user: dict = Depends(require_polyclinic_admin)) -> List[dict]:
    pc = await db.polyclinics.find_one({"admin_user_id": current_user["id"]}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="Polyclinic not found")

    doctors = await db.users.find(
        {"polyclinic_id": pc["id"], "role": {"$in": ["user", "doctor"]}},
        {"_id": 0, "hashed_password": 0, "google_id": 0},
    ).sort("name", 1).to_list(200)
    return doctors


@router.delete("/doctors/{doctor_id}")
async def remove_doctor(
    doctor_id: str,
    current_user: dict = Depends(require_polyclinic_admin),
):
    pc = await db.polyclinics.find_one({"admin_user_id": current_user["id"]}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="Polyclinic not found")

    result = await db.users.update_one(
        {"id": doctor_id, "polyclinic_id": pc["id"]},
        {"$unset": {"polyclinic_id": "", "polyclinic_joined_at": ""}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Doctor not in your polyclinic")
    return {"message": "Doctor removed from polyclinic"}


@router.get("/dashboard")
async def polyclinic_dashboard(
    doctor_id: Optional[str] = None,
    current_user: dict = Depends(require_polyclinic_admin),
):
    """Aggregate stats — total doctors, appointments this month, revenue,
    and per-doctor breakdown. No PHI (prescriptions/notes) exposed.

    If `doctor_id` is passed, all totals reflect only that doctor.
    """
    pc = await db.polyclinics.find_one({"admin_user_id": current_user["id"]}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="Polyclinic not found")

    all_doctors = await db.users.find(
        {"polyclinic_id": pc["id"], "role": {"$in": ["user", "doctor"]}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "profession": 1},
    ).to_list(200)

    # Apply filter: if doctor_id provided, scope aggregates to that doctor only
    if doctor_id:
        scope_ids = [d["id"] for d in all_doctors if d["id"] == doctor_id]
        if not scope_ids:
            raise HTTPException(status_code=404, detail="Doctor not in your polyclinic")
    else:
        scope_ids = [d["id"] for d in all_doctors]

    # Time window: this month
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    total_appointments = await db.appointments.count_documents(
        {"professional_id": {"$in": scope_ids}}
    ) if scope_ids else 0
    month_appointments = await db.appointments.count_documents(
        {"professional_id": {"$in": scope_ids}, "created_at": {"$gte": month_start}}
    ) if scope_ids else 0

    # Revenue from invoices (paid only)
    revenue_total = 0.0
    revenue_month = 0.0
    if scope_ids:
        pipeline_total = [
            {"$match": {"doctor_id": {"$in": scope_ids}, "status": "paid"}},
            {"$group": {"_id": None, "sum": {"$sum": "$total"}}},
        ]
        async for row in db.invoices.aggregate(pipeline_total):
            revenue_total = float(row.get("sum") or 0)
        pipeline_month = [
            {"$match": {"doctor_id": {"$in": scope_ids}, "status": "paid", "created_at": {"$gte": month_start}}},
            {"$group": {"_id": None, "sum": {"$sum": "$total"}}},
        ]
        async for row in db.invoices.aggregate(pipeline_month):
            revenue_month = float(row.get("sum") or 0)

    # Per-doctor breakdown (always show ALL doctors so the filter dropdown stays populated)
    per_doctor = []
    for d in all_doctors:
        appt_count = await db.appointments.count_documents(
            {"professional_id": d["id"], "created_at": {"$gte": month_start}}
        )
        per_doctor.append({
            "id": d["id"],
            "name": d.get("name"),
            "email": d.get("email"),
            "profession": d.get("profession"),
            "appointments_this_month": appt_count,
        })
    per_doctor.sort(key=lambda x: x["appointments_this_month"], reverse=True)

    return {
        "polyclinic": pc,
        "filter": {"doctor_id": doctor_id},
        "totals": {
            "doctors": len(scope_ids) if doctor_id else len(all_doctors),
            "appointments_all_time": total_appointments,
            "appointments_this_month": month_appointments,
            "revenue_paid_all_time": round(revenue_total, 2),
            "revenue_paid_this_month": round(revenue_month, 2),
        },
        "doctors": per_doctor,
    }
