import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Facebook, CheckCircle2, AlertTriangle, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const MetaWhatsAppSetup = () => {
  const [cfg, setCfg] = useState({
    app_id: '', waba_id: '', phone_number_id: '', webhook_verify_token: '',
    app_secret: '', system_user_token: '', has_app_secret: false, has_system_user_token: false,
    configured: false, webhook_url: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await axios.get(`${API_URL}/meta-whatsapp/config`);
      setCfg((prev) => ({ ...prev, ...res.data, app_secret: '', system_user_token: '' }));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      ['app_id', 'waba_id', 'phone_number_id', 'webhook_verify_token'].forEach((k) => {
        if (cfg[k]) payload[k] = cfg[k];
      });
      if (cfg.app_secret) payload.app_secret = cfg.app_secret;
      if (cfg.system_user_token) payload.system_user_token = cfg.system_user_token;
      await axios.put(`${API_URL}/meta-whatsapp/config`, payload);
      toast.success('Meta WhatsApp saved');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const copyWebhook = async () => {
    if (!cfg.webhook_url) return;
    const full = cfg.webhook_url.startsWith('http') ? cfg.webhook_url : window.location.origin + cfg.webhook_url;
    try { await navigator.clipboard.writeText(full); toast.success('Webhook URL copied'); }
    catch { toast.info(full); }
  };

  const startEmbeddedSignup = () => {
    // Meta Embedded Signup — real integration requires a public App ID + Tech Partner status.
    // For now we open Meta's Business Manager where the doctor can generate creds manually
    // and we surface the fields below to paste them.
    window.open('https://business.facebook.com/settings/whatsapp-business-accounts', '_blank', 'noopener');
  };

  if (loading) return null;

  return (
    <Card className="border-slate-200" data-testid="meta-whatsapp-setup">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              <Facebook className="h-5 w-5 mr-2 text-[#1877F2]" />
              Meta WhatsApp Business
            </CardTitle>
            <CardDescription>
              Connect your Facebook Business Manager to send Meta-native quick-reply messages.
            </CardDescription>
          </div>
          <Badge
            variant={cfg.configured ? 'default' : 'secondary'}
            className={cfg.configured ? 'bg-emerald-600' : ''}
            data-testid="meta-status-badge"
          >
            {cfg.configured
              ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</>
              : <><AlertTriangle className="h-3 w-3 mr-1" /> Not configured</>}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <Button
          onClick={startEmbeddedSignup}
          className="bg-[#1877F2] hover:bg-[#1465d6]"
          data-testid="meta-embedded-signup-btn"
        >
          <Facebook className="h-4 w-4 mr-2" /> Connect Facebook Business
          <ExternalLink className="h-3 w-3 ml-2" />
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>App ID</Label>
            <Input value={cfg.app_id} onChange={set('app_id')} placeholder="1234567890" data-testid="meta-app-id" />
          </div>
          <div>
            <Label>WABA ID</Label>
            <Input value={cfg.waba_id} onChange={set('waba_id')} placeholder="1234567890" data-testid="meta-waba-id" />
          </div>
          <div>
            <Label>Phone Number ID</Label>
            <Input value={cfg.phone_number_id} onChange={set('phone_number_id')} placeholder="1234567890" data-testid="meta-phone-id" />
          </div>
          <div>
            <Label>Webhook Verify Token</Label>
            <Input value={cfg.webhook_verify_token} onChange={set('webhook_verify_token')} placeholder="lumera-verify-2026" data-testid="meta-verify-token" />
          </div>
          <div>
            <Label>App Secret {cfg.has_app_secret && <Badge variant="secondary" className="ml-1 text-[10px]">saved</Badge>}</Label>
            <Input type="password" value={cfg.app_secret} onChange={set('app_secret')} placeholder="•••" data-testid="meta-app-secret" />
          </div>
          <div>
            <Label>System User Access Token {cfg.has_system_user_token && <Badge variant="secondary" className="ml-1 text-[10px]">saved</Badge>}</Label>
            <Input type="password" value={cfg.system_user_token} onChange={set('system_user_token')} placeholder="EAAG…" data-testid="meta-user-token" />
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg text-xs">
          <div className="font-medium text-slate-700 mb-1 flex items-center justify-between">
            <span>Webhook URL (paste into Meta App → WhatsApp → Configuration)</span>
            <Button variant="ghost" size="sm" onClick={copyWebhook} data-testid="meta-copy-webhook"><Copy className="h-3 w-3 mr-1" /> Copy</Button>
          </div>
          <code className="text-slate-800 break-all">{cfg.webhook_url ? (cfg.webhook_url.startsWith('http') ? cfg.webhook_url : window.location.origin + cfg.webhook_url) : `${window.location.origin}/api/meta-whatsapp/webhook`}</code>
        </div>

        <Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="meta-save-btn">
          {saving ? 'Saving…' : 'Save Meta WhatsApp'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MetaWhatsAppSetup;
