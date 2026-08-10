"""Custom Prescription Letterhead — logo, signature, MCI registration number
and free-text clinic details. Uploaded images stored as base64 data URLs for
simplicity; when we move to object storage this becomes a plain URL swap.
"""
from __future__ import annotations

import base64
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from shared import db, get_current_user, resolve_owner_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/letterhead", tags=["letterhead"])

MAX_IMG_BYTES = 350 * 1024  # 350 KB


class LetterheadUpdate(BaseModel):
    clinic_name: Optional[str] = None
    clinic_address: Optional[str] = None
    clinic_phone: Optional[str] = None
    clinic_email: Optional[str] = None
    doctor_name: Optional[str] = None
    doctor_qualifications: Optional[str] = None   # e.g. "MBBS, MD (Medicine)"
    doctor_specialty: Optional[str] = None
    mci_registration: Optional[str] = None        # State medical council reg #
    footer_note: Optional[str] = None             # e.g. "Consulting hours: …"


@router.get("")
async def get_letterhead(current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    doc = await db.letterheads.find_one({"owner_id": owner_id}, {"_id": 0}) or {}
    doc.setdefault("logo_data_url", "")
    doc.setdefault("signature_data_url", "")
    return doc


@router.put("")
async def upsert_letterhead(body: LetterheadUpdate, current_user: dict = Depends(get_current_user)):
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can update letterhead")
    owner_id = resolve_owner_id(current_user)
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    payload["owner_id"] = owner_id
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.letterheads.update_one({"owner_id": owner_id}, {"$set": payload}, upsert=True)
    return {"message": "Letterhead saved", "updated_at": payload["updated_at"]}


async def _upload_image(field: str, file: UploadFile, current_user: dict):
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can update letterhead")
    content = await file.read()
    if len(content) > MAX_IMG_BYTES:
        raise HTTPException(status_code=413, detail=f"Image must be ≤ {MAX_IMG_BYTES // 1024} KB")
    mime = file.content_type or "image/png"
    if not mime.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are allowed")
    data_url = f"data:{mime};base64,{base64.b64encode(content).decode()}"
    owner_id = resolve_owner_id(current_user)
    await db.letterheads.update_one(
        {"owner_id": owner_id},
        {"$set": {field: data_url, "owner_id": owner_id, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"message": f"{field.split('_')[0].title()} uploaded", "data_url": data_url}


@router.post("/logo")
async def upload_logo(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    return await _upload_image("logo_data_url", file, current_user)


@router.post("/signature")
async def upload_signature(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    return await _upload_image("signature_data_url", file, current_user)


@router.delete("/logo")
async def delete_logo(current_user: dict = Depends(get_current_user)):
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can update letterhead")
    owner_id = resolve_owner_id(current_user)
    await db.letterheads.update_one({"owner_id": owner_id}, {"$unset": {"logo_data_url": ""}})
    return {"message": "Logo removed"}


@router.delete("/signature")
async def delete_signature(current_user: dict = Depends(get_current_user)):
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can update letterhead")
    owner_id = resolve_owner_id(current_user)
    await db.letterheads.update_one({"owner_id": owner_id}, {"$unset": {"signature_data_url": ""}})
    return {"message": "Signature removed"}
