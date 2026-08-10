"""Rx Presets — save/load multi-drug prescription templates.

Presets are owned by the doctor (scoped by resolve_owner_id so front-desk /
assistant staff see the same list as their parent doctor).
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from shared import db, get_current_user, resolve_owner_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rx-presets", tags=["rx-presets"])


class RxPresetCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = None
    medications: List[Dict[str, Any]] = Field(..., min_items=1)
    default_instructions: Optional[str] = ""


class RxPresetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    medications: Optional[List[Dict[str, Any]]] = None
    default_instructions: Optional[str] = None


@router.get("")
async def list_presets(current_user: dict = Depends(get_current_user)):
    """List own presets + presets shared to the polyclinic the user belongs to."""
    owner_id = resolve_owner_id(current_user)
    me = await db.users.find_one({"id": owner_id}, {"_id": 0, "polyclinic_id": 1}) or {}
    query = {"$or": [{"owner_id": owner_id}]}
    if me.get("polyclinic_id"):
        query["$or"].append({"shared_polyclinic_id": me["polyclinic_id"]})
    presets = await db.rx_presets.find(query, {"_id": 0}).sort("name", 1).to_list(400)
    # Annotate presets with is_mine flag for the UI
    for p in presets:
        p["is_mine"] = p.get("owner_id") == owner_id
    return presets


@router.post("/{preset_id}/share")
async def toggle_share(preset_id: str, current_user: dict = Depends(get_current_user)):
    """Toggle sharing this preset with the polyclinic team."""
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can share Rx presets")
    owner_id = resolve_owner_id(current_user)
    preset = await db.rx_presets.find_one({"id": preset_id, "owner_id": owner_id}, {"_id": 0})
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    me = await db.users.find_one({"id": owner_id}, {"_id": 0, "polyclinic_id": 1, "name": 1}) or {}
    if not me.get("polyclinic_id"):
        raise HTTPException(status_code=400, detail="You need to belong to a polyclinic to share presets")
    now_shared = not bool(preset.get("shared_polyclinic_id"))
    if now_shared:
        await db.rx_presets.update_one({"id": preset_id}, {"$set": {
            "shared_polyclinic_id": me["polyclinic_id"],
            "shared_by_name": me.get("name"),
            "shared_at": datetime.now(timezone.utc).isoformat(),
        }})
    else:
        await db.rx_presets.update_one({"id": preset_id}, {"$unset": {"shared_polyclinic_id": "", "shared_at": ""}})
    return {"message": "Sharing updated", "shared": now_shared}


@router.post("")
async def create_preset(body: RxPresetCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can create Rx presets")
    owner_id = resolve_owner_id(current_user)
    preset = {
        "id": str(uuid.uuid4()),
        "owner_id": owner_id,
        "name": body.name,
        "description": body.description or "",
        "medications": body.medications,
        "default_instructions": body.default_instructions or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rx_presets.insert_one(preset.copy())
    return preset


@router.put("/{preset_id}")
async def update_preset(preset_id: str, body: RxPresetUpdate, current_user: dict = Depends(get_current_user)):
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can update Rx presets")
    owner_id = resolve_owner_id(current_user)
    existing = await db.rx_presets.find_one({"id": preset_id, "owner_id": owner_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Preset not found")
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.rx_presets.update_one({"id": preset_id}, {"$set": update})
    return await db.rx_presets.find_one({"id": preset_id}, {"_id": 0})


@router.delete("/{preset_id}")
async def delete_preset(preset_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can delete Rx presets")
    owner_id = resolve_owner_id(current_user)
    result = await db.rx_presets.delete_one({"id": preset_id, "owner_id": owner_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Preset not found")
    return {"message": "Preset deleted"}
