"""Invoicing — clinic-letterhead invoices with reusable consultation-type
templates. Inspired by Eka.Care / Practo / Healthplix invoice anatomy:

- Auto-numbered (INV-YYYY-NNNN per doctor)
- Clinic letterhead + Bill-To patient block
- Line items (description, qty, rate, amount)
- Subtotal, discount, optional GST, total
- Payment status (pending|partial|paid)
- Notes / terms
- Receptionists can view and create but not delete; doctors can do everything
"""
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from shared import (
    db,
    get_current_user,
    resolve_owner_id,
    require_doctor_or_owner,
    insert_doc,
)

router = APIRouter(tags=["invoices"])


# ---- Reusable consultation-type fee templates ----
class ConsultationTypeCreate(BaseModel):
    name: str
    fee: float
    description: Optional[str] = ""


class ConsultationTypeUpdate(BaseModel):
    name: Optional[str] = None
    fee: Optional[float] = None
    description: Optional[str] = None


@router.get("/consultation-types")
async def list_types(current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    items = await db.consultation_types.find(
        {"owner_id": owner_id}, {"_id": 0}
    ).sort("name", 1).to_list(100)
    return items


@router.post("/consultation-types")
async def create_type(payload: ConsultationTypeCreate, current_user: dict = Depends(require_doctor_or_owner)):
    owner_id = current_user['id']
    if payload.fee < 0:
        raise HTTPException(status_code=400, detail="Fee must be non-negative")
    doc = {
        "id": str(uuid.uuid4()),
        "owner_id": owner_id,
        "name": payload.name.strip(),
        "fee": float(payload.fee),
        "description": (payload.description or "").strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await insert_doc(db.consultation_types, doc)
    return doc


@router.put("/consultation-types/{type_id}")
async def update_type(type_id: str, payload: ConsultationTypeUpdate, current_user: dict = Depends(require_doctor_or_owner)):
    owner_id = current_user['id']
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    if "fee" in updates and updates["fee"] < 0:
        raise HTTPException(status_code=400, detail="Fee must be non-negative")
    result = await db.consultation_types.update_one(
        {"id": type_id, "owner_id": owner_id}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Consultation type not found")
    return await db.consultation_types.find_one({"id": type_id, "owner_id": owner_id}, {"_id": 0})


@router.delete("/consultation-types/{type_id}")
async def delete_type(type_id: str, current_user: dict = Depends(require_doctor_or_owner)):
    owner_id = current_user['id']
    result = await db.consultation_types.delete_one({"id": type_id, "owner_id": owner_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Consultation type not found")
    return {"success": True}


# ---- Invoices ----
class InvoiceItem(BaseModel):
    description: str
    consultation_type: Optional[str] = None
    qty: float = 1
    rate: float = 0


class InvoiceCreate(BaseModel):
    appointment_id: Optional[str] = None
    client_name: str
    client_phone: Optional[str] = None
    clinic_id: Optional[str] = None
    items: List[InvoiceItem] = Field(default_factory=list)
    discount: float = 0
    tax_rate: float = 0  # percent
    notes: Optional[str] = ""
    payment_status: str = "pending"  # pending|partial|paid
    amount_paid: float = 0


class InvoiceUpdate(BaseModel):
    items: Optional[List[InvoiceItem]] = None
    discount: Optional[float] = None
    tax_rate: Optional[float] = None
    notes: Optional[str] = None
    payment_status: Optional[str] = None
    amount_paid: Optional[float] = None


VALID_STATUSES = {"pending", "partial", "paid"}


def _compute_totals(items: List[dict], discount: float, tax_rate: float):
    subtotal = sum((it.get("qty", 1) or 0) * (it.get("rate", 0) or 0) for it in items)
    taxable = max(0.0, subtotal - (discount or 0))
    tax_amount = round(taxable * (tax_rate or 0) / 100.0, 2)
    total = round(taxable + tax_amount, 2)
    return round(subtotal, 2), tax_amount, total


async def _next_invoice_number(owner_id: str) -> str:
    """Atomically allocate the next sequence number for the year/doctor and
    format as INV-YYYY-NNNN."""
    year = datetime.now(timezone.utc).year
    counter_id = f"invoice:{owner_id}:{year}"
    doc = await db.counters.find_one_and_update(
        {"id": counter_id},
        {"$inc": {"value": 1}, "$setOnInsert": {"id": counter_id}},
        upsert=True,
        return_document=True,  # ReturnDocument.AFTER not imported — keep simple
    )
    seq = (doc or {}).get("value", 1)
    return f"INV-{year}-{int(seq):04d}"


@router.get("/invoices")
async def list_invoices(
    status: Optional[str] = None,
    client_phone: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    owner_id = resolve_owner_id(current_user)
    query = {"owner_id": owner_id}
    if status:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        query["payment_status"] = status
    if client_phone:
        query["client_phone"] = client_phone
    items = await db.invoices.find(query, {"_id": 0}).sort("issue_date", -1).limit(500).to_list(500)
    return items


@router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    item = await db.invoices.find_one({"id": invoice_id, "owner_id": owner_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return item


@router.post("/invoices")
async def create_invoice(payload: InvoiceCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') == 'receptionist' and any(False for _ in []):
        pass  # placeholder
    owner_id = resolve_owner_id(current_user)
    items = [it.dict() for it in payload.items]
    if not items:
        raise HTTPException(status_code=400, detail="Invoice must have at least one item")
    if payload.payment_status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid payment status")
    subtotal, tax_amount, total = _compute_totals(items, payload.discount or 0, payload.tax_rate or 0)
    if (payload.amount_paid or 0) < 0 or (payload.amount_paid or 0) > total + 0.01:
        raise HTTPException(status_code=400, detail="amount_paid out of range")

    invoice_number = await _next_invoice_number(owner_id)
    doc = {
        "id": str(uuid.uuid4()),
        "owner_id": owner_id,
        "created_by": current_user['id'],
        "invoice_number": invoice_number,
        "appointment_id": payload.appointment_id,
        "client_name": payload.client_name,
        "client_phone": payload.client_phone,
        "clinic_id": payload.clinic_id,
        "items": items,
        "subtotal": subtotal,
        "discount": float(payload.discount or 0),
        "tax_rate": float(payload.tax_rate or 0),
        "tax_amount": tax_amount,
        "total": total,
        "amount_paid": float(payload.amount_paid or 0),
        "payment_status": payload.payment_status,
        "notes": payload.notes or "",
        "issue_date": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await insert_doc(db.invoices, doc)
    return doc


@router.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, payload: InvoiceUpdate, current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    existing = await db.invoices.find_one({"id": invoice_id, "owner_id": owner_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")

    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    if "items" in updates:
        updates["items"] = [it.dict() if hasattr(it, 'dict') else it for it in updates["items"]]
    if "payment_status" in updates and updates["payment_status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid payment status")

    # Recompute totals if anything affecting them changed
    if any(k in updates for k in ["items", "discount", "tax_rate"]):
        merged = {**existing, **updates}
        subtotal, tax_amount, total = _compute_totals(
            merged.get("items", []),
            merged.get("discount", 0) or 0,
            merged.get("tax_rate", 0) or 0,
        )
        updates["subtotal"] = subtotal
        updates["tax_amount"] = tax_amount
        updates["total"] = total

    if "amount_paid" in updates:
        if updates["amount_paid"] < 0:
            raise HTTPException(status_code=400, detail="amount_paid must be non-negative")
        total_for_check = updates.get("total", existing.get("total", 0))
        if updates["amount_paid"] > total_for_check + 0.01:
            raise HTTPException(status_code=400, detail="amount_paid exceeds total")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.invoices.update_one({"id": invoice_id, "owner_id": owner_id}, {"$set": updates})
    return await db.invoices.find_one({"id": invoice_id, "owner_id": owner_id}, {"_id": 0})


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, current_user: dict = Depends(require_doctor_or_owner)):
    owner_id = current_user['id']
    result = await db.invoices.delete_one({"id": invoice_id, "owner_id": owner_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"success": True}
