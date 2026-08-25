import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/Layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Facebook, CheckCircle2, AlertTriangle, Copy, ExternalLink,
  Send, Loader2, Save, Info, Shield, Building2,
  RefreshCw, Zap, XCircle, Clock, HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// ── helpers ────────────────────────────────────────────────────────────────────
const SYSTEM_TEMPLATES = [
  'appointment_confirmation_v1',
  'appointment_reminder_v1',
  'prescription_ready_v1',
  'payment_link_v1',
];

const STATUS_STYLE = {
  APPROVED:      { cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  PENDING:       { cls: 'bg-amber-100  text-amber-700',   icon: Clock },
  IN_APPEAL:     { cls: 'bg-blue-100   text-blue-700',    icon: Clock },
  REJECTED:      { cls: 'bg-red-100    text-red-700',     icon: XCircle },
  NOT_SUBMITTED: { cls: 'bg-slate-100  text-slate-500',   icon: HelpCircle },
  UNKNOWN:       { cls: 'bg-slate-100  text-slate-400',   icon: HelpCircle },
  API_ERROR:     { cls: 'bg-red-50     text-red-400',     icon: AlertTriangle },
  ERROR:         { cls: 'bg-red-50     text-red-400',     icon: AlertTriangle },
};

const TemplateBadge = ({ status }) => {
  const cfg = STATUS_STYLE[status] || STATUS_STYLE.UNKNOWN;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      <Icon className="h-3 w-3" />{status}
    </span>
  );
};

