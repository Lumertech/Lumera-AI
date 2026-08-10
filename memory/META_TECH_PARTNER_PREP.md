# Lumera — Meta App Review Submission Packet
**Company:** Lumera Solutions LLP  
**Contact:** ravee@lumer.me  
**Product URL:** https://<your-production-domain>  
**Privacy:** https://<your-production-domain>/privacy  
**Terms:** https://<your-production-domain>/terms  
**Data Deletion:** https://<your-production-domain>/data-deletion

> All policy pages, footers, and terms consent lines have been rebranded to **Lumera Solutions LLP** with **ravee@lumer.me** as the contact address. Logo continues to render "Lumera".

---

# Part 1 — What to Submit to Meta

## 1.1 Permissions (only these three)

| Permission | Access | Where reviewer sees it in the video |
|---|---|---|
| `whatsapp_business_messaging` | Advanced | Scenes 3 & 4 (outbound + inbound message) |
| `whatsapp_business_management` | Advanced | Scene 2 (templates + phone-number registration) |
| `business_management` | Advanced | Scene 1 (Embedded Signup) |

Do **not** request `pages_*`, `instagram_*`, `catalog_management`, `ads_management`.

## 1.2 App-review paste-blocks (verbatim into each permission form)

**`whatsapp_business_messaging`**
> Lumera Solutions LLP is a clinical practice management platform for Indian doctors. Using this permission, Lumera sends session and utility-template messages (appointment confirmations, reminders, prescription PDFs, payment links, feedback prompts) from the connected doctor's own WhatsApp Business number to consenting patients, and receives inbound patient replies. All messages are tenant-isolated per doctor. Consent to WhatsApp communication is captured at appointment-booking time (shown in Scene 3 of the demo video).

**`whatsapp_business_management`**
> Lumera lists, creates, and updates message templates and registers phone numbers for the connected doctor's WABA using the Graph API endpoints under `/{waba-id}/message_templates` and `/{phone-number-id}/register`. Doctors manage templates directly inside Lumera (Scene 2 of the demo video) so they never have to open Business Manager.

**`business_management`**
> Required by WhatsApp Business Embedded Signup so the doctor can select or create a WhatsApp Business Account under their own Meta Business Manager without leaving Lumera (Scene 1 of the demo video). Lumera does not read or modify assets other than the specific WABA and phone number the doctor selects.

## 1.3 Reviewer test credentials block (paste into "Notes for App Reviewer")

```
Product: Lumera (by Lumera Solutions LLP)
Login URL: https://<your-production-domain>/login

Reviewer Doctor account:
  email:    reviewer@lumer.me
  password: MetaReview@2026

Reviewer test WhatsApp number (receives all demo messages):
  +91 <your reviewer phone with WA installed>

Notes:
- The account is pre-seeded with 3 dummy patients and 4 pre-approved utility
  templates.
- All WhatsApp flows are visible without any paid subscription.
- Data deletion self-service: https://<your-production-domain>/data-deletion
- For environment resets or a live walkthrough, email ravee@lumer.me.
```

## 1.4 App Dashboard field values

| Field | Value |
|---|---|
| App display name | Lumera |
| Business Verification legal name | Lumera Solutions LLP |
| Contact email | ravee@lumer.me |
| App category | Business and Pages |
| Privacy Policy URL | https://<your-production-domain>/privacy |
| Terms of Service URL | https://<your-production-domain>/terms |
| Data Deletion URL | https://<your-production-domain>/data-deletion |
| Webhook URL | https://<your-production-domain>/api/meta-whatsapp/webhook |
| Webhook fields subscribed | `messages`, `message_status`, `message_template_status_update` |
| Verify token | (paste value shown in Lumera → Settings → WhatsApp Setup) |

---

# Part 2 — The Demo Video

**Format:** MP4, ≥ 720p, ≤ 6 minutes, English voice-over, browser + phone screen-record combined.

**Recording tools:** OBS (free) or Loom or QuickTime. Merge with any free editor (DaVinci Resolve, iMovie).

**Two-screen setup:**
- Left: Laptop showing Lumera (Chrome, fresh profile, URL bar visible).
- Right: Phone showing WhatsApp (the reviewer phone `+91 <reviewer number>`).

## 2.1 Pre-recording checklist

- [ ] Business Verification for Lumera Solutions LLP is **complete** in Meta Business Manager.
- [ ] 4 utility templates (see Part 3) are **Approved** by Meta.
- [ ] `reviewer@lumer.me` account created in production with password `MetaReview@2026` and pre-seeded with 3 dummy patients.
- [ ] The reviewer WhatsApp phone is added as a **test recipient** in Meta Cloud API for the app.
- [ ] Privacy, Terms, and Data Deletion pages are live at their public URLs.
- [ ] Webhook `hub.challenge` handshake confirmed green in App Dashboard → Webhooks.

