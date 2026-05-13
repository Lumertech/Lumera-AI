import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mic, MicOff, Loader2, Sparkles, Plus, FileText, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const SOAPViewer = ({ soap }) => {
  if (!soap) return null;
  const Section = ({ title, children }) => (
    <div className="mb-4">
      <p className="font-manrope font-semibold text-sm text-indigo-700 mb-2 uppercase tracking-wide">{title}</p>
      <div className="text-sm text-slate-700 space-y-1 pl-3 border-l-2 border-indigo-100">{children}</div>
    </div>
  );
  const List = ({ items, empty = '—' }) => (
    <ul className="list-disc pl-4 space-y-0.5">
      {(items && items.length) ? items.map((it, i) => <li key={i}>{it}</li>) : <li className="text-slate-400">{empty}</li>}
    </ul>
  );
  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200">
      <p className="text-xs text-slate-500 uppercase mb-1">Chief Complaint</p>
      <p className="text-base font-semibold text-slate-900 mb-4">{soap.chief_complaint || '—'}</p>

      <Section title="S — Subjective">
        <p><span className="font-medium">HPI:</span> {soap.subjective?.history_of_present_illness || '—'}</p>
        <div><span className="font-medium">Past medical history:</span> <List items={soap.subjective?.past_medical_history} /></div>
        <div><span className="font-medium">Medications:</span> <List items={soap.subjective?.medications} /></div>
        <div><span className="font-medium">Allergies:</span> <List items={soap.subjective?.allergies} /></div>
        <p><span className="font-medium">Social history:</span> {soap.subjective?.social_history || '—'}</p>
      </Section>

      <Section title="O — Objective">
        <p><span className="font-medium">Vitals:</span> BP {soap.objective?.vitals?.bp || '—'}, Pulse {soap.objective?.vitals?.pulse || '—'}, Temp {soap.objective?.vitals?.temperature || '—'}, SpO₂ {soap.objective?.vitals?.spo2 || '—'}</p>
        <p><span className="font-medium">Physical exam:</span> {soap.objective?.physical_exam || '—'}</p>
        <div><span className="font-medium">Investigations:</span> <List items={soap.objective?.investigations} /></div>
      </Section>

      <Section title="A — Assessment">
        <p><span className="font-medium">Primary diagnosis:</span> {soap.assessment?.primary_diagnosis || '—'}</p>
        <div><span className="font-medium">Differentials:</span> <List items={soap.assessment?.differential_diagnoses} /></div>
        {soap.assessment?.icd10 && <p><span className="font-medium">ICD-10:</span> {soap.assessment.icd10}</p>}
      </Section>

      <Section title="P — Plan">
        <div className="space-y-1">
          <p className="font-medium">Medications:</p>
          {(soap.plan?.medications || []).length === 0
            ? <p className="text-slate-400 pl-2">—</p>
            : (soap.plan?.medications || []).map((m, i) => (
                <div key={i} className="pl-2">• {m.medicine_name} {m.dosage && `(${m.dosage})`} — {m.frequency} for {m.duration} {m.instructions && `· ${m.instructions}`}</div>
              ))}
        </div>
        <div className="mt-2"><span className="font-medium">Investigations ordered:</span> <List items={soap.plan?.investigations_ordered} /></div>
        <p className="mt-2"><span className="font-medium">Patient education:</span> {soap.plan?.patient_education || '—'}</p>
        <p><span className="font-medium">Follow-up:</span> {soap.plan?.follow_up || '—'}</p>
      </Section>
    </div>
  );
};

