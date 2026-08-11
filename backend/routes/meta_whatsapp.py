"""Meta WhatsApp Cloud API integration — scaffolding.

Once the doctor fills in Meta App ID / WABA / Phone Number ID / System User
Token via `/api/meta-whatsapp/config`, we call the Graph API v20.0 directly.

Endpoints:
  GET  /meta-whatsapp/config          — current server-side config presence
  PUT  /meta-whatsapp/config          — save/replace creds (owner-scoped)
  POST /meta-whatsapp/send            — send templated text or quick-reply message
  POST /meta-whatsapp/webhook         — inbound message webhook
  GET  /meta-whatsapp/webhook         — hub.challenge verification handshake
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from shared import db, get_current_user, resolve_owner_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/meta-whatsapp", tags=["meta-whatsapp"])

GRAPH_VERSION = "v20.0"
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_VERSION}"


class MetaConfig(BaseModel):
    app_id: Optional[str] = None
    app_secret: Optional[str] = None
    waba_id: Optional[str] = None
    phone_number_id: Optional[str] = None
    system_user_token: Optional[str] = None
    webhook_verify_token: Optional[str] = None


class QuickReplyButton(BaseModel):
    id: str = Field(..., max_length=256)
    title: str = Field(..., max_length=20)


class SendMessage(BaseModel):
    to: str = Field(..., description="+E.164 phone number")
    body: str = Field(..., max_length=4096)
    buttons: Optional[List[QuickReplyButton]] = None   # up to 3 quick replies


async def _get_config(owner_id: str) -> dict:
    cfg = await db.meta_whatsapp_configs.find_one({"owner_id": owner_id}, {"_id": 0}) or {}
    # Env-level fallback (useful if the whole clinic uses one Meta app)
    for k in ("app_id", "app_secret", "waba_id", "phone_number_id", "system_user_token", "webhook_verify_token"):
        cfg.setdefault(k, os.environ.get(f"META_{k.upper()}", "") or None)
    return cfg


@router.get("/config")
async def get_config(current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    cfg = await _get_config(owner_id)
    # Never leak the token; only presence
    return {
        "app_id": cfg.get("app_id") or "",
        "waba_id": cfg.get("waba_id") or "",
        "phone_number_id": cfg.get("phone_number_id") or "",
        "webhook_verify_token": cfg.get("webhook_verify_token") or "",
        "has_app_secret": bool(cfg.get("app_secret")),
        "has_system_user_token": bool(cfg.get("system_user_token")),
        "configured": bool(cfg.get("phone_number_id") and cfg.get("system_user_token")),
        "webhook_url": f"{os.environ.get('PUBLIC_BASE_URL', '')}/api/meta-whatsapp/webhook".rstrip("/"),
    }


@router.put("/config")
async def set_config(body: MetaConfig, current_user: dict = Depends(get_current_user)):
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can update WhatsApp config")
    owner_id = resolve_owner_id(current_user)
    payload = {k: (v or None) for k, v in body.model_dump().items() if v is not None}
    payload["owner_id"] = owner_id
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.meta_whatsapp_configs.update_one({"owner_id": owner_id}, {"$set": payload}, upsert=True)
    return {"message": "Saved", "configured": bool(payload.get("phone_number_id") and payload.get("system_user_token"))}


@router.post("/templates/publish")
async def publish_templates(current_user: dict = Depends(get_current_user)):
    """Publish Lumera's 4 utility templates to the connected doctor's WABA.

    Idempotent: templates that already exist are reported as `already_exists`,
    not re-created. Approval by Meta typically takes 1–24 hours.
    """
    from whatsapp_templates import LUMERA_UTILITY_TEMPLATES, DEFAULT_LANGUAGE  # local import to avoid module-load penalty

    TEMPLATE_ALREADY_EXISTS_CODES = {2388023, 100}

    owner_id = resolve_owner_id(current_user)
    cfg = await _get_config(owner_id)
    if not (cfg.get("waba_id") and cfg.get("system_user_token")):
        raise HTTPException(
            status_code=400,
            detail="Meta WhatsApp not configured. Add WABA ID and System User Token in Settings → WhatsApp.",
        )

    headers = {"Authorization": f"Bearer {cfg['system_user_token']}", "Content-Type": "application/json"}
    url = f"{GRAPH_BASE}/{cfg['waba_id']}/message_templates"

    results = []
    async with httpx.AsyncClient(timeout=30) as client:
        for tmpl in LUMERA_UTILITY_TEMPLATES:
            resp = await client.post(url, headers=headers, json=tmpl)
            try:
                body = resp.json()
            except Exception:  # noqa: BLE001
                body = {"raw": resp.text}

            if resp.status_code in (200, 201):
                results.append({
                    "name": tmpl["name"],
                    "status": "submitted",
                    "id": body.get("id"),
                    "review_status": body.get("status"),
                })
                continue

            err = body.get("error", {}) if isinstance(body, dict) else {}
            if err.get("code") in TEMPLATE_ALREADY_EXISTS_CODES or err.get("error_subcode") in TEMPLATE_ALREADY_EXISTS_CODES:
                results.append({"name": tmpl["name"], "status": "already_exists"})
            else:
                results.append({
                    "name": tmpl["name"],
                    "status": "failed",
                    "http": resp.status_code,
                    "error": err.get("message") or str(body)[:300],
                })

    summary = {
        "submitted": sum(1 for r in results if r["status"] == "submitted"),
        "already_exists": sum(1 for r in results if r["status"] == "already_exists"),
        "failed": sum(1 for r in results if r["status"] == "failed"),
    }
    return {"language": DEFAULT_LANGUAGE, "summary": summary, "results": results}


@router.get("/templates")
async def list_templates(current_user: dict = Depends(get_current_user)):
    """List templates on the doctor's WABA (fetches from Meta live)."""
    owner_id = resolve_owner_id(current_user)
    cfg = await _get_config(owner_id)
    if not (cfg.get("waba_id") and cfg.get("system_user_token")):
        return {"configured": False, "templates": []}
    url = f"{GRAPH_BASE}/{cfg['waba_id']}/message_templates?fields=name,language,category,status,quality_score"
    headers = {"Authorization": f"Bearer {cfg['system_user_token']}"}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, headers=headers)
    if r.status_code != 200:
        return {"configured": True, "templates": [], "error": r.text[:300]}
    return {"configured": True, "templates": r.json().get("data", [])}


