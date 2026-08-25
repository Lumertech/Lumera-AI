import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings as SettingsIcon, Calendar, Bell, CreditCard, Star } from 'lucide-react';
import { toast } from 'sonner';
import MetaWhatsAppSetup from './MetaWhatsAppSetup'; // moved to Admin Panel — kept for future use
import PaymentGatewaySettingsCard from '@/components/PaymentGatewaySettingsCard';
import ReviewLoopSettingsCard from '@/components/ReviewLoopSettingsCard';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const GoogleReviewSettingCard = () => {
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, sum] = await Promise.all([
          axios.get(`${API_URL}/feedback/settings/google-review`),
          axios.get(`${API_URL}/feedback/summary`),
        ]);
        setUrl(cfg.data.google_review_url || '');
        setSummary(sum.data);
      } finally { setLoaded(true); }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/feedback/settings/google-review`, { google_review_url: url });
      toast.success('Google Review link saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="font-manrope flex items-center space-x-2">
          <Star className="h-5 w-5 text-amber-500" />
          <span>Post-Consult Feedback &amp; Reviews</span>
        </CardTitle>
        <CardDescription className="font-inter">
          When patients rate your visit 4 or 5 stars, we send them this Google review link over WhatsApp.
          Feedback is auto-triggered 2 hours after each prescription.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Your Google Business review link</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://g.page/r/…/review"
            data-testid="google-review-url-input"
          />
          <p className="text-xs text-slate-500 mt-1">
            Grab it from your Google Business Profile → Get more reviews.
          </p>
        </div>
        <Button onClick={save} disabled={saving || !loaded} className="bg-amber-500 hover:bg-amber-600" data-testid="google-review-save-btn">
          {saving ? 'Saving…' : 'Save review link'}
        </Button>
        {summary && summary.count > 0 && (
          <div className="mt-3 p-3 bg-amber-50 rounded-lg text-sm">
            <div className="flex items-center gap-2 mb-1">
              <Star className="h-4 w-4 text-amber-500" />
              <strong>{summary.average}</strong> avg from {summary.count} rating{summary.count !== 1 ? 's' : ''} · {summary.positive_pct}% positive
            </div>
            <div className="text-xs text-slate-600">
              5★ {summary.distribution['5']} · 4★ {summary.distribution['4']} · 3★ {summary.distribution['3']} · 2★ {summary.distribution['2']} · 1★ {summary.distribution['1']}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Settings = () => {
  const [settings, setSettings] = useState({
    reminders_enabled: true,
    reminder_hours: 24,
    google_calendar_sync: false,
  });
  const [razorpayConfig, setRazorpayConfig] = useState({
    razorpay_key_id: '',
    razorpay_key_secret: '',
  });
  const [twilioConfig, setTwilioConfig] = useState({
    twilio_account_sid: '',
    twilio_auth_token: '',
    whatsapp_number: '',
  });
  const [paymentFees, setPaymentFees] = useState({
    consultation_fee: 500,
    followup_fee: 300,
    full_checkup_fee: 1000,
  });
  const [upiId, setUpiId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('none'); // 'none', 'upi', 'razorpay', 'both'
  const [botInstructions, setBotInstructions] = useState('');
  const [tabConfig, setTabConfig] = useState({
    dashboard: true,
    appointments: true,
    clients: true,
    whatsapp: true,
    payments: true,
    reminders: true,
    tools: true,
    settings: true,
  });
  const [razorpayConfigured, setRazorpayConfigured] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkRazorpayConfig();
    loadPaymentFees();
    loadBotInstructions();
    loadTabConfig();
    loadPatientPaymentSetup();
  }, []);

  const checkRazorpayConfig = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings/razorpay`);
      setRazorpayConfigured(response.data.configured);
      if (response.data.key_id) {
        setRazorpayConfig(prev => ({ ...prev, razorpay_key_id: response.data.key_id }));
      }
    } catch (error) {
      console.error('Failed to check Razorpay config:', error);
    }
  };

  const loadPaymentFees = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings/payment-fees`);
      setPaymentFees(response.data);
    } catch (error) {
      console.error('Failed to load payment fees:', error);
    }
  };

  const loadBotInstructions = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings/bot-instructions`);
      setBotInstructions(response.data.instructions);
    } catch (error) {
      console.error('Failed to load bot instructions:', error);
    }
  };

  const loadTabConfig = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings/tab-configuration`);
      setTabConfig(response.data);
    } catch (error) {
      console.error('Failed to load tab config:', error);
    }
  };

  const loadPatientPaymentSetup = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings/patient-payment`);
      setUpiId(response.data.upi_id || '');
      setPaymentMethod(response.data.payment_method || 'none');
    } catch (error) {
      console.error('Failed to load patient payment setup:', error);
    }
  };

  const savePatientPaymentSetup = async () => {
    if (!upiId && paymentMethod === 'upi') {
      toast.error('Please enter a valid UPI ID');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/settings/patient-payment`, {
        upi_id: upiId,
        payment_method: paymentMethod
      });
      toast.success('Patient payment setup saved successfully!');
      loadPatientPaymentSetup();
    } catch (error) {
      console.error('Save failed:', error);
      toast.error('Failed to save payment setup');
    } finally {
      setLoading(false);
    }
  };

  const saveRazorpayConfig = async () => {
    if (!razorpayConfig.razorpay_key_id || !razorpayConfig.razorpay_key_secret) {
      toast.error('Please enter both Razorpay Key ID and Secret');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/settings/razorpay`, razorpayConfig);
      toast.success('Razorpay configured successfully!');
      setRazorpayConfigured(true);
    } catch (error) {
      console.error('Failed to save Razorpay config:', error);
      toast.error('Failed to save Razorpay configuration');
    } finally {
      setLoading(false);
    }
  };

  const savePaymentFees = async () => {
    try {
      await axios.post(`${API_URL}/settings/payment-fees`, paymentFees);
      toast.success('Payment fees updated successfully!');
    } catch (error) {
      console.error('Failed to save payment fees:', error);
      toast.error('Failed to save payment fees');
    }
  };

  const saveBotInstructions = async () => {
    try {
      await axios.post(`${API_URL}/settings/bot-instructions`, { instructions: botInstructions });
      toast.success('Bot instructions saved successfully!');
    } catch (error) {
      console.error('Failed to save bot instructions:', error);
      toast.error('Failed to save bot instructions');
    }
  };

  const saveTabConfig = async () => {
    try {
      await axios.post(`${API_URL}/settings/tab-configuration`, { tabs: tabConfig });
      toast.success('Tab configuration saved successfully!');
    } catch (error) {
      console.error('Failed to save tab config:', error);
      toast.error('Failed to save tab configuration');
    }
  };

  const handleSave = () => {
    toast.success('Settings saved successfully!');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="settings-page">
        <Card className="border-slate-200 bg-gradient-to-br from-indigo-50 to-purple-50">
          <CardContent className="p-8">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-xl bg-indigo-500 flex items-center justify-center">
                <SettingsIcon className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="font-manrope font-bold text-2xl text-slate-900 mb-2">Settings</h2>
                <p className="font-inter text-slate-600">Manage your account and preferences</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              <span>Reminders</span>
            </CardTitle>
            <CardDescription className="font-inter">
              Configure automatic appointment reminders
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-manrope font-semibold">Enable Reminders</Label>
                <p className="font-inter text-sm text-slate-600">Send WhatsApp reminders to clients</p>
              </div>
              <Switch
                checked={settings.reminders_enabled}
                onCheckedChange={(checked) => setSettings({ ...settings, reminders_enabled: checked })}
                data-testid="reminders-toggle"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Reminder Time</Label>
              <Input
                type="number"
                value={settings.reminder_hours}
                onChange={(e) => setSettings({ ...settings, reminder_hours: parseInt(e.target.value) })}
                placeholder="24"
                data-testid="reminder-hours-input"
              />
              <p className="font-inter text-sm text-slate-600">Hours before appointment to send reminder</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Calendar Integration</span>
            </CardTitle>
            <CardDescription className="font-inter">Sync with Google Calendar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-manrope font-semibold">Google Calendar Sync</Label>
                <p className="font-inter text-sm text-slate-600">Automatically sync appointments</p>
              </div>
              <Switch
                checked={settings.google_calendar_sync}
                onCheckedChange={(checked) => setSettings({ ...settings, google_calendar_sync: checked })}
                data-testid="calendar-sync-toggle"
              />
            </div>
            {!settings.google_calendar_sync && (
              <Button variant="outline" className="w-full" data-testid="connect-google-btn">
                Connect Google Calendar
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Google Review URL — Post-consult feedback routing */}
        <GoogleReviewSettingCard />

        {/* Meta WhatsApp Business — moved to Admin Panel (/admin/whatsapp-config) */}

        {/* Payment & Gateway Settings (UPI / Gateway / Cash) */}
        <PaymentGatewaySettingsCard />

        {/* Google Review Loop */}
        <ReviewLoopSettingsCard />

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">Razorpay Payment Configuration</CardTitle>
            <CardDescription className="font-inter">
              Configure your Razorpay account to receive payments independently
              {razorpayConfigured && (
                <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                  ✓ Configured
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
              <p className="text-sm font-inter text-blue-900">
                <strong>How to get Razorpay keys:</strong>
                <br />
                1. Go to <a href="https://dashboard.razorpay.com/" target="_blank" rel="noopener noreferrer" className="underline">dashboard.razorpay.com</a>
                <br />
                2. Login/Signup with your account
                <br />
                3. Go to Settings → API Keys → Generate Test/Live Keys
                <br />
                4. Copy Key ID and Key Secret and paste below
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Razorpay Key ID</Label>
              <Input
                type="text"
                placeholder="rzp_test_..."
                value={razorpayConfig.razorpay_key_id}
                onChange={(e) => setRazorpayConfig({...razorpayConfig, razorpay_key_id: e.target.value})}
                data-testid="razorpay-key-id-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Razorpay Key Secret</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={razorpayConfig.razorpay_key_secret}
                onChange={(e) => setRazorpayConfig({...razorpayConfig, razorpay_key_secret: e.target.value})}
                data-testid="razorpay-key-secret-input"
              />
              <p className="text-xs text-slate-500">Keep this secret and never share publicly</p>
            </div>

            <Button 
              onClick={saveRazorpayConfig}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              data-testid="save-razorpay-btn"
            >
              {loading ? 'Saving...' : 'Save Razorpay Configuration'}
            </Button>

            {razorpayConfigured && (
              <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-green-900 font-inter">
                  ✅ <strong>Razorpay configured!</strong> You can now accept payments from patients via cards, net banking, and wallets.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Patient Payment Setup */}
        <Card className="border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader>
            <CardTitle className="font-manrope flex items-center space-x-2">
              <CreditCard className="h-5 w-5 text-indigo-600" />
              <span>Patient Payment Setup</span>
            </CardTitle>
            <CardDescription className="font-inter">
              Choose how your patients can pay you for consultations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current Setup Status */}
            <div className="p-4 bg-white rounded-lg border border-indigo-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-manrope font-semibold text-slate-700">Current Setup:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  paymentMethod === 'upi' ? 'bg-blue-100 text-blue-800' :
                  paymentMethod === 'razorpay' ? 'bg-purple-100 text-purple-800' :
                  paymentMethod === 'both' ? 'bg-green-100 text-green-800' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {paymentMethod === 'upi' ? 'UPI Only' :
                   paymentMethod === 'razorpay' ? 'Razorpay Only' :
                   paymentMethod === 'both' ? 'UPI + Razorpay' :
                   'Not Configured'}
                </span>
              </div>
              {paymentMethod === 'none' && (
                <p className="text-sm text-slate-600 font-inter">
                  Set up at least one payment method to collect payments from patients.
                </p>
              )}
            </div>

            {/* Option 1: UPI Collect (Recommended) */}
            <div className="space-y-3">
              <div className="flex items-start space-x-3 p-4 bg-white rounded-lg border-2 border-blue-200">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-blue-600 font-bold">💳</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-manrope font-semibold text-lg text-slate-900 mb-1">
                    UPI Collect (Recommended)
                  </h3>
                  <p className="text-sm text-slate-600 font-inter mb-3">
                    Patients pay directly to your UPI ID. Simple, no KYC required. We'll generate payment links and QR codes for you.
                  </p>
                  
                  <div className="space-y-2">
                    <Label className="font-manrope font-semibold">Your UPI ID</Label>
                    <Input
                      type="text"
                      placeholder="yourname@upi (e.g., doctor@paytm)"
                      value={upiId}
                      onChange={(e) => {
                        setUpiId(e.target.value);
                        if (e.target.value && paymentMethod === 'none') {
                          setPaymentMethod('upi');
                        } else if (e.target.value && paymentMethod === 'razorpay') {
                          setPaymentMethod('both');
                        }
                      }}
                      className="font-mono"
                    />
                    <p className="text-xs text-slate-500">
                      Enter your UPI ID (e.g., yourname@paytm, yourname@phonepe, yourname@googlepay)
                    </p>
                  </div>

                  {upiId && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-xs text-blue-900 font-inter">
                        ✓ UPI payment links will be generated as: <code className="bg-blue-100 px-2 py-1 rounded">upi://pay?pa={upiId}&am=500</code>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Option 2: Razorpay Integration */}
            <div className="space-y-3">
              <div className="flex items-start space-x-3 p-4 bg-white rounded-lg border-2 border-purple-200">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <span className="text-purple-600 font-bold">🌐</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-manrope font-semibold text-lg text-slate-900 mb-1">
                    Razorpay Integration (Advanced)
                  </h3>
                  <p className="text-sm text-slate-600 font-inter mb-3">
                    Enable cards, net banking, and wallet payments. Requires Razorpay KYC.
                  </p>

                  {razorpayConfigured ? (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-sm text-green-900 font-inter">
                        ✅ <strong>Razorpay configured!</strong> Your patients can now pay via cards, net banking, and wallets.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                      <p className="text-sm text-orange-900 font-inter mb-3">
                        ⚠️ Razorpay not configured. Configure above in "Razorpay Configuration" section.
                      </p>
                      <a
                        href="https://razorpay.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-indigo-600 hover:underline font-semibold"
                      >
                        Complete Razorpay KYC →
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Save Button */}
            <Button
              onClick={savePatientPaymentSetup}
              disabled={loading || (!upiId && !razorpayConfigured)}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {loading ? 'Saving...' : 'Save Patient Payment Setup'}
            </Button>

            {/* Help Text */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs text-slate-600 font-inter">
                <strong>💡 Tip:</strong> You can use both UPI and Razorpay together. UPI for simple payments, Razorpay for customers who prefer cards/wallets.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">Twilio WhatsApp Configuration</CardTitle>
            <CardDescription className="font-inter">
              Configure Twilio for WhatsApp OTP and notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200 mb-4">
              <p className="text-sm font-inter text-yellow-900">
                <strong>📖 Follow the integration guide:</strong>
                <br />
                Check <code className="bg-yellow-100 px-2 py-1 rounded">/TWILIO_INTEGRATION_GUIDE.md</code> for detailed setup instructions
                <br />
                <strong>Quick steps:</strong> Create Twilio account → Get credentials → Join WhatsApp sandbox → Add credentials here
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Twilio Account SID</Label>
              <Input
                type="text"
                placeholder="AC..."
                value={twilioConfig.twilio_account_sid}
                onChange={(e) => setTwilioConfig({...twilioConfig, twilio_account_sid: e.target.value})}
                data-testid="twilio-sid-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Twilio Auth Token</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={twilioConfig.twilio_auth_token}
                onChange={(e) => setTwilioConfig({...twilioConfig, twilio_auth_token: e.target.value})}
                data-testid="twilio-token-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">WhatsApp Number</Label>
              <Input
                placeholder="whatsapp:+14155238886"
                value={twilioConfig.whatsapp_number}
                onChange={(e) => setTwilioConfig({...twilioConfig, whatsapp_number: e.target.value})}
                data-testid="whatsapp-number-input"
              />
              <p className="text-xs text-slate-500">Include the &apos;whatsapp:&apos; prefix</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">Payment Fees Configuration</CardTitle>
            <CardDescription className="font-inter">Set your consultation and service fees</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="font-manrope font-semibold">Consultation Fee (₹)</Label>
                <Input
                  type="number"
                  value={paymentFees.consultation_fee}
                  onChange={(e) => setPaymentFees({...paymentFees, consultation_fee: parseInt(e.target.value)})}
                  data-testid="consultation-fee-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-manrope font-semibold">Follow-up Fee (₹)</Label>
                <Input
                  type="number"
                  value={paymentFees.followup_fee}
                  onChange={(e) => setPaymentFees({...paymentFees, followup_fee: parseInt(e.target.value)})}
                  data-testid="followup-fee-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-manrope font-semibold">Full Checkup Fee (₹)</Label>
                <Input
                  type="number"
                  value={paymentFees.full_checkup_fee}
                  onChange={(e) => setPaymentFees({...paymentFees, full_checkup_fee: parseInt(e.target.value)})}
                  data-testid="checkup-fee-input"
                />
              </div>
            </div>
            <Button 
              onClick={savePaymentFees}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              data-testid="save-fees-btn"
            >
              Save Payment Fees
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">WhatsApp Bot Instructions</CardTitle>
            <CardDescription className="font-inter">
              Customize how the AI bot behaves and responds to patients
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Bot Personality & Instructions</Label>
              <textarea
                className="w-full min-h-[120px] p-3 border border-slate-300 rounded-lg font-inter text-sm"
                value={botInstructions}
                onChange={(e) => setBotInstructions(e.target.value)}
                placeholder="Example: You are a friendly medical receptionist at Dr. Sarah's clinic. Be warm, professional, and empathetic. Always greet patients by name and offer help."
                data-testid="bot-instructions-input"
              />
              <p className="text-xs text-slate-500">
                These instructions guide the AI bot&apos;s behavior when chatting with patients
              </p>
            </div>
            <Button 
              onClick={saveBotInstructions}
              className="w-full bg-purple-600 hover:bg-purple-700"
              data-testid="save-bot-instructions-btn"
            >
              Save Bot Instructions
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">Tab Visibility Configuration</CardTitle>
            <CardDescription className="font-inter">
              Show or hide tabs in your dashboard navigation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {Object.keys(tabConfig).map((tab) => (
                <div key={tab} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <Label className="font-manrope font-medium capitalize">{tab}</Label>
                  <Switch
                    checked={tabConfig[tab]}
                    onCheckedChange={(checked) => setTabConfig({...tabConfig, [tab]: checked})}
                    data-testid={`tab-${tab}-toggle`}
                  />
                </div>
              ))}
            </div>
            <Button 
              onClick={saveTabConfig}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              data-testid="save-tab-config-btn"
            >
              Save Tab Configuration
            </Button>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700" data-testid="save-settings-btn">
            Save All Settings
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Settings;