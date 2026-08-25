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



class ReviewsSettingsPayload(BaseModel):
    google_review_url: Optional[str] = None
    enabled: bool = True
    delay_hours: int = 2

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

    # Persist the intent so we can render a public /pay/{id} landing page for
    # desktop users whose WhatsApp cannot follow raw upi:// deep-links.
    import uuid as _uuid
    from datetime import timedelta as _td
    intent_id = _uuid.uuid4().hex[:12]
    await db.pay_intents.insert_one({
        "id": intent_id,
        "owner_id": owner_id,
        "vpa": upi["upi_id"],
        "display_name": upi.get("display_name") or "Lumera Clinic",
        "amount": float(body.amount),
        "note": body.note or "",
        "invoice_id": body.invoice_id,
        "upi_intent": intent,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + _td(hours=24)).isoformat(),
    })

    import os as _os
    origin = _os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
    payment_page_url = f"{origin}/pay/{intent_id}" if origin else f"/pay/{intent_id}"

    return {
        "intent_id": intent_id,
        "upi_intent": intent,
        "qr_png_data_url": _png_data_url(intent),
        "vpa": upi["upi_id"],
        "display_name": upi.get("display_name"),
        "payment_page_url": payment_page_url,
    }


@router.get("/payments/upi/intent/{intent_id}")
async def get_public_upi_intent(intent_id: str):
    """PUBLIC (no auth) endpoint used by the /pay/{id} landing page."""
    doc = await db.pay_intents.find_one({"id": intent_id}, {"_id": 0, "owner_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Payment link not found or expired")
    if doc.get("expires_at"):
        try:
            exp = datetime.fromisoformat(doc["expires_at"])
            if datetime.now(timezone.utc) > exp:
                raise HTTPException(status_code=410, detail="Payment link expired")
        except HTTPException:
            raise
        except Exception:  # noqa: BLE001
            pass
    doc["qr_png_data_url"] = _png_data_url(doc["upi_intent"])
    return doc


# --------------------------------------------------------------------------- #
# Mark invoice paid (Cash) + optional WhatsApp receipt                         #
# --------------------------------------------------------------------------- #

@router.post("/settings/payment/verify-upi")
async def verify_upi(current_user: dict = Depends(get_current_user)):
    """Basic UPI VPA format check + build a ₹1 test intent to ensure the QR generator works."""
    owner_id = resolve_owner_id(current_user)
    cfg = await _get_settings(owner_id)
    upi = (cfg.get("upi") or {})
    vpa = (upi.get("upi_id") or "").strip()
    if not vpa:
        raise HTTPException(status_code=400, detail="UPI ID not saved yet")

    # RBI-published VPA regex: user@handle where handle is a bank/PSP identifier.
    import re as _re
    pattern = r"^[a-zA-Z0-9.\-_]{2,50}@[a-zA-Z]{2,20}$"
    if not _re.match(pattern, vpa):
        return {"valid": False, "reason": "UPI ID doesn't look right. Format should be name@handle (e.g. drsmith@okaxis)."}

    # Handle allowlist — common Indian PSP handles
    handle = vpa.split("@", 1)[1].lower()
    known_handles = {
        "okaxis", "okhdfcbank", "okicici", "oksbi", "okboi", "okpnb", "okbizaxis",
        "ybl", "axl", "ibl", "airtel", "apl", "abfspay", "aubank", "barodampay",
        "cnrb", "citi", "citigold", "dbs", "fam", "federal", "freecharge", "hdfcbank",
        "icici", "idbi", "idfcbank", "indus", "kaypay", "kbl", "kotak", "kmb",
        "mahb", "myicici", "obc", "paytm", "pingpay", "pnb", "postbank", "rbl",
        "sbi", "sc", "scb", "seb", "shrigradbank", "sib", "srib", "tapicici",
        "ubi", "unionbankofindia", "upi", "utbi", "vijb", "waaxis", "wahdfcbank",
        "waicici", "wasbi", "yesg", "yesbankltd", "google", "gpay",
    }
    handle_known = handle in known_handles

    # Try building the QR/intent — if this fails, credentials are broken.
    try:
        intent = _build_upi_intent(vpa, upi.get("display_name") or "Lumera", 1.0, "Verify", None)
        _png_data_url(intent)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"QR generation failed: {e}")

    return {
        "valid": True,
        "vpa": vpa,
        "handle_recognized": handle_known,
        "note": (
            "Format looks valid and QR generation works."
            + ("" if handle_known else f" Handle '@{handle}' is not in our common-handle list; double-check it if payments fail.")
        ),
    }


@router.post("/settings/payment/verify-gateway")
async def verify_gateway(current_user: dict = Depends(get_current_user)):
    """Best-effort connectivity check for the configured gateway (currently only Razorpay is wired)."""
    owner_id = resolve_owner_id(current_user)
    cfg = await _get_settings(owner_id)
    gateway = cfg.get("gateway") or {}
    provider = gateway.get("provider")
    creds = gateway.get("credentials") or {}
    if not provider:
        raise HTTPException(status_code=400, detail="No gateway configured")

    if provider != "razorpay":
        # Format-only check for other providers
        expected = {p["id"]: p["fields"] for p in SUPPORTED_PROVIDERS}[provider]
        missing = [f for f in expected if not creds.get(f)]
        if missing:
            return {"valid": False, "reason": f"Missing fields: {missing}"}
        return {"valid": True, "provider": provider, "note": "Format check passed. Live connectivity test is only wired for Razorpay right now."}

    # Razorpay: ping /v1/orders with the key
    key_id = creds.get("key_id")
    enc_secret = creds.get("key_secret")
    if not (key_id and enc_secret):
        return {"valid": False, "reason": "Razorpay key_id or key_secret missing"}
    try:
        key_secret = encryption_manager.decrypt(enc_secret)
    except Exception:  # noqa: BLE001
        return {"valid": False, "reason": "Could not decrypt stored key_secret. Re-save credentials."}

    import httpx as _httpx
    try:
        async with _httpx.AsyncClient(timeout=10) as client:
            # /v1/orders?count=1 is a cheap read to validate creds
            r = await client.get(
                "https://api.razorpay.com/v1/orders?count=1",
                auth=(key_id, key_secret),
            )
        if r.status_code == 200:
            return {"valid": True, "provider": "razorpay", "note": "Razorpay credentials verified."}
        if r.status_code in (401, 403):
            return {"valid": False, "provider": "razorpay", "reason": "Razorpay rejected the credentials (401/403). Re-check key_id and key_secret."}
        return {"valid": False, "provider": "razorpay", "reason": f"HTTP {r.status_code}: {r.text[:200]}"}
    except Exception as e:  # noqa: BLE001
        return {"valid": False, "provider": "razorpay", "reason": f"Network error: {e}"}



