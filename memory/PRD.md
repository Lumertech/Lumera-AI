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

## Phase 20 — POC Priority UX & Clinical Interactions (2026-02-11) ✅

### 1. Real-Time Patient WhatsApp Inbox
- New `GET /api/meta-whatsapp/conversations` — aggregates all message threads grouped by patient phone, with unread count, last message snippet, direction, and patient name lookup from appointments (tail-match last 10 digits).
- New `GET /api/meta-whatsapp/conversations/{phone}` — returns full chronological message thread + marks inbound messages as read.
- New `GET /api/meta-whatsapp/delivery-status/{phone}` — returns latest WA delivery status (none/sent/delivered/read/failed) for OPD queue ticks.
- New **`WhatsAppInbox.js`** page at `/whatsapp/inbox`:
  - Left panel: conversation threads sorted by latest, unread badge, patient name + phone, last message snippet + timestamp.
  - Right panel: WhatsApp-style chat bubbles (inbound left, outbound right) with timestamps.
  - Live reply bar: front-desk can type and send manual direct replies via the Meta Cloud API.
  - 10s thread poll + 6s active conversation poll for near-real-time updates.
  - Empty state with setup guidance when Meta not yet configured.
- Sidebar nav updated with **"WhatsApp Inbox"** item (available to doctor + front_desk roles).
- Demo seed: 3 conversation threads seeded for sarah@test.com with Rahul Sharma, Priya Patel, Arun Kumar.

### 2. Enhanced Ambient AI Recording Strip
- Updated `AmbientAIToggle.js` recording strip label to show **"Listening in {Language name}…"** (e.g. "Listening in English (India)…", "Listening in हिन्दी (Hindi)…") instead of the generic "patient can see this indicator".

### 3. WhatsApp Notification Status Ticks in OPD Queue
- Updated `QueueBoard.js` with new `WaTick` component (Check/CheckCheck/AlertCircle icons) for sent/delivered/read/failed states.
- Queue loads delivery status for all unique patient phones via `/api/meta-whatsapp/delivery-status/{phone}` in parallel.
- Tick icons render inline next to each patient's phone number in the queue row.

### Already Verified from Phase A (confirmed working):
- Import Last Rx (1-click Repeat Past Rx)
- Quick Vitals bar + BMI + Follow-up chips (+3D/+1W/+2W/+1M)
- Counter Cash Calculator in CollectPaymentDialog
- Auto Digital WhatsApp Receipt on Mark Paid
- Verify UPI + Verify Gateway Connection buttons in PaymentGatewaySettingsCard

**Testing: 12/12 backend pass, 90% frontend pass (minor: patient name lookup depends on matching appointment).**

## Phase 21 — WhatsApp Intake Parser + Drag-and-Drop Records Upload (2026-02-11) ✅

### WhatsApp Intake Parser
- New `_maybe_parse_intake(owner_id, phone, text)` background coroutine in `meta_whatsapp.py`
  - Triggered via `asyncio.create_task()` on every inbound text message in the Meta webhook
  - Finds the most recent appointment where `client_phone` tail-matches the sender AND `pre_intake_status='sent'`
  - Calls GPT-4o-mini (via Emergent LLM Key) to extract `{symptoms, duration, medications_allergies}` from free-form patient message
  - Graceful fallback: if no LLM key, stores raw message text as symptoms
  - Updates `pre_intake` and sets `pre_intake_status='auto_captured'`
  - Non-blocking — webhook still returns 200 immediately
- New `GET /api/appointments/{id}/pre-intake` endpoint (fixed `is None` check to avoid false 404 for appointments missing `pre_intake` field)
- `AppointmentDetails.js` header now shows:
  - **Emerald banner** `data-testid="pre-intake-banner"` for `auto_captured` status — shows parsed symptoms, duration, medications
  - **Amber banner** `data-testid="pre-intake-pending"` for `sent` status — "waiting for patient reply…"

