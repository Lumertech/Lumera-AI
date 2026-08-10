"""Payment & Gateway Settings — per-owner payment collection configuration.

Supports three collection methods (each doctor/practice picks ONE as active):

  A. UPI VPA         — static UPI id, dynamic QR + upi:// deep-link at pay time
  B. Turnkey OAuth   — Razorpay / Stripe Connect (scaffolded; docs link only for now)
  C. Direct API keys — Razorpay / PhonePe / Paytm / Cashfree / PayU / Stripe /
                       Airpay (SabPaisa). Credentials are encrypted (Fernet) and
                       only masked previews (`rzp_live_••••••1234`) leave the API.

Endpoints (all prefixed with /api by server.py):
    GET  /settings/payment                     — current active method + non-secret metadata
    PUT  /settings/payment/method              — pick active method: upi | gateway | cash
    PUT  /settings/payment/upi                 — save/update UPI VPA + display name
    PUT  /settings/payment/gateway             — save/update direct API creds (encrypted)
    GET  /settings/payment/providers           — list all supported providers + field schema
    POST /payments/upi/intent                  — build upi://pay?…&am=<amount> string + QR PNG
    POST /invoices/{invoice_id}/mark-cash-paid — mark invoice paid (cash), optional WA receipt
"""
from __future__ import annotations

import base64
import io
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from security import encryption_manager
from shared import db, get_current_user, resolve_owner_id, send_whatsapp_message

router = APIRouter(tags=["settings"])

# --------------------------------------------------------------------------- #
# Supported providers + credential field schemas                              #
# --------------------------------------------------------------------------- #

SUPPORTED_PROVIDERS: List[Dict[str, Any]] = [
    {"id": "razorpay",  "name": "Razorpay",        "country": "IN", "fields": ["key_id", "key_secret"]},
    {"id": "phonepe",   "name": "PhonePe Business","country": "IN", "fields": ["merchant_id", "salt_key", "salt_index"]},
    {"id": "paytm",     "name": "Paytm for Business","country": "IN", "fields": ["merchant_id", "merchant_key", "website"]},
    {"id": "cashfree",  "name": "Cashfree Payments","country": "IN", "fields": ["app_id", "secret_key"]},
    {"id": "payu",      "name": "PayU India",      "country": "IN", "fields": ["merchant_key", "merchant_salt"]},
    {"id": "stripe",    "name": "Stripe",          "country": "GLOBAL", "fields": ["publishable_key", "secret_key"]},
    {"id": "airpay",    "name": "Airpay / SabPaisa","country": "IN", "fields": ["merchant_id", "api_key", "encryption_key"]},
]

# Fields per provider that hold sensitive secrets (encrypted at rest & masked out).
_SECRET_FIELDS = {
    "razorpay":  ["key_secret"],
    "phonepe":   ["salt_key"],
    "paytm":     ["merchant_key"],
    "cashfree":  ["secret_key"],
    "payu":      ["merchant_salt"],
    "stripe":    ["secret_key"],
    "airpay":    ["api_key", "encryption_key"],
}

VALID_METHODS = {"upi", "gateway", "cash"}


def _mask(secret: str, keep: int = 4) -> str:
    if not secret:
        return ""
    if len(secret) <= keep:
        return "•" * len(secret)
    return f"{'•' * (len(secret) - keep)}{secret[-keep:]}"


def _sanitize_gateway(cfg: dict) -> dict:
    """Return a safe-to-render copy: masked secrets, plain non-secrets."""
    if not cfg:
        return {}
    provider = cfg.get("provider")
    secret_fields = _SECRET_FIELDS.get(provider, [])
    creds = cfg.get("credentials", {}) or {}
    safe = {}
    for k, v in creds.items():
        if k in secret_fields and v:
            try:
                plain = encryption_manager.decrypt(v)
            except Exception:  # noqa: BLE001
                plain = ""
            safe[k] = _mask(plain)
        else:
            safe[k] = v
    return {"provider": provider, "credentials": safe}


async def _get_settings(owner_id: str) -> dict:
    doc = await db.payment_settings.find_one({"owner_id": owner_id}, {"_id": 0})
    return doc or {}


