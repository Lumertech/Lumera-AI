# Lumera — Product Requirements

## Original Problem Statement
Lumera is an AI-powered medical practice management platform for doctors and allied health professionals in India. Features include:
- WhatsApp-based appointment booking & reminders
- Payments (Razorpay/UPI)
- Health records, ABDM/ABHA consent management
- AI-powered prescription writing with drug interaction checks, tapering schedules
- AI documentation (SOAP notes), voice-to-text consultation
- Voice Bot (Azure Speech + Exotel telephony)
- Multi-clinic management with receptionist sub-users
- "Hexa" voice-driven AI admin assistant

## User Personas
- **Doctor (primary)**: writes prescriptions, manages appointments, runs the clinic
- **Receptionist (sub-user, planned)**: manages appointments only, no pricing/bot edits
- **Admin (Lumera platform)**: manages users, analytics, landing content
- **Patient**: receives WhatsApp/voice booking, prescriptions, reminders

## Tech Stack
- Backend: FastAPI, MongoDB (motor), APScheduler, Twilio, Razorpay, Azure Speech SDK, emergentintegrations (OpenAI/Anthropic/Gemini via Emergent LLM key)
- Frontend: React + Tailwind + shadcn/ui
- Auth: JWT-based, bcrypt, role-based access (doctor, receptionist, admin)

## Implemented (as of 2026-05-13)

### Core
- Email/phone JWT auth + Google OAuth
- Calendar (appointments, time-offs, reminders)
- Clients/patients CRM
- Payments (Razorpay scaffolding — needs keys)
- WhatsApp bot (Twilio) with bot instructions, multi-language
- Admin dashboard (users, analytics, content editor)
- ABDM consent management (WhatsApp-driven, audit log)
- Voice Bot scaffolding (Azure SDK + Exotel — needs keys)
- Global Lumera rebrand

### Phase 1 — Prescription Module Enhancements (2026-05-13) ✅
- **Tapering / step-down schedule** per medication (multi-step builder, patient-friendly WhatsApp output)
- **AI drug interaction alerts** via `/api/prescriptions/drug-interactions` (gpt-4o-mini, severity high/moderate/low)
- **Private Doctor Notes** stored on prescription, never sent to patient; history per patient via `/api/prescriptions/private-notes/{phone}`
- **One-click ABHA linking** — checkbox on prescription form + `/api/prescriptions/{id}/link-abha` endpoint
- **Mic button → Whisper STT** on Symptoms, Special Instructions, General Instructions, and Private Notes (via Emergent LLM key)
- 15/15 backend pytest pass; UI smoke test green

### Phase 2-4 — AI Documentation + Clinic Management + Hexa + Seal (2026-05-13) ✅
**Phase 2 — AI Documentation Engine (HiGalen)**
- `Consultations` page with create / list / collapsible cards
- Long-form audio recording → Whisper transcription (`/api/consultations/transcribe`)
- One-click SOAP note generation (`/api/consultations/soap`) — Indian-medicine-tuned prompt
- Structured viewer for Subjective/Objective/Assessment/Plan

**Phase 3 — Clinics / Receptionists / OPD / Hexa (Eka.Care)**
- Multi-location clinic CRUD with primary-clinic toggle (`/api/clinics`)
- Receptionist sub-user creation (max 2/clinic), strict role enforcement via `resolve_owner_id()` helper
- Receptionists see parent doctor's appointments/clients; blocked (403) from prescriptions, clinics, hexa, consultations, OPD
- OPD Performance widget on dashboard (today/week/month + revenue + incentive tier: Bronze/Silver/Gold/Platinum)
- **Hexa** floating AI assistant — voice (Whisper) + text → safe actions:
  - Read: list today's/upcoming appointments, list unpaid invoices, search patient, summarize day
  - Write (requires_confirmation gate): send WhatsApp reminder, update bot instructions

**Phase 4 — Trust UI**
- "Seal of Privacy" badge component in dashboard footer with detail dialog (ABDM, HIPAA-ready, encrypted storage, role-based access, private notes)

**Test status:** Backend 27/27 pytest pass. Frontend smoke OK after fixing Optional[EmailStr] → Optional[str] coercion + shared `extractApiError()` util.

## P1 Backlog (next)

### Phase 2 — AI Documentation Engine
- SOAP note auto-generation from consultation transcript
- Full-length voice-to-text transcription (Whisper)
- Prompt tuning for Indian medical terminology / brand drug names

### Phase 3 — Clinic / Multi-Location / Hexa
- Clinic profile on Admin Profile (name, address, branding)
- Multi-location clinic support
- Receptionist sub-users (appointment management only)
- OPD tracking + incentive metrics
- "Hexa" AI assistant — voice + text driven admin actions

### Phase 4 — Trust / Security UI
- "Seal of Privacy" badge in patient-facing UI / WhatsApp
- HIPAA/ISO documentation review

## P2 / Future
- WhatsApp medication reminders (APScheduler cron based on prescriptions)
- Consultation Notes (replace prescriptions for non-doctor professions)
- UPI auto-reconciliation (PhonePe Business API)
- Razorpay activation (pending user keys)
- Azure Speech end-to-end activation (pending user keys)
- Exotel webhook integration for incoming calls
- `server.py` refactor into routers (`routes/voice.py`, `routes/whatsapp.py`, …)

## Key Endpoints (Phase 1 additions)
- `POST /api/prescriptions/transcribe` (multipart audio → text, Whisper)
- `POST /api/prescriptions/drug-interactions` (LLM-powered)
- `GET /api/prescriptions/private-notes/{client_phone}` (doctor-only)
- `POST /api/prescriptions/{prescription_id}/link-abha`
- `POST /api/prescriptions` — now accepts `private_doctor_notes`, `link_to_abha`, per-medication `is_tapering` + `taper_schedule[]`

## Data Model Additions
- `prescriptions.private_doctor_notes: str` (doctor-only, never sent to patient)
- `prescriptions.linked_to_abha: bool`, `prescriptions.abha_id: str`, `prescriptions.abha_linked_at`
- `prescriptions.medications[].is_tapering: bool`, `prescriptions.medications[].taper_schedule: [{dosage, frequency, duration, notes}]`

## Test Credentials
See `/app/memory/test_credentials.md`