### Drag-and-Drop Records Upload
- `HealthRecordsTab.js` fully rewritten with:
  - **DnD zone** (`data-testid="dnd-upload-zone"`): drag files or click to browse; supports JPG/PNG/WEBP/PDF up to 5 MB
  - **File queue**: shows thumbnails (images) or PDF icon, per-file record type selector and notes, progress bar
  - **Batch upload** button uploads all queued files; done items auto-clear after 2 s
  - **Visit-scoped section**: records uploaded with `appointmentId` appear under "This Visit" first
  - **Image previewer**: tap thumbnail to open fullscreen inline viewer
  - `AppointmentDetails.js` now passes `appointmentId={id}` to `HealthRecordsTab`
- `HealthRecordUpload` model in `server.py` now accepts `appointment_id: Optional[str]`

**Testing: 10/10 backend · 100% frontend (iteration_19)**

## Phase 22 — Intake Auto-Fill, Day-End Modal, Wait Time Estimator (2026-02-11) ✅

### Intake Auto-Fill in Prescription Writer
- `fetchAppointment` in `PrescriptionWriter.js` now checks `pre_intake_status === 'auto_captured'` before setting symptoms
- Priority: existing `notes` field > WhatsApp AI-parsed pre_intake > empty
- Populates chief complaint with: symptoms + "Duration: X" + "Medications/Allergies: Y" (newline-joined)
- New `intakePrefilled` state controls a dismissible emerald chip: _"Chief complaint pre-filled from WhatsApp intake · AI-parsed · Edit freely"_ (`data-testid="intake-prefill-banner"`)

### Day-End Closing Modal
- New `GET /api/queue/day-end-summary` endpoint in `queue.py`:
  - Counts completed, no_shows, total scheduled
  - Sums `revenue_collected` and `outstanding_dues` from today's invoices
  - Returns `all_done: bool` (all appointments in terminal state) and `avg_consult_minutes`
- `act()` in `QueueBoard.js` calls the summary after every `completed` transition
- If `all_done && patients_seen > 0`: shows `DayEndModal` with party popper, patients seen, revenue, no-shows, avg consult time (`data-testid="day-end-modal"`)

