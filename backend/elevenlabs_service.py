"""
ElevenLabs Text-to-Speech service for Lumera voice bot.
Provides multilingual TTS for inbound voice calls (Exotel) and preview/test flows.
"""

import os
import io
import base64
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

try:
    from elevenlabs import ElevenLabs, VoiceSettings
    ELEVENLABS_AVAILABLE = True
except ImportError:
    ELEVENLABS_AVAILABLE = False
    logger.warning("elevenlabs SDK not installed")

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()

# Curated multilingual voices that work with eleven_multilingual_v2 / v3.
# These are stable ElevenLabs "premade" voice IDs suitable for medical receptionist tone.
DEFAULT_VOICES: List[Dict[str, str]] = [
    {"voice_id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel",  "gender": "female", "accent": "American",   "description": "Warm, calm receptionist"},
    {"voice_id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi",    "gender": "female", "accent": "American",   "description": "Confident, professional"},
    {"voice_id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella",   "gender": "female", "accent": "American",   "description": "Friendly, soft-spoken"},
    {"voice_id": "ErXwobaYiN019PkySvjV", "name": "Antoni",  "gender": "male",   "accent": "American",   "description": "Well-rounded, calm male"},
    {"voice_id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli",    "gender": "female", "accent": "American",   "description": "Young, empathetic"},
    {"voice_id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh",    "gender": "male",   "accent": "American",   "description": "Deep, reassuring"},
    {"voice_id": "VR6AewLTigWG4xSOukaG", "name": "Arnold",  "gender": "male",   "accent": "American",   "description": "Crisp, authoritative"},
    {"voice_id": "pNInz6obpgDQGcFmaJgB", "name": "Adam",    "gender": "male",   "accent": "American",   "description": "Neutral narrator"},
    {"voice_id": "yoZ06aMxZJJ28mfd3POQ", "name": "Sam",     "gender": "male",   "accent": "American",   "description": "Casual, approachable"},
]

# ElevenLabs uses a single multilingual model — supports 29+ languages including
# Hindi, Tamil, Telugu, Bengali, Marathi, English, and more.
SUPPORTED_LANGUAGES: List[Dict[str, str]] = [
    {"code": "en", "name": "English",  "native_name": "English"},
    {"code": "hi", "name": "Hindi",    "native_name": "हिन्दी"},
    {"code": "mr", "name": "Marathi",  "native_name": "मराठी"},
    {"code": "ta", "name": "Tamil",    "native_name": "தமிழ்"},
    {"code": "te", "name": "Telugu",   "native_name": "తెలుగు"},
    {"code": "bn", "name": "Bengali",  "native_name": "বাংলা"},
    {"code": "gu", "name": "Gujarati", "native_name": "ગુજરાતી"},
    {"code": "kn", "name": "Kannada",  "native_name": "ಕನ್ನಡ"},
    {"code": "ml", "name": "Malayalam","native_name": "മലയാളം"},
    {"code": "pa", "name": "Punjabi",  "native_name": "ਪੰਜਾਬੀ"},
    {"code": "ur", "name": "Urdu",     "native_name": "اردو"},
    {"code": "ar", "name": "Arabic",   "native_name": "العربية"},
]


class ElevenLabsService:
    """ElevenLabs TTS wrapper — multilingual, async-safe (blocking calls wrapped in threads by callers)."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = (api_key or ELEVENLABS_API_KEY).strip()
        self.client: Optional[ElevenLabs] = None
        if ELEVENLABS_AVAILABLE and self.api_key:
            try:
                self.client = ElevenLabs(api_key=self.api_key)
            except Exception as e:
                logger.error(f"Failed to init ElevenLabs client: {e}")

    def is_available(self) -> bool:
        return self.client is not None

    def list_default_voices(self) -> List[Dict[str, str]]:
        return DEFAULT_VOICES

    def list_supported_languages(self) -> List[Dict[str, str]]:
        return SUPPORTED_LANGUAGES

    def fetch_account_voices(self) -> Dict[str, Any]:
        """Fetch voices from the account. Requires voices_read scope on the API key.
        Falls back to DEFAULT_VOICES on any error."""
        if not self.is_available():
            return {"voices": DEFAULT_VOICES, "source": "default", "note": "ElevenLabs not configured"}
        try:
            resp = self.client.voices.get_all()
            voices = [
                {
                    "voice_id": v.voice_id,
                    "name": v.name,
                    "category": getattr(v, "category", None),
                    "description": getattr(v, "description", None) or "",
                }
                for v in resp.voices
            ]
            return {"voices": voices, "source": "account"}
        except Exception as e:
            logger.warning(f"Could not fetch account voices, using defaults: {e}")
            return {
                "voices": DEFAULT_VOICES,
                "source": "default",
                "note": str(e)[:200],
            }

    def synthesize(
        self,
        text: str,
        voice_id: str,
        model_id: str = "eleven_multilingual_v2",
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        style: float = 0.0,
        output_format: str = "mp3_44100_128",
    ) -> bytes:
        """Synthesize speech to bytes. Raises RuntimeError on failure (with a
        friendly message) so callers can surface it to the UI."""
        if not self.is_available():
            raise RuntimeError("ElevenLabs is not configured. Add ELEVENLABS_API_KEY to backend/.env")
        try:
            audio_iter = self.client.text_to_speech.convert(
                text=text,
                voice_id=voice_id,
                model_id=model_id,
                output_format=output_format,
                voice_settings=VoiceSettings(
                    stability=stability,
                    similarity_boost=similarity_boost,
                    style=style,
                    use_speaker_boost=True,
                ),
            )
            return b"".join(chunk for chunk in audio_iter if chunk)
        except Exception as e:
            msg = str(e)
            # Parse ElevenLabs error envelope for a friendlier surface
            if "detected_unusual_activity" in msg:
                raise RuntimeError(
                    "ElevenLabs blocked this request — the free tier is disabled for cloud/proxy IPs. "
                    "Upgrade to a paid plan on your ElevenLabs account to activate voice generation."
                )
            if "missing_permissions" in msg or "unauthorized" in msg.lower():
                raise RuntimeError(
                    "ElevenLabs API key is missing required permissions. Regenerate the key with "
                    "'text_to_speech' and 'voices_read' scopes."
                )
            if "voice_not_found" in msg:
                raise RuntimeError(f"Voice '{voice_id}' does not exist in your ElevenLabs account.")
            raise RuntimeError(f"ElevenLabs TTS failed: {msg[:250]}")

    def synthesize_base64(self, text: str, voice_id: str, **kwargs) -> str:
        audio = self.synthesize(text, voice_id, **kwargs)
        return base64.b64encode(audio).decode()


# Singleton
_service: Optional[ElevenLabsService] = None


def get_elevenlabs_service() -> ElevenLabsService:
    global _service
    if _service is None:
        _service = ElevenLabsService()
    return _service
