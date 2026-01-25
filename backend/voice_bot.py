"""
Azure Speech + Exotel Voice Bot Integration for Lumer
Unified bot logic for WhatsApp and Voice channels
Supports multiple Indian languages (Hindi, Marathi, Tamil, Telugu, Bengali)
"""

import os
import json
import base64
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from enum import Enum

# Azure Speech SDK
try:
    import azure.cognitiveservices.speech as speechsdk
    AZURE_SPEECH_AVAILABLE = True
except ImportError:
    AZURE_SPEECH_AVAILABLE = False
    logging.warning("Azure Speech SDK not installed. Voice features will be limited.")

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Environment variables
AZURE_SPEECH_KEY = os.environ.get("AZURE_SPEECH_KEY", "")
AZURE_SPEECH_REGION = os.environ.get("AZURE_SPEECH_REGION", "centralindia")
EXOTEL_SID = os.environ.get("EXOTEL_SID", "")
EXOTEL_API_KEY = os.environ.get("EXOTEL_API_KEY", "")
EXOTEL_API_TOKEN = os.environ.get("EXOTEL_API_TOKEN", "")
EXOTEL_SUBDOMAIN = os.environ.get("EXOTEL_SUBDOMAIN", "api.in.exotel.com")


class SupportedLanguage(str, Enum):
    """Supported Indian languages for voice bot"""
    HINDI = "hi-IN"
    MARATHI = "mr-IN"
    TAMIL = "ta-IN"
    TELUGU = "te-IN"
    BENGALI = "bn-IN"
    ENGLISH = "en-IN"


# Voice mapping for TTS
VOICE_MAPPING = {
    SupportedLanguage.HINDI: {
        "male": "hi-IN-AaravNeural",
        "female": "hi-IN-AnanyaNeural"
    },
    SupportedLanguage.MARATHI: {
        "male": "mr-IN-MohanNeural",
        "female": "mr-IN-AarohiNeural"
    },
    SupportedLanguage.TAMIL: {
        "male": "ta-IN-ValluvarNeural",
        "female": "ta-IN-PallaviNeural"
    },
    SupportedLanguage.TELUGU: {
        "male": "te-IN-MohanNeural",
        "female": "te-IN-ShrutiNeural"
    },
    SupportedLanguage.BENGALI: {
        "male": "bn-IN-BashkarNeural",
        "female": "bn-IN-TanishaaNeural"
    },
    SupportedLanguage.ENGLISH: {
        "male": "en-IN-PrabhatNeural",
        "female": "en-IN-NeerjaNeural"
    }
}

# Language greetings
GREETINGS = {
    SupportedLanguage.HINDI: "नमस्ते! मैं आपकी अपॉइंटमेंट बुकिंग में मदद कर सकता हूं।",
    SupportedLanguage.MARATHI: "नमस्कार! मी तुमच्या अपॉइंटमेंट बुकिंगमध्ये मदत करू शकतो.",
    SupportedLanguage.TAMIL: "வணக்கம்! நான் உங்கள் அப்பாயிண்ட்மென்ட் புக்கிங்கில் உதவ முடியும்.",
    SupportedLanguage.TELUGU: "నమస్కారం! మీ అపాయింట్‌మెంట్ బుకింగ్‌లో నేను మీకు సహాయం చేయగలను.",
    SupportedLanguage.BENGALI: "নমস্কার! আমি আপনার অ্যাপয়েন্টমেন্ট বুকিংয়ে সাহায্য করতে পারি।",
    SupportedLanguage.ENGLISH: "Hello! I can help you with appointment booking."
}


class VoiceCallSession(BaseModel):
    """Model for tracking voice call sessions"""
    call_sid: str
    phone: str
    professional_id: Optional[str] = None
    language: SupportedLanguage = SupportedLanguage.HINDI
    state: str = "greeting"  # greeting, language_selection, name, date, time, confirm
    collected_data: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    transcript: List[Dict] = Field(default_factory=list)


