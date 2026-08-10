import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Mic, MicOff, Pause, Play, Sparkles, Loader2, AlertCircle, CheckCircle2, Eraser } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * AmbientAIToggle — an ambient scribe.
 * Uses the browser SpeechRecognition API for continuous transcription; when
 * the doctor stops, the transcript is sent to the LLM to extract structured
 * EMR fields (symptoms, dx, vitals, medications, labs, general instructions).
 * The doctor reviews & applies. Nothing is written to the parent form until
 * the doctor confirms.
 */
const AmbientAIToggle = ({ onApply, context = '' }) => {
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [paused, setPaused] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);

  // Initialize SpeechRecognition
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-IN';  // Indian English handles Hinglish reasonably
    rec.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + ' ';
        else interimText += t;
      }
      if (finalText) setTranscript((prev) => (prev + finalText).trim() + ' ');
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') {
        toast.error('Microphone permission denied');
        setEnabled(false); setListening(false);
      } else if (e.error === 'no-speech') {
        // ignore
      } else {
        console.warn('SpeechRecognition:', e.error);
      }
    };
    rec.onend = () => {
      // Auto-restart if still meant to be listening (avoid Chrome's auto-stop)
      if (listeningRef.current && !pausedRef.current) {
        try { rec.start(); } catch (_e) { /* ignore */ }
      } else {
        setListening(false);
      }
    };
    recognitionRef.current = rec;
    return () => { try { rec.stop(); } catch (_e) { /* stop guarded */ } };
  }, []);

  // Track listening/paused refs for onend restart logic
  const listeningRef = useRef(false);
  const pausedRef = useRef(false);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const startListening = () => {
    if (!supported || !recognitionRef.current) return;
    try {
      setTranscript(''); setInterim('');
      recognitionRef.current.start();
      setListening(true); setPaused(false);
      toast.info('Ambient AI listening…');
    } catch (e) {
      console.warn('start failed', e);
    }
  };

  const stopAndExtract = async () => {
    try { recognitionRef.current?.stop(); } catch (_e) { /* ignore */ }
    setListening(false);
    setPaused(false);
    const raw = (transcript + ' ' + interim).trim();
    setInterim('');
    if (!raw || raw.length < 5) {
      toast.error('No speech captured yet.');
      return;
    }
    setExtracting(true);
    try {
      const res = await axios.post(`${API_URL}/ambient/extract`, {
        transcript: raw,
        context: context || undefined,
      });
      setExtracted(res.data);
      setShowReview(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'AI extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const togglePause = () => {
    if (paused) {
      try { recognitionRef.current?.start(); } catch (_e) { /* ignore */ }
      setPaused(false);
      toast.info('Resumed');
    } else {
      try { recognitionRef.current?.stop(); } catch (_e) { /* ignore */ }
      setPaused(true);
      toast.info('Paused');
    }
  };

  const onEnableChange = (v) => {
    setEnabled(v);
    if (v) startListening();
    else {
      try { recognitionRef.current?.stop(); } catch (_e) { /* ignore */ }
      setListening(false); setPaused(false);
      setTranscript(''); setInterim('');
    }
  };

  const clearTranscript = () => { setTranscript(''); setInterim(''); toast.info('Transcript cleared'); };

  const applyToForm = () => {
    if (extracted && onApply) onApply(extracted);
    setShowReview(false);
    setExtracted(null);
    setTranscript(''); setInterim('');
    setEnabled(false); setListening(false);
    toast.success('Applied to consultation');
  };

  return (
    <>
      <Card className={`border-slate-200 ${listening && !paused ? 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-300' : ''}`} data-testid="ambient-ai-toggle">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${listening && !paused ? 'bg-purple-600 animate-pulse' : 'bg-slate-100'}`}>
                {listening && !paused ? <Mic className="h-5 w-5 text-white" /> : <Sparkles className="h-5 w-5 text-purple-600" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">Ambient AI Mode</span>
                  {listening && !paused && <Badge className="bg-purple-600 animate-pulse" data-testid="ambient-listening-badge">Listening</Badge>}
                  {paused && <Badge variant="secondary" data-testid="ambient-paused-badge">Paused</Badge>}
                </div>
                <p className="text-xs text-slate-500">
                  {supported
                    ? "Speak naturally — I'll auto-fill symptoms, diagnosis, meds & labs."
                    : "Your browser doesn't support live transcription. Use Chrome / Edge on desktop."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {listening && (
                <>
                  <Button variant="outline" size="sm" onClick={togglePause} data-testid="ambient-pause-btn">
                    {paused ? <><Play className="h-4 w-4 mr-1" /> Resume</> : <><Pause className="h-4 w-4 mr-1" /> Pause</>}
                  </Button>
                  <Button size="sm" onClick={stopAndExtract} disabled={extracting} className="bg-purple-600 hover:bg-purple-700" data-testid="ambient-stop-extract-btn">
                    {extracting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Extracting…</> : <><MicOff className="h-4 w-4 mr-1" /> Stop &amp; Extract</>}
                  </Button>
                </>
              )}
              <Switch
                checked={enabled}
                onCheckedChange={onEnableChange}
                disabled={!supported}
                data-testid="ambient-enable-switch"
              />
            </div>
          </div>

          {(listening || transcript) && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm max-h-40 overflow-y-auto" data-testid="ambient-transcript">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider">Live transcript</span>
                {transcript && (
                  <button type="button" onClick={clearTranscript} className="text-xs text-red-600 hover:underline flex items-center gap-1">
                    <Eraser className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
              <span className="text-slate-800">{transcript}</span>
              <span className="text-slate-400 italic">{interim}</span>
              {!transcript && !interim && <span className="text-slate-400 italic">Start speaking…</span>}
            </div>
          )}

          {!supported && (
            <p className="text-xs text-amber-700 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Requires Chrome / Edge on desktop for live transcription.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Review dialog */}
      <Dialog open={showReview} onOpenChange={setShowReview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <CheckCircle2 className="h-5 w-5 mr-2 text-emerald-600" /> Review AI extraction
            </DialogTitle>
          </DialogHeader>
          {extracted && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <Field label="Symptoms" value={extracted.symptoms} onChange={(v) => setExtracted({ ...extracted, symptoms: v })} testid="review-symptoms" />
              <Field label="Provisional diagnosis" value={extracted.provisional_diagnosis} onChange={(v) => setExtracted({ ...extracted, provisional_diagnosis: v })} testid="review-dx" />
              {Object.keys(extracted.vitals || {}).some((k) => extracted.vitals[k]) && (
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-500">Vitals</span>
                  <div className="text-sm text-slate-800 bg-slate-50 rounded p-2 mt-1">
                    {Object.entries(extracted.vitals).filter(([, v]) => v).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join('  ·  ')}
                  </div>
                </div>
              )}
              {(extracted.medications || []).length > 0 && (
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-500">Medications ({extracted.medications.length})</span>
                  <ul className="mt-1 space-y-1 text-sm">
                    {extracted.medications.map((m, i) => (
                      <li key={i} className="p-2 bg-slate-50 rounded">
                        <strong>{m.medicine_name}</strong> — {m.dosage} · {m.frequency} · {m.duration}
                        {m.instructions ? <span className="text-slate-500"> · {m.instructions}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(extracted.lab_tests || []).length > 0 && (
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-500">Lab / imaging ({extracted.lab_tests.length})</span>
                  <ul className="mt-1 space-y-1 text-sm">
                    {extracted.lab_tests.map((t, i) => (
                      <li key={i} className="p-2 bg-slate-50 rounded">
                        <strong>{t.name}</strong>{t.notes ? <span className="text-slate-500"> — {t.notes}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Field label="General instructions" value={extracted.general_instructions} onChange={(v) => setExtracted({ ...extracted, general_instructions: v })} testid="review-general" />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowReview(false)} data-testid="review-cancel">Discard</Button>
            <Button onClick={applyToForm} className="bg-emerald-600 hover:bg-emerald-700" data-testid="review-apply">
              <CheckCircle2 className="h-4 w-4 mr-1" /> Apply to consultation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const Field = ({ label, value, onChange, testid }) => (
  <div>
    <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
    <Textarea rows={2} value={value || ''} onChange={(e) => onChange(e.target.value)} className="mt-1" data-testid={testid} />
  </div>
);

export default AmbientAIToggle;