## 2.2 Full narrated script (read this out loud during the recording)

**[0:00 – 0:15] Title card (static frame)**
> "Hi Meta Review team, this is Ravee from Lumera Solutions LLP. Lumera is a clinical practice management platform for Indian doctors. This video demonstrates our use of `whatsapp_business_messaging`, `whatsapp_business_management`, and `business_management` in production. Reviewer credentials are in the submission notes."

**[0:15 – 1:15] Scene 1 — `business_management` via Embedded Signup**
> On the laptop, log in with reviewer@lumer.me. Open Settings → WhatsApp Setup (Meta). Point at the empty state on screen.
>
> Voice-over: "Each doctor connects their own WhatsApp Business Account through Embedded Signup — Lumera never resells messaging capacity."
>
> Click **Connect WhatsApp**. Meta's Embedded Signup popup appears. Pick your Meta Business Manager → pick or create a WABA → pick the phone number. On return, show the auto-filled `waba_id` and `phone_number_id` plus the green "Connected" badge.
>
> Overlay text on screen: `Permission demonstrated: business_management`.

**[1:15 – 2:15] Scene 2 — `whatsapp_business_management`**
> Click into the **Templates** tab. Show the list containing all four templates in status **APPROVED**.
>
> Voice-over: "Doctors create and manage their own message templates from Lumera. We call the Graph API `message_templates` endpoints scoped to their WABA."
>
> Click **Create Template**, fill a small demo utility template, and hit **Submit for approval**. Show the pending status.
>
> Overlay text: `Permission demonstrated: whatsapp_business_management`.

**[2:15 – 3:45] Scene 3 — Outbound `whatsapp_business_messaging` + consent**
> Navigate to **Appointments** → open the seeded "Reviewer Demo" appointment.
>
> Point at the WhatsApp Consent checkbox in the appointment card.
>
> Voice-over: "Every appointment records explicit patient consent to receive WhatsApp messages. Without it, the WhatsApp buttons are disabled."
>
> Click **Send Confirmation on WhatsApp**. A toast reads "Sent via WhatsApp."
>
> Cut to phone recording: WhatsApp message arrives on the reviewer phone with the templated text `Hi Reviewer Demo, your appointment with Dr. Sarah is confirmed for…`.
>
> Overlay text: `Permission demonstrated: whatsapp_business_messaging (outbound)`.

**[3:45 – 5:00] Scene 4 — Inbound `whatsapp_business_messaging` via webhook**
> On the phone, reply "CONFIRM" to that WhatsApp message.
>
> Cut to laptop: within ~3 seconds the reply appears in Lumera's WhatsApp Inbox, and the appointment status flips to **Confirmed**.
>
> Voice-over: "Inbound messages hit `/api/meta-whatsapp/webhook`. We verify the X-Hub-Signature-256 HMAC against the doctor's app_secret before writing the message into that doctor's tenant. Replies then drive booking, confirmations, and post-consult feedback flows."
>
> Overlay text: `Permission demonstrated: whatsapp_business_messaging (inbound + webhook HMAC)`.

**[5:00 – 5:45] Scene 5 — Data control + deletion (compliance)**
> Back on the laptop → Settings → WhatsApp Setup → click **Disconnect**. Show the config wiped and outbound buttons disabled.
>
> Open a new tab: navigate to `https://<your-production-domain>/data-deletion`. Show the form, type a demo phone number, submit, and show the returned ticket ID.
>
> Voice-over: "Doctors can disconnect at any time. Patients can request end-to-end deletion of their WhatsApp history with any Lumera-onboarded doctor from a public self-service page. Deletion is completed within 30 days as documented in our Privacy Policy."

**[5:45 – 6:00] Close**
> "Thank you for reviewing Lumera. Please reach me at ravee@lumer.me for environment resets or a live walkthrough."

**Editing tips**
- Add on-screen text overlays every time the scene changes ("Permission demonstrated: …").
- Never show `localhost`, staging banners, or developer mode notices.
- Show the browser URL bar clearly whenever you land on a new page.

---

# Part 3 — Utility Message Templates (submit before video)

All: **category = UTILITY**, **language = en / en_IN**. Do not include marketing or promotional language.

### 3.1 `appointment_confirmation_v1`
```
Hi {{1}}, your appointment with Dr. {{2}} is confirmed for {{3}} at {{4}}.
Clinic: {{5}}. Reply CANCEL to cancel or RESCHEDULE to change.
- Lumera
```
Vars: patient name · doctor name · date · time · clinic name.

