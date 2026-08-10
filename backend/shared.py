"""Shared dependencies for Lumera backend.

All route modules import db, auth helpers, and common utilities from here.
Keeping a single source of truth here helps avoid divergence and makes
modular routing in /app/backend/routes/* clean.
"""
from __future__ import annotations

import os
import logging
import re
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from fastapi import Header, HTTPException, Depends
import jwt
from twilio.rest import Client as TwilioClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# --- Database ----
_mongo_url = os.environ['MONGO_URL']
_mongo_client = AsyncIOMotorClient(_mongo_url)
db = _mongo_client[os.environ['DB_NAME']]

# --- Auth ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.environ.get('JWT_SECRET_KEY', 'your-secret-key')
JWT_ALGORITHM = "HS256"


def verify_token(token: str):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None


async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ")[1]
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload.get("user_id")}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def resolve_owner_id(current_user: dict) -> str:
    """Returns parent doctor's user_id for sub-users (front_desk/receptionist/assistant), else the user's own id."""
    role = current_user.get('role')
    if role in ('receptionist', 'front_desk', 'assistant') and current_user.get('parent_user_id'):
        return current_user['parent_user_id']
    return current_user['id']


async def require_doctor_or_owner(current_user: dict = Depends(get_current_user)):
    """Block receptionists/assistants from sensitive endpoints."""
    role = current_user.get('role')
    if role in ('receptionist', 'front_desk', 'assistant'):
        raise HTTPException(
            status_code=403,
            detail="Your role does not have access to this feature. Contact your clinic administrator.",
        )
    return current_user


async def require_write_appointments(current_user: dict = Depends(get_current_user)):
    """Assistants have read-mostly access — block writes."""
    if current_user.get('role') == 'assistant':
        raise HTTPException(
            status_code=403,
            detail="Assistants can view schedules but not create/reschedule appointments.",
        )
    return current_user


# --- Twilio (WhatsApp send) ---
_twilio_client: Optional[TwilioClient] = None
if os.environ.get('TWILIO_ACCOUNT_SID') and os.environ.get('TWILIO_AUTH_TOKEN'):
    if os.environ['TWILIO_ACCOUNT_SID'] != 'your_twilio_account_sid':
        _twilio_client = TwilioClient(os.environ['TWILIO_ACCOUNT_SID'], os.environ['TWILIO_AUTH_TOKEN'])


async def send_whatsapp_message(to_number: str, message: str):
    if not _twilio_client:
        logging.warning("Twilio not configured - WhatsApp send skipped")
        return None
    try:
        clean_number = to_number.replace("whatsapp:", "").strip()
        if not clean_number.startswith("+"):
            clean_number = "+" + clean_number
        wa_from = os.environ.get('TWILIO_WHATSAPP_NUMBER', 'whatsapp:+14155238886')
        return _twilio_client.messages.create(
            from_=wa_from,
            to=f"whatsapp:{clean_number}",
            body=message,
        )
    except Exception as e:
        logging.error(f"WhatsApp send failed: {e}")
        return None


# --- LLM helper ---
def get_llm_key() -> str:
    key = os.environ.get('EMERGENT_LLM_KEY')
    if not key or key == 'your_openai_api_key':
        raise HTTPException(status_code=503, detail="LLM key not configured")
    return key


def strip_json_fences(text: str) -> str:
    """Strip markdown json fences from LLM output."""
    cleaned = (text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


def safe_regex(value: str) -> str:
    """Escape user input for safe use in a MongoDB $regex."""
    return re.escape(value or "")


async def insert_doc(collection, doc: dict) -> dict:
    """Insert a document while preventing MongoDB ObjectId leakage into the
    response. Motor's `insert_one` mutates the input dict by adding `_id`;
    callers that subsequently return the dict would otherwise serialize that
    ObjectId, which is not JSON-safe. Inserts a shallow copy and strips `_id`
    from the original."""
    await collection.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


# --- Scheduler health tracking ---
_scheduler_last_run: dict[str, str] = {}


def record_scheduler_run(job_id: str) -> None:
    """Called by cron jobs to record their last successful run time."""
    from datetime import datetime as _dt, timezone as _tz
    _scheduler_last_run[job_id] = _dt.now(_tz.utc).isoformat()


def get_scheduler_runs() -> dict:
    return dict(_scheduler_last_run)
