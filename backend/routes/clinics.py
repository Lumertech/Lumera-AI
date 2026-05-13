"""Clinic management and receptionist sub-user endpoints — Phase 3.

- Clinic CRUD with primary-clinic enforcement
- Receptionist sub-user creation (max 2/clinic)
- OPD analytics with incentive tiers
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from security import PasswordValidator, InputSanitizer

from shared import (
    db,
    pwd_context,
    get_current_user,
    require_doctor_or_owner,
    resolve_owner_id,
)

router = APIRouter(tags=["clinics"])


class ClinicCreate(BaseModel):
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = None
    branding_color: Optional[str] = "#4F46E5"
    is_primary: Optional[bool] = False


class ClinicUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    branding_color: Optional[str] = None
    is_primary: Optional[bool] = None


class SubUserCreate(BaseModel):
    name: str
    email: EmailStr
    phone_number: str
    password: str
    clinic_id: Optional[str] = None


@router.get("/clinics")
async def list_clinics(current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    return await db.clinics.find({"owner_id": owner_id}, {"_id": 0}).sort("created_at", 1).to_list(50)


@router.post("/clinics")
async def create_clinic(payload: ClinicCreate, current_user: dict = Depends(require_doctor_or_owner)):
    owner_id = current_user['id']
    clinic_id = str(uuid.uuid4())
    if payload.is_primary:
        await db.clinics.update_many({"owner_id": owner_id}, {"$set": {"is_primary": False}})
    doc = {
        "id": clinic_id,
        "owner_id": owner_id,
        "name": InputSanitizer.sanitize_html(payload.name),
        "address": payload.address or "",
        "phone": payload.phone or "",
        "email": (payload.email or "").strip() or None,
        "branding_color": payload.branding_color or "#4F46E5",
        "is_primary": bool(payload.is_primary),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.clinics.insert_one(doc.copy())
    return doc


@router.put("/clinics/{clinic_id}")
async def update_clinic(clinic_id: str, payload: ClinicUpdate, current_user: dict = Depends(require_doctor_or_owner)):
    owner_id = current_user['id']
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    if "email" in updates:
        updates["email"] = (updates["email"] or "").strip() or None
    if updates.get("is_primary"):
        await db.clinics.update_many({"owner_id": owner_id}, {"$set": {"is_primary": False}})
    result = await db.clinics.update_one({"id": clinic_id, "owner_id": owner_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Clinic not found")
    return await db.clinics.find_one({"id": clinic_id, "owner_id": owner_id}, {"_id": 0})


@router.delete("/clinics/{clinic_id}")
async def delete_clinic(clinic_id: str, current_user: dict = Depends(require_doctor_or_owner)):
    owner_id = current_user['id']
    await db.users.update_many(
        {"parent_user_id": owner_id, "clinic_id": clinic_id},
        {"$unset": {"clinic_id": ""}},
    )
    result = await db.clinics.delete_one({"id": clinic_id, "owner_id": owner_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Clinic not found")
    return {"success": True}


@router.get("/clinics/sub-users")
async def list_sub_users(current_user: dict = Depends(require_doctor_or_owner)):
    owner_id = current_user['id']
    return await db.users.find(
        {"parent_user_id": owner_id, "role": "receptionist"},
        {"_id": 0, "hashed_password": 0},
    ).to_list(100)


@router.post("/clinics/sub-users")
async def create_sub_user(payload: SubUserCreate, current_user: dict = Depends(require_doctor_or_owner)):
    owner_id = current_user['id']
    if payload.clinic_id:
        existing = await db.users.count_documents({
            "parent_user_id": owner_id,
            "role": "receptionist",
            "clinic_id": payload.clinic_id,
        })
        if existing >= 2:
            raise HTTPException(status_code=400, detail="Maximum 2 receptionists allowed per clinic")
    if await db.users.find_one({"email": payload.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    is_valid, error_msg = PasswordValidator.validate(payload.password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "name": InputSanitizer.sanitize_html(payload.name),
        "email": payload.email,
        "hashed_password": pwd_context.hash(payload.password),
        "phone_number": payload.phone_number,
        "profession": "receptionist",
        "role": "receptionist",
        "parent_user_id": owner_id,
        "clinic_id": payload.clinic_id,
        "whatsapp_verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user.copy())
    return {k: v for k, v in user.items() if k not in ["hashed_password", "_id"]}


@router.delete("/clinics/sub-users/{sub_user_id}")
async def delete_sub_user(sub_user_id: str, current_user: dict = Depends(require_doctor_or_owner)):
    owner_id = current_user['id']
    result = await db.users.delete_one({"id": sub_user_id, "parent_user_id": owner_id, "role": "receptionist"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sub-user not found")
    return {"success": True}


@router.get("/analytics/opd")
async def opd_analytics(current_user: dict = Depends(require_doctor_or_owner)):
    owner_id = current_user['id']
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    month_ago = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")

    today_total = await db.appointments.count_documents({"professional_id": owner_id, "appointment_date": today_str})
    today_completed = await db.appointments.count_documents({"professional_id": owner_id, "appointment_date": today_str, "status": "completed"})
    today_scheduled = await db.appointments.count_documents({"professional_id": owner_id, "appointment_date": today_str, "status": "scheduled"})

    week_total = await db.appointments.count_documents({"professional_id": owner_id, "appointment_date": {"$gte": week_ago, "$lte": today_str}})
    month_total = await db.appointments.count_documents({"professional_id": owner_id, "appointment_date": {"$gte": month_ago, "$lte": today_str}})

    grouped = await db.appointments.aggregate([
        {"$match": {"professional_id": owner_id, "appointment_date": {"$gte": month_ago}}},
        {"$group": {"_id": "$client_phone", "count": {"$sum": 1}}},
    ]).to_list(10000)
    new_patients = sum(1 for g in grouped if g["count"] == 1)
    followup_patients = sum(1 for g in grouped if g["count"] > 1)

    rev = await db.payment_transactions.aggregate([
        {"$match": {"user_id": owner_id, "payment_status": "paid", "created_at": {"$gte": month_ago}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    month_revenue = rev[0]['total'] if rev else 0

    incentive_tier = "Bronze"; incentive_target_next = 50
    if month_total >= 200:
        incentive_tier, incentive_target_next = "Platinum", None
    elif month_total >= 100:
        incentive_tier, incentive_target_next = "Gold", 200
    elif month_total >= 50:
        incentive_tier, incentive_target_next = "Silver", 100

    return {
        "today": {"total": today_total, "completed": today_completed, "scheduled": today_scheduled},
        "this_week": {"total": week_total},
        "this_month": {
            "total": month_total,
            "new_patients": new_patients,
            "followup_patients": followup_patients,
            "revenue": month_revenue,
        },
        "incentive": {"tier": incentive_tier, "next_target": incentive_target_next, "current": month_total},
    }