@router.post("/send")
async def send_message(body: SendMessage, current_user: dict = Depends(get_current_user)):
    owner_id = resolve_owner_id(current_user)
    cfg = await _get_config(owner_id)
    if not (cfg.get("phone_number_id") and cfg.get("system_user_token")):
        raise HTTPException(status_code=400, detail="Meta WhatsApp not configured. Add credentials in Settings → WhatsApp.")

    url = f"{GRAPH_BASE}/{cfg['phone_number_id']}/messages"
    headers = {"Authorization": f"Bearer {cfg['system_user_token']}", "Content-Type": "application/json"}

    if body.buttons:
        # Interactive quick-reply buttons (up to 3)
        buttons = [{"type": "reply", "reply": {"id": b.id, "title": b.title}} for b in body.buttons[:3]]
        payload: Dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": body.to.lstrip("+"),
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body.body},
                "action": {"buttons": buttons},
            },
        }
    else:
        payload = {
            "messaging_product": "whatsapp",
            "to": body.to.lstrip("+"),
            "type": "text",
            "text": {"body": body.body},
        }

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.post(url, json=payload, headers=headers)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Meta Graph API unreachable: {e}")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Meta rejected message: {r.text[:300]}")

    # Log
    await db.meta_whatsapp_messages.insert_one({
        "owner_id": owner_id, "direction": "outbound", "to": body.to,
        "body": body.body, "buttons": [b.model_dump() for b in (body.buttons or [])],
        "graph_response": r.json(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"message": "Sent", "graph": r.json()}


# ---------- Webhook ----------
@router.get("/webhook")
async def verify_webhook(request: Request):
    """Meta hub.challenge verification. Uses any doctor's webhook_verify_token
    (first match) — for multi-tenant we recommend one central verify token via env."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    if mode != "subscribe" or not token:
        raise HTTPException(status_code=403, detail="Invalid verification request")
    # Try env first
    env_token = os.environ.get("META_WEBHOOK_VERIFY_TOKEN")
    if env_token and token == env_token:
        return PlainTextResponse(challenge or "")
    # Fallback: any user has this token
    match = await db.meta_whatsapp_configs.find_one({"webhook_verify_token": token}, {"_id": 0, "owner_id": 1})
    if not match:
        raise HTTPException(status_code=403, detail="Verify token mismatch")
    return PlainTextResponse(challenge or "")


@router.post("/webhook")
async def receive_webhook(request: Request):
    """Inbound messages / status callbacks. When app_secret is configured for a
    tenant, we verify Meta's `X-Hub-Signature-256` HMAC before persisting.
    Unsigned/invalid requests are rejected with 401."""
    raw = await request.body()
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Signature verification (optional per tenant — only enforced when secret present)
    sig_hdr = request.headers.get("x-hub-signature-256", "")
    verified = False
    if sig_hdr.startswith("sha256="):
        import hmac, hashlib
        provided = sig_hdr.split("=", 1)[1]
        # Try env secret first, then any per-tenant app_secret
        candidates = [os.environ.get("META_APP_SECRET", "")]
        async for c in db.meta_whatsapp_configs.find({"app_secret": {"$ne": None}}, {"_id": 0, "app_secret": 1}):
            if c.get("app_secret"):
                candidates.append(c["app_secret"])
        for secret in [s for s in candidates if s]:
            expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
            if hmac.compare_digest(expected, provided):
                verified = True
                break
    # If any tenant has an app_secret set, we require a valid signature.
    any_secret = os.environ.get("META_APP_SECRET") or await db.meta_whatsapp_configs.find_one({"app_secret": {"$ne": None}}, {"_id": 0})
    if any_secret and not verified:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Hub-Signature-256")

    now = datetime.now(timezone.utc).isoformat()
    for entry in body.get("entry", []):
        for ch in entry.get("changes", []):
            value = ch.get("value") or {}
            phone_number_id = (value.get("metadata") or {}).get("phone_number_id")
            cfg = await db.meta_whatsapp_configs.find_one({"phone_number_id": phone_number_id}, {"_id": 0, "owner_id": 1})
            owner_id = cfg["owner_id"] if cfg else None
            for msg in value.get("messages", []) or []:
                await db.meta_whatsapp_messages.insert_one({
                    "owner_id": owner_id,
                    "direction": "inbound",
                    "from": msg.get("from"),
                    "type": msg.get("type"),
                    "text": (msg.get("text") or {}).get("body"),
                    "button_reply": (msg.get("interactive") or {}).get("button_reply"),
                    "raw": msg,
                    "signature_verified": verified,
                    "created_at": now,
                })
            for st in value.get("statuses", []) or []:
                await db.meta_whatsapp_messages.insert_one({
                    "owner_id": owner_id,
                    "direction": "status",
                    "status": st.get("status"),
                    "raw": st,
                    "signature_verified": verified,
                    "created_at": now,
                })
    return {"received": True, "verified": verified}


# ---------- Inbox / Conversations ----------

@router.get("/conversations")
async def list_conversations(current_user: dict = Depends(get_current_user)):
    """Return all WhatsApp conversation threads grouped by patient phone number,
    sorted by latest message first. Unread count = inbound msgs not yet read."""
    owner_id = resolve_owner_id(current_user)

    pipeline = [
        {"$match": {"owner_id": owner_id, "direction": {"$in": ["inbound", "outbound"]}}},
        {"$project": {
            "phone": {"$cond": [{"$eq": ["$direction", "inbound"]}, "$from", "$to"]},
            "text": {"$ifNull": ["$text", "(media/button)"]},
            "direction": 1,
            "created_at": 1,
            "is_read": {"$ifNull": ["$is_read", False]},
        }},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$phone",
            "last_message": {"$first": "$text"},
            "last_direction": {"$first": "$direction"},
            "last_at": {"$first": "$created_at"},
            "unread_count": {
                "$sum": {
                    "$cond": [
                        {"$and": [{"$eq": ["$direction", "inbound"]}, {"$not": "$is_read"}]},
                        1, 0
                    ]
                }
            },
        }},
        {"$sort": {"last_at": -1}},
        {"$limit": 100},
    ]

    threads = []
    async for doc in db.meta_whatsapp_messages.aggregate(pipeline):
        phone = doc["_id"]
        if not phone:
            continue
        # Look up patient name from appointments (tail-match last 10 digits for +91 prefix)
        tail = phone[-10:] if len(phone) >= 10 else phone
        appt = await db.appointments.find_one(
            {"client_phone": {"$regex": tail + "$", "$options": "i"}, "professional_id": owner_id},
            {"client_name": 1, "_id": 0},
        )
        threads.append({
            "phone": phone,
            "patient_name": appt["client_name"] if appt else phone,
            "last_message": doc.get("last_message") or "(media)",
            "last_direction": doc.get("last_direction"),
            "last_at": doc.get("last_at"),
            "unread_count": int(doc.get("unread_count", 0)),
        })

    return threads


@router.get("/conversations/{phone}")
async def get_conversation(phone: str, current_user: dict = Depends(get_current_user)):
    """Return all messages in a thread with a patient, oldest-first.
    Marks all inbound messages as read on fetch."""
    from urllib.parse import unquote
    phone = unquote(phone)
    owner_id = resolve_owner_id(current_user)

    query = {
        "owner_id": owner_id,
        "direction": {"$in": ["inbound", "outbound"]},
        "$or": [{"from": phone}, {"to": phone}],
    }
    msgs: List[Dict[str, Any]] = []
    async for m in db.meta_whatsapp_messages.find(query, {"_id": 0, "raw": 0}).sort("created_at", 1):
        msgs.append(m)

    # Mark inbound as read
    await db.meta_whatsapp_messages.update_many(
        {"owner_id": owner_id, "direction": "inbound", "from": phone, "is_read": {"$ne": True}},
        {"$set": {"is_read": True}},
    )

    tail = phone[-10:] if len(phone) >= 10 else phone
    appt = await db.appointments.find_one(
        {"client_phone": {"$regex": tail + "$", "$options": "i"}, "professional_id": owner_id},
        {"client_name": 1, "_id": 0},
    )
    return {
        "phone": phone,
        "patient_name": appt["client_name"] if appt else phone,
        "messages": msgs,
    }


@router.get("/delivery-status/{phone}")
async def get_delivery_status(phone: str, current_user: dict = Depends(get_current_user)):
    """Latest WhatsApp delivery status for a patient phone — used by OPD queue ticks.
    Returns: none | sent | delivered | read | failed"""
    from urllib.parse import unquote
    phone = unquote(phone)
    owner_id = resolve_owner_id(current_user)

    tail = phone[-10:] if len(phone) >= 10 else phone
    # Check if any outbound message exists first
    last_out = await db.meta_whatsapp_messages.find_one(
        {"owner_id": owner_id, "direction": "outbound", "to": {"$regex": tail + "$"}},
        {"_id": 0, "created_at": 1},
        sort=[("created_at", -1)],
    )
    if not last_out:
        return {"phone": phone, "status": "none"}

    # Latest status callback matching this phone
    last_status = await db.meta_whatsapp_messages.find_one(
        {
            "owner_id": owner_id,
            "direction": "status",
            "$or": [
                {"raw.recipient_id": {"$regex": tail + "$"}},
                {"raw.to": {"$regex": tail + "$"}},
            ],
        },
        {"_id": 0, "status": 1, "created_at": 1},
        sort=[("created_at", -1)],
    )
    if last_status:
        return {"phone": phone, "status": last_status.get("status", "sent"), "updated_at": last_status.get("created_at")}

    return {"phone": phone, "status": "sent", "updated_at": last_out.get("created_at")}
