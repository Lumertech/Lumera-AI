# Meta Tech Provider / WhatsApp Business Solution Provider — Submission Prep for Lumera

**Purpose:** Everything you need to submit Lumera's Meta app for App Review + Tech Provider verification and pass on the first attempt.

**Product framing (put this in the submission form):**
> Lumera is an AI-powered clinical practice management platform for Indian doctors. On behalf of doctor tenants who own their own WhatsApp Business phone numbers, Lumera sends appointment confirmations, prescription PDFs, payment links, and post-consult feedback requests, and receives patient replies (booking requests, WhatsApp-bot conversations, feedback). Each doctor connects their own WABA via Embedded Signup; Lumera does not resell WhatsApp messaging.

---

## 1. Exact Permissions to Request

Request these **and only these** in Meta App Dashboard → App Review → Permissions and Features. Requesting extra scopes is the #1 reason submissions get delayed.

### A. WhatsApp Business Platform (Cloud API path — recommended)

| Permission | Why Lumera needs it | Review evidence you must show |
|---|---|---|
| `whatsapp_business_messaging` | Send & receive messages on behalf of each connected doctor's WABA phone number (confirmations, reminders, Rx PDFs, feedback, bot replies). | Screencast: doctor logs in → sends a session message → replies to an inbound message. |
| `whatsapp_business_management` | Register phone numbers, create/manage message templates, read WABA metadata, subscribe webhooks per WABA. | Screencast: Templates page listing an already-approved `appointment_confirmation_v1` template + phone-number registration success toast. |

### B. Embedded Signup (for onboarding doctors without leaving Lumera)

| Permission | Why | Evidence |
|---|---|---|
| `business_management` | Required by Meta's Embedded Signup flow so the doctor can create/link a WABA under their own Meta Business Manager. | Screencast: doctor clicks "Connect WhatsApp" → Meta Embedded Signup popup → returns with `waba_id` + `phone_number_id` prefilled. |

### C. Advanced Access (must be toggled)

For every permission above, on the App Review page, request **Advanced Access**, not Standard. Standard Access will only let the app owner (you) test; doctors won't be able to use it.

### D. What NOT to request
- ❌ `pages_*` — not needed, will trigger extra review.
- ❌ `instagram_*` — not needed.
- ❌ `catalog_management` — Lumera doesn't sell products via WhatsApp Commerce (skip unless you plan a shop).
- ❌ `ads_management` — not needed.

---

## 2. Business Verification Prerequisites

Meta will not grant Advanced Access until Business Verification is complete.

1. Meta Business Manager account created for **Lumera** (the company, not a doctor).
2. Legal business name, address, phone, website (must match filings).
3. Upload one of: Certificate of Incorporation / GST registration / Utility bill in company name.
4. Domain verification: add the DNS TXT / meta-tag on `lumera.<your-domain>`.
5. Two-factor auth ON for every admin of the Business Manager.
6. Assign the Lumera Meta app to the Business Manager (App Dashboard → Settings → Basic → Business Account).

---

## 3. Tech Provider Application (only if you resell messaging capacity)

Skip this **unless** you plan to bill patients or doctors for the WhatsApp messages themselves. Since Lumera's current model has each doctor pay Meta directly via their own WABA, you can submit as a **regular app** with the permissions above and mark Lumera as a "Service Provider" in the WABA sharing settings — no Tech Provider application required initially.

If you later do resell messaging:
- Apply at: Business Manager → Business Settings → Requests → Solution Partner.
- Prerequisites: 10 active client WABAs, PSTN business number, dedicated support email, publicly listed pricing page, and a signed Meta Solution Partner Agreement.

---

## 4. App Review Submission Checklist

Complete every row before hitting "Submit for Review":

