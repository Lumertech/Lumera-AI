import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Mic, MicOff, Pause, Play, Sparkles, Loader2, AlertCircle, CheckCircle2, Eraser, Zap } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Supported languages — code = SpeechRecognition BCP-47 tag, whisper = ISO 639-1
const LANGUAGES = [
  { code: 'en-IN', whisper: 'en', label: 'English (India)' },
  { code: 'hi-IN', whisper: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'ta-IN', whisper: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'te-IN', whisper: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'bn-IN', whisper: 'bn', label: 'বাংলা (Bengali)' },
  { code: 'mr-IN', whisper: 'mr', label: 'मराठी (Marathi)' },
  { code: 'kn-IN', whisper: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ml-IN', whisper: 'ml', label: 'മലയാളം (Malayalam)' },
  { code: 'gu-IN', whisper: 'gu', label: 'ગુજરાતી (Gujarati)' },
  { code: 'pa-IN', whisper: 'pa', label: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'en-US', whisper: 'en', label: 'English (US)' },
];

const Waveform = ({ analyser, active }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!active || !analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(buf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const bars = 32;
      const step = Math.floor(buf.length / bars);
      const bw = canvas.width / bars;
      for (let i = 0; i < bars; i++) {
        const v = buf[i * step] / 255;
        const bh = Math.max(2, v * canvas.height);
        ctx.fillStyle = `hsl(${280 + i * 3}, 80%, ${55 + v * 25}%)`;
        ctx.fillRect(i * bw + 1, (canvas.height - bh) / 2, bw - 2, bh);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);
  return <canvas ref={canvasRef} width={220} height={40} className="rounded" data-testid="ambient-waveform" />;
};

const AmbientAIToggle = ({ onApply, context = '' }) => {
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [paused, setPaused] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [langCode, setLangCode] = useState('en-IN');
  const [supported, setSupported] = useState(true);
  const [analyser, setAnalyser] = useState(null);
  const [whisperBusy, setWhisperBusy] = useState(false);
  const recognitionRef = useRef(null);
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecRef = useRef(null);
  const whisperChunksRef = useRef([]);
  const listeningRef = useRef(false);
  const pausedRef = useRef(false);

  // ------- Consent chime (soft two-tone via Web Audio) -------
  const playChime = (kind /* 'start' | 'stop' */) => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const [f1, f2] = kind === 'start' ? [523.25, 783.99] : [783.99, 523.25]; // C5→G5 or G5→C5
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      gain.connect(ctx.destination);
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine'; osc1.frequency.value = f1;
      osc1.connect(gain); osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.2);
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine'; osc2.frequency.value = f2;
      osc2.connect(gain); osc2.start(ctx.currentTime + 0.18); osc2.stop(ctx.currentTime + 0.42);
      setTimeout(() => { try { ctx.close(); } catch (_e) { /* noop */ } }, 700);
    } catch (_e) { /* audio may be blocked pre-user-gesture */ }
  };

  useEffect(() => { listeningRef.current = listening; }, [listening]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Init SpeechRecognition once
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = langCode;
    rec.onresult = (e) => {
      let f = '', i = '';
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const t = e.results[k][0].transcript;
        if (e.results[k].isFinal) f += t + ' '; else i += t;
      }
      if (f) setTranscript((p) => (p + f).trim() + ' ');
      setInterim(i);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') { toast.error('Microphone permission denied'); setEnabled(false); setListening(false); }
    };
    rec.onend = () => {
      if (listeningRef.current && !pausedRef.current) {
        try { rec.start(); } catch (_e) { /* already started */ }
      } else setListening(false);
    };
    recognitionRef.current = rec;
    return () => { try { rec.stop(); } catch (_e) { /* noop */ } };
  }, []);

  // Reapply language when changed while not listening
  useEffect(() => {
    if (recognitionRef.current) recognitionRef.current.lang = langCode;
  }, [langCode]);

  const startAudio = async () => {
    // Get mic stream once for both waveform + Whisper fallback
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 128;
      source.connect(an);
      setAnalyser(an);

      // MediaRecorder for Whisper fallback / high accuracy
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType: mime });
      whisperChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) whisperChunksRef.current.push(e.data); };
      mediaRecRef.current = mr;
      mr.start(1000); // capture in 1s chunks
      return true;
    } catch (e) {
      toast.error('Microphone access denied');
      return false;
    }
  };

  const stopAudio = () => {
    try { mediaRecRef.current?.stop(); } catch (_e) { /* noop */ }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch (_e) { /* noop */ }
    try { audioCtxRef.current?.close(); } catch (_e) { /* noop */ }
    streamRef.current = null; audioCtxRef.current = null; mediaRecRef.current = null;
    setAnalyser(null);
  };

  const startListening = async () => {
    setTranscript(''); setInterim(''); whisperChunksRef.current = [];
    const ok = await startAudio();
    if (!ok) return;
    if (supported && recognitionRef.current) {
      try {
        recognitionRef.current.lang = langCode;
        recognitionRef.current.start();
      } catch (_e) { /* already running */ }
    } else {
      toast.info('Live transcription unsupported — using Whisper on Stop');
    }
    setListening(true); setPaused(false);
    playChime('start');
    toast.info('Ambient AI listening…');
  };

  const stopAndExtract = async () => {
    setListening(false); setPaused(false);
    playChime('stop');
    try { recognitionRef.current?.stop(); } catch (_e) { /* noop */ }

    // Wait a beat for MediaRecorder to flush
    await new Promise((r) => setTimeout(r, 250));
    let finalTranscript = (transcript + ' ' + interim).trim();
    setInterim('');

    // If browser transcription empty or user chose Whisper fallback, run Whisper
    if (!finalTranscript || finalTranscript.length < 5) {
      try {
        const blob = new Blob(whisperChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 1000) {
          stopAudio();
          return toast.error('No speech captured');
        }
        setWhisperBusy(true);
        const lang = LANGUAGES.find((l) => l.code === langCode)?.whisper || 'en';
        const fd = new FormData();
        fd.append('file', blob, 'ambient.webm');
        fd.append('language', lang);
        const res = await axios.post(`${API_URL}/ambient/transcribe`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        finalTranscript = res.data.transcript || '';
        setTranscript(finalTranscript);
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Whisper transcription failed');
        stopAudio();
        return;
      } finally {
        setWhisperBusy(false);
      }
    }

    stopAudio();
    if (!finalTranscript || finalTranscript.length < 5) return toast.error('No speech captured');

    setExtracting(true);
    try {
      const res = await axios.post(`${API_URL}/ambient/extract`, {
        transcript: finalTranscript,
        context: context || undefined,
      });
      setExtracted(res.data);
      setShowReview(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'AI extraction failed');
    } finally { setExtracting(false); }
  };

  const togglePause = () => {
    if (paused) {
      try { recognitionRef.current?.start(); } catch (_e) { /* noop */ }
      try { mediaRecRef.current?.resume(); } catch (_e) { /* noop */ }
      setPaused(false); toast.info('Resumed');
    } else {
      try { recognitionRef.current?.stop(); } catch (_e) { /* noop */ }
      try { mediaRecRef.current?.pause(); } catch (_e) { /* noop */ }
      setPaused(true); toast.info('Paused');
    }
  };

  const onEnableChange = async (v) => {
    setEnabled(v);
    if (v) await startListening();
    else {
      try { recognitionRef.current?.stop(); } catch (_e) { /* noop */ }
      stopAudio();
      setListening(false); setPaused(false); setTranscript(''); setInterim('');
    }
  };

  const clearTranscript = () => { setTranscript(''); setInterim(''); };

  const applyToForm = () => {
    if (extracted && onApply) onApply(extracted);
    setShowReview(false); setExtracted(null);
    setTranscript(''); setInterim('');
    setEnabled(false); setListening(false);
    toast.success('Applied to consultation');
  };

  return (
    <>
      <Card className={`border-slate-200 ${listening && !paused ? 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-300' : ''}`} data-testid="ambient-ai-toggle">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${listening && !paused ? 'bg-purple-600 animate-pulse' : 'bg-slate-100'}`}>
                {listening && !paused ? <Mic className="h-5 w-5 text-white" /> : <Sparkles className="h-5 w-5 text-purple-600" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">Ambient AI Mode</span>
                  {listening && !paused && <Badge className="bg-purple-600 animate-pulse" data-testid="ambient-listening-badge">Recording</Badge>}
                  {paused && <Badge variant="secondary" data-testid="ambient-paused-badge">Paused</Badge>}
                  {whisperBusy && <Badge className="bg-indigo-600"><Zap className="h-3 w-3 mr-0.5" /> Whisper</Badge>}
                </div>
                <p className="text-xs text-slate-500">Speak naturally — I&apos;ll auto-fill symptoms, diagnosis, meds &amp; labs.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={langCode} onValueChange={setLangCode} disabled={listening}>
                <SelectTrigger className="w-40 h-9" data-testid="ambient-lang-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {listening && (
                <>
                  <Button variant="outline" size="sm" onClick={togglePause} data-testid="ambient-pause-btn">
                    {paused ? <><Play className="h-4 w-4 mr-1" /> Resume</> : <><Pause className="h-4 w-4 mr-1" /> Pause</>}
                  </Button>
                  <Button size="sm" onClick={stopAndExtract} disabled={extracting || whisperBusy} className="bg-purple-600 hover:bg-purple-700" data-testid="ambient-stop-extract-btn">
                    {extracting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Extracting…</> : whisperBusy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Transcribing…</> : <><MicOff className="h-4 w-4 mr-1" /> Stop &amp; Extract</>}
                  </Button>
                </>
              )}
              <Switch checked={enabled} onCheckedChange={onEnableChange} data-testid="ambient-enable-switch" />
            </div>
          </div>

          {listening && !paused && (
            <div className="flex items-center gap-3 px-2" data-testid="ambient-recording-strip">
              <Waveform analyser={analyser} active />
              <span className="text-xs text-purple-700 font-medium">
                Listening in {LANGUAGES.find((l) => l.code === langCode)?.label || langCode}…
              </span>
            </div>
          )}

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
              <AlertCircle className="h-3 w-3" /> Live transcription not supported here — Whisper will run on Stop.
            </p>
          )}
        </CardContent>
      </Card>

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
