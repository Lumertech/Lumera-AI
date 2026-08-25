"""
WhatsApp Embedded Signup, Multi-Tenant Onboarding, Template Management & Outbox.

Routes (all prefixed /api in server.py):
  GET  /whatsapp/platform-config          — public: app_id + config_id for SDK init
  POST /whatsapp/embedded-signup          — auth: exchange OAuth code, save user WA config
  GET  /whatsapp/status                   — auth: user's WA connection status
  POST /whatsapp/disconnect               — auth: disconnect WA
  POST /whatsapp/send-test                — auth: send a test text message
  POST /whatsapp/send-template            — auth: send an approved template to a patient
  GET  /whatsapp/templates                — auth: list templates (syncs status from Meta)
  POST /whatsapp/templates                — auth: create & submit template to Meta
  DELETE /whatsapp/templates/{id}         — auth: delete template locally + Meta
"""
import os
import uuid
import httpx
import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from shared import db, get_current_user, resolve_owner_id
from security import encryption_manager

logger = logging.getLogger(__name__)

router = APIRouter()

META_GRAPH = "https://graph.facebook.com/v22.0"

# ---------- Models ----------

class EmbeddedSignupRequest(BaseModel):
    code: str
    phone_number_id: str
    waba_id: str


class SendTestRequest(BaseModel):
    to: str  # target phone number (with country code)


class SendTemplateRequest(BaseModel):
    to: str               # patient phone number
    template_name: str    # e.g. "appointment_reminder"
    language: str = "en_US"
    params: List[str] = []   # ordered values for {{1}}, {{2}}, ...


class CreateTemplateRequest(BaseModel):
    name: str
    category: str = "UTILITY"   # UTILITY | MARKETING | AUTHENTICATION
    language: str = "en_US"
    components: List[dict]       # passed through verbatim to Meta


# ---------- Internal helpers ----------

async def _get_global_meta_config() -> dict:
    cfg = await db.system_config.find_one({"key": "whatsapp_global"}, {"_id": 0}) or {}
    # Decrypt sensitive fields if they were encrypted
    for field in ("app_secret", "system_user_token"):
        val = cfg.get(field)
        if val:
            try:
                cfg[field] = encryption_manager.decrypt(val)
            except Exception:
                pass  # stored plain or wrong key — use as-is
    return cfg


async def _get_user_wa(owner_id: str) -> dict:
    user = await db.users.find_one({"id": owner_id}, {"_id": 0, "whatsapp": 1}) or {}
    wa = user.get("whatsapp") or {}
    token = wa.get("access_token")
    if token:
        try:
            wa["access_token"] = encryption_manager.decrypt(token)
        except Exception:
            pass
    return wa


async def _fetch_meta(method: str, path: str, token: str, **kwargs):
    url = f"{META_GRAPH}/{path.lstrip('/')}"
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=15) as client:
        fn = getattr(client, method.lower())
        r = await fn(url, headers=headers, **kwargs)
    return r


# ---------- Public endpoint (no auth — needed for SDK init) ----------

@router.get("/platform-config")
async def whatsapp_platform_config():
    """Returns non-sensitive platform identifiers needed to init the Facebook JS SDK."""
    cfg = await db.system_config.find_one({"key": "whatsapp_global"}, {"_id": 0}) or {}
    return {
        "app_id": cfg.get("app_id") or "",
        "config_id": cfg.get("config_id") or "",
        "ready": bool(cfg.get("app_id") and cfg.get("config_id")),
    }


# ---------- Embedded Signup ----------

