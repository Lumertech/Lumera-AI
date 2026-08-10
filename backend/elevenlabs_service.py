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
# preview_url values are public and can be played without an API key.
DEFAULT_VOICES: List[Dict[str, str]] = [
    {"voice_id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel",   "gender": "female", "accent": "American",         "age": "young",       "description": "Calm, warm receptionist tone",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/df6788f9-5c96-470d-8312-aab3b3d8f50a.mp3"},
    {"voice_id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi",     "gender": "female", "accent": "American",         "age": "young",       "description": "Confident, strong narration",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/AZnzlk1XvdvUeBnXmlld/508e12d0-a7f7-4d86-a0d3-f3884ff353ed.mp3"},
    {"voice_id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella",    "gender": "female", "accent": "American",         "age": "young",       "description": "Soft, gentle and friendly",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/941b779e-c2ad-48d4-bddb-28d1a68fa27e.mp3"},
    {"voice_id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli",     "gender": "female", "accent": "American",         "age": "young",       "description": "Emotional, empathetic",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/MF3mGyEYCl7XYWbV9V6O/d8ecadea-9e48-4e5d-868a-2ec3d7397861.mp3"},
    {"voice_id": "LcfcDJNUP1GQjkzn1xUU", "name": "Emily",    "gender": "female", "accent": "American",         "age": "young",       "description": "Calm, meditative",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/LcfcDJNUP1GQjkzn1xUU/e4b994b7-9713-4238-84f3-add8fccaaccd.mp3"},
    {"voice_id": "XrExE9yKIg1WjnnlVkGX", "name": "Matilda",  "gender": "female", "accent": "American",         "age": "young",       "description": "Warm, audiobook-quality",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/b930e18d-6b4d-466e-bab2-0ae97c6d8535.mp3"},
    {"voice_id": "pMsXgVXv3BLzUgSXRplE", "name": "Serena",   "gender": "female", "accent": "American",         "age": "middle-aged", "description": "Pleasant, interactive",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/pMsXgVXv3BLzUgSXRplE/d61f18ed-e5b0-4d0b-a33c-5c6e7e33b053.mp3"},
    {"voice_id": "oWAxZDx7w5VEj9dCyTzz", "name": "Grace",    "gender": "female", "accent": "American-Southern","age": "young",       "description": "Gentle, comforting",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/oWAxZDx7w5VEj9dCyTzz/84a36d1c-e182-41a8-8c55-dbdd15cd6e72.mp3"},
    {"voice_id": "ThT5KcBeYPX3keUQqHPh", "name": "Dorothy",  "gender": "female", "accent": "British",          "age": "young",       "description": "Pleasant, well-spoken",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/ThT5KcBeYPX3keUQqHPh/981f0855-6598-48d2-9f8f-b6d92fbbe3fc.mp3"},
    {"voice_id": "ErXwobaYiN019PkySvjV", "name": "Antoni",   "gender": "male",   "accent": "American",         "age": "young",       "description": "Well-rounded, calm",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/ErXwobaYiN019PkySvjV/ee9ac367-91ee-4a56-818a-2bd1a9dbe83a.mp3"},
    {"voice_id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh",     "gender": "male",   "accent": "American",         "age": "young",       "description": "Deep, reassuring narrator",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/3ae2fc71-d5f9-4769-bb71-2a43633cd186.mp3"},
    {"voice_id": "VR6AewLTigWG4xSOukaG", "name": "Arnold",   "gender": "male",   "accent": "American",         "age": "middle-aged", "description": "Crisp, authoritative",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/VR6AewLTigWG4xSOukaG/316050b7-c4e0-48de-acf9-a882bb7fc43b.mp3"},
    {"voice_id": "pNInz6obpgDQGcFmaJgB", "name": "Adam",     "gender": "male",   "accent": "American",         "age": "middle-aged", "description": "Deep, neutral narrator",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/38a69695-2ca9-4b9e-b9ec-f07ced494a58.mp3"},
    {"voice_id": "GBv7mTt0atIp3Br8iCZE", "name": "Thomas",   "gender": "male",   "accent": "American",         "age": "young",       "description": "Calm, meditative",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/GBv7mTt0atIp3Br8iCZE/98542988-5267-4148-9a9e-baa8c4f14644.mp3"},
    {"voice_id": "TX3LPaxmHKxFdv7VOQHJ", "name": "Liam",     "gender": "male",   "accent": "American",         "age": "young",       "description": "Neutral, professional",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/TX3LPaxmHKxFdv7VOQHJ/63148076-6363-42db-aea8-31424308b92c.mp3"},
    {"voice_id": "onwK4e9ZLuTAKqWW03F9", "name": "Daniel",   "gender": "male",   "accent": "British",          "age": "middle-aged", "description": "Deep news-presenter",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/onwK4e9ZLuTAKqWW03F9/7eee0236-1a72-4b86-b303-5dcadc007ba9.mp3"},
    {"voice_id": "Yko7PKHZNXotIFUBG7I9", "name": "Matthew",  "gender": "male",   "accent": "British",          "age": "middle-aged", "description": "Calm audiobook narrator",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/Yko7PKHZNXotIFUBG7I9/02c66c93-a237-436f-8a7d-43e8c49bc6a3.mp3"},
    {"voice_id": "IKne3meq5aSn9XLyUdCD", "name": "Charlie",  "gender": "male",   "accent": "Australian",       "age": "middle-aged", "description": "Casual conversational",
     "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/IKne3meq5aSn9XLyUdCD/102de6f2-22ed-43e0-a1f1-111fa75c5481.mp3"},
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