class AzureSpeechService:
    """Azure Speech Services wrapper for STT and TTS"""
    
    def __init__(self):
        self.speech_config = None
        if AZURE_SPEECH_AVAILABLE and AZURE_SPEECH_KEY:
            self.speech_config = speechsdk.SpeechConfig(
                subscription=AZURE_SPEECH_KEY,
                region=AZURE_SPEECH_REGION
            )
            # Configure for low latency
            self.speech_config.set_property(
                speechsdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
                "5000"
            )
            self.speech_config.set_property(
                speechsdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,
                "500"
            )
    
    def is_available(self) -> bool:
        return self.speech_config is not None
    
    async def speech_to_text(
        self, 
        audio_data: bytes, 
        language: SupportedLanguage = SupportedLanguage.HINDI
    ) -> Optional[str]:
        """Convert speech audio to text"""
        if not self.is_available():
            logger.error("Azure Speech SDK not available")
            return None
        
        try:
            self.speech_config.speech_recognition_language = language.value
            
            # Create push stream for audio
            audio_format = speechsdk.audio.AudioStreamFormat(
                samples_per_second=16000,
                bits_per_sample=16,
                channels=1
            )
            push_stream = speechsdk.audio.PushAudioInputStream(stream_format=audio_format)
            audio_config = speechsdk.audio.AudioConfig(stream=push_stream)
            
            # Create recognizer
            recognizer = speechsdk.SpeechRecognizer(
                speech_config=self.speech_config,
                audio_config=audio_config,
                language=language.value
            )
            
            # Write audio data
            push_stream.write(audio_data)
            push_stream.close()
            
            # Recognize
            result = recognizer.recognize_once()
            
            if result.reason == speechsdk.ResultReason.RecognizedSpeech:
                logger.info(f"Recognized: {result.text}")
                return result.text
            elif result.reason == speechsdk.ResultReason.NoMatch:
                logger.warning("No speech could be recognized")
                return None
            else:
                logger.error(f"Speech recognition failed: {result.reason}")
                return None
                
        except Exception as e:
            logger.error(f"STT error: {str(e)}")
            return None
    
    async def text_to_speech(
        self, 
        text: str, 
        language: SupportedLanguage = SupportedLanguage.HINDI,
        voice_gender: str = "female"
    ) -> Optional[bytes]:
        """Convert text to speech audio"""
        if not self.is_available():
            logger.error("Azure Speech SDK not available")
            return None
        
        try:
            voice_name = VOICE_MAPPING.get(language, VOICE_MAPPING[SupportedLanguage.HINDI]).get(
                voice_gender, "female"
            )
            
            # Create SSML for natural speech
            ssml = f"""
            <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{language.value}">
                <voice name="{voice_name}">
                    <prosody rate="0.95" pitch="0%">
                        {text}
                    </prosody>
                </voice>
            </speak>
            """
            
            # Synthesize to memory
            audio_config = speechsdk.audio.AudioOutputConfig(use_default_speaker=False)
            synthesizer = speechsdk.SpeechSynthesizer(
                speech_config=self.speech_config,
                audio_config=audio_config
            )
            
            result = synthesizer.speak_ssml(ssml)
            
            if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
                logger.info(f"TTS completed: {len(result.audio_data)} bytes")
                return result.audio_data
            else:
                logger.error(f"TTS failed: {result.reason}")
                return None
                
        except Exception as e:
            logger.error(f"TTS error: {str(e)}")
            return None


