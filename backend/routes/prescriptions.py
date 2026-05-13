"""Prescription endpoints — Phase 1 enhancements.

Includes:
- AI suggestions
- Drug interaction alerts
- Whisper transcription (mic input)
- Private doctor notes history
- One-click ABHA linking
- Create / list prescriptions (sends patient-facing WhatsApp; never leaks private notes)
"""
import io
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText

from shared import (
    db,
    get_current_user,
    resolve_owner_id,
    send_whatsapp_message,
    get_llm_key,
    strip_json_fences,
)

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


# --- Models ---
class TaperStep(BaseModel):
    dosage: str
    frequency: str
    duration: str
    notes: Optional[str] = None


class PrescriptionItem(BaseModel):
    medicine_name: str
    dosage: str
    frequency: str
    duration: str
    instructions: Optional[str] = None
    is_tapering: Optional[bool] = False
    taper_schedule: Optional[List[TaperStep]] = None


class PrescriptionCreate(BaseModel):
    appointment_id: str
    client_name: str
    medications: List[Dict[str, Any]]
    instructions: str
    private_doctor_notes: Optional[str] = None
    link_to_abha: Optional[bool] = False


class DrugInteractionRequest(BaseModel):
    medications: List[Dict[str, Any]]
    patient_age: Optional[int] = None
    patient_conditions: Optional[List[str]] = None


class AISuggestionRequest(BaseModel):
    symptoms: str
    patient_age: Optional[int] = None
    patient_sex: Optional[str] = None


# --- Endpoints ---
@router.post("/ai-suggest")
async def ai_prescription_suggestions(
    request: AISuggestionRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('profession') != 'doctor':
        raise HTTPException(status_code=403, detail="Only doctors can access this feature")
    try:
        api_key = get_llm_key()
        prompt = f"""You are an AI medical assistant helping a doctor write a prescription.

Patient Information:
- Age: {request.patient_age} years
- Sex: {request.patient_sex}
- Symptoms: {request.symptoms}

Provide 3-5 commonly prescribed medications for these symptoms, formatted as JSON:
[
  {{
    "medicine_name": "Medicine name",
    "dosage": "Dosage amount",
    "frequency": "How often (e.g., twice daily)",
    "duration": "How long (e.g., 7 days)",
    "instructions": "Special instructions"
  }}
]

IMPORTANT:
- Only suggest commonly prescribed, safe medications
- Include appropriate dosages for the patient's age
- Add relevant precautions
- This is only a suggestion - the doctor will review and modify

Return ONLY the JSON array, no other text."""

        chat = LlmChat(
            api_key=api_key,
            session_id=f"prescription_{current_user['id']}_{uuid.uuid4()}",
            system_message="You are an AI medical assistant. Respond only with valid JSON arrays.",
        ).with_model("openai", "gpt-4o-mini")
        text = await chat.send_message(UserMessage(text=prompt))
        suggestions = strip_json_fences(text)
        json.loads(suggestions)  # validate
        return {"suggestions": suggestions}
    except json.JSONDecodeError:
        logging.warning("AI suggestion returned invalid JSON")
        return {"suggestions": json.dumps([{
            "medicine_name": "Paracetamol", "dosage": "500mg",
            "frequency": "Twice daily", "duration": "5 days",
            "instructions": "Take after meals with water",
        }])}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"AI suggestion error: {e}")
        return {"suggestions": json.dumps([{
            "medicine_name": "Paracetamol", "dosage": "500mg",
            "frequency": "Twice daily", "duration": "5 days",
            "instructions": "Take after meals with water",
        }])}


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: Optional[str] = Form("en"),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('profession') != 'doctor':
        raise HTTPException(status_code=403, detail="Only doctors can use voice input")
    api_key = get_llm_key()
    audio_bytes = await audio.read()
    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file exceeds 25 MB limit")

    filename = audio.filename or "audio.webm"
    if "." not in filename:
        ct = (audio.content_type or "").lower()
        ext = "webm"
        if "mp3" in ct or "mpeg" in ct: ext = "mp3"
        elif "wav" in ct: ext = "wav"
        elif "m4a" in ct or "mp4" in ct: ext = "m4a"
        filename = f"audio.{ext}"

    buf = io.BytesIO(audio_bytes); buf.name = filename
    try:
        stt = OpenAISpeechToText(api_key=api_key)
        response = await stt.transcribe(
            file=buf, model="whisper-1", response_format="json",
            language=language or "en",
            prompt="Indian medical terminology, drug names, dosages and frequencies.",
        )
        text = getattr(response, "text", None) or (response.get("text") if isinstance(response, dict) else "")
        return {"text": text or ""}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@router.post("/drug-interactions")
async def drug_interactions(
    request: DrugInteractionRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('profession') != 'doctor':
        raise HTTPException(status_code=403, detail="Only doctors can access this feature")
    api_key = get_llm_key()

    if not request.medications:
        return {"alerts": [], "summary": "No medications to analyze."}

    med_list = "\n".join([
        f"- {m.get('medicine_name','')} ({m.get('dosage','')}, {m.get('frequency','')}, {m.get('duration','')})"
        for m in request.medications
    ])
    conditions = ", ".join(request.patient_conditions or []) or "None reported"

    prompt = f"""You are a clinical pharmacology assistant. Review the following medications for a patient and identify drug-drug interactions, dose concerns, and contraindications. Use Indian brand-name awareness when relevant.

Patient age: {request.patient_age or 'unknown'}
Known conditions: {conditions}

Medications:
{med_list}

Return ONLY a JSON object with this exact shape (no prose, no markdown):
{{
  "alerts": [
    {{
      "severity": "high|moderate|low",
      "drugs_involved": ["DrugA", "DrugB"],
      "description": "Short clinical description of the interaction or concern",
      "recommendation": "What the doctor should consider"
    }}
  ],
  "summary": "One sentence summary of overall risk."
}}
If there are no interactions, return alerts: [] and a reassuring summary."""

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"drug_interactions_{current_user['id']}_{uuid.uuid4()}",
            system_message="You are a precise clinical pharmacology assistant. Respond only with valid JSON.",
        ).with_model("openai", "gpt-4o-mini")
        text = await chat.send_message(UserMessage(text=prompt))
        data = json.loads(strip_json_fences(text))
        if "alerts" not in data: data["alerts"] = []
        if "summary" not in data: data["summary"] = ""
        return data
    except json.JSONDecodeError:
        logging.warning("Drug interaction response was not valid JSON")
        return {"alerts": [], "summary": "Unable to parse interaction analysis."}
    except Exception as e:
        logging.error(f"Drug interaction check failed: {e}")
        raise HTTPException(status_code=500, detail="Drug interaction check failed")


