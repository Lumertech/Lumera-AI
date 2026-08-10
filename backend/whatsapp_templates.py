"""Lumera utility WhatsApp templates — single source of truth.

Used by:
  - /app/backend/seed_whatsapp_templates.py  (CLI one-shot publisher)
  - /app/backend/routes/meta_whatsapp.py     (POST /api/meta-whatsapp/templates/publish)

Keep this file in sync with /app/memory/META_TECH_PARTNER_PREP.md Part 3.
"""
from __future__ import annotations

from typing import List, Dict, Any

# Language code used across all templates. Meta requires exact match on submission
# and later on send. Use 'en' unless you specifically need en_IN localisation.
DEFAULT_LANGUAGE = "en"

LUMERA_UTILITY_TEMPLATES: List[Dict[str, Any]] = [
    {
        "name": "appointment_confirmation_v1",
        "category": "UTILITY",
        "language": DEFAULT_LANGUAGE,
        "components": [
            {
                "type": "BODY",
                "text": (
                    "Hi {{1}}, your appointment with Dr. {{2}} is confirmed for "
                    "{{3}} at {{4}}.\n"
                    "Clinic: {{5}}. Reply CANCEL to cancel or RESCHEDULE to change.\n"
                    "- Lumera"
                ),
                "example": {
                    "body_text": [[
                        "Priya",
                        "Sarah Johnson",
                        "11 Aug 2026",
                        "10:00 AM",
                        "Sunshine Clinic, Pune",
                    ]],
                },
            },
            {"type": "FOOTER", "text": "Lumera Solutions LLP"},
        ],
    },
    {
        "name": "appointment_reminder_v1",
        "category": "UTILITY",
        "language": DEFAULT_LANGUAGE,
        "components": [
            {
                "type": "BODY",
                "text": (
                    "Reminder: Hi {{1}}, you have an appointment tomorrow at "
                    "{{2}} with Dr. {{3}}.\n"
                    "Please reach 10 minutes early. Reply CONFIRM to confirm."
                ),
                "example": {
                    "body_text": [[
                        "Priya",
                        "10:00 AM",
                        "Sarah Johnson",
                    ]],
                },
            },
            {"type": "FOOTER", "text": "Lumera Solutions LLP"},
        ],
    },
    {
        "name": "prescription_ready_v1",
        "category": "UTILITY",
        "language": DEFAULT_LANGUAGE,
        "components": [
            {"type": "HEADER", "format": "DOCUMENT"},
            {
                "type": "BODY",
                "text": (
                    "Hi {{1}}, Dr. {{2}} has issued your prescription from today's "
                    "visit.\nPlease find it attached. Next follow-up: {{3}}.\n"
                    "- Lumera"
                ),
                "example": {
                    "body_text": [[
                        "Priya",
                        "Sarah Johnson",
                        "18 Aug 2026",
                    ]],
                },
            },
            {"type": "FOOTER", "text": "Lumera Solutions LLP"},
        ],
    },
    {
        "name": "payment_link_v1",
        "category": "UTILITY",
        "language": DEFAULT_LANGUAGE,
        "components": [
            {
                "type": "BODY",
                "text": (
                    "Hi {{1}}, please complete your payment of ₹{{2}} for the "
                    "consultation with Dr. {{3}} on {{4}} using the secure link "
                    "below. This link expires in 24 hours."
                ),
                "example": {
                    "body_text": [[
                        "Priya",
                        "500",
                        "Sarah Johnson",
                        "11 Aug 2026",
                    ]],
                },
            },
            {"type": "FOOTER", "text": "Lumera Solutions LLP"},
            {
                "type": "BUTTONS",
                "buttons": [
                    {
                        "type": "URL",
                        "text": "Pay Now",
                        "url": "https://pay.lumer.me/{{1}}",
                        "example": ["https://pay.lumer.me/DEMO123"],
                    }
                ],
            },
        ],
    },
]