# --------------------------------------------------------------------------- #
# Models                                                                      #
# --------------------------------------------------------------------------- #

class MethodPayload(BaseModel):
    method: str = Field(..., description="upi | gateway | cash")


class UPIPayload(BaseModel):
    upi_id: str = Field(..., min_length=3, max_length=80)
    display_name: Optional[str] = None


class GatewayPayload(BaseModel):
    provider: str
    credentials: Dict[str, str]


class UPIIntentPayload(BaseModel):
    amount: float = Field(..., ge=1)
    note: Optional[str] = None
    invoice_id: Optional[str] = None


class MarkCashPaidPayload(BaseModel):
    amount_paid: Optional[float] = None
    send_whatsapp_receipt: bool = False
    receipt_phone: Optional[str] = None


# --------------------------------------------------------------------------- #
# Providers + current settings                                                 #
# --------------------------------------------------------------------------- #

@router.get("/settings/payment/providers")
async def list_providers(_: dict = Depends(get_current_user)):
    return {"providers": SUPPORTED_PROVIDERS}


@router.get("/settings/payment")
async def get_payment_settings(current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    cfg = await _get_settings(owner_id)
    return {
        "method": cfg.get("method", "upi"),
        "upi": cfg.get("upi", {}) or {},
        "gateway": _sanitize_gateway(cfg.get("gateway") or {}),
        "configured": {
            "upi": bool(cfg.get("upi", {}).get("upi_id")),
            "gateway": bool(cfg.get("gateway", {}).get("provider") and cfg.get("gateway", {}).get("credentials")),
        },
    }


# --------------------------------------------------------------------------- #
# Update payment method / UPI / Gateway                                        #
# --------------------------------------------------------------------------- #

@router.put("/settings/payment/method")
async def set_method(body: MethodPayload, current_user: dict = Depends(get_current_user)):
    if body.method not in VALID_METHODS:
        raise HTTPException(status_code=400, detail=f"method must be one of {sorted(VALID_METHODS)}")
    owner_id = resolve_owner_id(current_user)
    await db.payment_settings.update_one(
        {"owner_id": owner_id},
        {"$set": {
            "owner_id": owner_id,
            "method": body.method,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"method": body.method}


@router.put("/settings/payment/upi")
async def set_upi(body: UPIPayload, current_user: dict = Depends(get_current_user)):
    upi = body.upi_id.strip()
    # loose validation — user@handle format
    if "@" not in upi or len(upi.split("@")[0]) < 2 or len(upi.split("@")[1]) < 2:
        raise HTTPException(status_code=400, detail="Enter a valid UPI ID (e.g. drsmith@okaxis)")

    owner_id = resolve_owner_id(current_user)
    await db.payment_settings.update_one(
        {"owner_id": owner_id},
        {"$set": {
            "owner_id": owner_id,
            "method": "upi",
            "upi": {
                "upi_id": upi,
                "display_name": (body.display_name or current_user.get("name") or "Lumera Clinic").strip(),
            },
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": "UPI VPA saved", "upi_id": upi}


@router.put("/settings/payment/gateway")
async def set_gateway(body: GatewayPayload, current_user: dict = Depends(get_current_user)):
    provider_ids = {p["id"] for p in SUPPORTED_PROVIDERS}
    if body.provider not in provider_ids:
        raise HTTPException(status_code=400, detail=f"provider must be one of {sorted(provider_ids)}")
    provider_def = next(p for p in SUPPORTED_PROVIDERS if p["id"] == body.provider)
    expected_fields = set(provider_def["fields"])
    got = {k: v for k, v in (body.credentials or {}).items() if v is not None and str(v).strip() != ""}
    missing = expected_fields - set(got.keys())
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing credential fields for {body.provider}: {sorted(missing)}")

    # Encrypt only fields marked as secret
    secret_fields = set(_SECRET_FIELDS.get(body.provider, []))
    stored = {}
    for k, v in got.items():
        if k not in expected_fields:
            continue  # ignore unknown fields
        stored[k] = encryption_manager.encrypt(str(v)) if k in secret_fields else str(v).strip()

    owner_id = resolve_owner_id(current_user)
    await db.payment_settings.update_one(
        {"owner_id": owner_id},
        {"$set": {
            "owner_id": owner_id,
            "gateway": {
                "provider": body.provider,
                "credentials": stored,
                "connected_at": datetime.now(timezone.utc).isoformat(),
            },
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": f"{provider_def['name']} credentials saved", "provider": body.provider}


@router.delete("/settings/payment/gateway")
async def disconnect_gateway(current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    await db.payment_settings.update_one(
        {"owner_id": owner_id},
        {"$unset": {"gateway": ""}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"message": "Gateway credentials removed"}


# --------------------------------------------------------------------------- #
# UPI intent link + QR                                                         #
# --------------------------------------------------------------------------- #

def _build_upi_intent(vpa: str, name: str, amount: float, note: Optional[str], txn_ref: Optional[str]) -> str:
    """Return standard NPCI-format upi://pay deep-link."""
    params = {
        "pa": vpa,
        "pn": name,
        "am": f"{amount:.2f}",
        "cu": "INR",
    }
    if note:
        params["tn"] = note[:80]
    if txn_ref:
        params["tr"] = txn_ref[:35]
    return "upi://pay?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)


def _png_data_url(data: str) -> str:
    img = qrcode.make(data)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"


@router.post("/payments/upi/intent")
async def build_upi_payment(body: UPIIntentPayload, current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    cfg = await _get_settings(owner_id)
    upi = (cfg.get("upi") or {})
    if not upi.get("upi_id"):
        raise HTTPException(status_code=400, detail="UPI ID not configured. Save it under Settings → Payment.")

    txn_ref = None
    if body.invoice_id:
        txn_ref = f"INV{body.invoice_id[:16]}"

    intent = _build_upi_intent(
        vpa=upi["upi_id"],
        name=upi.get("display_name") or "Lumera Clinic",
        amount=float(body.amount),
        note=body.note,
        txn_ref=txn_ref,
    )
    return {
        "upi_intent": intent,
        "qr_png_data_url": _png_data_url(intent),
        "vpa": upi["upi_id"],
        "display_name": upi.get("display_name"),
    }


# --------------------------------------------------------------------------- #
# Mark invoice paid (Cash) + optional WhatsApp receipt                         #
# --------------------------------------------------------------------------- #

@router.post("/invoices/{invoice_id}/mark-cash-paid")
async def mark_invoice_cash_paid(
    invoice_id: str,
    body: MarkCashPaidPayload,
    current_user: dict = Depends(get_current_user),
):
    owner_id = resolve_owner_id(current_user)
    inv = await db.invoices.find_one({"id": invoice_id, "owner_id": owner_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    total = float(inv.get("total", 0))
    paid = float(body.amount_paid) if body.amount_paid is not None else total
    if paid <= 0:
        raise HTTPException(status_code=400, detail="Paid amount must be greater than 0")
    if paid > total + 0.01:  # tiny float tolerance
        raise HTTPException(status_code=400, detail=f"Paid amount (₹{paid:.2f}) exceeds invoice total (₹{total:.2f})")

    status = "paid" if paid >= total else "partial"
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.invoices.update_one(
        {"id": invoice_id, "owner_id": owner_id},
        {"$set": {
            "payment_status": status,
            "payment_method": "cash",
            "amount_paid": paid,
            "paid_at": now_iso,
            "paid_by": current_user.get("name") or current_user.get("email"),
            "updated_at": now_iso,
        }},
    )

    receipt_sent = False
    if body.send_whatsapp_receipt:
        phone = (body.receipt_phone or inv.get("client_phone") or "").strip()
        if phone:
            msg = (
                f"Hi {inv.get('client_name','')}, we've received your cash payment of "
                f"₹{paid:.2f} for invoice {inv.get('invoice_number', invoice_id)}. "
                f"Thank you.\n- {current_user.get('name','Lumera Clinic')}"
            )
            try:
                await send_whatsapp_message(phone, msg)
                receipt_sent = True
            except Exception:  # noqa: BLE001
                receipt_sent = False

    return {
        "invoice_id": invoice_id,
        "payment_status": status,
        "amount_paid": paid,
        "receipt_sent": receipt_sent,
    }