### Wait Time Estimator
- New `_avg_consult_minutes(owner_id)` helper in `queue.py` — computes mean from last 20 completed appointments with `consultation_started_at` and `completed_at` (falls back to 10 min)
- `today_queue` response now includes:
  - `avg_consult_minutes` at the root
  - `estimated_wait_minutes` on each `checked_in` appointment row (accounts for current in-consultation patient's elapsed time)
- QueueBoard shows a blue pill badge _"~N min wait"_ on `checked_in` rows (`data-testid="wait-time-{id}"`)

### Bonus bug fix (found by testing agent)
- `formatTime()` in `utils.js` had no null guard — calling `.split(':')` on `undefined` crashed Appointments page when `end_time` was null. Fixed with early `if (!timeString) return ''`.

**Testing: 9/9 backend · 100% frontend (iteration_20)**

## Phase 23 — Code Review Fixes (2026-02-11) ✅

### Critical Security Fixes
- **`print.js`**: Replaced `document.write` (XSS surface) with Blob URL pattern — `new Blob([html], { type: 'text/html' })` + `URL.createObjectURL` opens the print window without any DOM-write API; blob URL is revoked on window unload.
- **`seed_reviewer.py`**: Hardcoded `REVIEWER_PASSWORD = "MetaReview@2026"` now reads `os.environ.get("META_REVIEWER_PASSWORD", "MetaReview@2026")`.
- **All test files** (`test_refactor_regression.py`, `test_prescription_phase1.py`, `test_phase23.py`, `test_medication_reminders.py`, `test_payment_settings.py`): Test credentials replaced with `os.environ.get("TEST_DOCTOR_EMAIL", ...)`, `os.environ.get("TEST_DOCTOR_PASSWORD", ...)` pattern. Mock sentinel values renamed (`secret` → `mock_secret`, `mock_salt`, `sub_password`, `recep_password`) with inline comments clarifying they are not real credentials.
- **`PaymentGatewaySettingsCard.js`**: Added inline comments to `FIELD_LABEL` dict clarifying `secret_key`/`api_key` are UI display labels, not hardcoded credentials (false-positive suppression).

### Correctness Bug Fixes
- **`PrescriptionWriter.js` — Stable React keys**: `emptyMed()` now generates a `_key` via `crypto.randomUUID()`. All `medications.map()` use `key={med._key}` instead of `key={index}`. Medications loaded from server/prescriptions get `_key` via `{ ...emptyMed(), ...m }`. AI suggestions use `key={\`${suggestion.medicine_name}-${index}\`}`, interaction alerts use drugs-joined key, taper steps use `key={\`${med._key}-taper-${sIdx}\`}`.
- **Empty catch blocks → `console.warn`**: Non-fatal catches in `PrescriptionWriter.js` (vitals, letterhead, outstanding balance), `Dashboard.js` (OPD analytics) now log warnings instead of silently swallowing errors. Real errors remain surfaced via `toast.error` in the outer catch.
- **`is` vs `==` for strings**: Verified no instances of this anti-pattern in test files — the 92 flagged cases were all valid `is None`/`is True`/`is False` idioms (correctly kept as-is).

### Deferred (with rationale)
- **localStorage → httpOnly cookies**: Requires backend session endpoint changes; deferred as architectural task.
- **Large component splits** (PrescriptionWriter, AmbientAIToggle, etc.): Maintenance improvement, not bugs; deferred to avoid regressions.
- **Missing useEffect deps (74 instances)**: `API_URL` and `axios` are module-level constants (never change); the truly stale-closure-risky ones (`loadThreads`, `loadConversation`) already use `useCallback` with correct dep arrays.

## Phase 24 — Full Landing Page CMS + Domain/Email Cleanup (2026-02-25) ✅

### Landing Page CMS
- **Complete CMS overhaul**: `AdminContentEditor.js` rebuilt as a tabbed CMS editor with 6 tabs covering the entire landing page
  - **Hero & Stats**: badge text, headline, subtitle, CTA button labels, 4 stats (value + label each), languages strip
  - **Pain Points**: section title/subtitle, 3 problem cards with 3 issues each
  - **Features**: section label/title/subtitle, 6 feature cards (title + description)
  - **Professions**: section title/subtitle, 6 profession cards (name + description)
  - **Testimonials**: section title, 3 testimonials (quote, name, role)
  - **CTA & Footer**: CTA headline/subtext/button labels, contact email, company name
- **Backend `LandingPageContent` Pydantic model** expanded from 10 fields → 77+ fields, all `Optional[str]` with defaults
- **GET `/api/admin/content`** now merges stored DB values over model defaults — backward compatible with old stored records
- **`Landing.js`** fully rewritten to consume all CMS fields; hardcoded text removed; `DEFAULT_CONTENT` fallback when API is unavailable
- Sticky "Save All" bar + Reset to Defaults + Preview button in the editor
- Domain Policy notice in CTA & Footer tab warns admins to use lumer.me only

### Email / Domain Cleanup
- `Landing.js` footer: `support@lumera.ai` → `ravee@lumer.me` ✅
- `AdminLogin.js` placeholder: `admin@lumer.com` → `admin@lumer.me` ✅
- `create_admin.py`: updated to `admin@lumer.me` with auto-migration of existing DB record ✅
- `backend/tests/test_refactor_regression.py`: default fallback `admin@lumer.com` → `admin@lumer.me` ✅
- MongoDB admin account migrated from `admin@lumer.com` → `admin@lumer.me` (live) ✅
- `test_credentials.md` updated ✅
- No `lumera.ai` or `lumer.com` references remain in any public-facing page or API

**Testing: 8/8 backend pytest pass + 100% frontend (iteration_21)**

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


## Phase 19 — UX Phase C: Patient WhatsApp Loops (2026-02-10) ✅
Shipped 3 patient-facing WhatsApp features:

**1. Pre-Consultation Intake (3-question form on booking)**
- `POST /api/appointments` now sends a WhatsApp message on creation asking the patient to reply with (1) main symptoms, (2) duration, (3) medications/allergies. Appointment row gets `pre_intake_dispatched_at` + `pre_intake_status='sent'`.
- New `PUT /api/appointments/{id}/pre-intake` for front desk to capture the patient's verbal or WA-relayed reply. Coerces non-string values (fixed 500 → 200 for numeric fields, iteration_17).

**2. Google Review Loop (2-hour post-consult)**
- New settings module: `GET/PUT /api/settings/reviews` — save `google_review_url`, toggle `enabled`, tune `delay_hours` (0–168). URL must start with http:// or https://.
- Existing 2-hour post-consult feedback dispatcher (`_send_feedback_message`) now appends `⭐ Loved the visit? Please leave a Google Review: <url>` when configured; feedback_triggers gets `review_link_included:true` flag.
- New `<ReviewLoopSettingsCard />` mounted in Settings with URL input, enabled toggle, delay input, and helper link to `business.google.com/reviews`.

**3. Desktop UPI QR Fallback**
- `POST /api/payments/upi/intent` now persists each intent to `pay_intents` collection (24h TTL) and returns `payment_page_url` (e.g. `https://…/pay/{intent_id}`).
- New PUBLIC endpoint (no auth) `GET /api/payments/upi/intent/{id}` — powers the payment page for desktop patients who can't tap `upi://` directly.
- New frontend page `/pay/:intentId` (`PayLink.js`) — mobile-friendly landing with big amount, doctor VPA, scannable QR, "Pay in UPI app" button, Copy UPI link, and post-payment guidance.
- `CollectPaymentDialog` WA text now leads with the desktop-friendly `payment_page_url` and appends the raw `upi://` intent as a secondary line — works on any device.
- Backend `.env` now has `PUBLIC_APP_URL` (points to production frontend) so QR links are absolute.

**Testing agent iteration 17**: 17/18 pass → 1 fix (numeric-field 500) → verified green.



## Phase 18 — UX Phase A: Clinical Speedups + Payment Polish (2026-02-10) ✅
Shipped 6 high-impact features from the 30+ UX list:

**Clinical Workflow Speedups**
- **Import Last Rx** button on the Prescription canvas — 1-click auto-populate the patient's previous medications for chronic follow-ups. Backend: `GET /api/prescriptions/last-for/{phone}`.
- **Outstanding Balance chip** on Prescription header — red pulsing badge showing `Outstanding Balance: ₹X · N unpaid` computed live from all pending/partial invoices for the phone. Backend: `GET /api/prescriptions/outstanding-balance/{phone}`.
- **Vitals bar + BMI + Follow-up chips** in the Rx footer — BP/Pulse/SpO₂/Temp/Wt/Ht badges + auto-calculated BMI with category colour (Underweight/Normal/Overweight/Obese) + `+3D / +1W / +2W / +1M` chips plus a manual date picker; follow-up saves with the Rx.

**Payment Polish**
- **Cash Change Calculator** in CollectPaymentDialog — "Amount tendered" input with live change/short display (green if change to return, red if short).
- **Auto Digital Receipt** on Mark Paid — Invoices.markStatus now fires `POST /api/invoices/{id}/send-receipt` when flipping to paid; toast surfaces whether the WA send succeeded.
- **Verify UPI + Verify Gateway** buttons in Settings — `POST /api/settings/payment/verify-upi` runs RBI-format regex + known-handle allowlist + QR builder round-trip; `POST /api/settings/payment/verify-gateway` pings Razorpay `/v1/orders?count=1` with the stored key (format-only for other providers).

**Backend hardening**
- `send-receipt` and `mark-cash-paid` now treat `send_whatsapp_message` returning None (unconfigured Twilio) as `receipt_sent:false` instead of silently reporting success (found by testing agent iteration 16).
- Testing agent iteration 16: 15/16 → 1 fix → verified green.



## Phase 17 — Self-Serve Payment Methods (2026-02-10) ✅
- **New backend module** `routes/settings.py` — 3 collection methods per practice:
  - **A. UPI VPA** (0% fees, default): stores `upi_id` + `display_name`; `POST /api/payments/upi/intent` builds NPCI-compliant `upi://pay?pa=…&am=…&cu=INR&tr=INV…` deep-link + returns a PNG QR (`data:image/png;base64,…`).
  - **B. Direct API creds** for 7 providers: Razorpay / PhonePe Business / Paytm / Cashfree / PayU / Stripe / Airpay-SabPaisa. Secret fields encrypted with Fernet; only masked previews (`••••••••••••9876`) leave the API. `GET /providers` exposes the field-schema for each.
  - **C. Counter Cash**: `POST /api/invoices/{id}/mark-cash-paid` records `payment_method=cash`, `amount_paid`, `paid_by`, `paid_at`; optional `send_whatsapp_receipt` fires a friendly receipt to the patient's number.
- **New Frontend UI** `components/PaymentGatewaySettingsCard.js` mounted in `Settings.js`: 3-tile radio picker, UPI form with **live QR preview** button, provider dropdown for gateway with dynamic fields, "Get keys" deep-link out to each provider's dashboard, disconnect gateway.
- **New Frontend UI** `components/CollectPaymentDialog.js` mounted in `Invoices.js` (new **Collect** button on unpaid rows): renders the right panel based on active method — QR + "Send on WhatsApp" for UPI, "Create payment link" for gateway, cash amount + "Mark Paid (Cash)" + optional WhatsApp receipt for cash.
- **Critical infra fix**: `load_dotenv()` was running AFTER `from security import ...` — meaning `EncryptionManager` generated a random Fernet key on every restart, silently losing encrypted secrets. Moved `load_dotenv()` to line 4 of `server.py` before any module imports read env; added stable `ENCRYPTION_KEY` to `backend/.env`. Verified: secret survives backend restart.
- **Additional fix**: `mark-cash-paid` now rejects overpayment with 400 (previously accepted it, creating inconsistent financial records).
- Testing agent iteration 15: 27/29 passed; both criticals then fixed and verified.



## Phase 16 — Expanded Drug & Lab Dictionaries with Fuzzy Search (2026-02-10) ✅
- **New builder** `backend/build_clinical_data.py`: expands ~180 curated Indian brand+generic seeds across common Indian dose forms (Tablet / DS / SR / Kid / Syrup / Suspension / Injection) → writes `data/indian_drugs.json`.
- **Drug catalogue grew 104 → 2,370** (23× larger). 59 categories: Analgesic, NSAID, Antibiotic, PPI, H2 Blocker, Antihistamine, Cough, Antidiabetic, Insulin, Statin, Beta Blocker, ACE Inhibitor, ARB, CCB, Diuretic, Anxiolytic, SSRI/SNRI, Bronchodilator, Steroid Inhaler, Corticosteroid, Antiemetic, Laxative, Supplement, Thyroid, Antifungal, Antiviral, Antimalarial, Antihelminthic, Muscle Relaxant, Ophthalmic, Topical, Anticonvulsant, OCP, Progestogen, Anticoagulant, Immunosuppressant, Alpha Blocker, PDE5 Inhibitor and more.
- **Lab catalogue grew 81 → 271** with LOINC codes. 19 categories: Hematology, Coagulation, Biochemistry, Lipid, Endocrine, Urine, Serology, Microbiology, Cytology, Histopathology, Immunohematology, Andrology, Genetics, Tumor Markers, Radiology (X-ray / USG / CT / MRI / DEXA / PET-CT / Nuclear / Mammography), Cardiology (ECG / 2D Echo / TMT / Holter), Neurology (EEG / EMG / NCV), Pulmonology (PFT / Spirometry).
- **Fuzzy search upgrade** in `routes/clinical_data.py`: 3-tier ranking using stdlib `difflib.SequenceMatcher`:
  - Rank 0: direct substring hit (`panto` → Pantop*)
  - Rank 1: per-token prefix hit (`cbc` → CBC panel)
  - Rank 2: fuzzy ratio ≥ 0.55 (handles typos like `diabtes`)
  Haystacks pre-computed at import — search stays sub-millisecond even on 2,370 rows.
- **Endpoints unchanged** — frontend `DrugAutocomplete` / `LabTestPicker` in `components/PrescriptionExtras.js` continue to work without any changes.
- Live-verified in the UI: `panto` in Medication field shows 6+ Pantoprazole variants; `cbc` in Lab search returns Complete Blood Count.



## Phase 15 — WhatsApp Templates Seeder (2026-02-10) ✅
- **Single source of truth** `backend/whatsapp_templates.py` — 4 utility templates (`appointment_confirmation_v1`, `appointment_reminder_v1`, `prescription_ready_v1`, `payment_link_v1`) with body text, variable examples, footer "Lumera Solutions LLP", DOCUMENT header on prescription, URL button on payment link.
- **CLI publisher** `backend/seed_whatsapp_templates.py`: one-shot Graph API publisher. Resolves creds from CLI args → env vars → Mongo `meta_whatsapp_configs`. Supports `--dry-run`. Idempotent (Meta error codes 2388023/100 treated as `already_exists`).
- **New backend endpoints** in `routes/meta_whatsapp.py`:
  - `POST /api/meta-whatsapp/templates/publish` — one-click publish for the connected doctor's WABA, returns per-template status + summary counts.
  - `GET /api/meta-whatsapp/templates` — live list from Meta of templates on the WABA.
- **UI**: added "Publish 4 utility templates" button + result panel to `Settings → Meta WhatsApp Business` card. Button is disabled until WABA config is saved. Shows submitted/already_exists/failed counts inline.
- Verified: unconfigured → 400, fake WABA+token → 4 per-template `failed http=401 "Invalid OAuth access token data"`.



## Phase 14 — Reviewer Seed + Router Split (2026-02-10) ✅
- **Reviewer seed script** `backend/seed_reviewer.py`: idempotent seeder that upserts `reviewer@lumer.me / MetaReview@2026` as a doctor with 3 demo patients (`+919000000001..03`) and 1 appointment `appt-reviewer-demo-2026` named "Reviewer Demo" scheduled tomorrow @ 10:00. Safe to re-run any time to reset password.
- `test_credentials.md` updated with reviewer credentials.
- **Router split** — `server.py` went from **3730 → 3309 lines** (–421):
  - `routes/auth.py` (228 lines): 8 endpoints — register, login, /me, send-otp, verify-otp, complete-registration, google/login, google/callback.
  - `routes/appointments.py` (263 lines): 10 endpoints — appointments CRUD + clients list/detail + patient-details + vitals GET/PUT (moved inline VitalsPayload model too).
- Late-import pattern (`from routes import auth as _auth_router_mod; app.include_router(...)` at the bottom of `server.py`) avoids circular imports.
- **Security fixes shipped alongside the refactor** (found by testing agent iteration 13, fixed and verified in iteration 14):
  - `/auth/me` and `/verify-otp` no longer leak `hashed_password`.
  - Login IP rate limit uses `JSONResponse(429)` (SlowAPI-handler-safe) and reads `X-Forwarded-For` for real client IP.
  - 5th failed login on same email returns `429 Account temporarily locked` (was `401`).
  - `PUT /appointments/{id}` strips immutable fields `{id, professional_id, created_at, created_by}` (mass-assignment fix).
  - Reviewer seed uses correct `appointment_date` field + `consultation_mode` + `payment_status`.
- Testing agent iteration_14: **43/43 backend tests passed**.



## Phase 13 — Legal Rebrand + Meta Submission Packet (2026-02-10) ✅
- Legal entity name globally updated to **Lumera Solutions LLP** across Policies (Privacy, Terms, WhatsApp Disclaimer, Limitation of Liability), Register page terms consent, RequestPaymentModal consent, and Landing footer. Contact email set to **ravee@lumer.me**. Logo unchanged.
- Privacy Policy expanded with Meta-required language (WhatsApp Business Platform naming, 90-day retention, `/data-deletion` pointer).
- Terms of Service now links to Meta's WhatsApp Business Messaging Policy + Business Terms and declares Lumera as a Service Provider (not a reseller).
- **New `/data-deletion` page + `POST /api/data-deletion/request` endpoint** returning a ticket id (`DEL-*`), stored in `data_deletion_requests` collection with 30-day SLA copy per Meta policy.
- **New `/privacy` and `/terms` shortcut routes** (redirect to Policies with anchor) — these are the URLs to paste into Meta App Dashboard.
- Meta submission packet drafted at `/app/memory/META_TECH_PARTNER_PREP.md` (permissions, verbatim paste-blocks, reviewer credentials, 6-minute video script scene-by-scene, template copy, screenshot bundle list, reject-recovery table).



## Phase 12 — Clinical Timeline, Allergy Alerts & Voice-to-Vitals (2026-02-10) ✅
- **Backend regex crash fix** in `/api/safety/timeline/{client_phone}` — phone numbers with `+` now `re.escape`-ed (was crashing with MongoDB `Regular expression is invalid`).
- **Patient Consult History Timeline**: new reusable `<PatientTimeline />` component. Wired into Patients list ("View Consult History" per client card) and PrescriptionWriter header ("Consult History" button). Aggregates appointments + prescriptions + invoices + ambient AI sessions, newest first.
- **Real-Time Clinical Allergy Alerts** already wired in `PrescriptionWriter.js` — now also surfaces an amber "safety-check unavailable" banner (`data-testid=safety-check-unavailable-banner`) if `/api/safety/drug-check` errors, preventing fail-open behavior.
- **Voice-to-Vitals for Nurses** in `VitalsEntry.js`: mic button using Web SpeechRecognition + regex parser auto-fills BP/pulse/SpO₂/temp/weight/height/RR. Missing imports fixed.
- **Route alias**: added `/appointments/:appointmentId/vitals` alongside `/vitals/:appointmentId`.
- Backend testing agent: 9/9 pass on safety endpoints incl. `+` regression, 4-source aggregation, and Penicillin conflict.

## Phase 24 — Full Landing Page CMS + Domain/Email Cleanup (2026-08-25) ✅
- `AdminContentEditor.js` rebuilt as 6-tab CMS (Hero/Stats/Languages, Pain Points, Features, Professions, Testimonials, CTA & Footer). `Landing.js` fully CMS-driven. Backend `LandingPageContent` model expanded to 77+ Optional fields.
- Email cleanup: `support@lumera.ai` → `ravee@lumer.me`, `admin@lumer.com` → `admin@lumer.me` across all files + MongoDB migration. Admin panel WhatsApp Config added to sidebar.
- Testing: 8/8 backend + 100% frontend (iteration_21)

## Phase 25 — Multi-Tenant WhatsApp Onboarding + Template Management (2026-08-25) ✅
- New `routes/whatsapp_onboarding.py`: `/platform-config` (public), `/embedded-signup`, `/status`, `/disconnect`, `/templates` (CRUD with Meta sync). Access tokens encrypted with Fernet at rest.
- Multi-tenant webhook routing updated: checks `users.whatsapp.phone_number_id` first, then legacy `meta_whatsapp_configs`.
- Admin config extended with `config_id` field + secret encryption. `WhatsAppConnectCard` in doctor Settings. `/whatsapp-templates` page with variable insertion UI.
- Testing: 10/10 backend + 100% frontend (iteration_22)

## Phase 26 — WA Outbox, Sidebar Status, Post-Signup Test (2026-08-25) ✅
- `POST /api/whatsapp/send-test` — sends plain-text greeting to verify two-way delivery; `_get_effective_wa` fallback chain (users.whatsapp → meta_whatsapp_configs → env)
- `POST /api/whatsapp/send-template` — sends approved template with `{{N}}` param substitution; logs to `meta_whatsapp_messages`
- `WhatsAppConnectCard` — "Send Test AI Message" section shown post-connection with phone input + send button
- `DashboardLayout` — WA status dot badge in sidebar footer (🟢 Active / 🔴 Disconnected) + "WA Templates" nav link to `/whatsapp-templates`
- `WaSendTemplateButton` — per-patient popover in QueueBoard; lazy-loads APPROVED templates; auto-fills `{{1}}`=name, `{{2}}`=date, `{{3}}`=time, `{{4}}`=doctor
- Testing: 9/9 backend + 100% frontend (iteration_23)


## Test Credentials
See `/app/memory/test_credentials.md`