- [ ] App icon 1024×1024 PNG (Lumera "L" logo, transparent bg).
- [ ] App Category = **Business and Pages**.
- [ ] Privacy Policy URL = `https://<your-domain>/privacy` (must be live, mention WhatsApp data handling explicitly).
- [ ] Terms of Service URL = `https://<your-domain>/terms`.
- [ ] Data Deletion URL = `https://<your-domain>/data-deletion` (must accept a phone number and confirm deletion within 30 days).
- [ ] User-facing app name = **Lumera**.
- [ ] App domain(s) added, includes your production domain + any preview domains you demo from.
- [ ] Webhook URL: `https://<your-domain>/api/meta-whatsapp/webhook` — verified with hub.challenge round-trip.
- [ ] Webhook subscribed to `messages`, `message_status`, `message_template_status_update`.
- [ ] HMAC signature verification enabled (Lumera does this — see `meta_whatsapp.py`).
- [ ] At least one approved WhatsApp template (Utility category recommended for first template).
- [ ] Screencast video (see Section 6) uploaded per permission.
- [ ] Reviewer test credentials provided in "Notes for App Reviewer".

### Reviewer test credentials block (paste verbatim into the review notes)
```
Login URL: https://<your-domain>/login
Reviewer Doctor: reviewer@lumera.demo / MetaReview@2026
Reviewer Patient WhatsApp: +1-555-META-DEMO (this is the number that will receive test messages)
Notes: The reviewer account is pre-seeded with 3 dummy patients and 1 pre-approved
template (utility_appointment_confirmation_v1). All flows are visible without ANY
paid subscription. Please contact support@lumera.<your-domain> if you need us to
reset the environment.
```
> **Action item:** create this reviewer account in production before submitting and add its creds to `/app/memory/test_credentials.md`.

---

## 5. Message Templates — Submit these BEFORE requesting permissions

Templates take 1–24 hrs to approve and must exist before the reviewer can see a real send. Submit these 4 utility templates (all category = **UTILITY**, language = **en / en_IN**):

**5.1 `appointment_confirmation_v1`**
```
Hi {{1}}, your appointment with Dr. {{2}} is confirmed for {{3}} at {{4}}.
Clinic: {{5}}. Reply CANCEL to cancel or RESCHEDULE to change.
- Lumera
```
Variables: patient name, doctor name, date, time, clinic name.

**5.2 `appointment_reminder_v1`**
```
Reminder: Hi {{1}}, you have an appointment tomorrow at {{2}} with Dr. {{3}}.
Please reach 10 minutes early. Reply CONFIRM to confirm.
```

**5.3 `prescription_ready_v1`** (with document header)
```
Hi {{1}}, Dr. {{2}} has issued your prescription from today's visit.
Please find it attached. Next follow-up: {{3}}.
- Lumera
```
Header: DOCUMENT. Body vars: patient name, doctor name, follow-up date.

**5.4 `payment_link_v1`** (with URL button)
```
Hi {{1}}, please complete your payment of ₹{{2}} for the consultation with
Dr. {{3}} on {{4}} using the secure link below. This link expires in 24 hours.
```
Button: URL, text "Pay Now", URL = `https://pay.lumera.<your-domain>/{{5}}`.

> **Do not** add marketing/promotional lines — Meta rejects utility templates that read like ads.

---

## 6. Demo Video Script (record with OBS or Loom, 4–6 min total)

Meta requires ONE video per permission or a single video covering all. A single video is safer. Keep it **under 6 minutes**, resolution **1280×720+**, format **mp4**.

### Pre-recording setup
- Log out of every browser session; use a fresh Chrome profile.
- Zoom OS/browser to 110% so text is readable.
- Have two devices ready: laptop (Lumera app) + phone (WhatsApp receiving end).
- Pre-approve at least `appointment_confirmation_v1`.
- Pre-seed one patient named "Reviewer Demo" with WhatsApp number = the reviewer test number.

### Script

**[0:00 – 0:15] Cover slide (static frame)**
> "Hi Meta Review Team, I'm <name>, founder of Lumera. Lumera is a clinical practice management platform for Indian doctors. This video walks through why we need `whatsapp_business_messaging`, `whatsapp_business_management`, and `business_management`, showing each in production."