@router.get("/settings/reviews")
async def get_reviews_settings(current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    doc = await db.review_settings.find_one({"owner_id": owner_id}, {"_id": 0}) or {}
    return {
        "google_review_url": doc.get("google_review_url", ""),
        "enabled": doc.get("enabled", True),
        "delay_hours": doc.get("delay_hours", 2),
    }


@router.put("/settings/reviews")
async def save_reviews_settings(body: ReviewsSettingsPayload, current_user: dict = Depends(get_current_user)):
    if body.google_review_url and not body.google_review_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Review URL must start with http:// or https://")
    if body.delay_hours < 0 or body.delay_hours > 168:
        raise HTTPException(status_code=400, detail="Delay must be between 0 and 168 hours (7 days)")
    owner_id = resolve_owner_id(current_user)
    await db.review_settings.update_one(
        {"owner_id": owner_id},
        {"$set": {
            "owner_id": owner_id,
            "google_review_url": (body.google_review_url or "").strip(),
            "enabled": body.enabled,
            "delay_hours": body.delay_hours,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": "Review loop settings saved"}

@router.post("/invoices/{invoice_id}/send-receipt")
async def send_invoice_receipt(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Send a WhatsApp receipt for a paid invoice — used by the auto-dispatch on Mark Paid."""
    owner_id = resolve_owner_id(current_user)
    inv = await db.invoices.find_one({"id": invoice_id, "owner_id": owner_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Invoice is not marked paid yet")
    phone = (inv.get("client_phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Invoice has no client_phone on file")

    method = (inv.get("payment_method") or "gateway").upper()
    amount = float(inv.get("amount_paid") or inv.get("total") or 0)
    doctor_name = current_user.get("name") or "Lumera Clinic"
    msg = (
        f"Hi {inv.get('client_name','')}, we've received your payment of ₹{amount:.2f} "
        f"({method}) for invoice {inv.get('invoice_number', invoice_id[:8])}.\n"
        f"Thank you for choosing us.\n- {doctor_name}"
    )
    try:
        result = await send_whatsapp_message(phone, msg)
        # Treat None (unconfigured / skipped) as NOT sent — only a real Twilio message object counts.
        sent = bool(result)
    except Exception:  # noqa: BLE001
        sent = False

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {
            "receipt_sent_at": now_iso if sent else None,
            "receipt_status": "sent" if sent else "failed",
        }},
    )
    return {"invoice_id": invoice_id, "receipt_sent": sent}


# --------------------------------------------------------------------------- #
# Workspace AI Config                                                          #
# --------------------------------------------------------------------------- #

VALID_TONES = {"Professional", "Empathetic", "Direct"}


class AIConfigPayload(BaseModel):
    persona_name: Optional[str] = None
    tone: Optional[str] = None  # Professional | Empathetic | Direct
    working_hours: Optional[str] = None
    emergency_number: Optional[str] = None
    custom_system_instructions: Optional[str] = None
    special_guidelines: Optional[str] = None


@router.get("/workspace/ai-config")
async def get_ai_config(current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    doc = await db.workspace_ai_config.find_one({"owner_id": owner_id}, {"_id": 0}) or {}
    return {
        "persona_name": doc.get("persona_name", ""),
        "tone": doc.get("tone", "Professional"),
        "working_hours": doc.get("working_hours", ""),
        "emergency_number": doc.get("emergency_number", ""),
        "custom_system_instructions": doc.get("custom_system_instructions", ""),
        "special_guidelines": doc.get("special_guidelines", ""),
    }


@router.put("/workspace/ai-config")
async def save_ai_config(body: AIConfigPayload, current_user: dict = Depends(get_current_user)):
    if body.tone and body.tone not in VALID_TONES:
        raise HTTPException(status_code=400, detail=f"tone must be one of {sorted(VALID_TONES)}")
    owner_id = resolve_owner_id(current_user)
    update: dict = {"owner_id": owner_id, "updated_at": datetime.now(timezone.utc).isoformat()}
    for field in AIConfigPayload.model_fields:
        val = getattr(body, field)
        if val is not None:
            update[field] = val.strip() if isinstance(val, str) else val
    await db.workspace_ai_config.update_one(
        {"owner_id": owner_id},
        {"$set": update},
        upsert=True,
    )
    return {"message": "AI config saved"}


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
                result = await send_whatsapp_message(phone, msg)
                receipt_sent = bool(result)
            except Exception:  # noqa: BLE001
                receipt_sent = False

    return {
        "invoice_id": invoice_id,
        "payment_status": status,
        "amount_paid": paid,
        "receipt_sent": receipt_sent,
    }
