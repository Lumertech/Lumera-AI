import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Loader2, ChevronDown, Send } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * WaSendTemplateButton
 * Shows a popover listing APPROVED WhatsApp templates.
 * Pre-fills {{1}}→patientName, {{2}}→date, {{3}}→time, {{4}}→doctorName.
 * On confirm: calls POST /api/whatsapp/send-template.
 *
 * Props:
 *   patientPhone  — string e.g. "+919876543210"
 *   patientName   — string
 *   appointmentDate — string e.g. "2026-08-25"
 *   appointmentTime — string e.g. "10:30 AM"
 *   doctorName    — string
 */
const WaSendTemplateButton = ({
  patientPhone,
  patientName = '',
  appointmentDate = '',
  appointmentTime = '',
  doctorName = '',
}) => {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState(null); // null = not loaded yet
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);

  // Lazy-load approved templates on first open
  useEffect(() => {
    if (!open || templates !== null) return;
    axios.get(`${API_URL}/whatsapp/templates`)
      .then(r => setTemplates(r.data.filter(t => t.status === 'APPROVED')))
      .catch(() => setTemplates([]));
  }, [open, templates]);

  if (!patientPhone) return null;

  /** Replace {{N}} placeholders with patient context values */
  const fillParams = (components) => {
    const contextMap = {
      1: patientName,
      2: appointmentDate,
      3: appointmentTime,
      4: doctorName,
    };
    const bodyComp = components?.find(c => c.type === 'BODY');
    if (!bodyComp?.text) return Object.values(contextMap);
    // Collect unique variable indices in order
    const matches = [...bodyComp.text.matchAll(/\{\{(\d+)\}\}/g)];
    const indices = [...new Set(matches.map(m => parseInt(m[1])))].sort((a, b) => a - b);
    return indices.map(i => contextMap[i] || '');
  };

  const previewBody = (template) => {
    const bodyComp = template.components?.find(c => c.type === 'BODY');
    if (!bodyComp?.text) return template.name;
    const params = fillParams(template.components);
    let text = bodyComp.text;
    params.forEach((val, i) => {
      text = text.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), val || `{{${i + 1}}}`);
    });
    return text;
  };

  const send = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const params = fillParams(selected.components);
      await axios.post(`${API_URL}/whatsapp/send-template`, {
        to: patientPhone,
        template_name: selected.name,
        language: selected.language || 'en_US',
        params,
      });
      toast.success(`Template "${selected.name}" sent to ${patientName || patientPhone}`);
      setOpen(false);
      setSelected(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send template');
    } finally {
      setSending(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-green-700 hover:bg-green-50"
          data-testid={`wa-template-btn-${patientPhone}`}
          title="Send WhatsApp Template"
        >
          <MessageSquare className="h-3.5 w-3.5 mr-1" />
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="end" data-testid="wa-template-popover">
        <div className="p-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">Send WhatsApp Template</p>
          <p className="text-xs text-slate-400 mt-0.5">To: {patientName} · {patientPhone}</p>
        </div>

        {templates === null ? (
          <div className="p-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : templates.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500">
            No approved templates yet.{' '}
            <a href="/whatsapp-templates" className="text-indigo-600 underline">Create one</a>
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors ${
                  selected?.id === t.id ? 'bg-indigo-50' : ''
                }`}
                data-testid={`template-option-${t.name}`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium text-slate-800 font-mono">{t.name}</span>
                  <Badge className="text-[10px] bg-emerald-100 text-emerald-700">APPROVED</Badge>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">
                  {previewBody(t)}
                </p>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="p-3 border-t border-slate-100 space-y-2">
            <p className="text-xs text-slate-600 bg-slate-50 rounded p-2 leading-relaxed">
              {previewBody(selected)}
            </p>
            <Button
              size="sm"
              onClick={send}
              disabled={sending}
              className="w-full bg-green-600 hover:bg-green-700"
              data-testid="confirm-send-template-btn"
            >
              {sending
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Sending…</>
                : <><Send className="h-3.5 w-3.5 mr-1.5" />Send to {patientName || patientPhone}</>}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default WaSendTemplateButton;
