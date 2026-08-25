import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  Settings as SettingsIcon, Calendar, Bell, CreditCard, Star,
  Bot, Eye, Stethoscope, MessageSquare, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import WhatsAppConnectCard from '@/components/WhatsAppConnectCard';
import PaymentGatewaySettingsCard from '@/components/PaymentGatewaySettingsCard';
import ReviewLoopSettingsCard from '@/components/ReviewLoopSettingsCard';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

/* ─────────────────────────────────────────────────────────────────────────── */
/*  AI & Rules                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

const TONES = ['Professional', 'Empathetic', 'Direct'];

function buildPromptPreview(cfg) {
  const lines = [];
  lines.push('=== SYSTEM PROMPT ===');
  lines.push('You are a clinical NLP assistant for Indian doctors. Extract structured EMR fields from an unstructured consultation transcript.');
  lines.push('The transcript may mix English and Hindi/Hinglish.');
  lines.push('Return STRICT JSON only matching the clinical schema.');
  lines.push('');
  if (cfg.persona_name || cfg.tone) {
    lines.push(`Persona: You are ${cfg.persona_name || 'the AI assistant'}, communicating in a ${cfg.tone || 'Professional'} tone.`);
  }
  if (cfg.working_hours) lines.push(`Clinic working hours: ${cfg.working_hours}`);
  if (cfg.emergency_number) lines.push(`Emergency escalation number: ${cfg.emergency_number}`);
  if (cfg.custom_system_instructions) {
    lines.push('');
    lines.push('Custom instructions:');
    lines.push(cfg.custom_system_instructions);
  }
  if (cfg.special_guidelines) {
    lines.push('');
    lines.push('Special guidelines:');
    lines.push(cfg.special_guidelines);
  }
  lines.push('');
  lines.push('=== END ===');
  return lines.join('\n');
}

const AIConfigCard = () => {
  const [cfg, setCfg] = useState({
    persona_name: '',
    tone: 'Professional',
    working_hours: '',
    emergency_number: '',
    custom_system_instructions: '',
    special_guidelines: '',
  });
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/workspace/ai-config`)
      .then(r => setCfg(prev => ({ ...prev, ...r.data })))
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/workspace/ai-config`, cfg);
      toast.success('AI config saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const set = (key) => (e) => setCfg(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <>
      <Card className="border-slate-200" data-testid="ai-config-card">
        <CardHeader>
          <CardTitle className="font-manrope flex items-center gap-2">
            <Bot className="h-5 w-5 text-indigo-500" />
            AI Assistant Configuration
          </CardTitle>
          <CardDescription className="font-inter">
            Customize how the AI assistant speaks and what context it uses during consultations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Row 1: Persona name + Tone */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Persona Name</Label>
              <Input
                value={cfg.persona_name}
                onChange={set('persona_name')}
                placeholder="e.g. Dr. Lumera Assistant"
                data-testid="ai-persona-name-input"
              />
              <p className="text-xs text-slate-500">Display name used internally in the AI prompt.</p>
            </div>
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Communication Tone</Label>
              <div className="flex gap-2" data-testid="ai-tone-selector">
                {TONES.map(t => (
                  <button
                    key={t}
                    onClick={() => setCfg(prev => ({ ...prev, tone: t }))}
                    data-testid={`ai-tone-${t.toLowerCase()}`}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                      cfg.tone === t
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Working hours + Emergency number */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Clinic Working Hours</Label>
              <Input
                value={cfg.working_hours}
                onChange={set('working_hours')}
                placeholder="e.g. Mon–Sat 9am–7pm, Sun Closed"
                data-testid="ai-working-hours-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Emergency Escalation Number</Label>
              <Input
                value={cfg.emergency_number}
                onChange={set('emergency_number')}
                placeholder="e.g. +91 98765 43210"
                data-testid="ai-emergency-number-input"
              />
            </div>
          </div>

          {/* Custom instructions */}
          <div className="space-y-2">
            <Label className="font-manrope font-semibold">Custom System Instructions</Label>
            <textarea
              className="w-full min-h-[100px] p-3 border border-slate-300 rounded-lg font-inter text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={cfg.custom_system_instructions}
              onChange={set('custom_system_instructions')}
              placeholder="e.g. Always note penicillin allergy prominently. Prefer generic drug names over brands when possible."
              data-testid="ai-custom-instructions-input"
            />
            <p className="text-xs text-slate-500">Appended verbatim to every AI extraction prompt.</p>
          </div>

          {/* Special guidelines */}
          <div className="space-y-2">
            <Label className="font-manrope font-semibold">Special Guidelines</Label>
            <textarea
              className="w-full min-h-[80px] p-3 border border-slate-300 rounded-lg font-inter text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={cfg.special_guidelines}
              onChange={set('special_guidelines')}
              placeholder="e.g. This is a paediatric clinic — adjust dosages for children. Avoid NSAIDs as first-line."
              data-testid="ai-special-guidelines-input"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={save}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="ai-config-save-btn"
            >
              {saving ? 'Saving…' : 'Save AI Config'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-2"
              data-testid="ai-preview-prompt-btn"
            >
              <Eye className="h-4 w-4" />
              Preview Prompt Context
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Drawer */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto" data-testid="ai-preview-drawer">
          <SheetHeader className="mb-4">
            <SheetTitle className="font-manrope flex items-center gap-2">
              <Eye className="h-5 w-5 text-indigo-500" />
              Prompt Context Preview
            </SheetTitle>
            <SheetDescription>
              This is exactly how your settings will be fed to the AI model. No API call is made here.
            </SheetDescription>
          </SheetHeader>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <pre
              className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words leading-relaxed"
              data-testid="ai-prompt-preview-text"
            >
              {buildPromptPreview(cfg)}
            </pre>
          </div>

          <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
            <p className="text-xs text-indigo-800 font-inter">
              Save your AI config first to make these settings active. Changes take effect on the next Ambient AI extraction.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Google Review card (unchanged logic)                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

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
              5★ {summary.distribution?.['5']} · 4★ {summary.distribution?.['4']} · 3★ {summary.distribution?.['3']} · 2★ {summary.distribution?.['2']} · 1★ {summary.distribution?.['1']}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Main Settings component                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

const Settings = () => {
  const [settings, setSettings] = useState({
    reminders_enabled: true,
    reminder_hours: 24,
    google_calendar_sync: false,
  });
  const [razorpayConfig, setRazorpayConfig] = useState({ razorpay_key_id: '', razorpay_key_secret: '' });
  const [twilioConfig, setTwilioConfig] = useState({ twilio_account_sid: '', twilio_auth_token: '', whatsapp_number: '' });
  const [paymentFees, setPaymentFees] = useState({ consultation_fee: 500, followup_fee: 300, full_checkup_fee: 1000 });
  const [upiId, setUpiId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('none');
  const [botInstructions, setBotInstructions] = useState('');
  const [tabConfig, setTabConfig] = useState({
    dashboard: true, appointments: true, clients: true,
    whatsapp: true, payments: true, reminders: true, tools: true, settings: true,
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
      const r = await axios.get(`${API_URL}/settings/razorpay`);
      setRazorpayConfigured(r.data.configured);
      if (r.data.key_id) setRazorpayConfig(prev => ({ ...prev, razorpay_key_id: r.data.key_id }));
    } catch { /* silent */ }
  };

  const loadPaymentFees = async () => {
    try { const r = await axios.get(`${API_URL}/settings/payment-fees`); setPaymentFees(r.data); } catch { /* silent */ }
  };

  const loadBotInstructions = async () => {
    try { const r = await axios.get(`${API_URL}/settings/bot-instructions`); setBotInstructions(r.data.instructions); } catch { /* silent */ }
  };

  const loadTabConfig = async () => {
    try { const r = await axios.get(`${API_URL}/settings/tab-configuration`); setTabConfig(r.data); } catch { /* silent */ }
  };

  const loadPatientPaymentSetup = async () => {
    try {
      const r = await axios.get(`${API_URL}/settings/patient-payment`);
      setUpiId(r.data.upi_id || '');
      setPaymentMethod(r.data.payment_method || 'none');
    } catch { /* silent */ }
  };

  const savePatientPaymentSetup = async () => {
    if (!upiId && paymentMethod === 'upi') { toast.error('Please enter a valid UPI ID'); return; }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/settings/patient-payment`, { upi_id: upiId, payment_method: paymentMethod });
      toast.success('Patient payment setup saved!');
      loadPatientPaymentSetup();
    } catch { toast.error('Failed to save payment setup'); } finally { setLoading(false); }
  };

  const saveRazorpayConfig = async () => {
    if (!razorpayConfig.razorpay_key_id || !razorpayConfig.razorpay_key_secret) {
      toast.error('Please enter both Razorpay Key ID and Secret'); return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/settings/razorpay`, razorpayConfig);
      toast.success('Razorpay configured successfully!');
      setRazorpayConfigured(true);
    } catch { toast.error('Failed to save Razorpay configuration'); } finally { setLoading(false); }
  };

  const savePaymentFees = async () => {
    try { await axios.post(`${API_URL}/settings/payment-fees`, paymentFees); toast.success('Payment fees updated!'); }
    catch { toast.error('Failed to save payment fees'); }
  };

  const saveBotInstructions = async () => {
    try { await axios.post(`${API_URL}/settings/bot-instructions`, { instructions: botInstructions }); toast.success('Bot instructions saved!'); }
    catch { toast.error('Failed to save bot instructions'); }
  };

  const saveTabConfig = async () => {
    try { await axios.post(`${API_URL}/settings/tab-configuration`, { tabs: tabConfig }); toast.success('Tab configuration saved!'); }
    catch { toast.error('Failed to save tab configuration'); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="settings-page">
        {/* Header */}
        <Card className="border-slate-200 bg-gradient-to-br from-indigo-50 to-purple-50">
          <CardContent className="p-8">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-xl bg-indigo-500 flex items-center justify-center">
                <SettingsIcon className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="font-manrope font-bold text-2xl text-slate-900 mb-1">Settings</h2>
                <p className="font-inter text-slate-600">Manage your account, AI, and clinic preferences</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="general" data-testid="settings-tabs">
          <TabsList className="w-full h-auto flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl">
            <TabsTrigger value="general" className="flex items-center gap-1.5 flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm" data-testid="settings-tab-general">
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-1.5 flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm" data-testid="settings-tab-ai">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">AI &amp; Rules</span>
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-1.5 flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm" data-testid="settings-tab-whatsapp">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-1.5 flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm" data-testid="settings-tab-payments">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Payments</span>
            </TabsTrigger>
          </TabsList>

          {/* ── GENERAL TAB ─────────────────────────────────────────────────── */}
          <TabsContent value="general" className="space-y-6 mt-4">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="font-manrope flex items-center space-x-2">
                  <Bell className="h-5 w-5" />
                  <span>Reminders</span>
                </CardTitle>
                <CardDescription className="font-inter">Configure automatic appointment reminders</CardDescription>
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
                <CardTitle className="font-manrope">Tab Visibility Configuration</CardTitle>
                <CardDescription className="font-inter">Show or hide tabs in your dashboard navigation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  {Object.keys(tabConfig).map((tab) => (
                    <div key={tab} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <Label className="font-manrope font-medium capitalize">{tab}</Label>
                      <Switch
                        checked={tabConfig[tab]}
                        onCheckedChange={(checked) => setTabConfig({ ...tabConfig, [tab]: checked })}
                        data-testid={`tab-${tab}-toggle`}
                      />
                    </div>
                  ))}
                </div>
                <Button onClick={saveTabConfig} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="save-tab-config-btn">
                  Save Tab Configuration
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── AI & RULES TAB ──────────────────────────────────────────────── */}
          <TabsContent value="ai" className="space-y-6 mt-4">
            <AIConfigCard />

            {/* Bot Instructions */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="font-manrope">WhatsApp Bot Instructions</CardTitle>
                <CardDescription className="font-inter">
                  Customize how the AI bot behaves and responds to patients over WhatsApp
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="font-manrope font-semibold">Bot Personality &amp; Instructions</Label>
                  <textarea
                    className="w-full min-h-[120px] p-3 border border-slate-300 rounded-lg font-inter text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={botInstructions}
                    onChange={(e) => setBotInstructions(e.target.value)}
                    placeholder="Example: You are a friendly medical receptionist at Dr. Sarah's clinic. Be warm, professional, and empathetic."
                    data-testid="bot-instructions-input"
                  />
                  <p className="text-xs text-slate-500">These instructions guide the AI bot's behavior when chatting with patients</p>
                </div>
                <Button onClick={saveBotInstructions} className="w-full bg-purple-600 hover:bg-purple-700" data-testid="save-bot-instructions-btn">
                  Save Bot Instructions
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── WHATSAPP TAB ────────────────────────────────────────────────── */}
          <TabsContent value="whatsapp" className="space-y-6 mt-4">
            <WhatsAppConnectCard />

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="font-manrope">Twilio WhatsApp Configuration</CardTitle>
                <CardDescription className="font-inter">Configure Twilio for legacy WhatsApp OTP and notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200 mb-4">
                  <p className="text-sm font-inter text-yellow-900">
                    <strong>Setup guide:</strong> Check <code className="bg-yellow-100 px-2 py-1 rounded">/TWILIO_INTEGRATION_GUIDE.md</code> for detailed instructions.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="font-manrope font-semibold">Twilio Account SID</Label>
                  <Input
                    type="text"
                    placeholder="AC..."
                    value={twilioConfig.twilio_account_sid}
                    onChange={(e) => setTwilioConfig({ ...twilioConfig, twilio_account_sid: e.target.value })}
                    data-testid="twilio-sid-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-manrope font-semibold">Twilio Auth Token</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={twilioConfig.twilio_auth_token}
                    onChange={(e) => setTwilioConfig({ ...twilioConfig, twilio_auth_token: e.target.value })}
                    data-testid="twilio-token-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-manrope font-semibold">WhatsApp Number</Label>
                  <Input
                    placeholder="whatsapp:+14155238886"
                    value={twilioConfig.whatsapp_number}
                    onChange={(e) => setTwilioConfig({ ...twilioConfig, whatsapp_number: e.target.value })}
                    data-testid="whatsapp-number-input"
                  />
                  <p className="text-xs text-slate-500">Include the 'whatsapp:' prefix</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── PAYMENTS TAB ────────────────────────────────────────────────── */}
          <TabsContent value="payments" className="space-y-6 mt-4">
            <GoogleReviewSettingCard />

            <PaymentGatewaySettingsCard />

            <ReviewLoopSettingsCard />

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
                      onChange={(e) => setPaymentFees({ ...paymentFees, consultation_fee: parseInt(e.target.value) })}
                      data-testid="consultation-fee-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-manrope font-semibold">Follow-up Fee (₹)</Label>
                    <Input
                      type="number"
                      value={paymentFees.followup_fee}
                      onChange={(e) => setPaymentFees({ ...paymentFees, followup_fee: parseInt(e.target.value) })}
                      data-testid="followup-fee-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-manrope font-semibold">Full Checkup Fee (₹)</Label>
                    <Input
                      type="number"
                      value={paymentFees.full_checkup_fee}
                      onChange={(e) => setPaymentFees({ ...paymentFees, full_checkup_fee: parseInt(e.target.value) })}
                      data-testid="checkup-fee-input"
                    />
                  </div>
                </div>
                <Button onClick={savePaymentFees} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="save-fees-btn">
                  Save Payment Fees
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="font-manrope">Razorpay Payment Configuration</CardTitle>
                <CardDescription className="font-inter">
                  Configure your Razorpay account to receive payments independently
                  {razorpayConfigured && (
                    <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                      Configured
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
                  <p className="text-sm font-inter text-blue-900">
                    <strong>How to get Razorpay keys:</strong><br />
                    Go to <a href="https://dashboard.razorpay.com/" target="_blank" rel="noopener noreferrer" className="underline">dashboard.razorpay.com</a> → Settings → API Keys
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="font-manrope font-semibold">Razorpay Key ID</Label>
                  <Input
                    type="text"
                    placeholder="rzp_test_..."
                    value={razorpayConfig.razorpay_key_id}
                    onChange={(e) => setRazorpayConfig({ ...razorpayConfig, razorpay_key_id: e.target.value })}
                    data-testid="razorpay-key-id-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-manrope font-semibold">Razorpay Key Secret</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={razorpayConfig.razorpay_key_secret}
                    onChange={(e) => setRazorpayConfig({ ...razorpayConfig, razorpay_key_secret: e.target.value })}
                    data-testid="razorpay-key-secret-input"
                  />
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
                      Razorpay configured! You can now accept payments via cards, net banking, and wallets.
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
                <CardDescription className="font-inter">Choose how your patients can pay you for consultations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
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
                       paymentMethod === 'both' ? 'UPI + Razorpay' : 'Not Configured'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="font-manrope font-semibold">Your UPI ID</Label>
                  <Input
                    type="text"
                    placeholder="yourname@upi (e.g., doctor@paytm)"
                    value={upiId}
                    onChange={(e) => {
                      setUpiId(e.target.value);
                      if (e.target.value && paymentMethod === 'none') setPaymentMethod('upi');
                      else if (e.target.value && paymentMethod === 'razorpay') setPaymentMethod('both');
                    }}
                    className="font-mono"
                  />
                </div>
                <Button
                  onClick={savePatientPaymentSetup}
                  disabled={loading || (!upiId && !razorpayConfigured)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                >
                  {loading ? 'Saving...' : 'Save Patient Payment Setup'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