class ExotelService:
    """Exotel telephony service integration"""
    
    def __init__(self):
        self.base_url = f"https://{EXOTEL_API_KEY}:{EXOTEL_API_TOKEN}@{EXOTEL_SUBDOMAIN}/v1/Accounts/{EXOTEL_SID}"
        self.is_configured = bool(EXOTEL_SID and EXOTEL_API_KEY and EXOTEL_API_TOKEN)
    
    async def initiate_call(
        self, 
        from_number: str, 
        to_number: str, 
        flow_id: str,
        status_callback: str
    ) -> Optional[Dict]:
        """Initiate an outbound call"""
        if not self.is_configured:
            logger.warning("Exotel not configured")
            return None
        
        try:
            import aiohttp
            
            url = f"{self.base_url}/Calls/connect"
            payload = {
                "From": from_number,
                "To": to_number,
                "CallerId": flow_id,  # Virtual number or flow ID
                "CallType": "trans",
                "TimeLimit": 14400,
                "StatusCallback": status_callback
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data=payload) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logger.error(f"Exotel call failed: {await response.text()}")
                        return None
                        
        except Exception as e:
            logger.error(f"Exotel error: {str(e)}")
            return None
    
    async def get_call_details(self, call_sid: str) -> Optional[Dict]:
        """Get details of a specific call"""
        if not self.is_configured:
            return None
        
        try:
            import aiohttp
            
            url = f"{self.base_url}/Calls/{call_sid}"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        return await response.json()
                    return None
                    
        except Exception as e:
            logger.error(f"Exotel get call error: {str(e)}")
            return None


