"""Idempotent seed for the Meta App Review reviewer account.

Creates (or resets password of) reviewer@lumer.me / MetaReview@2026 as a doctor,
plus 3 demo patients and 1 appointment named "Reviewer Demo" so Meta reviewers
can immediately walk the WhatsApp flows shown in the demo video.

Safe to run multiple times: uses upserts + deterministic ids.

Usage:  cd /app/backend && python seed_reviewer.py
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

REVIEWER_EMAIL = "reviewer@lumer.me"
REVIEWER_PASSWORD = "MetaReview@2026"
REVIEWER_NAME = "Dr. Reviewer Demo"
REVIEWER_PHONE = "+919999900000"

# Deterministic id so re-runs don't create duplicate users
REVIEWER_ID = "reviewer-meta-review-2026"

DEMO_PATIENTS = [
    {"name": "Reviewer Demo",   "phone": "+919000000001", "email": "demo1@lumer.me"},
    {"name": "Priya Verma",     "phone": "+919000000002", "email": "demo2@lumer.me"},
    {"name": "Rahul Iyer",      "phone": "+919000000003", "email": "demo3@lumer.me"},
]

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    now = datetime.now(timezone.utc).isoformat()

    # ---- 1. Reviewer doctor account (upsert + always reset password) ----
    doctor_doc = {
        "id": REVIEWER_ID,
        "name": REVIEWER_NAME,
        "email": REVIEWER_EMAIL,
        "hashed_password": pwd_ctx.hash(REVIEWER_PASSWORD),
        "phone_number": REVIEWER_PHONE,
        "profession": "doctor",
        "role": "user",
        "whatsapp_verified": True,
        "created_at": now,
    }
    await db.users.update_one(
        {"email": REVIEWER_EMAIL},
        {"$set": doctor_doc},
        upsert=True,
    )
    print(f"✓ Reviewer doctor upserted: {REVIEWER_EMAIL}")

    # ---- 2. Clients / patients (via clients collection if used; else derived from appointments) ----
    for p in DEMO_PATIENTS:
        await db.clients.update_one(
            {"professional_id": REVIEWER_ID, "phone": p["phone"]},
            {"$set": {
                "id": f"cli-{p['phone'][-4:]}",
                "professional_id": REVIEWER_ID,
                "name": p["name"],
                "phone": p["phone"],
                "email": p["email"],
                "created_at": now,
            }},
            upsert=True,
        )
    print(f"✓ {len(DEMO_PATIENTS)} demo patients upserted")

    # ---- 3. One appointment named "Reviewer Demo" (idempotent by deterministic id) ----
    appt_id = "appt-reviewer-demo-2026"
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    appt_doc = {
        "id": appt_id,
        "professional_id": REVIEWER_ID,
        "client_name": DEMO_PATIENTS[0]["name"],
        "client_phone": DEMO_PATIENTS[0]["phone"],
        "client_email": DEMO_PATIENTS[0]["email"],
        "service": "General Consultation",
        "appointment_date": tomorrow,
        "date": tomorrow,  # backward-compat for older readers
        "start_time": "10:00",
        "end_time": "10:30",
        "consultation_mode": "in-person",
        "status": "confirmed",
        "notes": "Pre-seeded for Meta App Review walkthrough.",
        "whatsapp_consent": True,
        "reminder_sent": False,
        "payment_status": "pending",
        "created_at": now,
    }
    await db.appointments.update_one(
        {"id": appt_id},
        {"$set": appt_doc},
        upsert=True,
    )
    print(f"✓ Reviewer Demo appointment upserted: {appt_id} on {tomorrow}")

    # ---- 4. Seed a WhatsApp consent snapshot (patient_safety not needed here) ----
    # (Reviewer flow doesn't require allergies — kept empty on purpose)

    print("\n────────────────────────────────────────")
    print("Meta reviewer credentials ready:")
    print(f"  URL:      /login")
    print(f"  Email:    {REVIEWER_EMAIL}")
    print(f"  Password: {REVIEWER_PASSWORD}")
    print(f"  Demo appointment: 'Reviewer Demo' on {tomorrow} at 10:00")
    print("────────────────────────────────────────")

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
