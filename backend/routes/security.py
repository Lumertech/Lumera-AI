"""Security & Authentication routes.

Provides:
  POST /auth/change-password       — bcrypt verify + update + session invalidation
  POST /auth/logout-all            — increment session_version, fresh token returned
  GET  /auth/sessions              — last 10 login events as "sessions"
  POST /auth/2fa/setup             — generate TOTP secret + QR URI
  POST /auth/2fa/disable           — clear 2FA secret
  Shared helpers:
    send_security_email()          — Hostinger SMTP async wrapper
    log_security_event()           — write to security_audit_logs collection
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Optional

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from shared import db, get_current_user, pwd_context

logger = logging.getLogger(__name__)

router = APIRouter(tags=["security"])

# --------------------------------------------------------------------------- #
# Email helpers (Hostinger SMTP)                                               #
# --------------------------------------------------------------------------- #

SMTP_HOST      = os.environ.get("SMTP_HOST", "smtp.hostinger.com")
SMTP_PORT      = int(os.environ.get("SMTP_PORT", "465"))
SMTP_USE_SSL   = os.environ.get("SMTP_USE_SSL", "true").lower() == "true"
SMTP_USER      = os.environ.get("SMTP_USERNAME", "")
SMTP_PASS      = os.environ.get("SMTP_PASSWORD", "")
MAIL_FROM      = os.environ.get("MAIL_FROM", "ravee@lumer.me")
MAIL_FROM_NAME = os.environ.get("MAIL_FROM_NAME", "Lumera")


def _smtp_send_sync(to: str, subject: str, text: str, html: str) -> None:
    msg = EmailMessage()
    msg["From"] = f"{MAIL_FROM_NAME} <{MAIL_FROM}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    ctx = ssl.create_default_context()
    if SMTP_USE_SSL and SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20, context=ctx) as s:
            s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
            s.ehlo()
            s.starttls(context=ctx)
            s.ehlo()
            s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)


async def send_security_email(to: str, subject: str, text: str, html: str) -> None:
    """Non-blocking Hostinger SMTP send."""
    if not SMTP_USER or not SMTP_PASS:
        logger.warning("SMTP not configured — email skipped (to=%s subject=%s)", to, subject)
        return
    try:
        await asyncio.to_thread(_smtp_send_sync, to, subject, text, html)
    except Exception as exc:
        logger.error("SMTP send failed to=%s: %s", to, exc)


# --------------------------------------------------------------------------- #
# Audit logging helper                                                         #
# --------------------------------------------------------------------------- #

async def log_security_event(
    event_type: str,
    user_id: str,
    performed_by: str,
    details: dict | None = None,
    ip_address: str = "",
) -> None:
    await db.security_audit_logs.insert_one({
        "event_type": event_type,
        "user_id": user_id,
        "performed_by": performed_by,
        "ip_address": ip_address,
        "details": details or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")


# --------------------------------------------------------------------------- #
# Password strength validator                                                  #
# --------------------------------------------------------------------------- #

def _validate_new_password(pw: str) -> tuple[bool, str]:
    if len(pw) < 8:
        return False, "Password must be at least 8 characters"
    if not re.search(r"[A-Z]", pw):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", pw):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r"\d", pw):
        return False, "Password must contain at least one digit"
    if not re.search(r"[^A-Za-z0-9]", pw):
        return False, "Password must contain at least one special character"
    return True, ""


# --------------------------------------------------------------------------- #
# Routes                                                                       #
# --------------------------------------------------------------------------- #

class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


@router.post("/auth/change-password")
async def change_password(
    body: ChangePasswordBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    ok, msg = _validate_new_password(body.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    user = await db.users.find_one({"id": current_user["id"]}, {"hashed_password": 1})
    if not user or not pwd_context.verify(body.current_password, user.get("hashed_password", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    new_hash = pwd_context.hash(body.new_password)
    # Increment session_version to invalidate all other tokens
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"hashed_password": new_hash}, "$inc": {"session_version": 1}},
    )
    updated = await db.users.find_one({"id": current_user["id"]}, {"session_version": 1})
    new_sv = updated.get("session_version", 1)

    await log_security_event(
        "password_change", current_user["id"], current_user["id"],
        {"email": current_user.get("email")}, _client_ip(request),
    )

    # Return fresh token with new session_version so the current session stays alive
    from server import create_access_token  # noqa: PLC0415 — late import avoids circular
    new_token = create_access_token({
        "user_id": current_user["id"],
        "email": current_user.get("email"),
        "session_version": new_sv,
    })
    return {"message": "Password changed successfully", "token": new_token}


@router.post("/auth/logout-all")
async def logout_all_devices(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    await db.users.update_one({"id": current_user["id"]}, {"$inc": {"session_version": 1}})
    updated = await db.users.find_one({"id": current_user["id"]}, {"session_version": 1})
    new_sv = updated.get("session_version", 1)

    await log_security_event(
        "logout_all", current_user["id"], current_user["id"],
        {}, _client_ip(request),
    )

    from server import create_access_token  # noqa: PLC0415
    new_token = create_access_token({
        "user_id": current_user["id"],
        "email": current_user.get("email"),
        "session_version": new_sv,
    })
    return {"message": "All other sessions have been logged out", "token": new_token}


@router.get("/auth/sessions")
async def list_sessions(current_user: dict = Depends(get_current_user)):
    events = await db.security_audit_logs.find(
        {"user_id": current_user["id"], "event_type": {"$in": ["login", "logout_all", "password_change"]}},
        {"_id": 0},
    ).sort("timestamp", -1).limit(10).to_list(10)
    return events


# --------------------------------------------------------------------------- #
# 2FA (TOTP setup framework)                                                   #
# --------------------------------------------------------------------------- #

@router.post("/auth/2fa/setup")
async def setup_2fa(current_user: dict = Depends(get_current_user)):
    """Generate a TOTP secret and return the QR URI so the doctor can scan it."""
    secret = pyotp.random_base32()
    # Store the pending secret (not yet activated)
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"totp_secret_pending": secret}})
    label = current_user.get("email", current_user["id"])
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=label, issuer_name="Lumera")
    return {
        "secret": secret,
        "qr_uri": uri,
        "instructions": "Scan this QR code with Google Authenticator or Authy, then verify the code to activate 2FA.",
    }


@router.post("/auth/2fa/verify-setup")
async def verify_2fa_setup(body: dict, current_user: dict = Depends(get_current_user)):
    """Verify the TOTP code and activate 2FA for this account."""
    code = str(body.get("code", "")).strip()
    user = await db.users.find_one({"id": current_user["id"]}, {"totp_secret_pending": 1})
    secret = (user or {}).get("totp_secret_pending")
    if not secret:
        raise HTTPException(status_code=400, detail="No pending 2FA setup. Run /auth/2fa/setup first.")
    totp = pyotp.TOTP(secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"two_factor_enabled": True, "totp_secret": secret}, "$unset": {"totp_secret_pending": ""}},
    )
    return {"message": "2FA enabled successfully"}


@router.post("/auth/2fa/disable")
async def disable_2fa(current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"two_factor_enabled": False}, "$unset": {"totp_secret": "", "totp_secret_pending": ""}},
    )
    await log_security_event("2fa_disabled", current_user["id"], current_user["id"])
    return {"message": "2FA disabled"}
