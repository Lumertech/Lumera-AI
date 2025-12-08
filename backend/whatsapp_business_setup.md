# WhatsApp Business API Integration Guide for Lumer

## Overview
Lumer integrates with WhatsApp Business API for OTP verification, appointment confirmations, and prescription delivery.

## Option 1: Twilio WhatsApp Business API (Recommended for Production)

### Step 1: Create Twilio Account
1. Go to [https://www.twilio.com/](https://www.twilio.com/)
2. Sign up for a free trial account
3. You'll get ₹1,300 (~$16) in trial credits

### Step 2: Get WhatsApp Sandbox (For Testing)
1. In Twilio Console, go to **Messaging → Try it Out → Send a WhatsApp message**
2. You'll see a sandbox number (e.g., +1 415 523 8886)
3. Send the join code (e.g., "join <word>") from your WhatsApp to activate
4. Note: Sandbox is for testing only, limited to pre-approved numbers

### Step 3: Get Production WhatsApp Business Number (For Live Use)
1. In Twilio Console, go to **Messaging → WhatsApp → Senders**
2. Click **Request Access** to WhatsApp Business API
3. Fill in business details:
   - Business Name
   - Business Website
   - Business Description
   - Facebook Business Manager ID (create at business.facebook.com)
4. Wait for approval (usually 24-48 hours)
5. Once approved, you'll get a WhatsApp Business number

### Step 4: Get Twilio Credentials
1. Go to Twilio Console Dashboard
2. Copy these credentials:
   - **Account SID**: Found on dashboard (starts with AC...)
   - **Auth Token**: Click "Show" to reveal (keep this secret!)
   - **WhatsApp Number**: Your WhatsApp-enabled number (format: whatsapp:+14155238886)

### Step 5: Configure Webhooks
1. Go to **Messaging → Settings → WhatsApp sandbox settings**
2. Set "When a message comes in" webhook to:
   ```
   https://your-lumer-domain.com/api/webhook/whatsapp
   ```
3. Set HTTP method to **POST**

### Step 6: Add Credentials to Lumer
1. Open Lumer Settings page
2. Go to "WhatsApp Configuration"
3. Enter:
   - Twilio Account SID
   - Twilio Auth Token
   - WhatsApp Number (with whatsapp: prefix)
4. Click Save

### Step 7: Test Integration
1. Try registering a new user with your phone number
2. You should receive an OTP on WhatsApp
3. Create a test appointment - client should get confirmation

---

## Option 2: Baileys (Personal WhatsApp - For Development Only)

⚠️ **Warning**: Baileys uses personal WhatsApp accounts and violates WhatsApp ToS. Use only for development/testing.

### Requirements
- Node.js installed
- A personal WhatsApp account (not Business)
- Not recommended for production

### Quick Setup
```bash
# Install dependencies
npm install @whiskeysockets/baileys

# Run the bot
node whatsapp_bot.js

# Scan QR code with WhatsApp mobile app
# WhatsApp → Settings → Linked Devices → Link a Device
```

---

## Cost Comparison (India)

### Twilio Pricing
- **OTP Messages**: ₹0.50 per message
- **Appointment Confirmations**: ₹0.50 per message
- **Prescription Delivery**: ₹0.50 per message
- **Estimated monthly cost for 100 patients**: ~₹150

### Baileys
- **Free** but:
  - Risk of account ban
  - No official support
  - Not scalable
  - Against WhatsApp ToS

---

## Message Templates (Pre-approval Required)

For production use, you must create and get WhatsApp message templates approved:

### 1. OTP Template
```
Your Lumer verification code is {{1}}. Valid for 10 minutes.
```

### 2. Appointment Confirmation Template
```
Hello {{1}},

Your appointment with Dr. {{2}} is confirmed!
📅 Date: {{3}}
⏰ Time: {{4}}
📍 Mode: {{5}}

Please arrive 10 minutes early.

Need to reschedule? Reply CANCEL
```

### 3. Prescription Template
```
Hello {{1}},

Your prescription from Dr. {{2}} is ready.

📋 Prescription attached above

⚕️ Follow the instructions carefully.
💊 Take medications as prescribed.

Feel better soon!
```

### How to Submit Templates
1. Go to Twilio Console → WhatsApp → Content Templates
2. Click "Create New Template"
3. Fill in template details
4. Submit for WhatsApp approval (24-48 hours)

---

## Testing Checklist

- [ ] OTP messages received on WhatsApp
- [ ] Appointment confirmations sent
- [ ] Prescriptions delivered with PDF attachment
- [ ] Reminder messages working
- [ ] Webhook receiving messages from patients
- [ ] All message templates approved

---

## Troubleshooting

### Issue: OTP not received
- Check if Twilio credentials are correct
- Verify phone number format (+91XXXXXXXXXX)
- Check Twilio logs for errors
- Ensure WhatsApp number is in sandbox (for testing)

### Issue: Messages not sending
- Verify Twilio account has credits
- Check if message templates are approved
- Ensure webhook URL is accessible
- Check for rate limiting

### Issue: Webhook not receiving
- Verify webhook URL is public and HTTPS
- Check firewall/security group settings
- Test webhook with Postman first
- Verify signature validation

---

## Production Deployment Checklist

- [ ] Move from Twilio sandbox to approved Business number
- [ ] All message templates approved by WhatsApp
- [ ] Webhook URL configured correctly
- [ ] SSL certificate valid
- [ ] Phone number verification working
- [ ] Error logging and monitoring set up
- [ ] Rate limiting implemented
- [ ] Backup notification method (SMS/Email) configured

---

## Support

**Twilio Support**: https://support.twilio.com
**WhatsApp Business API Docs**: https://developers.facebook.com/docs/whatsapp