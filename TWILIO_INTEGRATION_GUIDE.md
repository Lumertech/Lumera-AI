# Twilio WhatsApp Integration Guide for Lumera

## Quick Start (5 Minutes Setup)

### Step 1: Create Twilio Account
1. Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Sign up with your email
3. Verify your phone number
4. You'll get **₹1,300 (~$16) in free trial credits**

### Step 2: Get Your Credentials
1. Go to Twilio Console: [https://console.twilio.com/](https://console.twilio.com/)
2. On the dashboard, you'll see:
   - **Account SID**: Starts with `AC...` (Example: `ACa1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)
   - **Auth Token**: Click the eye icon to reveal (Example: `12a34b56c78d90e12f34g56h78i90j12`)
3. **Copy both** - you'll need them in Step 4

### Step 3: Enable WhatsApp Sandbox (For Testing)
1. In Twilio Console, go to: **Messaging** → **Try it Out** → **Send a WhatsApp message**
2. You'll see instructions like:
   ```
   Send "join <word>" to +1 415 523 8886 on WhatsApp
   ```
3. **Open WhatsApp on your phone** and send that message
4. You'll get a confirmation: "You are all set!"
5. **Copy the sandbox number**: `whatsapp:+14155238886`

### Step 4: Add Credentials to Lumera
1. **In Lumera**, go to **Settings** page
2. Scroll to **"WhatsApp Configuration"** section
3. Enter:
   - **Twilio Account SID**: Paste from Step 2
   - **Twilio Auth Token**: Paste from Step 2  
   - **WhatsApp Number**: Paste sandbox number (with `whatsapp:` prefix)
4. Click **"Save Settings"**
5. ✅ Done! Your WhatsApp is now connected

### Step 5: Test It!
1. Try registering a new user with WhatsApp OTP
2. Create a test appointment
3. Check your WhatsApp - you should receive messages!

---

## Production Setup (After Testing)

### When to Upgrade?
- Sandbox works only with numbers you manually add
- For production, you need an **approved WhatsApp Business number**
- This allows sending to ANY number without pre-approval

### How to Get Production Access?
1. In Twilio Console → **Messaging** → **WhatsApp** → **Senders**
2. Click **"Request Access"**
3. Fill in:
   - Business Name
   - Business Website
   - Business Description
   - Facebook Business Manager ID (create at [business.facebook.com](https://business.facebook.com))
4. Wait 24-48 hours for approval
5. Once approved, update the WhatsApp number in Lumera Settings

### Message Templates (Production Only)
For production, WhatsApp requires pre-approved message templates:

**1. OTP Template**
```
Your Lumera verification code is {{1}}. Valid for 10 minutes. Do not share this code.
```

**2. Appointment Confirmation**
```
Hello {{1}},

Your appointment with Dr. {{2}} is confirmed!
📅 Date: {{3}}
⏰ Time: {{4}}
📍 Mode: {{5}}

Please arrive 10 minutes early.
```

**3. Prescription Delivery**
```
Hello {{1}},

Your prescription from Dr. {{2}} is ready.

📋 Prescription attached above

⚕️ Follow instructions carefully
💊 Take medications as prescribed

Feel better soon!
```

**How to Submit Templates:**
1. Twilio Console → **Messaging** → **WhatsApp** → **Content Templates**
2. Click **"Create New Template"**
3. Paste the template text
4. Submit for WhatsApp approval (24-48 hours)

---

## Pricing (India)

### Free Trial
- ₹1,300 in credits (enough for 2,600+ messages)
- Perfect for testing

### After Trial
- **₹0.50 per message** (approximately)
- OTP messages, confirmations, prescriptions all count

### Example Costs
- **100 patients/month**: ~₹150
- **500 patients/month**: ~₹750
- **1000 patients/month**: ~₹1,500

---

## Troubleshooting

### "OTP not received"
✅ **Check:**
1. Is the phone number in international format? (+91XXXXXXXXXX)
2. Did you join the sandbox? (Send "join word" message)
3. Are Twilio credentials correct in Settings?
4. Check Twilio logs: [https://console.twilio.com/monitor/logs/sms](https://console.twilio.com/monitor/logs/sms)

### "Invalid credentials" error
✅ **Fix:**
1. Double-check Account SID and Auth Token (no extra spaces)
2. Make sure Auth Token is not expired
3. Try regenerating Auth Token in Twilio Console

### "Webhook not receiving messages"
✅ **Fix:**
1. In Twilio Console → **Messaging** → **Settings** → **WhatsApp sandbox**
2. Set webhook URL to:
   ```
   https://your-lumer-domain.com/api/webhook/whatsapp
   ```
3. Make sure URL is HTTPS (not HTTP)

### "Rate limit exceeded"
✅ **Info:**
- Sandbox has limits (1 msg/sec)
- Production accounts have higher limits
- Upgrade to paid account for more capacity

---

## Testing Checklist

- [ ] Twilio account created and verified
- [ ] Account SID and Auth Token copied
- [ ] WhatsApp sandbox activated (sent join message)
- [ ] Credentials added to Lumera Settings
- [ ] Test OTP: Register new user with phone number
- [ ] Test appointment: Create appointment, check WhatsApp confirmation
- [ ] Test prescription: Write prescription, check WhatsApp delivery

---

## Support

**Twilio Support:**
- Docs: [https://www.twilio.com/docs/whatsapp](https://www.twilio.com/docs/whatsapp)
- Help Center: [https://support.twilio.com](https://support.twilio.com)
- Community: [https://www.twilio.com/community](https://www.twilio.com/community)

**WhatsApp Business API:**
- Docs: [https://developers.facebook.com/docs/whatsapp](https://developers.facebook.com/docs/whatsapp)
- Business Manager: [https://business.facebook.com](https://business.facebook.com)

---

## Quick Reference

### Twilio Console URLs
- Dashboard: [https://console.twilio.com/](https://console.twilio.com/)
- WhatsApp Sandbox: [https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn)
- Message Logs: [https://console.twilio.com/monitor/logs/sms](https://console.twilio.com/monitor/logs/sms)
- Billing: [https://console.twilio.com/billing](https://console.twilio.com/billing)

### Important Numbers
- Sandbox WhatsApp Number: `whatsapp:+14155238886` (may vary by region)
- Format for India: `+91XXXXXXXXXX` (10 digits after +91)
- Format for WhatsApp API: `whatsapp:+91XXXXXXXXXX`