**[0:15 – 1:15] Scene 1 — Doctor connects their own WhatsApp (proves `business_management` + Embedded Signup)**
- On laptop, log in as `sarah@test.com`.
- Navigate: Settings → **WhatsApp Setup** (Meta) — show current empty state.
- Click **Connect WhatsApp** → Meta Embedded Signup popup appears.
- Complete popup: pick Business Manager → pick/create WABA → pick phone number.
- Return to Lumera; show `waba_id` and `phone_number_id` auto-filled + green "Connected" badge.
- Voice-over: *"Each doctor connects their own WhatsApp Business Account. Lumera stores `waba_id` and `phone_number_id` scoped to that doctor tenant — we never share numbers across tenants."*

**[1:15 – 2:15] Scene 2 — Template management (proves `whatsapp_business_management`)**
- Navigate to **Templates** tab.
- Show the list including `appointment_confirmation_v1` marked **Approved**.
- Click **Create Template** → fill sample utility template → submit for approval.
- Voice-over: *"Doctors create and manage their own message templates from inside Lumera. We call the Graph API `message_templates` endpoints under the doctor's WABA."*

**[2:15 – 3:45] Scene 3 — Send a session message (proves `whatsapp_business_messaging` outbound)**
- Navigate to **Appointments** → open the seeded Reviewer Demo appointment → click **Send Confirmation on WhatsApp**.
- Show Lumera toast: "Sent via WhatsApp".
- Cut to phone recording: WhatsApp message arriving on reviewer test number, showing the templated text.
- Voice-over: *"Lumera sends the approved utility template using the doctor's WABA. All messages are consented to at appointment-booking time — we show that consent checkbox next."*
- Briefly show the consent checkbox in the appointment-booking form.

**[3:45 – 5:00] Scene 4 — Receive a reply (proves `whatsapp_business_messaging` inbound + webhook)**
- On the phone, reply "CONFIRM" to the message.
- Cut to laptop: show the reply appearing in Lumera's **WhatsApp Inbox** in under 5 seconds.
- Then show the **Appointments** row status flipping to "Confirmed".
- Voice-over: *"Inbound messages hit `/api/meta-whatsapp/webhook`, which verifies the `X-Hub-Signature-256` HMAC before writing to the doctor's tenant. Patient replies drive Lumera's booking bot, appointment confirmation, and post-consult feedback flows."*

**[5:00 – 5:45] Scene 5 — Data control & deletion**
- Navigate to Settings → **WhatsApp Setup** → **Disconnect** button.
- Click Disconnect → show confirmation → show config wiped and no more messages can be sent.
- Also show the Data Deletion URL page (`/data-deletion`).
- Voice-over: *"Doctors can disconnect at any time. We also expose a self-service data deletion endpoint per Meta policy."*

**[5:45 – 6:00] Close**
> "Thank you for reviewing Lumera. Please reach us at support@lumera.<your-domain> if you need environment resets or a live walkthrough."

### Recording tips that pass review
- Show the URL bar clearly — reviewers want to see your real domain, not `localhost`.
- Never show test-mode "app is in development" banners in the video.
- Speak the permission names out loud as you demo them.
- If any UI is in an unusual state (e.g., empty), narrate why — silence gets flagged.

---

## 7. Compliance Copy You Must Have on the Site

Meta reviewers open these URLs. Missing text = instant reject.

**Privacy Policy — required paragraphs:**
> Lumera uses the WhatsApp Business Platform to send appointment confirmations, reminders, prescription documents, payment links, and to receive patient replies on behalf of the doctor you visit. Message content is stored encrypted for up to 90 days for audit purposes and can be deleted at any time by writing to privacy@lumera.<your-domain> or via our data deletion tool at https://<your-domain>/data-deletion. Lumera does not sell WhatsApp data to third parties. WhatsApp is a trademark of Meta Platforms, Inc.