@router.post("/embedded-signup")
async def embedded_signup(body: EmbeddedSignupRequest, current_user: dict = Depends(get_current_user)):
    """Exchange Meta OAuth code for an access token; save WABA + phone_number_id to user doc."""
    owner_id = resolve_owner_id(current_user)
    global_cfg = await _get_global_meta_config()

    if not global_cfg.get("app_id") or not global_cfg.get("app_secret"):
        raise HTTPException(400, "Platform Meta app not configured. Ask your admin to set App ID and App Secret.")

    app_id = global_cfg["app_id"]
    app_secret = global_cfg["app_secret"]

    # 1. Exchange code → short-lived user token
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{META_GRAPH}/oauth/access_token", params={
            "client_id": app_id,
            "client_secret": app_secret,
            "code": body.code,
        })
    if r.status_code != 200:
        logger.error("Token exchange failed: %s", r.text)
        raise HTTPException(400, f"Meta token exchange failed: {r.json().get('error', {}).get('message', r.text)}")

    access_token = r.json().get("access_token")
    if not access_token:
        raise HTTPException(400, "No access_token in Meta response")

    # 2. Subscribe WABA to Lumera's app webhook (best-effort)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"{META_GRAPH}/{body.waba_id}/subscribed_apps",
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except Exception as exc:
        logger.warning("WABA webhook subscription failed (non-fatal): %s", exc)

    # 3. Persist to user document (encrypt token at rest)
    encrypted_token = encryption_manager.encrypt(access_token)
    await db.users.update_one(
        {"id": owner_id},
        {"$set": {
            "whatsapp.waba_id": body.waba_id,
            "whatsapp.phone_number_id": body.phone_number_id,
            "whatsapp.access_token": encrypted_token,
            "whatsapp.status": "CONNECTED",
            "whatsapp.connected_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    # 4. Also upsert into legacy meta_whatsapp_configs for inbox routing backward compat
    await db.meta_whatsapp_configs.update_one(
        {"owner_id": owner_id},
        {"$set": {
            "owner_id": owner_id,
            "phone_number_id": body.phone_number_id,
            "waba_id": body.waba_id,
            "system_user_token": encrypted_token,
        }},
        upsert=True,
    )

    return {
        "status": "CONNECTED",
        "waba_id": body.waba_id,
        "phone_number_id": body.phone_number_id,
    }


# ---------- Status ----------

@router.get("/status")
async def whatsapp_status(current_user: dict = Depends(get_current_user)):
    """Return the current user's WhatsApp connection status."""
    owner_id = resolve_owner_id(current_user)
    wa = await _get_user_wa(owner_id)
    return {
        "status": wa.get("status") or "DISCONNECTED",
        "waba_id": wa.get("waba_id") or "",
        "phone_number_id": wa.get("phone_number_id") or "",
        "connected_at": wa.get("connected_at") or None,
        "connected": wa.get("status") == "CONNECTED",
    }


@router.post("/disconnect")
async def whatsapp_disconnect(current_user: dict = Depends(get_current_user)):
    """Disconnect the current user's WhatsApp (clears credentials)."""
    owner_id = resolve_owner_id(current_user)
    await db.users.update_one(
        {"id": owner_id},
        {"$set": {"whatsapp.status": "DISCONNECTED"},
         "$unset": {"whatsapp.access_token": "", "whatsapp.waba_id": "", "whatsapp.phone_number_id": ""}}
    )
    return {"status": "DISCONNECTED"}


# ---------- Effective config (new embedded signup > legacy meta_whatsapp_configs > env) ----------

async def _get_effective_wa(owner_id: str) -> dict:
    """Return the best available WA credentials for this owner."""
    user = await db.users.find_one({"id": owner_id}, {"_id": 0, "whatsapp": 1}) or {}
    wa = user.get("whatsapp") or {}
    if wa.get("status") == "CONNECTED" and wa.get("phone_number_id") and wa.get("access_token"):
        token = wa["access_token"]
        try:
            token = encryption_manager.decrypt(token)
        except Exception:
            pass
        return {"phone_number_id": wa["phone_number_id"], "access_token": token, "waba_id": wa.get("waba_id", "")}
    # Fallback: legacy per-doctor config
    cfg = await db.meta_whatsapp_configs.find_one({"owner_id": owner_id}, {"_id": 0}) or {}
    token = cfg.get("system_user_token") or os.environ.get("META_SYSTEM_USER_TOKEN", "")
    phone_id = cfg.get("phone_number_id") or os.environ.get("META_PHONE_NUMBER_ID", "")
    if token:
        try:
            token = encryption_manager.decrypt(token)
        except Exception:
            pass
    return {"phone_number_id": phone_id, "access_token": token, "waba_id": cfg.get("waba_id", "")}


async def _meta_send(phone_number_id: str, access_token: str, payload: dict):
    """Low-level POST to Meta Graph API messages endpoint."""
    url = f"{META_GRAPH}/{phone_number_id}/messages"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, json=payload,
                              headers={"Authorization": f"Bearer {access_token}",
                                       "Content-Type": "application/json"})
    return r


# ---------- Send Test Message ----------

@router.post("/send-test")
async def send_test_message(body: SendTestRequest, current_user: dict = Depends(get_current_user)):
    """Send a test plain-text greeting to verify two-way API delivery."""
    owner_id = resolve_owner_id(current_user)
    wa = await _get_effective_wa(owner_id)
    if not wa["phone_number_id"] or not wa["access_token"]:
        raise HTTPException(400, "WhatsApp not configured. Complete embedded signup or add credentials in Settings.")

    payload = {
        "messaging_product": "whatsapp",
        "to": body.to.lstrip("+"),
        "type": "text",
        "text": {"body": "Hello! This is a test message from Lumera. Your WhatsApp Business integration is working correctly."},
    }
    try:
        r = await _meta_send(wa["phone_number_id"], wa["access_token"], payload)
    except Exception as exc:
        raise HTTPException(502, f"Meta API unreachable: {exc}")

    if r.status_code >= 400:
        raise HTTPException(502, f"Meta rejected: {r.json().get('error', {}).get('message', r.text[:200])}")

    return {"sent": True, "to": body.to, "graph": r.json()}


# ---------- Send Approved Template ----------

@router.post("/send-template")
async def send_template_message(body: SendTemplateRequest, current_user: dict = Depends(get_current_user)):
    """Send an approved WhatsApp template to a patient, substituting {{N}} parameters."""
    owner_id = resolve_owner_id(current_user)
    wa = await _get_effective_wa(owner_id)
    if not wa["phone_number_id"] or not wa["access_token"]:
        raise HTTPException(400, "WhatsApp not configured.")

    # Build parameters array for body component
    parameters = [{"type": "text", "text": p} for p in body.params]
    components = []
    if parameters:
        components.append({"type": "body", "parameters": parameters})

    payload = {
        "messaging_product": "whatsapp",
        "to": body.to.lstrip("+"),
        "type": "template",
        "template": {
            "name": body.template_name,
            "language": {"code": body.language},
            **({"components": components} if components else {}),
        },
    }
    try:
        r = await _meta_send(wa["phone_number_id"], wa["access_token"], payload)
    except Exception as exc:
        raise HTTPException(502, f"Meta API unreachable: {exc}")

    if r.status_code >= 400:
        raise HTTPException(502, f"Meta rejected: {r.json().get('error', {}).get('message', r.text[:200])}")

    # Log in messages collection
    await db.meta_whatsapp_messages.insert_one({
        "owner_id": owner_id, "direction": "outbound", "to": body.to,
        "body": f"[template:{body.template_name}] params={body.params}",
        "graph_response": r.json(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"sent": True, "to": body.to, "template": body.template_name, "graph": r.json()}


# ---------- Template Management ----------

@router.get("/templates")
async def list_templates(current_user: dict = Depends(get_current_user)):
    """List all templates, syncing status from Meta for PENDING ones."""
    owner_id = resolve_owner_id(current_user)
    wa = await _get_user_wa(owner_id)
    templates = await db.whatsapp_templates.find(
        {"owner_id": owner_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)

    # Sync PENDING statuses from Meta (best-effort, non-blocking)
    if wa.get("waba_id") and wa.get("access_token") and any(t.get("status") == "PENDING" for t in templates):
        try:
            r = await _fetch_meta("GET", f"{wa['waba_id']}/message_templates",
                                  wa["access_token"], params={"limit": 100})
            if r.status_code == 200:
                meta_map = {t["name"]: t["status"] for t in r.json().get("data", [])}
                for t in templates:
                    if t.get("status") == "PENDING" and t.get("name") in meta_map:
                        new_status = meta_map[t["name"]].upper()
                        if new_status != "PENDING":
                            await db.whatsapp_templates.update_one(
                                {"id": t["id"]}, {"$set": {"status": new_status}}
                            )
                            t["status"] = new_status
        except Exception as exc:
            logger.warning("Meta template sync failed (non-fatal): %s", exc)

    return templates


@router.post("/templates")
async def create_template(body: CreateTemplateRequest, current_user: dict = Depends(get_current_user)):
    """Submit a new template to Meta for review and save to DB."""
    owner_id = resolve_owner_id(current_user)
    wa = await _get_user_wa(owner_id)

    if not wa.get("waba_id") or not wa.get("access_token"):
        raise HTTPException(400, "WhatsApp not connected. Complete embedded signup first.")

    # Normalise name: lowercase, underscores
    body.name = body.name.lower().replace(" ", "_")

    # Submit to Meta
    meta_id = None
    status = "REJECTED"
    error_msg = None
    try:
        r = await _fetch_meta(
            "POST", f"{wa['waba_id']}/message_templates", wa["access_token"],
            json={"name": body.name, "category": body.category,
                  "language": body.language, "components": body.components},
        )
        if r.status_code in (200, 201):
            resp = r.json()
            meta_id = resp.get("id")
            status = resp.get("status", "PENDING").upper()
        else:
            error_msg = r.json().get("error", {}).get("message", r.text)
            logger.error("Meta template creation failed: %s", r.text)
    except Exception as exc:
        error_msg = str(exc)
        logger.error("Meta template API error: %s", exc)

    doc = {
        "id": str(uuid.uuid4()),
        "owner_id": owner_id,
        "waba_id": wa["waba_id"],
        "name": body.name,
        "category": body.category,
        "language": body.language,
        "components": body.components,
        "status": status,
        "meta_id": meta_id,
        "error": error_msg,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.whatsapp_templates.insert_one(doc)
    doc.pop("_id", None)

    if status == "REJECTED" and error_msg:
        raise HTTPException(422, f"Meta rejected template: {error_msg}")

    return doc


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a template from DB and attempt to remove from Meta."""
    owner_id = resolve_owner_id(current_user)
    t = await db.whatsapp_templates.find_one({"id": template_id, "owner_id": owner_id})
    if not t:
        raise HTTPException(404, "Template not found")

    # Try Meta deletion (best-effort)
    wa = await _get_user_wa(owner_id)
    if wa.get("waba_id") and wa.get("access_token"):
        try:
            await _fetch_meta("DELETE", f"{wa['waba_id']}/message_templates",
                              wa["access_token"],
                              params={"name": t["name"]})
        except Exception as exc:
            logger.warning("Meta template delete failed (non-fatal): %s", exc)

    await db.whatsapp_templates.delete_one({"id": template_id})
    return {"deleted": True}
