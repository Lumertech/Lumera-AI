"""Hexa AI Assistant — natural language admin commands.

- Read-only intents execute immediately
- Write intents require confirmation
- Patient-name regex is safely escaped to prevent crashes
- WhatsApp send is offloaded to BackgroundTasks so the response stays snappy
"""
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from emergentintegrations.llm.chat import LlmChat, UserMessage

from shared import (
    db,
    require_doctor_or_owner,
    get_llm_key,
    strip_json_fences,
    safe_regex,
    send_whatsapp_message,
)

router = APIRouter(prefix="/hexa", tags=["hexa"])


class HexaCommand(BaseModel):
    text: str
    confirm: Optional[bool] = False


HEXA_SYSTEM = """You are Hexa, the AI admin assistant for Lumera (a doctor's practice management app). Convert the doctor's natural-language request into a single safe action.

Allowed actions (return one of these as action.type):
- "list_today_appointments" — show today's appointments
- "list_upcoming_appointments" — next 7 days
- "send_reminder_now" — send appointment reminder; params: {appointment_id?: str OR client_name?: str}
- "list_unpaid_invoices" — show unpaid invoices
- "update_bot_instructions" — propose a draft (params: {draft: str}); never apply silently
- "search_patient" — params: {query: str}
- "summarize_day" — summary of today
- "unknown" — when not parseable

Return ONLY JSON: {"action":{"type":"...","params":{...}}, "speech": "Short reply for the doctor", "requires_confirmation": true|false}
For destructive or write actions, set requires_confirmation: true and DO NOT execute until the client sends confirm=true."""


@router.post("/command")
async def hexa_command(
    payload: HexaCommand,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_doctor_or_owner),
):
    if not (payload.text or "").strip():
        raise HTTPException(status_code=400, detail="Empty command")
    api_key = get_llm_key()

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"hexa_{current_user['id']}_{uuid.uuid4()}",
            system_message=HEXA_SYSTEM,
        ).with_model("openai", "gpt-4o-mini")
        text = await chat.send_message(UserMessage(text=payload.text.strip()))
        parsed = json.loads(strip_json_fences(text))
    except json.JSONDecodeError:
        parsed = {
            "action": {"type": "unknown", "params": {}},
            "speech": "I couldn't understand that. Try: 'show today's appointments'.",
            "requires_confirmation": False,
        }
    except Exception as e:
        logging.error(f"Hexa parse failed: {e}")
        raise HTTPException(status_code=500, detail="Hexa failed to parse command")

    action = parsed.get("action", {}) or {}
    a_type = action.get("type", "unknown")
    a_params = action.get("params", {}) or {}
    requires_conf = bool(parsed.get("requires_confirmation"))
    speech = parsed.get("speech", "")

    owner_id = current_user['id']
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    result_data = None

    if a_type == "list_today_appointments":
        result_data = await db.appointments.find(
            {"professional_id": owner_id, "appointment_date": today_str}, {"_id": 0}
        ).sort("start_time", 1).to_list(100)
    elif a_type == "list_upcoming_appointments":
        end = (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%d")
        result_data = await db.appointments.find(
            {"professional_id": owner_id, "appointment_date": {"$gte": today_str, "$lte": end}}, {"_id": 0}
        ).sort([("appointment_date", 1), ("start_time", 1)]).to_list(200)
    elif a_type == "list_unpaid_invoices":
        result_data = await db.appointments.find(
            {"professional_id": owner_id, "payment_status": "pending"}, {"_id": 0}
        ).limit(50).to_list(50)
    elif a_type == "search_patient":
        q = a_params.get("query", "")
        if q:
            regex = {"$regex": safe_regex(q), "$options": "i"}
            result_data = await db.clients.find(
                {"professional_id": owner_id, "$or": [{"name": regex}, {"phone": regex}]},
                {"_id": 0},
            ).limit(20).to_list(20)
        else:
            result_data = []
    elif a_type == "summarize_day":
        appts = await db.appointments.find(
            {"professional_id": owner_id, "appointment_date": today_str}, {"_id": 0}
        ).sort("start_time", 1).to_list(100)
        completed = sum(1 for a in appts if a.get("status") == "completed")
        result_data = {"total": len(appts), "completed": completed, "appointments": appts}
    elif a_type == "send_reminder_now":
        if not payload.confirm:
            return {"action": action, "speech": speech or "Confirm sending the reminder?", "requires_confirmation": True, "executed": False}
        appt = None
        if a_params.get("appointment_id"):
            appt = await db.appointments.find_one({"id": a_params["appointment_id"], "professional_id": owner_id}, {"_id": 0})
        elif a_params.get("client_name"):
            name_regex = {"$regex": safe_regex(a_params["client_name"]), "$options": "i"}
            appt = await db.appointments.find_one({
                "professional_id": owner_id,
                "client_name": name_regex,
                "appointment_date": {"$gte": today_str},
            }, {"_id": 0})
        if not appt:
            return {"action": action, "speech": "I could not find that appointment.", "requires_confirmation": False, "executed": False}
        msg = f"Reminder: You have an appointment with Dr. {current_user.get('name','')} on {appt['appointment_date']} at {appt.get('start_time','')}."
        # Outbox observability — log the queued task whether or not Twilio actually sends
        outbox_entry = {
            "id": str(uuid.uuid4()),
            "professional_id": owner_id,
            "type": "hexa_reminder",
            "appointment_id": appt["id"],
            "client_phone": appt["client_phone"],
            "message_preview": msg[:160],
            "status": "queued",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.hexa_outbox.insert_one(outbox_entry.copy())

        async def _send_and_log(phone: str, body: str, outbox_id: str):
            try:
                result = await send_whatsapp_message(phone, body)
                status = "sent" if result else "skipped"
                await db.hexa_outbox.update_one(
                    {"id": outbox_id},
                    {"$set": {"status": status, "completed_at": datetime.now(timezone.utc).isoformat()}},
                )
            except Exception as e:
                await db.hexa_outbox.update_one(
                    {"id": outbox_id},
                    {"$set": {"status": "failed", "error": str(e)[:240], "completed_at": datetime.now(timezone.utc).isoformat()}},
                )

        background_tasks.add_task(_send_and_log, appt['client_phone'], msg, outbox_entry["id"])
        return {
            "action": action,
            "speech": "Reminder scheduled.",
            "requires_confirmation": False,
            "executed": True,
            "result": {"appointment_id": appt['id'], "client_phone": appt['client_phone'], "outbox_id": outbox_entry["id"]},
        }
    elif a_type == "update_bot_instructions":
        if not payload.confirm:
            return {"action": action, "speech": "Here is a draft for your bot instructions. Confirm to apply.", "requires_confirmation": True, "executed": False}
        draft = a_params.get("draft", "")
        if not draft:
            raise HTTPException(status_code=400, detail="No draft provided")
        await db.users.update_one({"id": owner_id}, {"$set": {"bot_instructions": draft}})
        return {"action": action, "speech": "Bot instructions updated.", "requires_confirmation": False, "executed": True}
    else:
        return {
            "action": action,
            "speech": speech or "I can help with appointments, reminders, and patient lookups.",
            "requires_confirmation": False,
            "executed": False,
        }

    return {
        "action": action,
        "speech": speech,
        "requires_confirmation": requires_conf,
        "executed": True,
        "result": result_data,
    }