const Field = ({ label, id, value, onChange, type = 'text', placeholder, hint, suffix }) => (
  <div>
    <Label htmlFor={id} className="text-slate-700">{label}</Label>
    <div className="flex gap-2 mt-1">
      <Input id={id} type={type} value={value} onChange={onChange}
        placeholder={placeholder} data-testid={id} className="flex-1" />
      {suffix}
    </div>
    {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────
const AdminWhatsAppConfig = () => {
  const [cfg, setCfg] = useState({
    app_id: '', config_id: '', waba_id: '', phone_number_id: '',
    webhook_verify_token: 'lumera-verify-2026',
    app_secret: '', system_user_token: '',
    has_app_secret: false, has_system_user_token: false,
    configured: false, webhook_url: '',
  });
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);

  // Webhook test state
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null); // null | {ok, status, body}

  // Template status state
  const [tplStatus,      setTplStatus]      = useState(null); // null = not loaded
  const [tplLoading,     setTplLoading]     = useState(false);

  // ── loaders ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/whatsapp-config`);
      setCfg(prev => ({ ...prev, ...res.data, app_secret: '', system_user_token: '' }));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load config');
    } finally { setLoading(false); }
  }, []);

  const loadTemplateStatus = useCallback(async () => {
    setTplLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/whatsapp-templates-status`);
      setTplStatus(res.data);
    } catch (e) {
      toast.error('Could not fetch template statuses');
    } finally { setTplLoading(false); }
  }, []);

  useEffect(() => { load(); loadTemplateStatus(); }, [load, loadTemplateStatus]);

  // ── handlers ─────────────────────────────────────────────────────────────────
  const set = (k) => (e) => setCfg(prev => ({ ...prev, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      for (const k of ['app_id', 'config_id', 'waba_id', 'phone_number_id', 'webhook_verify_token']) {
        if (cfg[k] !== undefined) payload[k] = cfg[k];
      }
      if (cfg.app_secret)        payload.app_secret = cfg.app_secret;
      if (cfg.system_user_token) payload.system_user_token = cfg.system_user_token;
      await axios.put(`${API_URL}/admin/whatsapp-config`, payload);
      toast.success('Configuration saved.');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const copyWebhook = async () => {
    const url = webhookUrl;
    try { await navigator.clipboard.writeText(url); toast.success('Webhook URL copied'); }
    catch { toast.info(url); }
  };

  const testWebhook = async () => {
    setTesting(true);
    setTestResult(null);
    const token = cfg.webhook_verify_token || 'lumera-verify-2026';
    const challenge = `lumera_diag_${Date.now()}`;
    const url = `${API_URL}/meta-whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=${challenge}`;
    try {
      const res = await fetch(url);
      const body = await res.text();
      const ok = res.status === 200 && body.trim() === challenge;
      setTestResult({ ok, status: res.status, body: body.trim().slice(0, 80) });
      if (ok) toast.success('Webhook test passed — server returned HTTP 200 with challenge echo.');
      else     toast.error(`Webhook test failed — HTTP ${res.status}: ${body.slice(0, 60)}`);
    } catch (err) {
      setTestResult({ ok: false, status: 0, body: err.message });
      toast.error(`Network error: ${err.message}`);
    } finally { setTesting(false); }
  };

  const publishTemplates = async () => {
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await axios.post(`${API_URL}/meta-whatsapp/templates/publish`);
      setPublishResult(res.data);
      const { summary } = res.data;
      if (summary.failed > 0)      toast.error(`${summary.failed} template(s) failed.`);
      else if (summary.submitted > 0) toast.success(`${summary.submitted} template(s) submitted for review.`);
      else                           toast.info('All templates already exist.');
      loadTemplateStatus();
    } catch (e) { toast.error(e.response?.data?.detail || 'Publish failed');
    } finally { setPublishing(false); }
  };

  // ── render ────────────────────────────────────────────────────────────────────
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

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-manrope font-bold text-3xl text-slate-900 mb-1">
              Meta WhatsApp Business
            </h1>
            <p className="text-slate-500 text-sm">
              Multi-tenant tech-provider configuration — platform credentials and client tenant defaults.
            </p>
          </div>
          <Badge
            className={cfg.configured ? 'bg-emerald-600 text-white' : ''}
            variant={cfg.configured ? 'default' : 'secondary'}
            data-testid="meta-status-badge"
          >
            {cfg.configured
              ? <><CheckCircle2 className="h-3 w-3 mr-1 inline" />Connected</>
              : <><AlertTriangle className="h-3 w-3 mr-1 inline" />Not configured</>}
          </Badge>
        </div>

        {/* ── SECTION 1 · Webhook & Diagnostics ── */}
        <Card className="border-blue-200 bg-blue-50/60" data-testid="webhook-diagnostics-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600" />
              Webhook Endpoint &amp; Diagnostics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* URL */}
            <div>
              <Label className="text-slate-600 text-xs uppercase tracking-wide mb-1 block">
                Callback URL — paste into Meta App → WhatsApp → Configuration
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-blue-900 text-sm break-all font-mono bg-white border border-blue-200 rounded px-3 py-2"
                  data-testid="webhook-url-display">
                  {webhookUrl}
                </code>
                <Button variant="ghost" size="sm" onClick={copyWebhook}
                  className="text-blue-700 hover:bg-blue-100 shrink-0" data-testid="copy-webhook-btn">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Verify token display */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-500">Active verify token:</span>
              <code className="font-mono bg-white border border-blue-200 text-blue-800 px-2 py-0.5 rounded text-xs"
                data-testid="active-verify-token">
                {cfg.webhook_verify_token || 'lumera-verify-2026'}
              </code>
            </div>

            <Separator className="bg-blue-200" />

            {/* Diagnostic test */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={testWebhook}
                disabled={testing}
                className="border-blue-400 text-blue-700 hover:bg-blue-100"
                data-testid="test-webhook-btn"
              >
                {testing
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Testing…</>
                  : <><Zap className="h-4 w-4 mr-1.5" />Test Webhook Endpoint</>}
              </Button>
              <span className="text-xs text-slate-400">
                Sends a live GET verification request and checks for HTTP 200 + challenge echo.
              </span>
            </div>

            {testResult && (
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm
                ${testResult.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}
                data-testid="webhook-test-result">
                {testResult.ok
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  : <XCircle      className="h-4 w-4 text-red-500     mt-0.5 shrink-0" />}
                <div>
                  <p className={`font-medium ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {testResult.ok ? 'HTTP 200 — Webhook is live and responding correctly' : `HTTP ${testResult.status} — Verification failed`}
                  </p>
                  {!testResult.ok && (
                    <p className="text-xs text-red-500 mt-0.5 font-mono">{testResult.body}</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── SECTION 2 · Platform Credentials ── */}
        <Card className="border-slate-200" data-testid="platform-credentials-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-indigo-600" />
              Platform Credentials
            </CardTitle>
            <CardDescription>
              These belong to the <strong>Lumera platform app</strong> registered in Meta App Dashboard.
              Used for embedded signup OAuth and global webhook verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => window.open('https://developers.facebook.com/apps', '_blank', 'noopener')}
              className="bg-[#1877F2] hover:bg-[#1465d6] h-8 text-sm"
              data-testid="open-meta-developers-btn"
            >
              <Facebook className="h-4 w-4 mr-2" />Open Meta for Developers
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="App ID" id="meta-app-id" value={cfg.app_id} onChange={set('app_id')}
                placeholder="1234567890" />
              <Field
                label={<>App Secret {cfg.has_app_secret && <Badge variant="secondary" className="ml-1 text-[10px]">saved</Badge>}</>}
                id="meta-app-secret" type="password" value={cfg.app_secret} onChange={set('app_secret')}
                placeholder="Leave blank to keep existing" />
              <Field label="Facebook Login Config ID" id="meta-config-id" value={cfg.config_id} onChange={set('config_id')}
                placeholder="Config ID for Embedded Signup"
                hint="Meta App → Facebook Login → Configurations" />
              <Field label="Global Verify Token" id="meta-verify-token"
                value={cfg.webhook_verify_token} onChange={set('webhook_verify_token')}
                placeholder="lumera-verify-2026"
                hint="Must match exactly what Meta App Dashboard has" />
            </div>

            <Button onClick={save} disabled={saving} data-testid="save-platform-credentials-btn"
              className="bg-indigo-600 hover:bg-indigo-700">
              <Save className="h-4 w-4 mr-2" />{saving ? 'Saving…' : 'Save Platform Credentials'}
            </Button>
          </CardContent>
        </Card>

        {/* ── SECTION 3 · Client Tenant Defaults ── */}
        <Card className="border-slate-200" data-testid="client-tenant-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-purple-600" />
              Client Tenant Defaults
            </CardTitle>
            <CardDescription>
              The <strong>platform's own WhatsApp Business Account</strong> used for sending system-level
              messages and publishing shared templates. Per-tenant WABAs are stored on each user's profile
              after embedded signup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => window.open('https://business.facebook.com/settings/whatsapp-business-accounts', '_blank', 'noopener')}
              className="bg-[#25D366] hover:bg-[#20bb59] h-8 text-sm text-white"
              data-testid="open-meta-business-btn"
            >
              <Facebook className="h-4 w-4 mr-2" />Open Meta Business Manager
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="WABA ID (WhatsApp Business Account ID)"
                id="meta-waba-id" value={cfg.waba_id} onChange={set('waba_id')}
                placeholder="1234567890" />
              <Field label="Phone Number ID" id="meta-phone-id"
                value={cfg.phone_number_id} onChange={set('phone_number_id')}
                placeholder="1234567890" />
              <div className="md:col-span-2">
                <Field
                  label={<>System User Access Token {cfg.has_system_user_token && <Badge variant="secondary" className="ml-1 text-[10px]">saved</Badge>}</>}
                  id="meta-system-token" type="password" value={cfg.system_user_token} onChange={set('system_user_token')}
                  placeholder="EAAG… (leave blank to keep existing)"
                  hint="Used for template submission and platform-level messaging" />
              </div>
            </div>

            <Button onClick={save} disabled={saving} data-testid="save-tenant-credentials-btn"
              className="bg-purple-600 hover:bg-purple-700">
              <Save className="h-4 w-4 mr-2" />{saving ? 'Saving…' : 'Save Tenant Credentials'}
            </Button>
          </CardContent>
        </Card>

        {/* ── SECTION 4 · System Template Approval Status ── */}
        <Card className="border-slate-200" data-testid="template-status-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">System Template Approval Status</CardTitle>
                <CardDescription className="mt-1">
                  Real-time approval state of the 4 platform utility templates from Meta.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={loadTemplateStatus} disabled={tplLoading}
                  data-testid="refresh-template-status-btn">
                  <RefreshCw className={`h-4 w-4 mr-1.5 ${tplLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={publishTemplates}
                  disabled={publishing || !cfg.configured}
                  className="border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                  data-testid="publish-templates-btn">
                  {publishing
                    ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Publishing…</>
                    : <><Send className="h-4 w-4 mr-1.5" />Publish / Resubmit</>}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {tplLoading && !tplStatus ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm" data-testid="template-status-table">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-600 text-xs">Template Name</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-600 text-xs">Status</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-600 text-xs">Category</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-600 text-xs">Language</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(tplStatus || SYSTEM_TEMPLATES.map(n => ({ name: n, status: 'UNKNOWN' }))).map(t => (
                      <tr key={t.name} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-700" data-testid={`tpl-name-${t.name}`}>
                          {t.name}
                        </td>
                        <td className="px-4 py-3" data-testid={`tpl-status-${t.name}`}>
                          <TemplateBadge status={t.status} />
                          {t.rejected_reason && (
                            <p className="text-[10px] text-red-500 mt-0.5">{t.rejected_reason}</p>
                          )}
                          {t.error && (
                            <p className="text-[10px] text-slate-400 mt-0.5">{t.error}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{t.category || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{t.language || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {publishResult && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2"
                data-testid="publish-result">
                <div className="flex gap-4 text-xs">
                  <span className="text-emerald-700">✓ Submitted: <strong>{publishResult.summary.submitted}</strong></span>
                  <span className="text-slate-500">↺ Exists: <strong>{publishResult.summary.already_exists}</strong></span>
                  <span className="text-rose-700">✗ Failed: <strong>{publishResult.summary.failed}</strong></span>
                </div>
                <ul className="text-xs font-mono text-slate-600 space-y-0.5">
                  {publishResult.results.map(r => (
                    <li key={r.name}>
                      <span className={r.status === 'submitted' ? 'text-emerald-700' : r.status === 'already_exists' ? 'text-slate-400' : 'text-rose-600'}>
                        {r.status === 'submitted' ? '✓' : r.status === 'already_exists' ? '↺' : '✗'}
                      </span>{' '}
                      {r.name} — {r.status}
                      {r.error && <span className="text-rose-500"> ({r.error})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-slate-400 mt-3">
              Requires WABA ID + System User Token saved above. Status syncs live from Meta — approval takes 1–24 hours.
            </p>
          </CardContent>
        </Card>

      </div>
    </AdminLayout>
  );
};

export default AdminWhatsAppConfig;
