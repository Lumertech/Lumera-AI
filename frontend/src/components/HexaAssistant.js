import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Sparkles, Mic, MicOff, Send, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const HexaAssistant = () => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [history, setHistory] = useState([]); // {role:'user'|'hexa', content, action?, requires_confirmation?, executed?, result?}
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { text, action }
  const mrRef = useRef(null);
  const chunksRef = useRef([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, open]);

  const send = async (overrideText, confirm = false) => {
    const t = (overrideText ?? text).trim();
    if (!t) return;
    setLoading(true);
    setHistory((h) => [...h, { role: 'user', content: t }]);
    setText('');
    try {
      const res = await axios.post(`${API_URL}/hexa/command`, { text: t, confirm });
      const { speech, action, requires_confirmation, executed, result } = res.data || {};
      setHistory((h) => [...h, { role: 'hexa', content: speech || '(no reply)', action, requires_confirmation, executed, result }]);
      if (requires_confirmation && !confirm) {
        setPendingAction({ text: t, action });
      } else {
        setPendingAction(null);
      }
    } catch (err) {
      console.error('Hexa error', err);
      toast.error(err?.response?.data?.detail || 'Hexa failed');
      setHistory((h) => [...h, { role: 'hexa', content: 'Sorry, I had trouble with that.' }]);
    } finally {
      setLoading(false);
    }
  };

  const confirmPending = async () => {
    if (!pendingAction) return;
    await send(pendingAction.text, true);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        await transcribe(blob);
        setRecording(false);
      };
      mrRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (err) {
      console.error(err);
      toast.error('Microphone permission denied');
    }
  };

  const stopRecording = () => {
    if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop();
  };

  const transcribe = async (blob) => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'hexa.webm');
      fd.append('language', 'en');
      // Reuse prescription transcribe endpoint
      const res = await axios.post(`${API_URL}/prescriptions/transcribe`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const t = (res.data?.text || '').trim();
      if (t) {
        await send(t, false);
      } else {
        toast.error('No speech detected');
      }
    } catch (err) {
      console.error(err);
      toast.error('Transcription failed');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-testid="hexa-open-btn"
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 group"
        title="Hexa AI Assistant"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full blur-lg opacity-60 group-hover:opacity-90 transition-opacity" />
          <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-xl">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 w-[92vw] max-w-[380px]" data-testid="hexa-panel">
      <Card className="border-indigo-200 shadow-2xl">
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-xl">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <div>
                <p className="font-manrope font-bold text-sm">Hexa</p>
                <p className="text-xs opacity-90">Your AI admin assistant</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} data-testid="hexa-close-btn" className="opacity-80 hover:opacity-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="p-4 space-y-3 max-h-[420px] overflow-y-auto bg-slate-50">
            {history.length === 0 && (
              <div className="text-xs text-slate-500 space-y-2">
                <p className="font-medium text-slate-700">Try asking me:</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Show today\'s appointments', 'Send reminder to Riya', 'Show unpaid invoices', 'Summarize my day'].map((s) => (
                    <button key={s} onClick={() => send(s)} className="px-2 py-1 bg-white border border-slate-200 rounded-full hover:border-indigo-400 text-[11px] text-slate-700" data-testid={`hexa-quick-${s.slice(0,10)}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {history.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-lg text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.action?.type === 'list_today_appointments' && Array.isArray(m.result) && (
                    <div className="mt-2 space-y-1">
                      {m.result.length === 0 && <p className="text-xs opacity-70">No appointments today.</p>}
                      {m.result.slice(0, 8).map((a) => (
                        <div key={a.id} className="text-xs p-1.5 bg-slate-100 rounded">
                          <span className="font-semibold">{a.start_time}</span> · {a.client_name}
                        </div>
                      ))}
                    </div>
                  )}
                  {m.executed && (
                    <Badge className="mt-2 bg-emerald-100 text-emerald-800 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Done
                    </Badge>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Hexa is thinking…</div>
            )}
          </div>

          {pendingAction && (
            <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center justify-between">
              <p className="text-xs text-amber-800">Confirm this action?</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPendingAction(null)} data-testid="hexa-cancel-action">Cancel</Button>
                <Button size="sm" onClick={confirmPending} className="bg-emerald-600 hover:bg-emerald-700" data-testid="hexa-confirm-action">Yes, do it</Button>
              </div>
            </div>
          )}

          <div className="p-3 border-t border-slate-200 flex items-center gap-2 bg-white rounded-b-xl">
            <Button size="icon" variant={recording ? 'destructive' : 'outline'} onClick={() => (recording ? stopRecording() : startRecording())} disabled={loading} data-testid="hexa-mic-btn" className={recording ? 'animate-pulse' : ''}>
              {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="Ask Hexa…"
              data-testid="hexa-input"
              disabled={loading}
            />
            <Button size="icon" onClick={() => send()} disabled={loading || !text.trim()} data-testid="hexa-send-btn">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HexaAssistant;
