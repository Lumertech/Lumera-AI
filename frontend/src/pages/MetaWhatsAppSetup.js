import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Facebook, CheckCircle2, AlertTriangle, Copy, ExternalLink, Send, Loader2 } from 'lucide-react';
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
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);

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

  const publishTemplates = async () => {
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await axios.post(`${API_URL}/meta-whatsapp/templates/publish`);
      setPublishResult(res.data);
      const { summary } = res.data;
      if (summary.failed > 0) {
        toast.error(`${summary.failed} template(s) failed. Check details below.`);
      } else if (summary.submitted > 0) {
        toast.success(`${summary.submitted} template(s) submitted for review.`);
      } else {
        toast.info('All templates already exist — nothing to publish.');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Publish failed');
    } finally {
      setPublishing(false);
    }
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

        <div className="border-t pt-4 space-y-3">
          <div>
            <div className="font-manrope font-semibold text-slate-900">Publish Lumera utility templates</div>
            <p className="text-xs text-slate-600 mt-1">
              One-click publish of the 4 pre-baked utility templates
              (<code>appointment_confirmation_v1</code>, <code>appointment_reminder_v1</code>,
              <code>prescription_ready_v1</code>, <code>payment_link_v1</code>) to Meta for
              review. Idempotent — templates that already exist are skipped.
              Requires WABA ID + System User Token saved above.
            </p>
          </div>
          <Button
            onClick={publishTemplates}
            disabled={publishing || !cfg.configured}
            variant="outline"
            className="border-emerald-500 text-emerald-700 hover:bg-emerald-50"
            data-testid="meta-publish-templates-btn"
          >
            {publishing
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Publishing…</>
              : <><Send className="h-4 w-4 mr-2" /> Publish 4 utility templates</>}
          </Button>

          {publishResult && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm" data-testid="publish-templates-result">
              <div className="flex gap-4 text-xs">
                <span className="text-emerald-700">✓ Submitted: <strong>{publishResult.summary.submitted}</strong></span>
                <span className="text-slate-600">↺ Already exists: <strong>{publishResult.summary.already_exists}</strong></span>
                <span className="text-rose-700">✗ Failed: <strong>{publishResult.summary.failed}</strong></span>
              </div>
              <ul className="text-xs text-slate-700 space-y-1">
                {publishResult.results.map((r) => (
                  <li key={r.name} className="font-mono">
                    <span className={r.status === 'submitted' ? 'text-emerald-700' : r.status === 'already_exists' ? 'text-slate-500' : 'text-rose-700'}>
                      {r.status === 'submitted' ? '✓' : r.status === 'already_exists' ? '↺' : '✗'}
                    </span>{' '}
                    {r.name} — {r.status}
                    {r.error ? <span className="text-rose-600"> ({r.error})</span> : null}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-600">
                Templates are PENDING Meta review. Approval typically takes 1–24 hours.
                Track in Meta Business Manager → WhatsApp Manager → Message Templates.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MetaWhatsAppSetup;
