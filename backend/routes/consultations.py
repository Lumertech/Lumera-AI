"""Consultation endpoints — Phase 2 AI Documentation Engine.

- Create/list/get/update consultation records
- Long-form audio transcription (Whisper)
- SOAP note auto-generation tuned for Indian medical practice
"""
import io
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText

from shared import (
    db,
    require_doctor_or_owner,
    get_llm_key,
    strip_json_fences,
)

router = APIRouter(prefix="/consultations", tags=["consultations"])


class ConsultationCreate(BaseModel):
    appointment_id: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    transcript: Optional[str] = ""


class ConsultationUpdate(BaseModel):
    transcript: Optional[str] = None
    soap: Optional[Dict[str, Any]] = None
    chief_complaint: Optional[str] = None


class SOAPGenerateRequest(BaseModel):
    transcript: str
    patient_age: Optional[int] = None
    patient_sex: Optional[str] = None
    chief_complaint: Optional[str] = None


@router.post("")
async def create_consultation(
    payload: ConsultationCreate,
    current_user: dict = Depends(require_doctor_or_owner),
):
    if current_user.get('profession') != 'doctor':
        raise HTTPException(status_code=403, detail="Only doctors can create consultations")
    consultation_id = str(uuid.uuid4())
    doc = {
        "id": consultation_id,
        "professional_id": current_user['id'],
        "appointment_id": payload.appointment_id,
        "client_name": payload.client_name,
        "client_phone": payload.client_phone,
        "transcript": payload.transcript or "",
        "soap": None,
        "chief_complaint": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.consultations.insert_one(doc.copy())
    return doc


@router.get("")
async def list_consultations(current_user: dict = Depends(require_doctor_or_owner)):
    items = await db.consultations.find(
        {"professional_id": current_user['id']}, {"_id": 0}
    ).sort("created_at", -1).limit(200).to_list(200)
    return items


@router.get("/{consultation_id}")
async def get_consultation(consultation_id: str, current_user: dict = Depends(require_doctor_or_owner)):
    item = await db.consultations.find_one(
        {"id": consultation_id, "professional_id": current_user['id']}, {"_id": 0}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Consultation not found")
    return item


@router.put("/{consultation_id}")
async def update_consultation(
    consultation_id: str,
    payload: ConsultationUpdate,
    current_user: dict = Depends(require_doctor_or_owner),
):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.consultations.update_one(
        {"id": consultation_id, "professional_id": current_user['id']},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Consultation not found")
    item = await db.consultations.find_one(
        {"id": consultation_id, "professional_id": current_user['id']}, {"_id": 0}
    )
    return item


@router.post("/transcribe")
async def transcribe_consultation(
    audio: UploadFile = File(...),
    language: Optional[str] = Form("en"),
    current_user: dict = Depends(require_doctor_or_owner),
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
            prompt="Doctor-patient consultation in India. Includes Indian brand drug names, regional medical terms, dosages, frequencies, complaints, examination findings.",
        )
        text = getattr(response, "text", None) or (response.get("text") if isinstance(response, dict) else "")
        return {"text": text or ""}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Consultation transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@router.post("/soap")
async def generate_soap_note(
    payload: SOAPGenerateRequest,
    current_user: dict = Depends(require_doctor_or_owner),
):
    if current_user.get('profession') != 'doctor':
        raise HTTPException(status_code=403, detail="Only doctors can generate SOAP notes")
    api_key = get_llm_key()
    if not (payload.transcript or "").strip():
        raise HTTPException(status_code=400, detail="Transcript is empty")

    prompt = f"""You are an experienced clinical scribe assisting an Indian doctor. Generate a structured SOAP note from the consultation transcript below. Use Indian medical conventions and recognise common Indian brand-name medicines and regional terms (e.g., 'sugar' for diabetes, 'BP' for hypertension).

Patient age: {payload.patient_age or 'unknown'}
Patient sex: {payload.patient_sex or 'unknown'}
Stated chief complaint (if any): {payload.chief_complaint or 'not stated'}

Transcript:
\"\"\"
{payload.transcript.strip()}
\"\"\"

Return ONLY a JSON object with this exact shape (no markdown, no prose):
{{
  "chief_complaint": "Short summary of why patient came in",
  "subjective": {{
    "history_of_present_illness": "Narrative HPI in 3-6 sentences",
    "past_medical_history": ["item 1", "item 2"],
    "medications": ["current medicine 1"],
    "allergies": ["allergy 1"],
    "social_history": "lifestyle / occupation / habits"
  }},
  "objective": {{
    "vitals": {{"bp": "", "pulse": "", "temperature": "", "spo2": "", "weight": ""}},
    "physical_exam": "Key examination findings",
    "investigations": ["test 1"]
  }},
  "assessment": {{
    "primary_diagnosis": "Most likely diagnosis",
    "differential_diagnoses": ["DD1", "DD2"],
    "icd10": ""
  }},
  "plan": {{
    "medications": [
      {{"medicine_name": "", "dosage": "", "frequency": "", "duration": "", "instructions": ""}}
    ],
    "investigations_ordered": ["test 1"],
    "patient_education": "Lifestyle and education advice",
    "follow_up": "When to return / red flags"
  }}
}}

If something is not mentioned in the transcript, leave the field empty (""), empty list ([]), or omit. Do NOT fabricate findings."""

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"soap_{current_user['id']}_{uuid.uuid4()}",
            system_message="You are a precise clinical scribe. Respond only with valid JSON. Do not invent findings.",
        ).with_model("openai", "gpt-4o-mini")
        text = await chat.send_message(UserMessage(text=prompt))
        soap = json.loads(strip_json_fences(text))
        return {"soap": soap}
    except json.JSONDecodeError:
        logging.warning("SOAP response was not valid JSON")
        raise HTTPException(status_code=502, detail="Unable to parse SOAP note from AI")
    except Exception as e:
        logging.error(f"SOAP generation failed: {e}")
        raise HTTPException(status_code=500, detail="SOAP generation failed")