const ConsultationCard = ({ item, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState(item.transcript || '');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mrRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        setRecording(false);
        await sendForTranscription(blob);
      };
      mrRef.current = mr;
      mr.start();
      setRecording(true);
      toast.info('Recording consultation… tap mic to stop');
    } catch (err) {
      toast.error('Could not access microphone');
    }
  };

  const stopRecording = () => {
    if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop();
  };

  const sendForTranscription = async (blob) => {
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'consultation.webm');
      fd.append('language', 'en');
      const res = await axios.post(`${API_URL}/consultations/transcribe`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const text = (res.data?.text || '').trim();
      if (text) {
        setTranscript((prev) => (prev ? `${prev}\n${text}` : text));
        toast.success('Transcribed');
      } else toast.error('No speech detected');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Transcription failed');
    } finally {
      setTranscribing(false);
    }
  };

  const saveTranscript = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`${API_URL}/consultations/${item.id}`, { transcript });
      onUpdate(res.data);
      toast.success('Saved');
    } catch (err) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const generateSOAP = async () => {
    if (!transcript.trim()) return toast.error('Add transcript first');
    setGenerating(true);
    try {
      const res = await axios.post(`${API_URL}/consultations/soap`, { transcript });
      const soap = res.data?.soap;
      const upd = await axios.put(`${API_URL}/consultations/${item.id}`, { transcript, soap });
      onUpdate(upd.data);
      toast.success('SOAP note generated');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'SOAP generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="border-slate-200" data-testid={`consultation-${item.id}`}>
      <CardHeader className="cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-manrope text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600" />
              {item.client_name || 'Untitled consultation'}
              {item.soap && <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">SOAP ready</Badge>}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">{new Date(item.created_at).toLocaleString()}</p>
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Consultation transcript</Label>
              <div className="flex gap-1">
                <Button size="sm" variant={recording ? 'destructive' : 'outline'} onClick={() => (recording ? stopRecording() : startRecording())} disabled={transcribing} className={recording ? 'animate-pulse' : ''} data-testid={`record-${item.id}`}>
                  {transcribing ? <Loader2 className="h-3 w-3 animate-spin" /> : recording ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                  <span className="ml-1 text-xs">{recording ? 'Stop' : transcribing ? 'Transcribing' : 'Record'}</span>
                </Button>
              </div>
            </div>
            <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={8} placeholder="Paste or dictate the consultation conversation…" data-testid={`transcript-${item.id}`} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={saveTranscript} disabled={saving} data-testid={`save-${item.id}`}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />} Save
              </Button>
              <Button size="sm" onClick={generateSOAP} disabled={generating || !transcript.trim()} className="bg-purple-600 hover:bg-purple-700" data-testid={`generate-soap-${item.id}`}>
                {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />} Generate SOAP note
              </Button>
            </div>
          </div>

          {item.soap && (
            <div>
              <Label className="text-xs font-semibold mb-2 block">SOAP Note</Label>
              <SOAPViewer soap={item.soap} />
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

const Consultations = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ client_name: '', client_phone: '' });

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/consultations`);
      setItems(res.data || []);
    } catch (err) {
      toast.error('Failed to load consultations');
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!form.client_name.trim()) return toast.error('Patient name required');
    setCreating(true);
    try {
      const res = await axios.post(`${API_URL}/consultations`, form);
      setItems([res.data, ...items]);
      setForm({ client_name: '', client_phone: '' });
      toast.success('Consultation created');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = (updated) => {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="consultations-page">
        <Card className="border-slate-200 bg-gradient-to-br from-purple-50 to-indigo-50">
          <CardContent className="p-6">
            <h1 className="font-manrope font-bold text-2xl text-slate-900 mb-1 flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-purple-600" /> AI Documentation Engine
            </h1>
            <p className="text-sm text-slate-600 font-inter">Record consultations → auto-generate SOAP notes tuned for Indian medical practice.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-manrope flex items-center gap-2"><Plus className="h-5 w-5" /> Start New Consultation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Patient name</Label>
                <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} placeholder="e.g., Riya Sharma" data-testid="new-consult-name" />
              </div>
              <div>
                <Label className="text-xs">Patient phone (optional)</Label>
                <Input value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} placeholder="+91 9999999999" data-testid="new-consult-phone" />
              </div>
            </div>
            <Button onClick={create} disabled={creating} className="bg-purple-600 hover:bg-purple-700" data-testid="create-consult-btn">
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Start
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>
        ) : items.length === 0 ? (
          <Alert><AlertDescription>No consultations yet. Start one above to record and generate a SOAP note.</AlertDescription></Alert>
        ) : (
          <div className="space-y-3" data-testid="consultations-list">
            {items.map((it) => (
              <ConsultationCard key={it.id} item={it} onUpdate={handleUpdate} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Consultations;