class UnifiedBotLogic:
    """
    Unified bot logic that handles both WhatsApp and Voice channels.
    The same conversation flow is used regardless of channel.
    """
    
    def __init__(self, db):
        self.db = db
        self.speech_service = AzureSpeechService()
        self.exotel_service = ExotelService()
    
    async def get_bot_instructions(self, professional_id: str) -> str:
        """Get bot instructions for a professional"""
        user = await self.db.users.find_one({"id": professional_id}, {"_id": 0})
        if user:
            return user.get("bot_instructions", self._default_instructions())
        return self._default_instructions()
    
    def _default_instructions(self) -> str:
        return """You are a helpful medical receptionist assistant. 
        Be polite, professional, and helpful. 
        Help patients book appointments and answer basic queries.
        Always confirm appointment details before finalizing."""
    
    async def process_message(
        self, 
        message: str, 
        phone: str, 
        professional_id: str,
        channel: str = "whatsapp",  # "whatsapp" or "voice"
        language: SupportedLanguage = SupportedLanguage.ENGLISH
    ) -> str:
        """
        Process a message from any channel and return response.
        This is the unified bot logic used by both WhatsApp and Voice.
        """
        # Get conversation state
        conversation = await self.db.unified_conversations.find_one({
            "phone": phone,
            "professional_id": professional_id
        }, {"_id": 0})
        
        if not conversation:
            conversation = {
                "phone": phone,
                "professional_id": professional_id,
                "state": "greeting",
                "language": language.value,
                "collected_data": {},
                "history": [],
                "channel": channel,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await self.db.unified_conversations.insert_one(conversation)
        
        # Get bot instructions
        instructions = await self.get_bot_instructions(professional_id)
        
        # Process based on state
        state = conversation.get("state", "greeting")
        response = ""
        new_state = state
        collected_data = conversation.get("collected_data", {})
        
        if state == "greeting":
            response = await self._handle_greeting(message, language)
            new_state = "collecting_name"
            
        elif state == "collecting_name":
            collected_data["name"] = message
            response = await self._get_date_prompt(language)
            new_state = "collecting_date"
            
        elif state == "collecting_date":
            # Parse date
            collected_data["date"] = message
            response = await self._get_time_prompt(language)
            new_state = "collecting_time"
            
        elif state == "collecting_time":
            collected_data["time"] = message
            response = await self._confirm_booking(collected_data, language)
            new_state = "confirming"
            
        elif state == "confirming":
            if self._is_affirmative(message, language):
                # Create appointment
                appointment = await self._create_appointment(
                    phone, professional_id, collected_data
                )
                response = await self._booking_confirmed(appointment, language)
                new_state = "completed"
            else:
                response = await self._booking_cancelled(language)
                new_state = "greeting"
                collected_data = {}
        
        else:
            # Default: use AI for general queries
            response = await self._ai_response(message, instructions, language)
        
        # Update conversation
        await self.db.unified_conversations.update_one(
            {"phone": phone, "professional_id": professional_id},
            {
                "$set": {
                    "state": new_state,
                    "collected_data": collected_data,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                },
                "$push": {
                    "history": {
                        "role": "user",
                        "content": message,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "channel": channel
                    }
                }
            }
        )
        
        # Also log bot response
        await self.db.unified_conversations.update_one(
            {"phone": phone, "professional_id": professional_id},
            {
                "$push": {
                    "history": {
                        "role": "assistant",
                        "content": response,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "channel": channel
                    }
                }
            }
        )
        
        return response
    
    async def _handle_greeting(self, message: str, language: SupportedLanguage) -> str:
        """Handle initial greeting"""
        greeting = GREETINGS.get(language, GREETINGS[SupportedLanguage.ENGLISH])
        name_prompt = {
            SupportedLanguage.HINDI: "कृपया अपना नाम बताएं।",
            SupportedLanguage.MARATHI: "कृपया आपले नाव सांगा.",
            SupportedLanguage.TAMIL: "தயவுசெய்து உங்கள் பெயரைச் சொல்லுங்கள்.",
            SupportedLanguage.TELUGU: "దయచేసి మీ పేరు చెప్పండి.",
            SupportedLanguage.BENGALI: "দয়া করে আপনার নাম বলুন।",
            SupportedLanguage.ENGLISH: "Please tell me your name."
        }
        return f"{greeting} {name_prompt.get(language, name_prompt[SupportedLanguage.ENGLISH])}"
    
    async def _get_date_prompt(self, language: SupportedLanguage) -> str:
        """Get date collection prompt"""
        prompts = {
            SupportedLanguage.HINDI: "धन्यवाद! अपॉइंटमेंट के लिए कौन सी तारीख चाहिए?",
            SupportedLanguage.MARATHI: "धन्यवाद! अपॉइंटमेंटसाठी कोणती तारीख हवी आहे?",
            SupportedLanguage.TAMIL: "நன்றி! அப்பாயிண்ட்மென்ட்டுக்கு எந்த தேதி வேண்டும்?",
            SupportedLanguage.TELUGU: "ధన్యవాదాలు! అపాయింట్‌మెంట్ కోసం ఏ తేదీ కావాలి?",
            SupportedLanguage.BENGALI: "ধন্যবাদ! অ্যাপয়েন্টমেন্টের জন্য কোন তারিখ চাই?",
            SupportedLanguage.ENGLISH: "Thank you! Which date would you like for the appointment?"
        }
        return prompts.get(language, prompts[SupportedLanguage.ENGLISH])
    
    async def _get_time_prompt(self, language: SupportedLanguage) -> str:
        """Get time collection prompt"""
        prompts = {
            SupportedLanguage.HINDI: "ठीक है! कितने बजे अपॉइंटमेंट चाहिए?",
            SupportedLanguage.MARATHI: "ठीक आहे! किती वाजता अपॉइंटमेंट हवी?",
            SupportedLanguage.TAMIL: "சரி! எத்தனை மணிக்கு அப்பாயிண்ட்மென்ட் வேண்டும்?",
            SupportedLanguage.TELUGU: "సరే! ఎన్ని గంటలకు అపాయింట్‌మెంట్ కావాలి?",
            SupportedLanguage.BENGALI: "ঠিক আছে! কয়টায় অ্যাপয়েন্টমেন্ট চান?",
            SupportedLanguage.ENGLISH: "Alright! What time would you prefer?"
        }
        return prompts.get(language, prompts[SupportedLanguage.ENGLISH])
    
    async def _confirm_booking(self, data: Dict, language: SupportedLanguage) -> str:
        """Confirm booking details"""
        templates = {
            SupportedLanguage.HINDI: f"कृपया पुष्टि करें:\nनाम: {data.get('name')}\nतारीख: {data.get('date')}\nसमय: {data.get('time')}\n\nक्या यह सही है? (हां/नहीं)",
            SupportedLanguage.MARATHI: f"कृपया पुष्टी करा:\nनाव: {data.get('name')}\nतारीख: {data.get('date')}\nवेळ: {data.get('time')}\n\nहे बरोबर आहे का? (होय/नाही)",
            SupportedLanguage.TAMIL: f"தயவுசெய்து உறுதிப்படுத்துங்கள்:\nபெயர்: {data.get('name')}\nதேதி: {data.get('date')}\nநேரம்: {data.get('time')}\n\nஇது சரியா? (ஆம்/இல்லை)",
            SupportedLanguage.TELUGU: f"దయచేసి నిర్ధారించండి:\nపేరు: {data.get('name')}\nతేదీ: {data.get('date')}\nసమయం: {data.get('time')}\n\nఇది సరైనదా? (అవును/కాదు)",
            SupportedLanguage.BENGALI: f"দয়া করে নিশ্চিত করুন:\nনাম: {data.get('name')}\nতারিখ: {data.get('date')}\nসময়: {data.get('time')}\n\nএটা কি ঠিক আছে? (হ্যাঁ/না)",
            SupportedLanguage.ENGLISH: f"Please confirm:\nName: {data.get('name')}\nDate: {data.get('date')}\nTime: {data.get('time')}\n\nIs this correct? (Yes/No)"
        }
        return templates.get(language, templates[SupportedLanguage.ENGLISH])
    
    def _is_affirmative(self, message: str, language: SupportedLanguage) -> bool:
        """Check if message is affirmative"""
        affirmatives = {
            SupportedLanguage.HINDI: ["हां", "हाँ", "जी", "ठीक", "सही", "yes", "ok"],
            SupportedLanguage.MARATHI: ["होय", "हो", "ठीक", "yes", "ok"],
            SupportedLanguage.TAMIL: ["ஆம்", "சரி", "yes", "ok"],
            SupportedLanguage.TELUGU: ["అవును", "సరే", "yes", "ok"],
            SupportedLanguage.BENGALI: ["হ্যাঁ", "হা", "ঠিক", "yes", "ok"],
            SupportedLanguage.ENGLISH: ["yes", "yeah", "yep", "ok", "correct", "confirm"]
        }
        words = affirmatives.get(language, affirmatives[SupportedLanguage.ENGLISH])
        return any(word in message.lower() for word in words)
    
    async def _create_appointment(
        self, 
        phone: str, 
        professional_id: str, 
        data: Dict
    ) -> Dict:
        """Create appointment in database"""
        import uuid
        
        appointment = {
            "id": str(uuid.uuid4()),
            "professional_id": professional_id,
            "client_name": data.get("name", "Unknown"),
            "client_phone": phone,
            "date": data.get("date"),
            "time": data.get("time"),
            "status": "scheduled",
            "source": "voice_bot",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await self.db.appointments.insert_one(appointment)
        return appointment
    
    async def _booking_confirmed(self, appointment: Dict, language: SupportedLanguage) -> str:
        """Booking confirmed message"""
        templates = {
            SupportedLanguage.HINDI: f"आपकी अपॉइंटमेंट बुक हो गई है। तारीख: {appointment.get('date')}, समय: {appointment.get('time')}। आपको WhatsApp पर पुष्टि मिलेगी।",
            SupportedLanguage.MARATHI: f"आपली अपॉइंटमेंट बुक झाली आहे। तारीख: {appointment.get('date')}, वेळ: {appointment.get('time')}। तुम्हाला WhatsApp वर पुष्टी मिळेल.",
            SupportedLanguage.TAMIL: f"உங்கள் அப்பாயிண்ட்மென்ட் பதிவு செய்யப்பட்டது। தேதி: {appointment.get('date')}, நேரம்: {appointment.get('time')}। WhatsApp-ல் உறுதிப்படுத்தல் கிடைக்கும்.",
            SupportedLanguage.TELUGU: f"మీ అపాయింట్‌మెంట్ బుక్ అయింది. తేదీ: {appointment.get('date')}, సమయం: {appointment.get('time')}। WhatsApp లో నిర్ధారణ వస్తుంది.",
            SupportedLanguage.BENGALI: f"আপনার অ্যাপয়েন্টমেন্ট বুক হয়ে গেছে। তারিখ: {appointment.get('date')}, সময়: {appointment.get('time')}। WhatsApp-এ নিশ্চিতকরণ পাবেন।",
            SupportedLanguage.ENGLISH: f"Your appointment has been booked. Date: {appointment.get('date')}, Time: {appointment.get('time')}. You will receive a confirmation on WhatsApp."
        }
        return templates.get(language, templates[SupportedLanguage.ENGLISH])
    
    async def _booking_cancelled(self, language: SupportedLanguage) -> str:
        """Booking cancelled message"""
        templates = {
            SupportedLanguage.HINDI: "ठीक है, अपॉइंटमेंट रद्द कर दी गई। क्या मैं आपकी और मदद कर सकता हूं?",
            SupportedLanguage.MARATHI: "ठीक आहे, अपॉइंटमेंट रद्द केली. मी तुम्हाला आणखी मदत करू शकतो का?",
            SupportedLanguage.TAMIL: "சரி, அப்பாயிண்ட்மென்ட் ரத்து செய்யப்பட்டது. வேறு ஏதாவது உதவ வேண்டுமா?",
            SupportedLanguage.TELUGU: "సరే, అపాయింట్‌మెంట్ రద్దు చేయబడింది. ఇంకా ఏమైనా సహాయం కావాలా?",
            SupportedLanguage.BENGALI: "ঠিক আছে, অ্যাপয়েন্টমেন্ট বাতিল করা হয়েছে। আর কিছু সাহায্য করতে পারি?",
            SupportedLanguage.ENGLISH: "Okay, appointment cancelled. Is there anything else I can help with?"
        }
        return templates.get(language, templates[SupportedLanguage.ENGLISH])
    
    async def _ai_response(self, message: str, instructions: str, language: SupportedLanguage) -> str:
        """Get AI-powered response for general queries"""
        try:
            from emergentintegrations.llm.chat import chat, UserMessage, SystemMessage
            
            lang_instruction = {
                SupportedLanguage.HINDI: "Respond in Hindi language.",
                SupportedLanguage.MARATHI: "Respond in Marathi language.",
                SupportedLanguage.TAMIL: "Respond in Tamil language.",
                SupportedLanguage.TELUGU: "Respond in Telugu language.",
                SupportedLanguage.BENGALI: "Respond in Bengali language.",
                SupportedLanguage.ENGLISH: "Respond in English."
            }
            
            full_instructions = f"{instructions}\n\n{lang_instruction.get(language, lang_instruction[SupportedLanguage.ENGLISH])}"
            
            response = await chat(
                api_key=os.environ.get("EMERGENT_LLM_KEY"),
                model="gpt-4o-mini",
                messages=[
                    SystemMessage(content=full_instructions),
                    UserMessage(content=message)
                ]
            )
            
            return response.content
            
        except Exception as e:
            logger.error(f"AI response error: {str(e)}")
            return "I'm sorry, I couldn't process your request. Please try again."


# Voice call session manager
class VoiceCallManager:
    """Manages active voice call sessions"""
    
    def __init__(self, db, bot_logic: UnifiedBotLogic):
        self.db = db
        self.bot_logic = bot_logic
        self.speech_service = AzureSpeechService()
        self.active_sessions: Dict[str, VoiceCallSession] = {}
    
    async def handle_incoming_call(
        self, 
        call_sid: str, 
        from_phone: str,
        to_phone: str,
        professional_id: Optional[str] = None
    ) -> Dict:
        """Handle an incoming voice call"""
        
        # Find professional by virtual number if not provided
        if not professional_id:
            user = await self.db.users.find_one(
                {"virtual_number": to_phone}, 
                {"_id": 0}
            )
            if user:
                professional_id = user.get("id")
        
        # Create session
        session = VoiceCallSession(
            call_sid=call_sid,
            phone=from_phone,
            professional_id=professional_id,
            language=SupportedLanguage.HINDI  # Default, will detect
        )
        
        self.active_sessions[call_sid] = session
        
        # Save to DB
        await self.db.voice_sessions.insert_one({
            "call_sid": call_sid,
            "phone": from_phone,
            "professional_id": professional_id,
            "language": session.language.value,
            "state": session.state,
            "created_at": session.created_at.isoformat()
        })
        
        # Generate greeting audio
        greeting = GREETINGS[session.language]
        audio = await self.speech_service.text_to_speech(greeting, session.language)
        
        return {
            "session_id": call_sid,
            "greeting_audio": base64.b64encode(audio).decode() if audio else None,
            "language": session.language.value
        }
    
    async def process_audio(
        self, 
        call_sid: str, 
        audio_data: bytes
    ) -> Dict:
        """Process incoming audio and return response audio"""
        
        session = self.active_sessions.get(call_sid)
        if not session:
            return {"error": "Session not found"}
        
        # STT
        text = await self.speech_service.speech_to_text(audio_data, session.language)
        if not text:
            return {"error": "Could not recognize speech"}
        
        # Add to transcript
        session.transcript.append({
            "role": "user",
            "content": text,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        # Get bot response
        response_text = await self.bot_logic.process_message(
            message=text,
            phone=session.phone,
            professional_id=session.professional_id,
            channel="voice",
            language=session.language
        )
        
        # Add response to transcript
        session.transcript.append({
            "role": "assistant",
            "content": response_text,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        # TTS
        audio = await self.speech_service.text_to_speech(response_text, session.language)
        
        # Update DB
        await self.db.voice_sessions.update_one(
            {"call_sid": call_sid},
            {
                "$set": {
                    "state": session.state,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                },
                "$push": {
                    "transcript": session.transcript[-2:]  # Last user + assistant message
                }
            }
        )
        
        return {
            "recognized_text": text,
            "response_text": response_text,
            "response_audio": base64.b64encode(audio).decode() if audio else None
        }
    
    async def end_call(self, call_sid: str) -> None:
        """End a voice call session"""
        session = self.active_sessions.pop(call_sid, None)
        
        if session:
            await self.db.voice_sessions.update_one(
                {"call_sid": call_sid},
                {
                    "$set": {
                        "ended_at": datetime.now(timezone.utc).isoformat(),
                        "state": "ended"
                    }
                }
            )


# Initialize global instances (will be set by server.py)
speech_service: Optional[AzureSpeechService] = None
exotel_service: Optional[ExotelService] = None
unified_bot: Optional[UnifiedBotLogic] = None
voice_manager: Optional[VoiceCallManager] = None


def init_voice_services(db):
    """Initialize voice services with database connection"""
    global speech_service, exotel_service, unified_bot, voice_manager
    
    speech_service = AzureSpeechService()
    exotel_service = ExotelService()
    unified_bot = UnifiedBotLogic(db)
    voice_manager = VoiceCallManager(db, unified_bot)
    
    logger.info(f"Voice services initialized. Azure Speech available: {speech_service.is_available()}")
    logger.info(f"Exotel configured: {exotel_service.is_configured}")
    
    return {
        "speech_service": speech_service,
        "exotel_service": exotel_service,
        "unified_bot": unified_bot,
        "voice_manager": voice_manager
    }
