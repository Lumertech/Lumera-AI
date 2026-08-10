import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Loader2, QrCode, Wallet, Banknote, KeyRound, ExternalLink } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const PROVIDER_LABEL = {
  razorpay: 'Razorpay',
  phonepe: 'PhonePe Business',
  paytm: 'Paytm for Business',
  cashfree: 'Cashfree Payments',
  payu: 'PayU India',
  stripe: 'Stripe',
  airpay: 'Airpay / SabPaisa',
};

const FIELD_LABEL = {
  key_id: 'Key ID',
  key_secret: 'Key Secret',
  merchant_id: 'Merchant ID',
  salt_key: 'Salt Key / API Key',
  salt_index: 'Salt Index',
  merchant_key: 'Merchant Key',
  website: 'Website Name',
  app_id: 'App ID',
  secret_key: 'Secret Key',
  merchant_salt: 'Merchant Salt',
  publishable_key: 'Publishable Key',
  api_key: 'API Key',
  encryption_key: 'Encryption Key',
};

// Fields that must never be pre-filled from the server (they come masked)
const SECRET_KEYS = new Set(['key_secret', 'salt_key', 'merchant_key', 'secret_key', 'merchant_salt', 'api_key', 'encryption_key']);

const PaymentGatewaySettingsCard = () => {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [method, setMethod] = useState('upi');
  const [upiId, setUpiId] = useState('');
  const [upiName, setUpiName] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('razorpay');
  const [creds, setCreds] = useState({});
  const [saving, setSaving] = useState(false);
  const [qrPreview, setQrPreview] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([
          axios.get(`${API_URL}/settings/payment/providers`),
          axios.get(`${API_URL}/settings/payment`),
        ]);
        setProviders(p.data.providers || []);
        setSettings(s.data);
        setMethod(s.data.method || 'upi');
        setUpiId(s.data.upi?.upi_id || '');
        setUpiName(s.data.upi?.display_name || '');
        if (s.data.gateway?.provider) {
          setSelectedProvider(s.data.gateway.provider);
          // Don't prefill masked secrets — but show non-secret fields
          const initCreds = {};
          Object.entries(s.data.gateway.credentials || {}).forEach(([k, v]) => {
            if (!SECRET_KEYS.has(k)) initCreds[k] = v;
          });
          setCreds(initCreds);
        }
      } catch (e) {
        toast.error('Could not load payment settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveMethod = async (nextMethod) => {
    setMethod(nextMethod);
    try {
      await axios.put(`${API_URL}/settings/payment/method`, { method: nextMethod });
      toast.success(`Active method: ${nextMethod.toUpperCase()}`);
    } catch (e) {
      toast.error('Could not switch method');
    }
  };

  const saveUpi = async () => {
    if (!upiId.trim()) return toast.error('Enter your UPI ID');
    setSaving(true);
    try {
      await axios.put(`${API_URL}/settings/payment/upi`, {
        upi_id: upiId.trim(),
        display_name: upiName.trim() || null,
      });
      toast.success('UPI VPA saved');
      const s = await axios.get(`${API_URL}/settings/payment`);
      setSettings(s.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not save UPI');
    } finally {
      setSaving(false);
    }
  };


  const verifyUpi = async () => {
    try {
      const r = await axios.post(`${API_URL}/settings/payment/verify-upi`);
      if (r.data.valid) toast.success(r.data.note || 'UPI verified');
      else toast.error(r.data.reason || 'UPI check failed');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Verify failed');
    }
  };

  const verifyGateway = async () => {
    try {
      const r = await axios.post(`${API_URL}/settings/payment/verify-gateway`);
      if (r.data.valid) toast.success(r.data.note || `${r.data.provider} verified`);
      else toast.error(r.data.reason || 'Gateway check failed');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Verify failed');
    }
  };

  const previewQr = async () => {
    if (!upiId.trim()) return toast.error('Save your UPI ID first');
    try {
      const res = await axios.post(`${API_URL}/payments/upi/intent`, {
        amount: 500,
        note: 'Preview',
      });
      setQrPreview(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not generate QR');
    }
  };

  const saveGateway = async () => {
    const providerDef = providers.find((p) => p.id === selectedProvider);
    const missing = providerDef.fields.filter((f) => !creds[f] || !String(creds[f]).trim());
    if (missing.length) return toast.error(`Missing: ${missing.join(', ')}`);
    setSaving(true);
    try {
      await axios.put(`${API_URL}/settings/payment/gateway`, {
        provider: selectedProvider,
        credentials: creds,
      });
      toast.success(`${PROVIDER_LABEL[selectedProvider]} credentials saved`);
      const s = await axios.get(`${API_URL}/settings/payment`);
      setSettings(s.data);
      // Clear the just-saved secret inputs so masked values dominate
      const clean = {};
      Object.entries(creds).forEach(([k, v]) => { if (!SECRET_KEYS.has(k)) clean[k] = v; });
      setCreds(clean);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not save gateway');
    } finally {
      setSaving(false);
    }
  };

  const disconnectGateway = async () => {
    if (!window.confirm('Remove gateway credentials?')) return;
    try {
      await axios.delete(`${API_URL}/settings/payment/gateway`);
      toast.success('Gateway disconnected');
      const s = await axios.get(`${API_URL}/settings/payment`);
      setSettings(s.data);
      setCreds({});
    } catch (e) {
      toast.error('Could not disconnect');
    }
  };

  if (loading) return (
    <Card className="border-slate-200"><CardContent className="p-8 text-center">
      <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-600" />
    </CardContent></Card>
  );

  const providerDef = providers.find((p) => p.id === selectedProvider);

  return (
    <Card className="border-slate-200" data-testid="payment-gateway-settings-card">
      <CardHeader>
        <CardTitle className="font-manrope flex items-center gap-2">
          <Wallet className="h-5 w-5 text-emerald-600" /> Payment &amp; Gateway Settings
        </CardTitle>
        <CardDescription className="font-inter">
          Choose how you want to collect payments from patients. Pick UPI for zero fees,
          a payment gateway for automation, or plain cash at the counter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Method picker */}
        <RadioGroup value={method} onValueChange={saveMethod} className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="method-picker">
          <label className={`flex items-start gap-3 rounded-lg border-2 p-4 cursor-pointer ${method === 'upi' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
            <RadioGroupItem value="upi" id="m-upi" className="mt-1" />
            <div>
              <div className="font-manrope font-semibold flex items-center gap-2">
                <QrCode className="h-4 w-4" /> UPI VPA
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">0% fees</Badge>
              </div>
              <p className="text-xs text-slate-600 mt-1">Simplest. Dynamic QR + upi:// link on every invoice.</p>
            </div>
          </label>
          <label className={`flex items-start gap-3 rounded-lg border-2 p-4 cursor-pointer ${method === 'gateway' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
            <RadioGroupItem value="gateway" id="m-gw" className="mt-1" />
            <div>
              <div className="font-manrope font-semibold flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Payment Gateway
              </div>
              <p className="text-xs text-slate-600 mt-1">Razorpay, PhonePe, Paytm, Cashfree, PayU, Stripe, Airpay.</p>
            </div>
          </label>
          <label className={`flex items-start gap-3 rounded-lg border-2 p-4 cursor-pointer ${method === 'cash' ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}>
            <RadioGroupItem value="cash" id="m-cash" className="mt-1" />
            <div>
              <div className="font-manrope font-semibold flex items-center gap-2">
                <Banknote className="h-4 w-4" /> Counter Cash
              </div>
              <p className="text-xs text-slate-600 mt-1">Front desk marks invoices as Paid (Cash). Optional WhatsApp receipt.</p>
            </div>
          </label>
        </RadioGroup>

        {/* Option A: UPI */}
        {method === 'upi' && (
          <div className="border rounded-lg p-4 space-y-3 bg-slate-50" data-testid="upi-panel">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="upi-id">UPI ID (VPA) *</Label>
                <Input id="upi-id" placeholder="drsmith@okaxis" value={upiId} onChange={(e) => setUpiId(e.target.value)} data-testid="upi-id-input" />
              </div>
              <div>
                <Label htmlFor="upi-name">Display Name (shown to payer)</Label>
                <Input id="upi-name" placeholder="Dr Smith Clinic" value={upiName} onChange={(e) => setUpiName(e.target.value)} data-testid="upi-name-input" />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={saveUpi} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="upi-save-btn">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : 'Save UPI'}
              </Button>
              <Button variant="outline" onClick={previewQr} data-testid="upi-preview-qr-btn">
                <QrCode className="h-4 w-4 mr-2" /> Preview QR (₹500)
              </Button>
              <Button variant="outline" onClick={verifyUpi} data-testid="upi-verify-btn" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
                Verify UPI
              </Button>
            </div>
            {qrPreview && (
              <div className="mt-3 flex flex-col md:flex-row gap-4 items-center bg-white rounded-lg p-4 border" data-testid="qr-preview">
                <img src={qrPreview.qr_png_data_url} alt="UPI QR" className="w-40 h-40" />
                <div className="text-xs space-y-1 font-mono break-all">
                  <div><strong>VPA:</strong> {qrPreview.vpa}</div>
                  <div><strong>Payee:</strong> {qrPreview.display_name}</div>
                  <div className="text-slate-500"><strong>Intent:</strong> {qrPreview.upi_intent}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Option B: Payment Gateway */}
        {method === 'gateway' && (
          <div className="border rounded-lg p-4 space-y-4 bg-slate-50" data-testid="gateway-panel">
            <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
              <strong>Turnkey OAuth Connect</strong> for Razorpay Connect and Stripe Connect is coming soon (requires our Solution Partner approval).
              For now, paste your existing gateway&apos;s API credentials below — Lumera stores secrets encrypted with Fernet and only shows masked previews.
            </div>

            <div>
              <Label>Provider</Label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger data-testid="gateway-provider-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{PROVIDER_LABEL[p.id] || p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {providerDef && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {providerDef.fields.map((f) => {
                  const isSecret = SECRET_KEYS.has(f);
                  const savedMasked = settings?.gateway?.credentials?.[f];
                  return (
                    <div key={f}>
                      <Label htmlFor={`cred-${f}`}>{FIELD_LABEL[f] || f}</Label>
                      <Input
                        id={`cred-${f}`}
                        type={isSecret ? 'password' : 'text'}
                        placeholder={isSecret && savedMasked ? `Saved: ${savedMasked}` : ''}
                        value={creds[f] || ''}
                        onChange={(e) => setCreds({ ...creds, [f]: e.target.value })}
                        data-testid={`gateway-field-${f}`}
                      />
                      {isSecret && savedMasked && !creds[f] && (
                        <p className="text-xs text-slate-500 mt-1">Leave blank to keep the existing value.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={saveGateway} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="gateway-save-btn">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : 'Save credentials'}
              </Button>
              {settings?.gateway?.provider && (
                <Button variant="outline" onClick={verifyGateway} className="border-indigo-300 text-indigo-700 hover:bg-indigo-50" data-testid="gateway-verify-btn">
                  Verify Connection
                </Button>
              )}
              {settings?.gateway?.provider && (
                <Button variant="outline" onClick={disconnectGateway} className="text-rose-600" data-testid="gateway-disconnect-btn">
                  Disconnect
                </Button>
              )}
              {providerDef && (
                <a
                  href={providerDef.id === 'razorpay' ? 'https://dashboard.razorpay.com/app/keys' :
                        providerDef.id === 'stripe'   ? 'https://dashboard.stripe.com/apikeys' :
                        providerDef.id === 'phonepe'  ? 'https://business.phonepe.com/' :
                        providerDef.id === 'paytm'    ? 'https://business.paytm.com/' :
                        providerDef.id === 'cashfree' ? 'https://merchant.cashfree.com/merchants/login' :
                        providerDef.id === 'payu'     ? 'https://onboarding.payu.in/' :
                        'https://airpay.co.in/'}
                  target="_blank" rel="noreferrer"
                  className="text-xs text-indigo-600 hover:underline flex items-center self-center ml-2"
                >
                  Get keys <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Option C: Cash */}
        {method === 'cash' && (
          <div className="border rounded-lg p-4 bg-amber-50 text-sm text-amber-900" data-testid="cash-panel">
            Cash mode is active. Any user with billing access can mark an invoice as Paid (Cash)
            from the invoice page. Enable &ldquo;Send WhatsApp receipt&rdquo; to automatically message the patient
            a payment confirmation.
          </div>
        )}

      </CardContent>
    </Card>
  );
};

export default PaymentGatewaySettingsCard;
