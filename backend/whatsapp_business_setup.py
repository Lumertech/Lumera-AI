"""WhatsApp Business API Setup Helper"""
import os
import httpx
import logging
from typing import Dict, Optional

class WhatsAppBusinessSetup:
    """Helper for setting up doctor's own WhatsApp Business number"""
    
    def __init__(self, phone_number_id: str, access_token: str):
        self.phone_number_id = phone_number_id
        self.access_token = access_token
        self.base_url = "https://graph.facebook.com/v18.0"
    
    async def send_message(self, to: str, message: str) -> bool:
        """Send message via WhatsApp Business API"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/{self.phone_number_id}/messages",
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "messaging_product": "whatsapp",
                        "to": to,
                        "type": "text",
                        "text": {"body": message}
                    },
                    timeout=30.0
                )
                result = response.json()
                return response.status_code == 200
        except Exception as e:
            logging.error(f"WhatsApp Business API send failed: {e}")
            return False
    
    async def send_template_message(self, to: str, template_name: str, params: list) -> bool:
        """Send template message (for OTP, prescriptions, etc.)"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/{self.phone_number_id}/messages",
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "messaging_product": "whatsapp",
                        "to": to,
                        "type": "template",
                        "template": {
                            "name": template_name,
                            "language": {"code": "en"},
                            "components": [
                                {
                                    "type": "body",
                                    "parameters": [{"type": "text", "text": p} for p in params]
                                }
                            ]
                        }
                    },
                    timeout=30.0
                )
                return response.status_code == 200
        except Exception as e:
            logging.error(f"Template message send failed: {e}")
            return False
    
    async def send_payment_link(self, to: str, payment_link: str, amount: int) -> bool:
        """Send payment link with details"""
        message = f"💳 Payment Request\n\nAmount: ₹{amount}\n\nClick here to pay: {payment_link}\n\nThank you!"
        return await self.send_message(to, message)
    
    async def send_prescription(self, to: str, prescription_text: str) -> bool:
        """Send prescription via WhatsApp"""
        return await self.send_message(to, prescription_text)
