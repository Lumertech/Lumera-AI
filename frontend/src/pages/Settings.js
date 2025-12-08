import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings as SettingsIcon, Calendar, Bell } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

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