@router.get("/private-notes/{client_phone}")
async def private_notes_history(
    client_phone: str,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('profession') != 'doctor':
        raise HTTPException(status_code=403, detail="Only doctors can view private notes")
    notes = await db.prescriptions.find(
        {
            "professional_id": current_user['id'],
            "client_phone": client_phone,
            "private_doctor_notes": {"$exists": True, "$nin": [None, ""]},
        },
        {"_id": 0, "id": 1, "private_doctor_notes": 1, "created_at": 1, "client_name": 1},
    ).sort("created_at", -1).to_list(100)
    return {"notes": notes}


@router.post("/{prescription_id}/link-abha")
async def link_prescription_abha(
    prescription_id: str,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('profession') != 'doctor':
        raise HTTPException(status_code=403, detail="Only doctors can link prescriptions")
    prescription = await db.prescriptions.find_one(
        {"id": prescription_id, "professional_id": current_user['id']}, {"_id": 0}
    )
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")
    client = await db.clients.find_one(
        {"professional_id": current_user['id'], "phone": prescription["client_phone"]},
        {"_id": 0},
    )
    abha_id = (client or {}).get("abha_id")
    if not abha_id:
        raise HTTPException(status_code=400, detail="Patient has no ABHA ID on file. Please add ABHA ID to the patient record first.")
    await db.prescriptions.update_one(
        {"id": prescription_id},
        {"$set": {"linked_to_abha": True, "abha_id": abha_id, "abha_linked_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True, "abha_id": abha_id, "linked_at": datetime.now(timezone.utc).isoformat()}


@router.post("")
async def create_prescription(
    prescription: PrescriptionCreate,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('profession') != 'doctor':
        raise HTTPException(status_code=403, detail="Only doctors can create prescriptions")
    prescription_id = str(uuid.uuid4())
    appointment = await db.appointments.find_one(
        {"id": prescription.appointment_id, "professional_id": current_user['id']}, {"_id": 0}
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    prescription_data = {
        "id": prescription_id,
        "professional_id": current_user['id'],
        "appointment_id": prescription.appointment_id,
        "client_name": prescription.client_name,
        "client_phone": appointment["client_phone"],
        "medications": prescription.medications,
        "instructions": prescription.instructions,
        "private_doctor_notes": prescription.private_doctor_notes or "",
        "linked_to_abha": False,
        "doctor_name": current_user['name'],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.prescriptions.insert_one(prescription_data.copy())

    if prescription.link_to_abha:
        try:
            client = await db.clients.find_one(
                {"professional_id": current_user['id'], "phone": appointment["client_phone"]},
                {"_id": 0},
            )
            abha_id = (client or {}).get("abha_id")
            if abha_id:
                await db.prescriptions.update_one(
                    {"id": prescription_id},
                    {"$set": {"linked_to_abha": True, "abha_id": abha_id}},
                )
                prescription_data["linked_to_abha"] = True
                prescription_data["abha_id"] = abha_id
        except Exception as e:
            logging.warning(f"ABHA linking skipped: {e}")

    def _format_med(i, med):
        base = f"{i+1}. {med['medicine_name']} - {med.get('dosage','')}\n   {med.get('frequency','')} for {med.get('duration','')}"
        if med.get('instructions'):
            base += f"\n   {med['instructions']}"
        if med.get('is_tapering') and med.get('taper_schedule'):
            base += "\n   Tapering schedule:"
            for idx, step in enumerate(med['taper_schedule'], 1):
                step_line = f"\n     Step {idx}: {step.get('dosage','')} - {step.get('frequency','')} for {step.get('duration','')}"
                if step.get('notes'):
                    step_line += f" ({step['notes']})"
                base += step_line
        return base

    meds_text = "\n".join([_format_med(i, med) for i, med in enumerate(prescription.medications)])
    prescription_message = f"""
\U0001f4dc PRESCRIPTION

Patient: {prescription.client_name}
Doctor: Dr. {current_user['name']}
Date: {datetime.now().strftime('%d %b %Y')}

MEDICATIONS:
{meds_text}

GENERAL INSTRUCTIONS:
{prescription.instructions}

\u26a0\ufe0f Important:
- Take medications as prescribed
- Complete the full course
- Contact doctor if symptoms worsen
- Do not share medications

For queries, contact: {current_user.get('phone_number', 'clinic')}
"""
    message_sent = await send_whatsapp_message(appointment["client_phone"], prescription_message)
    return {**prescription_data, "whatsapp_sent": bool(message_sent)}


@router.get("")
async def list_prescriptions(current_user: dict = Depends(get_current_user)):
    prescriptions = await db.prescriptions.find(
        {"professional_id": current_user['id']}, {"_id": 0}
    ).to_list(100)
    return prescriptions
