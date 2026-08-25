"""Admin security & governance endpoints.

  POST /admin/users/{id}/reset-password-trigger  — generate reset link, send email
  POST /admin/users/{id}/suspend                 — suspend account, invalidate sessions
  POST /admin/users/{id}/unsuspend               — lift suspension
  POST /admin/users/{id}/set-role                — assign admin | staff | doctor | user
  GET  /admin/security-audit-logs               — paginated audit log viewer
  POST /auth/reset-password                      — consume reset token, set new password
"""
from __future__ import annotations

import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from shared import db, get_current_user, pwd_context
from routes.security import log_security_event, send_security_email

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin-security"])

VALID_ROLES = {"admin", "staff", "doctor", "user", "receptionist", "front_desk", "assistant"}
FRONTEND_URL = os.environ.get("PUBLIC_APP_URL", "https://lumera-voice.preview.emergentagent.com")


async def _require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# --------------------------------------------------------------------------- #
# Password Reset (admin trigger)                                               #
# --------------------------------------------------------------------------- #

@router.post("/admin/users/{user_id}/reset-password-trigger")
async def trigger_password_reset(user_id: str, admin: dict = Depends(_require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "name": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    await db.password_reset_tokens.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "token_hash": _token_hash(raw_token),
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "used": False,
        }},
        upsert=True,
    )

    reset_url = f"{FRONTEND_URL}/reset-password?token={raw_token}"

    # Send email via Hostinger SMTP
    text = (
        f"Hello {user.get('name', 'Doctor')},\n\n"
        f"An administrator has requested a password reset for your Lumera account.\n\n"
        f"Click the link below to reset your password (expires in 1 hour):\n{reset_url}\n\n"
        f"If you did not request this, please contact support at ravee@lumer.me\n\n"
        f"— Lumera Team"
    )
    html = f"""
    <html><body style="font-family:sans-serif;max-width:600px;margin:auto;color:#334155">
      <h2 style="color:#4f46e5">Password Reset Request</h2>
      <p>Hello <strong>{user.get('name','Doctor')}</strong>,</p>
      <p>An administrator has requested a password reset for your Lumera account.</p>
      <p>
        <a href="{reset_url}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:white;text-decoration:none;border-radius:8px;font-weight:600">
          Reset Password
        </a>
      </p>
      <p style="font-size:12px;color:#64748b">This link expires in 1 hour. If you did not request this, please contact <a href="mailto:ravee@lumer.me">ravee@lumer.me</a></p>
    </body></html>
    """
    await send_security_email(user["email"], "Password Reset — Lumera", text, html)

    await log_security_event(
        "admin_reset_password_trigger", user_id, admin["id"],
        {"target_email": user["email"], "reset_url_sent": True},
    )

    return {
        "message": f"Password reset email sent to {user['email']}",
        "reset_url": reset_url,  # also returned so admin can share manually
        "expires_in_hours": 1,
    }


# --------------------------------------------------------------------------- #
# Reset-password consumer (public — validates token, sets new password)       #
# --------------------------------------------------------------------------- #

class ResetPasswordBody(BaseModel):
    token: str
    new_password: str
    confirm_password: str


@router.post("/auth/reset-password")
async def reset_password(body: ResetPasswordBody):
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    import re
    rules = [
        (r".{8,}",            "at least 8 characters"),
        (r"[A-Z]",            "one uppercase letter"),
        (r"[a-z]",            "one lowercase letter"),
        (r"\d",               "one digit"),
        (r"[^A-Za-z0-9]",    "one special character"),
    ]
    for pattern, label in rules:
        if not re.search(pattern, body.new_password):
            raise HTTPException(status_code=400, detail=f"Password must contain {label}")

    record = await db.password_reset_tokens.find_one({"token_hash": _token_hash(body.token)})
    if not record or record.get("used"):
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    expires = record.get("expires_at", "")
    if expires and datetime.fromisoformat(expires) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset link has expired")

    user_id = record["user_id"]
    new_hash = pwd_context.hash(body.new_password)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"hashed_password": new_hash}, "$inc": {"session_version": 1}},
    )
    await db.password_reset_tokens.update_one({"_id": record["_id"]}, {"$set": {"used": True}})
    await log_security_event("password_reset_consumed", user_id, user_id)

    return {"message": "Password reset successfully. You can now log in with your new password."}


# --------------------------------------------------------------------------- #
# Suspend / Unsuspend                                                          #
# --------------------------------------------------------------------------- #

@router.post("/admin/users/{user_id}/suspend")
async def suspend_user(user_id: str, body: dict = {}, admin: dict = Depends(_require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    reason = (body or {}).get("reason", "Administrative action")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "is_suspended": True,
            "suspended_at": datetime.now(timezone.utc).isoformat(),
            "suspension_reason": reason,
        }, "$inc": {"session_version": 1}},  # immediate session revocation
    )
    await log_security_event(
        "admin_suspend", user_id, admin["id"],
        {"reason": reason, "email": user.get("email")},
    )
    return {"message": "Account suspended and sessions revoked"}


@router.post("/admin/users/{user_id}/unsuspend")
async def unsuspend_user(user_id: str, admin: dict = Depends(_require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_suspended": False}, "$unset": {"suspended_at": "", "suspension_reason": ""}},
    )
    await log_security_event("admin_unsuspend", user_id, admin["id"])
    return {"message": "Account unsuspended"}


# --------------------------------------------------------------------------- #
# Role Assignment                                                              #
# --------------------------------------------------------------------------- #

class SetRoleBody(BaseModel):
    role: str


@router.post("/admin/users/{user_id}/set-role")
async def set_user_role(user_id: str, body: SetRoleBody, admin: dict = Depends(_require_admin)):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of {sorted(VALID_ROLES)}")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1, "email": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    old_role = user.get("role", "user")
    await db.users.update_one({"id": user_id}, {"$set": {"role": body.role}})
    await log_security_event(
        "admin_role_change", user_id, admin["id"],
        {"old_role": old_role, "new_role": body.role, "email": user.get("email")},
    )
    return {"message": f"Role updated to {body.role}", "old_role": old_role, "new_role": body.role}


# --------------------------------------------------------------------------- #
# Audit Logs viewer                                                            #
# --------------------------------------------------------------------------- #

@router.get("/admin/security-audit-logs")
async def get_audit_logs(
    page: int = 1,
    limit: int = 50,
    event_type: str = "",
    admin: dict = Depends(_require_admin),
):
    query: dict = {}
    if event_type:
        query["event_type"] = event_type
    skip = (page - 1) * limit
    logs = await db.security_audit_logs.find(query, {"_id": 0}).sort(
        "timestamp", -1
    ).skip(skip).limit(limit).to_list(limit)
    total = await db.security_audit_logs.count_documents(query)
    return {"logs": logs, "total": total, "page": page, "limit": limit}