### 3.2 `appointment_reminder_v1`
```
Reminder: Hi {{1}}, you have an appointment tomorrow at {{2}} with Dr. {{3}}.
Please reach 10 minutes early. Reply CONFIRM to confirm.
```

### 3.3 `prescription_ready_v1` (header: DOCUMENT)
```
Hi {{1}}, Dr. {{2}} has issued your prescription from today's visit.
Please find it attached. Next follow-up: {{3}}.
- Lumera
```

### 3.4 `payment_link_v1` (button: URL "Pay Now" → `https://pay.<your-domain>/{{5}}`)
```
Hi {{1}}, please complete your payment of ₹{{2}} for the consultation with
Dr. {{3}} on {{4}} using the secure link below. This link expires in 24 hours.
```

---

# Part 4 — Documentation Bundle to Attach

Zip and upload (Meta lets you attach PDFs/PNGs to each permission request):

1. **Company_Registration.pdf** — LLP incorporation certificate of Lumera Solutions LLP.
2. **GST_Certificate.pdf** — GST registration in the LLP's legal name.
3. **Address_Proof.pdf** — utility bill / bank letter in the LLP's registered address.
4. **Domain_Ownership.png** — screenshot of your DNS panel showing the Meta verification TXT record for `<your-domain>`.
5. **Screenshot_PrivacyPolicy.png** — full-page capture of `/privacy` clearly showing the WhatsApp/Meta paragraph and "Lumera Solutions LLP" name.
6. **Screenshot_Terms.png** — full-page capture of `/terms` including the Meta Business Terms link.
7. **Screenshot_DataDeletion.png** — full-page capture of `/data-deletion` form.
8. **Screenshot_MetaSetup.png** — Lumera Settings → WhatsApp Setup showing per-tenant credential fields.
9. **Screenshot_Templates.png** — templates list with the 4 approved utility templates.
10. **Screenshot_Consent.png** — appointment-booking form with the WhatsApp consent checkbox circled.
11. **Screenshot_Inbox.png** — Lumera WhatsApp Inbox with an inbound message from a test patient.
12. **Screenshot_Webhook_Health.png** — Meta App Dashboard showing webhook verified (green) and subscribed fields.
13. **Lumera_Demo.mp4** — the 4–6 minute recording from Part 2.

---

# Part 5 — Do This Exact Sequence

1. Complete **Business Verification** for **Lumera Solutions LLP** in Meta Business Manager. (3–5 biz days.)
2. Submit the 4 utility templates in Part 3. (1–24 hrs.)
3. Create the `reviewer@lumer.me / MetaReview@2026` production account and seed 3 demo patients + 1 demo appointment named "Reviewer Demo".
4. Confirm `/privacy`, `/terms`, `/data-deletion` are publicly reachable on your production domain.
5. Test-fire the webhook: hit **Test** in Meta App Dashboard → Webhooks → Messages, confirm a 200 with HMAC verified.
6. Record the demo video following Part 2 exactly.
7. Collect all files listed in Part 4 into a folder named `Lumera_MetaReview_<yyyy-mm-dd>`.
8. In App Dashboard → **App Review** → **Add Permissions**: tick the 3 permissions from 1.1, paste the paragraphs from 1.2, upload the video, upload the screenshots.
9. Paste the reviewer credential block from 1.3 into "Notes for App Reviewer".
10. Submit. Expect a decision in **3–7 business days**.

---

# Part 6 — Compliance Copy Already Live in the App

The following texts are already rendered on the site (do not remove — reviewers will read them):

- **`/privacy`** — explicit paragraph naming Meta Platforms, Inc., WhatsApp Business Platform usage, 90-day retention, and pointer to `/data-deletion`.
- **`/terms`** — links to WhatsApp Business Messaging Policy and Business Terms of Service; states Lumera Solutions LLP acts as a Service Provider and does not resell messaging capacity.
- **`/data-deletion`** — public form accepting phone number, issues a ticket ID, and states 30-day fulfilment SLA.
- **Landing footer** — `© 2026 Lumera Solutions LLP. All rights reserved.`
- **Registration + payment consent lines** — updated to Lumera Solutions LLP.

---

# Part 7 — If Meta Rejects

| Reject reason | Fix |
|---|---|
| Cannot log in with credentials provided | Reset `reviewer@lumer.me` and re-add to submission notes. |
| Video doesn't clearly show permission usage | Add on-screen text overlay ("Permission demonstrated: X") each scene change. Re-record only the scene concerned. |
| Privacy Policy doesn't mention WhatsApp / Meta | Confirm `/privacy` renders the paragraph from Part 6 exactly. |
| Business Verification pending | Complete verification before re-submitting. |

You can iterate on the same review ticket free of cost within 60 days.
