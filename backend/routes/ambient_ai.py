"""Ambient AI EMR — extract structured clinical fields from a raw consultation
transcript using the Emergent LLM Key.

Input: free-flowing transcript (English + Hinglish + Indian accent-tolerant)
Output: JSON with symptoms, provisional_diagnosis, medications[], lab_tests[]
"""
from __future__ import annotations

import json
import logging
import os
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

from shared import get_current_user, db, safe_regex

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ambient", tags=["ambient-ai"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "").strip()


class ExtractRequest(BaseModel):
    transcript: str = Field(..., min_length=5, max_length=20000)
    context: Optional[str] = None   # e.g. patient name / age hints


class ExtractedMedication(BaseModel):
    medicine_name: str = ""
    dosage: str = ""
    frequency: str = ""
    duration: str = ""
    instructions: str = ""


class ExtractedLab(BaseModel):
    name: str = ""
    notes: str = ""


class ExtractedEMR(BaseModel):
    symptoms: str = ""
    provisional_diagnosis: str = ""
    vitals: dict = Field(default_factory=dict)
    medications: List[ExtractedMedication] = Field(default_factory=list)
    lab_tests: List[ExtractedLab] = Field(default_factory=list)
    general_instructions: str = ""
    raw_transcript: str = ""


SYSTEM_PROMPT = """You are a clinical NLP assistant for Indian doctors. Extract structured EMR fields from an unstructured consultation transcript.
The transcript may mix English and Hindi/Hinglish (e.g. "sir ko sir dard ho raha hai" = "headache").
Return STRICT JSON only — no prose — matching this schema:
{
  "symptoms": "brief patient-reported symptoms in one paragraph",
  "provisional_diagnosis": "doctor's stated impression or your best guess if clearly implied",
  "vitals": {"bp":"", "pulse":"", "spo2":"", "temperature":"", "weight":""},
  "medications": [
    {"medicine_name":"e.g. Pan 40","dosage":"40mg","frequency":"1-0-0 before food","duration":"14 days","instructions":""}
  ],
  "lab_tests": [{"name":"CBC","notes":""}],
  "general_instructions": "diet / follow-up / precautions"
}
Rules:
- Prefer Indian brand names doctors use (Pan 40, Crocin, Augmentin 625, Metformin, Amlodac).
- Convert Hinglish dose phrases (e.g. "din me do baar khaana ke baad" → "1-0-1 after food").
- Only include vitals actually stated; leave others as "".
- Only include medications/labs actually mentioned; empty arrays are fine.
- Keep every string short. Return ONLY the JSON object.
"""


def _build_persona_context(cfg: dict) -> str:
    """Append doctor's workspace AI settings to the base system prompt."""
    parts = []
    tone = (cfg.get("tone") or "").strip()
    name = (cfg.get("persona_name") or "").strip()
    if name or tone:
        parts.append(f"\nPersona: You are {name or 'the AI assistant'}, communicating in a {tone or 'Professional'} tone.")
    if cfg.get("working_hours"):
        parts.append(f"Clinic working hours: {cfg['working_hours']}")
    if cfg.get("emergency_number"):
        parts.append(f"Emergency escalation number: {cfg['emergency_number']}")
    if cfg.get("custom_system_instructions"):
        parts.append(f"Custom instructions:\n{cfg['custom_system_instructions']}")
    if cfg.get("special_guidelines"):
        parts.append(f"Special guidelines:\n{cfg['special_guidelines']}")
    return ("\n" + "\n".join(parts)) if parts else ""


