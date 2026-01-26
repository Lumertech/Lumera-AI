import httpx
import os
import logging
from typing import Dict, Optional

class MultiLanguageBot:
    """Handle multi-language translation for WhatsApp bot"""
    
    SUPPORTED_LANGUAGES = {
        'en': 'English',
        'hi': 'Hindi',
        'mr': 'Marathi',
        'ta': 'Tamil',
        'te': 'Telugu',
        'bn': 'Bengali',
        'gu': 'Gujarati',
        'kn': 'Kannada'
    }
    
    def __init__(self, api_key: str):
        self.api_key = api_key
    
    async def detect_language(self, text: str) -> str:
        """Detect language of input text"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{
                            "role": "user",
                            "content": f"Detect the language of this text and respond with ONLY the 2-letter ISO code (en, hi, mr, ta, te, bn, gu, kn): {text}"
                        }],
                        "temperature": 0.1
                    },
                    timeout=10.0
                )
                result = response.json()
                lang_code = result["choices"][0]["message"]["content"].strip().lower()[:2]
                return lang_code if lang_code in self.SUPPORTED_LANGUAGES else 'en'
        except Exception as e:
            logging.error(f"Language detection failed: {e}")
            return 'en'
    
    async def translate(self, text: str, target_lang: str) -> str:
        """Translate text to target language"""
        if target_lang == 'en':
            return text
        
        try:
            lang_name = self.SUPPORTED_LANGUAGES.get(target_lang, 'English')
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{
                            "role": "user",
                            "content": f"Translate this text to {lang_name}, keep it natural and conversational: {text}"
                        }],
                        "temperature": 0.3
                    },
                    timeout=15.0
                )
                result = response.json()
                return result["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logging.error(f"Translation failed: {e}")
            return text
    
    async def get_bot_response(self, message: str, context: Dict, user_language: str = 'en') -> str:
        """Generate context-aware bot response in user's language"""
        try:
            state = context.get('state', 'new')
            data = context.get('data', {})
            
            # Generate response based on state
            if state == 'new':
                response = "Hello! Welcome to Lumera 🏥\nI'll help you book an appointment.\n\nWhat is your full name?"
            elif state == 'awaiting_age':
                name = data.get('name', 'there')
                response = f"Thanks {name}! What is your age?"
            elif state == 'awaiting_sex':
                response = "What is your sex? (Male/Female/Other)"
            elif state == 'awaiting_type':
                response = "Would you like a clinic visit or phone consultation?"
            elif state == 'awaiting_slot':
                response = "Available slots:\n\nToday:\n• 2:00 PM\n• 4:00 PM\n\nTomorrow:\n• 10:00 AM\n• 2:00 PM\n• 4:00 PM\n\nReply with your preferred time!"
            else:
                response = "I can help you book appointments! Just say Hi to start."
            
            # Translate to user's language
            if user_language != 'en':
                response = await self.translate(response, user_language)
            
            return response
            
        except Exception as e:
            logging.error(f"Bot response generation failed: {e}")
            return "I'm here to help! Just say Hi to start booking."
