"""Auth routes — email/password, WhatsApp OTP, Google Calendar OAuth.

Extracted from server.py (Phase 14 router split, 2026-02-10). Relies on
symbols already defined in server.py by the time this module is imported
(late import at bottom of server.py). This avoids duplicating the auth
helpers (limiter, PasswordValidator, InputSanitizer, system_metrics,
create_access_token) that are still shared across other server.py code.
"""
from __future__ import annotations

import logging
import os
import random
import uuid
from datetime import datetime, timedelta, timezone

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse

# Late-import from server.py — safe because server.py includes this router
# only after all these symbols are defined (bottom of server.py).
from server import (
    UserCreate,
    UserLogin,
    PhoneVerifyRequest,
    OTPVerifyRequest,
    PasswordValidator,
    InputSanitizer,
    create_access_token,
    system_metrics,
    send_whatsapp_message,
)
from shared import db, get_current_user, pwd_context

router = APIRouter(tags=["auth"])


# ---------- Email / Password ----------

@router.post("/auth/register")
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    is_valid, error_msg = PasswordValidator.validate(user_data.password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    sanitized_name = InputSanitizer.sanitize_html(user_data.name)

    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "name": sanitized_name,
        "email": user_data.email,
        "hashed_password": pwd_context.hash(user_data.password),
        "phone_number": user_data.phone_number,
        "profession": user_data.profession,
        "specialty": (user_data.specialty or "").strip() or None,
        "role": "user",
        "whatsapp_verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    system_metrics.increment("users_created")

    token = create_access_token({"user_id": user_id, "email": user_data.email})
    return {"token": token, "user": {k: v for k, v in user.items() if k not in ["hashed_password", "_id"]}}


@router.post("/auth/login")
async def login(request: Request, credentials: UserLogin):
    # Manual IP-based rate limit (5 requests / minute) — the @limiter.limit
    # decorator conflicts with FastAPI body parsing when used on APIRouter
    # instances registered post-hoc, so we enforce the same policy here.
    fwd = request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip")
    client_ip = (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown"))
    minute_ago = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    recent_hits = await db.login_ip_hits.count_documents(
        {"ip": client_ip, "at": {"$gte": minute_ago}}
    )
    if recent_hits >= 5:
        # Return JSONResponse directly — HTTPException(429) is caught by SlowAPI's
        # global handler which expects request.state.view_rate_limit to be set.
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many login attempts. Please wait a minute and retry."},
        )
    await db.login_ip_hits.insert_one({"ip": client_ip, "at": datetime.now(timezone.utc).isoformat()})

    # Check ACTIVE account lockout BEFORE password verification.
    login_attempt = await db.login_attempts.find_one({"email": credentials.email}, {"_id": 0})
    if login_attempt and login_attempt.get("locked_until"):
        locked_until = datetime.fromisoformat(login_attempt["locked_until"])
        if datetime.now(timezone.utc) < locked_until:
            remaining = int((locked_until - datetime.now(timezone.utc)).total_seconds() / 60) + 1
            return JSONResponse(
                status_code=429,
                content={"detail": f"Account temporarily locked. Try again in {remaining} minutes."},
            )

    user = await db.users.find_one({"email": credentials.email})
    if not user or not pwd_context.verify(credentials.password, user["hashed_password"]):
        await db.login_attempts.update_one(
            {"email": credentials.email},
            {
                "$inc": {"failed_attempts": 1},
                "$set": {"last_attempt": datetime.now(timezone.utc).isoformat()},
            },
            upsert=True,
        )
        updated_attempt = await db.login_attempts.find_one({"email": credentials.email}, {"_id": 0})
        if updated_attempt and updated_attempt.get("failed_attempts", 0) >= 5:
            lock_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            await db.login_attempts.update_one(
                {"email": credentials.email},
                {"$set": {"locked_until": lock_until.isoformat()}},
            )
            return JSONResponse(
                status_code=429,
                content={"detail": "Account temporarily locked. Try again in 15 minutes."},
            )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await db.login_attempts.delete_one({"email": credentials.email})
    token = create_access_token({"user_id": user["id"], "email": user["email"]})
    user_data = {k: v for k, v in user.items() if k not in ["hashed_password", "_id"]}
    return {"token": token, "user": user_data}


@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {k: v for k, v in current_user.items() if k not in ("hashed_password", "password", "_id")}


# ---------- WhatsApp OTP ----------

@router.post("/auth/send-otp")
async def send_otp(request: PhoneVerifyRequest):
    otp = str(random.randint(100000, 999999))
    await db.otp_codes.update_one(
        {"phone_number": request.phone_number},
        {
            "$set": {
                "otp": otp,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            }
        },
        upsert=True,
    )
    message = f"Your Lumera verification code is {otp}. Valid for 10 minutes. Do not share this code with anyone."
    await send_whatsapp_message(request.phone_number, message)
    return {"message": "OTP sent successfully", "phone_number": request.phone_number}


@router.post("/auth/verify-otp")
async def verify_otp(request: OTPVerifyRequest):
    otp_record = await db.otp_codes.find_one({"phone_number": request.phone_number})
    if not otp_record:
        raise HTTPException(status_code=400, detail="OTP not found or expired")
    if otp_record["otp"] != request.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    expires_at = datetime.fromisoformat(otp_record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="OTP expired")

    user = await db.users.find_one({"phone_number": request.phone_number})
    if user:
        token = create_access_token({"user_id": user["id"], "phone": user["phone_number"]})
        user_data = {k: v for k, v in user.items() if k not in ("password", "hashed_password", "_id")}
        await db.otp_codes.delete_one({"phone_number": request.phone_number})
        return {"token": token, "user": user_data, "is_new_user": False}
    return {"message": "Phone verified", "phone_number": request.phone_number, "is_new_user": True}


@router.post("/auth/complete-registration")
async def complete_registration(name: str, profession: str, phone_number: str):
    otp_record = await db.otp_codes.find_one({"phone_number": phone_number})
    if not otp_record:
        raise HTTPException(status_code=400, detail="Phone number not verified")

    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "name": name,
        "email": f"{phone_number}@lumer.app",
        "phone_number": phone_number,
        "profession": profession,
        "whatsapp_verified": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    await db.otp_codes.delete_one({"phone_number": phone_number})

    token = create_access_token({"user_id": user_id, "phone": phone_number})
    return {"token": token, "user": {k: v for k, v in user.items() if k != "_id"}}


@router.put("/auth/specialty")
async def update_specialty(body: dict, current_user: dict = Depends(get_current_user)):
    """Allow a logged-in doctor to set or update their specialty."""
    specialty = (body.get("specialty") or "").strip()
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"specialty": specialty or None}},
    )
    return {"message": "Specialty updated", "specialty": specialty or None}


# ---------- Google Calendar OAuth ----------

@router.get("/auth/google/login")
async def google_login():
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI")
    scope = "https://www.googleapis.com/auth/calendar"
    auth_url = (
        f"https://accounts.google.com/o/oauth2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={redirect_uri}&"
        f"response_type=code&"
        f"scope={scope}&"
        f"access_type=offline&"
        f"prompt=consent"
    )
    return {"authorization_url": auth_url}


@router.get("/auth/google/callback")
async def google_callback(code: str, current_user: dict = Depends(get_current_user)):
    try:
        token_resp = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
                "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET"),
                "redirect_uri": os.environ.get("GOOGLE_REDIRECT_URI"),
                "grant_type": "authorization_code",
            },
        ).json()
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"google_tokens": token_resp}},
        )
        return RedirectResponse(f"{os.environ['PUBLIC_APP_URL']}/dashboard?google_connected=true")
    except Exception as e:
        logging.error(f"Google auth failed: {e}")
        raise HTTPException(status_code=400, detail="Failed to connect Google Calendar")