@router.post("/extract", response_model=ExtractedEMR)
async def extract_emr(body: ExtractRequest, current_user: dict = Depends(get_current_user)):
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can use Ambient AI")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="Emergent LLM Key not configured on server")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"emergentintegrations not installed: {e}")

    # Inject doctor's workspace AI config into the system prompt
    ai_cfg = await db.workspace_ai_config.find_one(
        {"owner_id": current_user["id"]}, {"_id": 0}
    ) or {}
    system_msg = SYSTEM_PROMPT + _build_persona_context(ai_cfg)

    session_id = f"ambient-{current_user['id']}"
    chat = (
        LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system_msg)
        .with_model("openai", "gpt-4o-mini")  # cheap + fast for structured extraction
    )
    ctx = f"\nContext: {body.context}\n" if body.context else ""
    prompt = f"{ctx}Transcript:\n<<<\n{body.transcript}\n>>>\n\nReturn JSON only."
    try:
        raw = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.exception("Ambient extract LLM call failed")
        raise HTTPException(status_code=502, detail=f"LLM call failed: {str(e)[:200]}")

    # Parse JSON out of the LLM response (handle stray formatting)
    text = str(raw).strip()
    if text.startswith("```"):
        # strip ```json fences
        text = text.strip("`")
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"): text = text[:-3]
    try:
        data = json.loads(text)
    except Exception:
        # Attempt to locate {...} in the text
        start = text.find("{"); end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start:end + 1])
            except Exception as e:
                logger.warning(f"Failed to parse LLM JSON: {e}\nOUT: {text[:400]}")
                raise HTTPException(status_code=502, detail="AI returned unstructured output. Please try again.")
        else:
            raise HTTPException(status_code=502, detail="AI returned unstructured output. Please try again.")

    result = ExtractedEMR(**{
        "symptoms": (data.get("symptoms") or "").strip(),
        "provisional_diagnosis": (data.get("provisional_diagnosis") or "").strip(),
        "vitals": data.get("vitals") or {},
        "medications": [ExtractedMedication(**{k: (m.get(k) or "").strip() for k in ExtractedMedication.model_fields.keys()}) for m in (data.get("medications") or [])],
        "lab_tests": [ExtractedLab(**{"name": (l.get("name") or "").strip(), "notes": (l.get("notes") or "").strip()}) for l in (data.get("lab_tests") or [])],
        "general_instructions": (data.get("general_instructions") or "").strip(),
        "raw_transcript": body.transcript,
    })

    # Save every ambient session so doctors can revisit or search later
    try:
        import uuid as _uuid
        await db.ambient_sessions.insert_one({
            "id": str(_uuid.uuid4()),
            "doctor_id": current_user["id"],
            "context": body.context or "",
            "transcript": body.transcript,
            "extracted": result.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"ambient session save failed: {e}")

    return result


@router.get("/sessions")
async def list_sessions(q: str = "", limit: int = 20, current_user: dict = Depends(get_current_user)):
    """Recent ambient AI sessions for the current doctor, searchable by keyword."""
    query: dict = {"doctor_id": current_user["id"]}
    if q:
        escaped_q = safe_regex(q)
        query["$or"] = [
            {"transcript": {"$regex": escaped_q, "$options": "i"}},
            {"context": {"$regex": escaped_q, "$options": "i"}},
            {"extracted.provisional_diagnosis": {"$regex": escaped_q, "$options": "i"}},
        ]
    rows = await db.ambient_sessions.find(query, {"_id": 0}).sort("created_at", -1).to_list(max(1, min(limit, 100)))
    return rows


@router.post("/transcribe")
async def whisper_transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Whisper STT fallback for browsers without SpeechRecognition, or when
    doctors want higher-accuracy Hinglish transcription."""
    if current_user.get("profession") != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can use Ambient AI")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="Emergent LLM Key not configured")
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText
    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"emergentintegrations missing: {e}")

    content = await file.read()
    if len(content) > 24 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio must be ≤ 24 MB")

    import io
    buf = io.BytesIO(content)
    buf.name = file.filename or "audio.webm"

    stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
    try:
        resp = await stt.transcribe(
            file=buf,
            model="whisper-1",
            response_format="json",
            language=language if language else None,
            prompt="Indian clinical consultation. Doctor may mix English and Hindi (Hinglish). Uses Indian drug brand names like Pan 40, Crocin, Augmentin, Amlodac.",
        )
    except Exception as e:
        logger.exception("Whisper failed")
        raise HTTPException(status_code=502, detail=f"Whisper failed: {str(e)[:200]}")
    return {"transcript": getattr(resp, "text", "") or ""}
