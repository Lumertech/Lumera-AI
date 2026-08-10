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

### Modular Refactor (2026-05-13) ✅
- **`/app/backend/shared.py`** — single source of truth: db, pwd_context, JWT, `get_current_user`, `resolve_owner_id`, `require_doctor_or_owner`, `send_whatsapp_message`, `get_llm_key`, `strip_json_fences`, `safe_regex`
- **`/app/backend/routes/`** — extracted modules:
  - `prescriptions.py` (AI suggestions, drug interactions, transcribe, private notes, ABHA linking, create/list)
  - `consultations.py` (CRUD, long-audio transcribe, SOAP generation)
  - `clinics.py` (clinic CRUD, sub-users, OPD analytics)
  - `hexa.py` (Hexa command — read intents + confirmation-gated write intents)
- **Improvements during refactor:**
  - Hexa: `re.escape()` patient-name regex (safe with O'Brien, special chars)
  - Hexa: WhatsApp send moved to `BackgroundTasks` for snappy response
  - Empty `email` field now coerces to None on clinic create/update
- **Top-level React `ErrorBoundary`** wrapping the entire app
- `server.py`: **4432 → 3572 lines** (-860 lines extracted into modular routers)
- **Tests: 65/65 backend pass** (Phase 1 + Phase 2/3 + 23 refactor regression tests)

### Phase 6 — Medication Reminders + Pagination (2026-05-13) ✅
- **WhatsApp Medication Reminders** auto-scheduled from prescription frequency + duration
  - Smart frequency parser: OD/BD/TDS/QID/"twice daily"/"every 8 hours"... → dose times
  - Smart duration parser: "7 days", "1 week", "2 weeks", "1 month", "SOS"
  - Default dose times: 1×=09:00 · 2×=09/21 · 3×=08/14/20 · 4×=08/12/16/20
  - APScheduler cron every 5 min — dedup via `sent_log`, auto-complete past `end_date`
  - Endpoints: GET / GET-by-prescription / PUT (pause|active|completed) / DELETE
  - UI: `MedicationRemindersPanel` embedded in `/reminders` page (grouped by patient)
- **Consultations pagination** — `GET /api/consultations?limit=&offset=` → `{items, total, limit, offset}` (clamped 1..200 / >=0)
- Tests: 14/14 medication reminder pytest pass after fixing expired-reminder auto-complete bug

### Bug fix — Hexa & STT outage (2026-05-13) ✅
- Medication-reminders cron was creating/closing a new asyncio loop, breaking the shared Motor MongoDB client → every Hexa & transcribe call started 500ing
- Fix: capture main loop in lifespan startup, dispatch via `asyncio.run_coroutine_threadsafe()` — no new/closed loops

### Phase 7 — Consultation Notes + Observability (2026-05-18) ✅
- **Consultation Notes** for non-doctor professions (therapists, spa, wellness)
  - `/api/consultation-notes` CRUD + by-appointment lookup
  - `ConsultationNotesWriter.js` page with mic-driven dictation on Summary/Recommendations/Private Notes
  - AppointmentDetails button auto-switches: doctors → "Write Prescription", others → "Write Consultation Notes"
  - WhatsApp delivery via BackgroundTasks
- **`shared.insert_doc()`** helper — prevents ObjectId leak regressions
- **`/api/health/scheduler`** observability endpoint with per-job stale thresholds; seeded at startup
- **Hexa outbox** (`db.hexa_outbox`) — every Hexa-triggered WhatsApp send tracked through queued→sent/skipped/failed lifecycle
- Tests: 14/14 pytest pass (15 total, 1 skipped pre-cron-tick); 100% frontend smoke; 2 cosmetic items also fixed (startup-seed + React hydration warning)

### Phase 8 — Patient Self-Service Portal (2026-05-18) ✅
- **Doctor side:** `IssuePortalLinkCard` embedded in AppointmentDetails / Health Records tab — generate link, set TTL (1-180 days, default 30), copy URL
- **Patient side:** public `/p/:token` page (no login) with sections for Active Medications · Upcoming Appointments · Prescriptions · Consultation Notes · Past Visits · Payment History
- **Privacy:** `private_doctor_notes` and `private_notes` scrubbed from public responses (verified by tests)
- **Revocation + expiry:** revoked tokens return 410; expired tokens return 410; bad/short tokens 404
- **Backend:** `/api/patient-portal/issue-link`, `/links`, `/revoke/{token}` (doctor-only) + 6 public endpoints under `/api/patient-portal/{token}/*` (no auth)
- **Branding:** Seal of Privacy badge present in portal header
- Tests: 18/18 patient_portal pytest pass + 61/61 combined regression — zero defects

### Phase 9 — Print Buttons + Invoicing Module (2026-07-02) ✅
- **Print / PDF buttons** on PrescriptionWriter, ConsultationNotesWriter, and each invoice
  - Pure client-side (`lib/print.js`) — opens print-friendly HTML in a new window and auto-fires `window.print()`
  - Clinic letterhead from primary clinic; tapering schedule renders inline in Rx
- **Invoicing module** modelled on Eka.Care / Practo / Healthplix
  - Auto-numbered `INV-YYYY-NNNN` per doctor per year (concurrency-safe via `db.counters.find_one_and_update` + `ReturnDocument.AFTER`)
  - Line items (description, consultation type, qty, rate), subtotal → discount → GST → total math
  - Payment status pending|partial|paid with normalization: `paid` auto-sets amount_paid=total
  - Reusable **Consultation Type** fee templates (name, fee, description)
  - Frontend: Invoices page with summary cards, filter pills, search, modal editor with live totals
  - Receptionist boundary: GET/POST allowed (scoped to parent), DELETE + consultation-type management blocked (403)
- Sidebar: new **Invoices** nav item
- Tests: 13/13 invoice pytest pass; PrescriptionWriter print regression fixed after test-agent flagged missing `primaryClinic` state declaration

### Phase 19 — Meta Signup UI + Ambient Session Log + Consent Chime + Webhook HMAC (2026-08-10) ✅

- **Meta WhatsApp Signup UI** (`/settings` → new `MetaWhatsAppSetup` card): Connect Facebook Business button (opens Meta Business Manager), inputs for App ID, WABA ID, Phone Number ID, App Secret (masked), System User Token (masked), Webhook Verify Token, and a copy-webhook-URL helper. Green "Connected" badge when phone_number_id + system-user token both present.
- **Ambient Session Log** — every `/api/ambient/extract` call now inserts a row into `db.ambient_sessions` with transcript + extracted fields + context + timestamp. New `GET /api/ambient/sessions?q=&limit=` endpoint returns doctor-scoped, reverse-chronological, case-insensitive keyword search across transcript / diagnosis / context. New `/ambient-history` page renders searchable card list with expand-to-view details.
- **Consent Chime** — Web Audio API two-tone chime: C5→G5 sine wave when Ambient AI starts recording, G5→C5 on stop. Zero external assets, plays inline via oscillator + exponential gain ramp for a soft ~0.4s cue.
- **Meta Webhook HMAC signature verification** — when any tenant has stored `app_secret`, inbound webhook POSTs must include a valid `X-Hub-Signature-256` (HMAC-SHA256 over raw body). Multi-tenant matching tries env secret first then all stored tenant secrets. Unsigned/invalid → 401. When no secret is configured anywhere (i.e. Meta not yet activated), the webhook stays open (dev-friendly).
- Testing agent Iteration 11: **17/17 backend tests pass**, incl. Meta config masking, missing-config send guard (400), webhook GET verify (200/403), Hinglish extraction, auto-session-save, sessions ordering + search, Whisper RBAC + 24MB size cap, plus queue/letterhead/feedback regressions.

### Phase 18 — Whisper Fallback + Multi-language + Waveform + Meta WhatsApp Scaffold (2026-08-10) ✅

**Whisper Fallback** (`POST /api/ambient/transcribe`)
- Multipart audio upload → OpenAI Whisper via Emergent LLM Key
- Automatic fallback: when browser SpeechRecognition captures nothing (unsupported/failed), the recorded audio blob is sent to Whisper
- Language hint (ISO 639-1) passed for higher-accuracy Hinglish
- Prompt tuned with Indian brand names

**Multi-language Toggle**
- Language dropdown with 11 Indian options: English-IN, Hindi, Tamil, Telugu, Bengali, Marathi, Kannada, Malayalam, Gujarati, Punjabi + English-US
- SpeechRecognition `lang` updates live; Whisper uses corresponding ISO code

**Live Waveform**
- AudioContext + AnalyserNode → animated 32-bar canvas visualization while recording
- Purple gradient bars react to voice amplitude
- Small "Recording… patient can see this indicator" caption sits next to the waveform for patient reassurance

**Meta WhatsApp scaffolding** (`routes/meta_whatsapp.py`) — ready to activate when creds arrive
- `PUT /api/meta-whatsapp/config` (owner-scoped) — stores App ID / Secret / WABA / phone_number_id / system-user token / verify token
- `GET /api/meta-whatsapp/config` — presence flags only (never leaks secrets)
- `POST /api/meta-whatsapp/send` — text or up to 3 quick-reply buttons via Graph v20 `interactive` payload
- `GET /api/meta-whatsapp/webhook` — hub.challenge verification (env token OR any user's stored token)
- `POST /api/meta-whatsapp/webhook` — persists inbound messages + button replies + status callbacks into `db.meta_whatsapp_messages`
- Verified: unconfigured send returns 400; webhook verify returns 200 for correct token, 403 for wrong

### Phase 17 — Ambient AI EMR (2026-08-10) ✅
- New backend `routes/ambient_ai.py` → `POST /api/ambient/extract` — sends a raw transcript to GPT-4o-mini via Emergent LLM Key and returns STRICT JSON with: `symptoms`, `provisional_diagnosis`, `vitals` (BP/pulse/spo2/temp/weight), `medications[]` (name + dose + freq + duration + instructions), `lab_tests[]`, `general_instructions`
- Prompt tuned for **Hinglish + Indian brand names** (Pan 40, Crocin, Amlodac, etc.) — converts "din me do baar khaana ke baad" → "1-0-1 after food"; verified end-to-end with a realistic gastritis transcript → correctly extracted BP 120/80, Pulse 72, "acute gastritis", Pan 40 + Digene, CBC + stool routine, follow-up in 5 days
- New `AmbientAIToggle` React component — browser `SpeechRecognition` for continuous live transcription (Indian English locale), pulsing mic indicator when active, **Pause/Resume**, live transcript preview with **Clear**, and a **Stop & Extract** button that calls the LLM and opens a Review modal
- **Review modal** shows all extracted fields editable; on Apply, the parent form is auto-populated (symptoms + vitals + medications + lab tests + general instructions merged intelligently — never overwrites empty existing values)
- Integrated into both **PrescriptionWriter** and **ConsultationNotesWriter** pages
- Auto-restart guard on `SpeechRecognition.onend` prevents Chrome's default 60s auto-stop, so the mic stays on until the doctor explicitly toggles it off

### Phase 16 — OPD Queue Engine + Letterhead + Rx Preset Sharing (2026-08-10) ✅

**Dynamic OPD Queue Engine:**
- New `routes/queue.py` — full state machine: `scheduled → checked_in → in_consultation → completed`, plus `no_show / cancelled` branches with valid-transition enforcement
- Token auto-assigned at check-in in format `A-01`, `A-02` per doctor per day
- Endpoints: `GET /api/queue/today` (with polyclinic-aware doctor scoping), `POST /api/queue/{id}/check-in`, `POST /api/queue/{id}/status`, `POST /api/queue/waiting-room/token`, `GET /api/queue/waiting-room/public/{token}` (no auth)
- Frontend `QueueBoard` component renders atop the Appointments page with live status pipeline buttons, refreshes every 20s
- **Waiting Room / Smart TV monitor** — public route `/waiting-room/:token` — dominant "Now Serving" card (huge token), Up-Next list, Waiting/Done counters. Patient names auto-masked to first-initial for privacy (e.g., "A. S."). Refreshes every 8s.

**Custom Print Letterhead:**
- New `routes/letterhead.py` — GET/PUT text fields + logo/signature image uploads (data URLs, ≤350 KB) + delete endpoints
- New `/letterhead` page (Practice Tools) with logo + signature upload cards, clinic/doctor detail form, MCI registration, footer note, and one-click print preview
- `renderPrescriptionHTML` extended to embed the letterhead: top logo + clinic block, doctor qualifications + MCI Reg. No., and signature block above the footer
- PrescriptionWriter auto-fetches letterhead on mount and passes it to every print job
- **Practice Tools tab restored** in sidebar (using Wrench icon) linking to the letterhead builder

**Rx Preset Sharing:**
- `GET /api/rx-presets` now returns own + polyclinic-shared presets, each tagged `is_mine`
- New `POST /api/rx-presets/{id}/share` toggles polyclinic sharing (only doctors with a `polyclinic_id` can share)
- UI shows a green "Shared" pill on shared presets and "by <name>" attribution on presets loaded from colleagues; share/delete buttons visible only on own presets

### Phase 15 — Feedback Widget + Nurse Vitals + Auto-Print (2026-08-10) ✅

**Feedback Widget on Dashboard:**
- New `GET /api/feedback/recent?limit=8` endpoint returns the latest responded ratings for the doctor/polyclinic scope
- `FeedbackWidget` component on the Dashboard shows avg rating + % positive, then a live list of recent stars with patient name, comment preview, and time-ago. 1-3★ rows highlighted in red with a "Needs follow-up" badge; auto-refreshes every 60 seconds

**Auto-Vitals from Nurse:**
- New endpoints `GET/PUT /api/appointments/{id}/vitals` — assistants, receptionists, front-desk, and doctors can record vitals directly on the appointment (uses `resolve_owner_id` so staff writes into their parent doctor's scope)
- New `/vitals/:appointmentId` page (`VitalsEntry.js`) — tablet-friendly form with 7 vital fields, save button, and last-saved-by/at metadata
- "Take Vitals" button added to the appointment details page next to "Write Prescription"
- Prescription writer auto-fetches saved vitals on mount and displays a green "Vitals pre-filled by <name> · <time>" badge above the vitals card

**Print Prescription with Vitals + Lab Orders:**
- `renderPrescriptionHTML` extended to render a Vitals table and a Lab / Imaging Orders table (with test name, code, sample, notes)
- After successful WhatsApp send, `submitPrescription` auto-triggers `handlePrint()` so patients walk out with a printed copy

### Phase 14 — Smart Prescription + Global Doctor Filter + Post-Consult Feedback (2026-08-10) ✅

**Smart Prescription (Phase C):**
- **Vitals header** — structured input for BP, Pulse, SpO2, Temp, Weight, Height, Respiratory Rate — persisted on `prescriptions.vitals` and included in WhatsApp Rx message
- **Indian Drug Database** — 100+ curated brand + generic combos (Crocin, Augmentin, Pan 40, Amlodac, Glycomet, Thyronorm, etc.) with default dose / frequency / duration. Endpoint: `GET /api/clinical/drugs/search?q=`
  - `DrugAutocomplete` component replaces plain medicine-name Input in `PrescriptionWriter`; picking a drug auto-fills dosage/frequency/duration
- **Rx Presets** — CRUD via `/api/rx-presets` scoped by `resolve_owner_id`. UI card shows saved presets, one-click "Load", inline delete
- **Lab / Imaging Orders** — 80+ curated tests (CBC, HbA1c, USG, MRI, CT, etc.) with `/api/clinical/lab-tests/search`; new `LabTestPicker` component adds test rows with per-test notes; included in WhatsApp Rx message

**Global Doctor Filter (Polyclinic Dashboard):**
- `GET /api/polyclinic/dashboard?doctor_id=<uuid>` now scopes all aggregates
- Frontend dropdown in the Polyclinic Dashboard header with "All doctors" + individual options; active doctor is highlighted in the performance table

**Post-Consult Feedback + Google Review routing:**
- New collection `feedback_triggers` — auto-created when a prescription is submitted (2h delay by default)
- New background scheduler job every 10 minutes dispatches due WhatsApp feedback prompts
- Endpoints: `POST /api/feedback/schedule`, `GET /api/feedback/triggers`, `GET /api/feedback/summary`, `GET/POST /api/feedback/{token}` + `/submit` (public patient-facing)
- Ratings 4-5 auto-reply with the doctor's configured Google Business review link; ratings 1-3 send a private "thanks, we'll follow up" note
- Google Review URL setting card added to `/settings` (top of the page, above Razorpay) with rating summary display (avg + 5-1★ distribution + positive %)

### Phase 13 — Sidebar Refactor + Logout UX (2026-08-10) ✅
- Left sidebar reordered into clinical workflow: **Daily Ops → Clinical Care → Finance → Automation → Organization → Settings**
  1. Dashboard  2. Appointments & OPD  3. Patients  4. Consultations & EMR
  5. Invoices & Billing  6. Payments  7. AI Voice & WhatsApp  8. WhatsApp Bot
  9. Reminders & Retention  10. Clinics & Staff  11. Profile  12. Settings  13. Subscription
- Removed broken "Tools" nav item (never had a route — was 404-ing)
- Added "Back to home" pill link on Login, Admin Login, Register and Polyclinic Register pages — visible in top-left after logout so users can always get back to the landing page

### Phase 12 — Voice Library Gallery + Polyclinic Umbrella (2026-08-10) ✅
**Voice Library Gallery**
- Curated 18 premade ElevenLabs voices (9 female + 9 male, spanning American/British/Australian/Southern accents) with public 5-second preview MP3 URLs
- New public endpoint `GET /api/elevenlabs/library` — no auth required
- New component `VoiceLibraryGallery.js` — 3-column card grid, gender filter, play/pause per voice, visual "selected" ring, integrated into the AI Voice tab

**Polyclinic Umbrella tier**
- New role `polyclinic_admin` with dedicated auth flow (`/polyclinic/register` public signup)
- New `polyclinics` collection: `{id, name, address, phone, email, admin_user_id, created_at}`
- Doctors get an optional `polyclinic_id` field linking them to a polyclinic
- Routes under `/api/polyclinic/`:
  - `POST /register` (public), `GET/PUT /me`, `GET /dashboard` (aggregate stats: doctor count, appts this-month/all-time, revenue this-month/all-time, per-doctor breakdown)
  - `POST /doctors/invite` (email-based link to existing Lumera doctor), `GET /doctors`, `DELETE /doctors/{id}`
- Design decision: **owner sees aggregate only — no PHI/prescriptions**. Individual doctors retain full ownership of their patient data (existing RBAC unchanged)
- Frontend: `PolyclinicLayout` (indigo sidebar), `PolyclinicDashboard`, `PolyclinicDoctors`, `PolyclinicSettings`, `PolyclinicRegister`
- `ProtectedRoute` + `PublicRoute` now recognize the new role and auto-redirect polyclinic admins to `/polyclinic/dashboard`
- Login page links to polyclinic sign-up

### Phase 11 — ElevenLabs Voice Bot Integration (2026-08-10) ✅- **Provider-agnostic TTS pipeline** — `elevenlabs_service.py` wraps ElevenLabs SDK; `voice_bot.VoiceCallManager` now prefers ElevenLabs when the user's `elevenlabs_config.enabled=true`, falls back to Azure Speech
- **Multilingual (eleven_multilingual_v2)** — 12 languages exposed (English + 10 Indian regional + Arabic), auto-detected from text
- **New backend routes** under `/api/elevenlabs/`:
  - `GET /status`, `GET /languages`, `GET /voices` (account voices with default library fallback)
  - `POST /tts` and `POST /preview` (thread-offloaded synthesis, base64 MP3)
  - `GET /config`, `PUT /config` — per-user voice preferences
  - Every synthesis logged to `db.elevenlabs_usage` (best-effort)
- **Frontend:** new "AI Voice" tab in Voice Bot page (`ElevenLabsVoicePanel.js`) — enable switch, language + voice selectors, stability/similarity sliders, live preview player
- **Curated defaults** — 9 built-in ElevenLabs premade voices exposed automatically when the API key lacks `voices_read` scope
- **Friendly error surfacing** — "Unusual activity" (VPN/proxy on free tier), missing scopes, and unknown voice IDs all surface a clear user-facing message
- Env: `ELEVENLABS_API_KEY` in `backend/.env`; SDK `elevenlabs==2.62.0`

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
- **Call screener (Android app)** — user has decided to skip Exotel telephony wiring in the web app; call-screening voice bot will be built alongside the Android app (uses the existing ElevenLabs + unified bot logic pipeline)
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
