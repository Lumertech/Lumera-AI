import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/Layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Facebook, CheckCircle2, AlertTriangle, Copy,
  ExternalLink, Send, Loader2, Save, Info,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AdminWhatsAppConfig = () => {
  const [cfg, setCfg] = useState({
    app_id: '', waba_id: '', phone_number_id: '',
    webhook_verify_token: 'lumera-verify-2026',
    app_secret: '', system_user_token: '',
    has_app_secret: false, has_system_user_token: false,
    configured: false, webhook_url: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);

  const load = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/whatsapp-config`);
      setCfg(prev => ({ ...prev, ...res.data, app_secret: '', system_user_token: '' }));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load config');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setCfg(prev => ({ ...prev, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      for (const k of ['app_id', 'waba_id', 'phone_number_id', 'webhook_verify_token']) {
        if (cfg[k] !== undefined) payload[k] = cfg[k];
      }
      if (cfg.app_secret) payload.app_secret = cfg.app_secret;
      if (cfg.system_user_token) payload.system_user_token = cfg.system_user_token;
      await axios.put(`${API_URL}/admin/whatsapp-config`, payload);
      toast.success('Global WhatsApp config saved — webhook verification updated.');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const copyWebhook = async () => {
    const url = cfg.webhook_url || `${window.location.origin}/api/meta-whatsapp/webhook`;
    try { await navigator.clipboard.writeText(url); toast.success('Webhook URL copied'); }
    catch { toast.info(url); }
  };

  const publishTemplates = async () => {
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await axios.post(`${API_URL}/meta-whatsapp/templates/publish`);
      setPublishResult(res.data);
      const { summary } = res.data;
      if (summary.failed > 0) toast.error(`${summary.failed} template(s) failed.`);
      else if (summary.submitted > 0) toast.success(`${summary.submitted} template(s) submitted for review.`);
      else toast.info('All templates already exist.');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Publish failed');
    } finally { setPublishing(false); }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  const webhookUrl = cfg.webhook_url || `${window.location.origin}/api/meta-whatsapp/webhook`;

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-manrope font-bold text-3xl text-slate-900 mb-1">
              Meta WhatsApp Business
            </h1>
            <p className="text-slate-500 text-sm">
              Global platform configuration — applies to all webhook verifications.
            </p>
          </div>
          <Badge
            variant={cfg.configured ? 'default' : 'secondary'}
            className={cfg.configured ? 'bg-emerald-600 text-white' : ''}
            data-testid="meta-status-badge"
          >
            {cfg.configured
              ? <><CheckCircle2 className="h-3 w-3 mr-1 inline" /> Connected</>
              : <><AlertTriangle className="h-3 w-3 mr-1 inline" /> Not configured</>}
          </Badge>
        </div>

        {/* Webhook URL box — most important, shown first */}
        <Card className="border-blue-200 bg-blue-50" data-testid="webhook-url-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                <Info className="h-4 w-4" />
                Webhook Callback URL — paste into Meta App → WhatsApp → Configuration
              </div>
              <Button variant="ghost" size="sm" onClick={copyWebhook}
                data-testid="copy-webhook-btn"
                className="text-blue-700 hover:bg-blue-100">
                <Copy className="h-3 w-3 mr-1" /> Copy
              </Button>
            </div>
            <code className="text-blue-900 text-sm break-all font-mono" data-testid="webhook-url-display">
              {webhookUrl}
            </code>
          </CardContent>
        </Card>

        {/* Credentials */}
        <Card className="border-slate-200" data-testid="meta-whatsapp-config-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Facebook className="h-5 w-5 text-[#1877F2]" />
              App Credentials
            </CardTitle>
            <CardDescription>
              Stored globally in the platform database — shared across all webhook verifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Button
              onClick={() => window.open('https://business.facebook.com/settings/whatsapp-business-accounts', '_blank', 'noopener')}
              className="bg-[#1877F2] hover:bg-[#1465d6]"
              data-testid="open-meta-business-btn"
            >
              <Facebook className="h-4 w-4 mr-2" /> Open Meta Business Manager
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="app_id">App ID</Label>
                <Input id="app_id" value={cfg.app_id} onChange={set('app_id')}
                  placeholder="1234567890" data-testid="meta-app-id" />
              </div>
              <div>
                <Label htmlFor="waba_id">WABA ID (WhatsApp Business Account ID)</Label>
                <Input id="waba_id" value={cfg.waba_id} onChange={set('waba_id')}
                  placeholder="1234567890" data-testid="meta-waba-id" />
              </div>
              <div>
                <Label htmlFor="phone_number_id">Phone Number ID</Label>
                <Input id="phone_number_id" value={cfg.phone_number_id} onChange={set('phone_number_id')}
                  placeholder="1234567890" data-testid="meta-phone-id" />
              </div>
              <div>
                <Label htmlFor="webhook_verify_token">Webhook Verify Token</Label>
                <Input id="webhook_verify_token" value={cfg.webhook_verify_token}
                  onChange={set('webhook_verify_token')}
                  placeholder="lumera-verify-2026" data-testid="meta-verify-token" />
                <p className="text-xs text-slate-400 mt-1">
                  Must match exactly what you enter in Meta App Dashboard
                </p>
              </div>
              <div>
                <Label htmlFor="app_secret">
                  App Secret{' '}
                  {cfg.has_app_secret && <Badge variant="secondary" className="ml-1 text-[10px]">saved</Badge>}
                </Label>
                <Input id="app_secret" type="password" value={cfg.app_secret}
                  onChange={set('app_secret')} placeholder="Leave blank to keep existing"
                  data-testid="meta-app-secret" />
              </div>
              <div>
                <Label htmlFor="system_user_token">
                  System User Access Token{' '}
                  {cfg.has_system_user_token && <Badge variant="secondary" className="ml-1 text-[10px]">saved</Badge>}
                </Label>
                <Input id="system_user_token" type="password" value={cfg.system_user_token}
                  onChange={set('system_user_token')} placeholder="EAAG… (leave blank to keep existing)"
                  data-testid="meta-system-token" />
              </div>
            </div>

            <Button onClick={save} disabled={saving} data-testid="save-whatsapp-config-btn"
              className="bg-indigo-600 hover:bg-indigo-700">
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving…' : 'Save Configuration'}
            </Button>
          </CardContent>
        </Card>

        {/* Publish Templates */}
        <Card className="border-slate-200" data-testid="publish-templates-card">
          <CardHeader>
            <CardTitle className="text-lg">Publish Utility Templates</CardTitle>
            <CardDescription>
              One-click publish of 4 pre-baked templates to Meta for review.
              Requires WABA ID + System User Token saved above.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 space-y-1">
              <p>Templates: <code>appointment_confirmation_v1</code>, <code>appointment_reminder_v1</code>,</p>
              <p><code>prescription_ready_v1</code>, <code>payment_link_v1</code></p>
              <p className="text-slate-400">Idempotent — already-existing templates are skipped. Approval takes 1–24 hours.</p>
            </div>
            <Button onClick={publishTemplates} disabled={publishing || !cfg.configured}
              variant="outline" className="border-emerald-500 text-emerald-700 hover:bg-emerald-50"
              data-testid="publish-templates-btn">
              {publishing
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Publishing…</>
                : <><Send className="h-4 w-4 mr-2" />Publish 4 Utility Templates</>}
            </Button>

            {publishResult && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm"
                data-testid="publish-result">
                <div className="flex gap-4 text-xs">
                  <span className="text-emerald-700">✓ Submitted: <strong>{publishResult.summary.submitted}</strong></span>
                  <span className="text-slate-600">↺ Exists: <strong>{publishResult.summary.already_exists}</strong></span>
                  <span className="text-rose-700">✗ Failed: <strong>{publishResult.summary.failed}</strong></span>
                </div>
                <ul className="text-xs text-slate-700 space-y-1 font-mono">
                  {publishResult.results.map(r => (
                    <li key={r.name}>
                      <span className={r.status === 'submitted' ? 'text-emerald-700' : r.status === 'already_exists' ? 'text-slate-500' : 'text-rose-700'}>
                        {r.status === 'submitted' ? '✓' : r.status === 'already_exists' ? '↺' : '✗'}
                      </span>{' '}
                      {r.name} — {r.status}
                      {r.error ? <span className="text-rose-600"> ({r.error})</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminWhatsAppConfig;
