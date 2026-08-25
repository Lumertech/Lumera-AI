import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Trash2, RefreshCw, AlertTriangle, CheckCircle2, Clock, XCircle, Tag } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const STATUS_CONFIG = {
  APPROVED: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  PENDING:  { label: 'Pending',  color: 'bg-amber-100 text-amber-700',   icon: Clock },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700',       icon: XCircle },
  IN_APPEAL: { label: 'In Appeal', color: 'bg-blue-100 text-blue-700',   icon: AlertTriangle },
};

const VARIABLE_HINT = '{{1}}, {{2}}, … — numbered variables substituted at send time.';

const TemplateStatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['PENDING'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <cfg.icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
};

const CreateTemplateDialog = ({ onCreated }) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', category: 'UTILITY', language: 'en_US',
    header_text: '', body_text: '', footer_text: '',
  });

  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: typeof e === 'string' ? e : e.target.value }));

  const insertVar = (field, idx) => {
    setForm(prev => ({ ...prev, [field]: prev[field] + `{{${idx}}}` }));
  };

  const buildComponents = () => {
    const cs = [];
    if (form.header_text) cs.push({ type: 'HEADER', format: 'TEXT', text: form.header_text });
    if (form.body_text) cs.push({ type: 'BODY', text: form.body_text });
    if (form.footer_text) cs.push({ type: 'FOOTER', text: form.footer_text });
    return cs;
  };

  const submit = async () => {
    if (!form.name.trim() || !form.body_text.trim()) {
      toast.error('Template name and body are required.'); return;
    }
    setSaving(true);
    try {
      const res = await axios.post(`${API_URL}/whatsapp/templates`, {
        name: form.name.trim(),
        category: form.category,
        language: form.language,
        components: buildComponents(),
      });
      toast.success(`Template "${res.data.name}" submitted for review.`);
      onCreated(res.data);
      setOpen(false);
      setForm({ name: '', category: 'UTILITY', language: 'en_US', header_text: '', body_text: '', footer_text: '' });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create template');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="create-template-btn" className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="h-4 w-4 mr-1.5" />New Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create WhatsApp Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 sm:col-span-1">
              <Label>Template Name</Label>
              <Input value={form.name} onChange={set('name')} placeholder="appointment_reminder"
                data-testid="template-name-input" />
              <p className="text-[11px] text-slate-400 mt-1">lowercase + underscores</p>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={set('category')}>
                <SelectTrigger data-testid="template-category-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTILITY">UTILITY</SelectItem>
                  <SelectItem value="MARKETING">MARKETING</SelectItem>
                  <SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Select value={form.language} onValueChange={set('language')}>
                <SelectTrigger data-testid="template-language-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en_US">English (US)</SelectItem>
                  <SelectItem value="en_GB">English (GB)</SelectItem>
                  <SelectItem value="hi">Hindi</SelectItem>
                  <SelectItem value="ta">Tamil</SelectItem>
                  <SelectItem value="te">Telugu</SelectItem>
                  <SelectItem value="mr">Marathi</SelectItem>
                  <SelectItem value="bn">Bengali</SelectItem>
                  <SelectItem value="kn">Kannada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Header (optional)</Label>
            <Input value={form.header_text} onChange={set('header_text')} placeholder="Your appointment header"
              data-testid="template-header-input" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Body <span className="text-red-500">*</span></Label>
              <div className="flex gap-1">
                {[1,2,3].map(i => (
                  <button key={i} onClick={() => insertVar('body_text', i)}
                    className="text-xs px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-mono text-slate-600">
                    {`{{${i}}}`}
                  </button>
                ))}
              </div>
            </div>
            <Textarea value={form.body_text} onChange={set('body_text')} rows={4}
              placeholder="Hi {{1}}, your appointment with Dr. {{2}} is on {{3}}." 
              data-testid="template-body-input" />
            <p className="text-[11px] text-slate-400 mt-1">{VARIABLE_HINT}</p>
          </div>

          <div>
            <Label>Footer (optional)</Label>
            <Input value={form.footer_text} onChange={set('footer_text')} placeholder="Lumera Solutions LLP"
              data-testid="template-footer-input" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} data-testid="submit-template-btn"
            className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? 'Submitting…' : 'Submit to Meta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const WhatsAppTemplates = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/whatsapp/templates`);
      setTemplates(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load templates');
    } finally { setLoading(false); }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await axios.get(`${API_URL}/whatsapp/templates`);
      setTemplates(res.data);
      toast.success('Templates synced from Meta.');
    } catch (err) {
      toast.error('Sync failed');
    } finally { setSyncing(false); }
  };

  const deleteTemplate = async (id, name) => {
    if (!window.confirm(`Delete template "${name}"? This removes it from Meta too.`)) return;
    try {
      await axios.delete(`${API_URL}/whatsapp/templates/${id}`);
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success('Template deleted.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-manrope font-bold text-3xl text-slate-900 mb-1">WhatsApp Templates</h1>
            <p className="text-slate-500 text-sm">Manage message templates approved by Meta for outbound messaging.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={sync} disabled={syncing} data-testid="sync-templates-btn">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />Sync from Meta
            </Button>
            <CreateTemplateDialog onCreated={(t) => setTemplates(prev => [t, ...prev])} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <Card className="border-dashed border-slate-300">
            <CardContent className="py-16 text-center">
              <Tag className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="font-manrope font-semibold text-slate-600 mb-2">No templates yet</p>
              <p className="text-sm text-slate-400 mb-4">
                Create your first template to send appointment reminders, payment links, and more.
              </p>
              <CreateTemplateDialog onCreated={(t) => setTemplates(prev => [t, ...prev])} />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4" data-testid="templates-list">
            {templates.map(t => (
              <Card key={t.id} className="border-slate-200" data-testid={`template-card-${t.name}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-mono font-semibold text-slate-800">{t.name}</span>
                        <TemplateStatusBadge status={t.status} />
                        <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                        <Badge variant="outline" className="text-[10px]">{t.language}</Badge>
                      </div>
                      {t.components?.filter(c => c.type === 'BODY').map((c, i) => (
                        <p key={i} className="text-sm text-slate-600 line-clamp-2">{c.text}</p>
                      ))}
                      {t.error && (
                        <p className="text-xs text-red-500 mt-1">{t.error}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        Created {new Date(t.created_at).toLocaleDateString()}
                        {t.meta_id && <span className="ml-2 font-mono">ID: {t.meta_id}</span>}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteTemplate(t.id, t.name)}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                      data-testid={`delete-template-${t.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default WhatsAppTemplates;
