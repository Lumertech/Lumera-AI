"""ElevenLabs TTS routes — multilingual voice for Lumera voice bot.

Endpoints:
  GET  /api/elevenlabs/status         — configured + which key is being used
  GET  /api/elevenlabs/voices         — voices from the account (with default fallback)
  GET  /api/elevenlabs/languages      — supported multilingual languages
  POST /api/elevenlabs/tts            — synthesize (auth) returns base64 mp3
  POST /api/elevenlabs/preview        — quick preview using a default voice (auth)
  GET  /api/elevenlabs/config         — get current user's voice settings
  PUT  /api/elevenlabs/config         — save current user's voice settings
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from shared import db, get_current_user
from elevenlabs_service import get_elevenlabs_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/elevenlabs", tags=["elevenlabs"])


# ---------- Models ----------
class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice_id: str = Field(..., min_length=1)
    model_id: str = "eleven_multilingual_v2"
    stability: float = Field(default=0.5, ge=0.0, le=1.0)
    similarity_boost: float = Field(default=0.75, ge=0.0, le=1.0)
    style: float = Field(default=0.0, ge=0.0, le=1.0)


class ElevenLabsConfig(BaseModel):
    enabled: bool = False
    voice_id: Optional[str] = None
    voice_name: Optional[str] = None
    language: str = "en"
    model_id: str = "eleven_multilingual_v2"
    stability: float = 0.5
    similarity_boost: float = 0.75


# ---------- Status ----------
@router.get("/status")
async def elevenlabs_status(current_user: dict = Depends(get_current_user)):
    svc = get_elevenlabs_service()
    return {
        "available": svc.is_available(),
        "provider": "elevenlabs",
        "default_model": "eleven_multilingual_v2",
    }


@router.get("/library")
async def voice_library():
    """Public voice gallery — 18 curated premade voices with 5-second preview MP3 URLs.
    No auth required; served from ElevenLabs' public CDN."""
    svc = get_elevenlabs_service()
    return {"voices": svc.list_default_voices(), "count": len(svc.list_default_voices())}


@router.get("/voices")
async def list_voices(current_user: dict = Depends(get_current_user)):
    svc = get_elevenlabs_service()
    if not svc.is_available():
        return {
            "voices": svc.list_default_voices(),
            "source": "default",
            "note": "ElevenLabs API key not configured on server.",
        }
    # Blocking network call — offload to a thread
    result = await asyncio.to_thread(svc.fetch_account_voices)
    return result


@router.get("/languages")
async def list_languages():
    svc = get_elevenlabs_service()
    return {"languages": svc.list_supported_languages()}


# ---------- Synthesis ----------
@router.post("/tts")
async def synthesize_tts(body: TTSRequest, current_user: dict = Depends(get_current_user)):
    svc = get_elevenlabs_service()
    if not svc.is_available():
        raise HTTPException(status_code=503, detail="ElevenLabs is not configured on the server.")
    try:
        audio_b64 = await asyncio.to_thread(
            svc.synthesize_base64,
            body.text,
            body.voice_id,
            model_id=body.model_id,
            stability=body.stability,
            similarity_boost=body.similarity_boost,
            style=body.style,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Log usage (best-effort)
    try:
        await db.elevenlabs_usage.insert_one({
            "user_id": current_user["id"],
            "text_len": len(body.text),
            "voice_id": body.voice_id,
            "model_id": body.model_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as log_err:
        logger.warning(f"elevenlabs_usage log failed: {log_err}")

    return {
        "audio_base64": audio_b64,
        "mime_type": "audio/mpeg",
        "voice_id": body.voice_id,
        "model_id": body.model_id,
    }


@router.post("/preview")
async def preview_voice(body: TTSRequest, current_user: dict = Depends(get_current_user)):
    """Alias of /tts kept explicit for a friendlier UI action name."""
    return await synthesize_tts(body, current_user)


# ---------- Per-user config ----------
@router.get("/config")
async def get_config(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    cfg = (user or {}).get("elevenlabs_config") or {}
    svc = get_elevenlabs_service()
    return {
        "enabled": cfg.get("enabled", False),
        "voice_id": cfg.get("voice_id"),
        "voice_name": cfg.get("voice_name"),
        "language": cfg.get("language", "en"),
        "model_id": cfg.get("model_id", "eleven_multilingual_v2"),
        "stability": cfg.get("stability", 0.5),
        "similarity_boost": cfg.get("similarity_boost", 0.75),
        "server_configured": svc.is_available(),
    }


@router.put("/config")
async def update_config(cfg: ElevenLabsConfig, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "elevenlabs_config": cfg.model_dump(),
            "elevenlabs_config_updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"message": "ElevenLabs configuration saved", "config": cfg.model_dump()}