**Terms of Service — required paragraphs:**
> Doctors connecting a WhatsApp Business Account via Lumera agree to Meta's WhatsApp Business Messaging Policy (https://www.whatsapp.com/legal/business-policy) and Business Terms of Service (https://www.whatsapp.com/legal/business-terms). Lumera acts as a Service Provider under the doctor's Business Account.

**Data Deletion page:**
- Input: WhatsApp phone number.
- Server behavior: enqueue a job to purge messages / patient records tied to that number across all doctor tenants within 30 days; email a confirmation.

---

## 8. Submission Order (do these in this exact order)

1. Complete Business Verification (may take 3–5 business days).
2. Pre-approve 4 utility templates (Section 5).
3. Create reviewer account in production + add to `/app/memory/test_credentials.md`.
4. Publish Privacy + Terms + Data Deletion pages.
5. Verify webhook URL + HMAC signature works end-to-end with a real Meta test event.
6. Record demo video (Section 6).
7. In App Review → **Add Permissions** → tick `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management` (Advanced Access on each).
8. For each permission: paste the "How will you use this?" text (see Section 9), upload the same video, add screenshots.
9. Submit.

Expected timeline: **3–7 business days** for App Review after Business Verification is done.

---

## 9. "How will you use this permission?" — copy/paste answers

**`whatsapp_business_messaging`:**
> Lumera sends session and utility-template messages (appointment confirmations, reminders, prescription PDFs, payment links, feedback prompts) from the connected doctor's WhatsApp Business number to their consenting patients, and receives inbound patient replies which drive the doctor's booking, confirmation, and feedback flows inside Lumera. All messages are tenant-isolated: a doctor only accesses their own patients' WhatsApp conversations. Consent to WhatsApp communication is captured at appointment-booking time and shown in Section 3 of the demo video.

**`whatsapp_business_management`:**
> Lumera lists, creates, and updates message templates and registers phone numbers for the connected doctor's WABA using the Graph API endpoints under `/{waba-id}/message_templates` and `/{phone-number-id}/register`. Doctors manage templates directly in Lumera (Section 2 of the demo video) rather than having to open Business Manager.

**`business_management`:**
> Required by WhatsApp Business Embedded Signup so the doctor can select or create a WhatsApp Business Account under their own Meta Business Manager from inside Lumera (Section 1 of the demo video). Lumera does not read or modify assets other than the specific WABA and phone number the doctor selects.

---

## 10. If Meta rejects — the 3 most common reasons and fixes

| Reject reason | What to change |
|---|---|
| "We were unable to log in with the credentials provided." | The reviewer account expired or password changed. Re-verify creds in `test_credentials.md` and reset. |
| "Video did not clearly show how this permission is used." | Add a text overlay in your video (e.g., "Now demonstrating whatsapp_business_messaging") each time you switch scenes. |
| "Privacy Policy does not mention WhatsApp usage." | Add the exact paragraph from Section 7 verbatim. |

Iterate on the same review ticket — Meta lets you re-submit for the same permission within 60 days without paying/re-verifying.

---

## Appendix A — Lumera's technical readiness (already done, cite in submission notes)

- Webhook: `POST /api/meta-whatsapp/webhook` with HMAC-SHA256 signature verification against `app_secret` (see `/app/backend/routes/meta_whatsapp.py`).
- Verification handshake: `GET /api/meta-whatsapp/webhook?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…` returns challenge iff token matches a stored doctor config.
- Per-tenant credential storage: `meta_whatsapp_configs` collection, keyed by `owner_id`, stores `app_id`, `app_secret`, `waba_id`, `phone_number_id`, `system_user_token`, `webhook_verify_token`.
- Setup UI: `/settings/whatsapp` (`MetaWhatsAppSetup.js`) exposes copy-webhook, save creds, and disconnect actions.
