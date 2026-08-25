import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Plus, Trash2, Sparkles, Send, CreditCard, Mic, MicOff,
  ShieldAlert, Link2, Lock, ChevronDown, ChevronUp, History, AlertTriangle, Printer
} from 'lucide-react';
import { toast } from 'sonner';
import RequestPaymentModalV2 from '@/components/RequestPaymentModalV2';
import { useAuth } from '@/contexts/AuthContext';
import { printDocument, renderPrescriptionHTML } from '@/lib/print';
import { VitalsHeader, DrugAutocomplete, LabTestPicker, RxPresets } from '@/components/PrescriptionExtras';
import AmbientAIToggle from '@/components/AmbientAIToggle';
import PatientTimeline from '@/components/PatientTimeline';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const emptyTaperStep = () => ({ dosage: '', frequency: '', duration: '', notes: '' });
const emptyMed = () => ({
  _key: (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `med-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  medicine_name: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
  is_tapering: false,
  taper_schedule: [],
});

const SEVERITY_COLORS = {
  high: 'bg-red-100 text-red-800 border-red-300',
  moderate: 'bg-amber-100 text-amber-800 border-amber-300',
  low: 'bg-sky-100 text-sky-800 border-sky-300',
};

const PrescriptionWriter = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [appointment, setAppointment] = useState(null);
  const [primaryClinic, setPrimaryClinic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [symptoms, setSymptoms] = useState('');
  const [medications, setMedications] = useState([emptyMed()]);
  const [generalInstructions, setGeneralInstructions] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  // Vitals + Lab tests (Phase C)
  const [vitals, setVitals] = useState({});
  const [labTests, setLabTests] = useState([]);

  // Phase 1 additions
  const [privateNotes, setPrivateNotes] = useState('');
  const [pastPrivateNotes, setPastPrivateNotes] = useState([]);
  const [showPastNotes, setShowPastNotes] = useState(false);
  const [linkToAbha, setLinkToAbha] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [importingLastRx, setImportingLastRx] = useState(false);
  const [outstanding, setOutstanding] = useState(null);

  // Drug interactions
  const [interactionsLoading, setInteractionsLoading] = useState(false);
  const [interactions, setInteractions] = useState(null);

  // Mic / Whisper
  const [recordingTarget, setRecordingTarget] = useState(null); // 'symptoms' | 'private' | `med-<idx>-instructions`
  const [transcribing, setTranscribing] = useState(false);
  const [intakePrefilled, setIntakePrefilled] = useState(false); // true when symptoms auto-filled from WA intake
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    fetchAppointment();
    // Load primary clinic for letterhead
    axios.get(`${API_URL}/clinics`)
      .then((r) => {
        const list = r.data || [];
        setPrimaryClinic(list.find((c) => c.is_primary) || list[0] || null);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (appointment?.client_phone) {
      fetchPastPrivateNotes(appointment.client_phone);
    }
  }, [appointment?.client_phone]);

  const [vitalsCapturedBy, setVitalsCapturedBy] = useState(null);
  const [letterhead, setLetterhead] = useState(null);
  const [safetyAlert, setSafetyAlert] = useState(null); // {allergy_conflicts, duplicates}
  const [safetyCheckError, setSafetyCheckError] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Debounced clinical safety check
  useEffect(() => {
    if (!appointment?.client_phone) return;
    const meds = (medications || []).map((m) => m.medicine_name).filter(Boolean);
    if (meds.length === 0) { setSafetyAlert(null); setSafetyCheckError(false); return; }
    const t = setTimeout(async () => {
      try {
        const res = await axios.post(`${API_URL}/safety/drug-check`, {
          client_phone: appointment.client_phone,
          medication_names: meds,
        });
        setSafetyAlert(res.data.safe ? null : res.data);
        setSafetyCheckError(false);
      } catch (_e) {
        setSafetyCheckError(true);
        setSafetyAlert(null);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [medications, appointment?.client_phone]);

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/letterhead`);
        setLetterhead(r.data);
      } catch (_) { console.warn('[PrescriptionWriter] Letterhead load failed (non-fatal):', _); }
    })();
  }, []);

  const fetchAppointment = async () => {
    try {
      const response = await axios.get(`${API_URL}/appointments/${id}`);
      setAppointment(response.data);
      // Populate chief complaint:
      // Priority 1 — existing saved notes; Priority 2 — WA AI-parsed pre-intake
      if (response.data.notes) {
        setSymptoms(response.data.notes);
      } else if (
        response.data.pre_intake_status === 'auto_captured' &&
        response.data.pre_intake?.symptoms
      ) {
        const parts = [response.data.pre_intake.symptoms];
        if (response.data.pre_intake.duration)
          parts.push(`Duration: ${response.data.pre_intake.duration}`);
        if (response.data.pre_intake.medications_allergies)
          parts.push(`Medications/Allergies: ${response.data.pre_intake.medications_allergies}`);
        setSymptoms(parts.join('\n'));
        setIntakePrefilled(true);
      }
      // Load pre-populated vitals recorded by nurse/assistant
      try {
        const v = await axios.get(`${API_URL}/appointments/${id}/vitals`);
        if (v.data.vitals && Object.keys(v.data.vitals).length > 0) {
          setVitals(v.data.vitals);
          if (v.data.captured_by) {
            setVitalsCapturedBy({ by: v.data.captured_by, at: v.data.captured_at });
          }
        }
      } catch (_) { console.warn('[PrescriptionWriter] Vitals load failed (non-fatal):', _); }
      // Outstanding balance chip
      if (response.data.client_phone) {
        try {
          const ob = await axios.get(`${API_URL}/prescriptions/outstanding-balance/${encodeURIComponent(response.data.client_phone)}`);
          if (ob.data?.outstanding > 0) setOutstanding(ob.data);
        } catch (_) { console.warn('[PrescriptionWriter] Outstanding balance load failed (non-fatal):', _); }
      }
    } catch (error) {
      console.error('Failed to fetch appointment:', error);
      toast.error('Failed to load appointment');
    } finally {
      setLoading(false);
    }
  };

  const fetchPastPrivateNotes = async (phone) => {
    try {
      const res = await axios.get(`${API_URL}/prescriptions/private-notes/${encodeURIComponent(phone)}`);
      setPastPrivateNotes(res.data?.notes || []);
    } catch (err) {
      // Silent - non-critical
      console.error('Failed to fetch private notes history', err);
    }
  };

  const importLastRx = async () => {
    const phone = appointment?.client_phone;
    if (!phone) return toast.error('No patient phone on this appointment');
    setImportingLastRx(true);
    try {
      const res = await axios.get(`${API_URL}/prescriptions/last-for/${encodeURIComponent(phone)}`);
      if (!res.data.found) {
        toast.info('No previous prescriptions for this patient');
        return;
      }
      const meds = (res.data.medications || [])
        .filter((m) => m?.medicine_name)
        .map((m) => ({ ...emptyMed(), ...m })); // ensure each has a stable _key
      if (meds.length === 0) {
        toast.info('Previous prescription had no medications');
        return;
      }
      setMedications(meds);
      if (res.data.diagnosis && !symptoms) setSymptoms(res.data.diagnosis);
      toast.success(`Imported ${meds.length} medication(s) from last Rx`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not import last Rx');
    } finally {
      setImportingLastRx(false);
    }
  };

  const applyFollowUpChip = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setFollowUpDate(d.toISOString().slice(0, 10));
    toast.success(`Follow-up set to ${d.toDateString()}`);
  };

  // Compute BMI live from vitals.weight (kg) + vitals.height (cm)
  const bmi = React.useMemo(() => {
    const w = parseFloat(vitals?.weight);
    const h = parseFloat(vitals?.height);
    if (!w || !h) return null;
    const hM = h / 100;
    const v = w / (hM * hM);
    if (!isFinite(v) || v <= 0) return null;
    return v.toFixed(1);
  }, [vitals?.weight, vitals?.height]);

  const bmiCategory = React.useMemo(() => {
    if (!bmi) return null;
    const v = parseFloat(bmi);
    if (v < 18.5) return { label: 'Underweight', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    if (v < 25)   return { label: 'Normal',      color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    if (v < 30)   return { label: 'Overweight',  color: 'text-amber-700 bg-amber-50 border-amber-200' };
    return { label: 'Obese', color: 'text-rose-700 bg-rose-50 border-rose-200' };
  }, [bmi]);


  const getAISuggestions = async () => {
    if (!symptoms.trim()) return toast.error('Please enter symptoms first');
    if (!appointment?.patient_details) return toast.error('Please add patient details first');

    setAiLoading(true);
    try {
      const response = await axios.post(`${API_URL}/prescriptions/ai-suggest`, {
        symptoms,
        patient_age: appointment.patient_details.age,
        patient_sex: appointment.patient_details.sex,
      });

      let suggestions = [];
      try {
        suggestions = JSON.parse(response.data.suggestions);
      } catch (parseError) {
        const match = response.data.suggestions.match(/\[[\s\S]*\]/);
        if (match) suggestions = JSON.parse(match[0]);
      }
      if (suggestions.length > 0) {
        setAiSuggestions(suggestions);
        toast.success(`${suggestions.length} medication suggestions generated!`);
      } else {
        toast.error('No suggestions generated. Try different symptoms.');
      }
    } catch (error) {
      console.error('AI suggestion failed:', error);
      toast.error('Failed to get AI suggestions');
    } finally {
      setAiLoading(false);
    }
  };

  const addMedication = () => setMedications([...medications, emptyMed()]);
  const removeMedication = (index) => setMedications(medications.filter((_, i) => i !== index));
  const updateMedication = (index, field, value) => {
    const updated = [...medications];
    updated[index][field] = value;
    setMedications(updated);
  };
  const applySuggestion = (suggestion) => {
    const existingNames = medications.map((m) => m.medicine_name.toLowerCase());
    if (existingNames.includes(suggestion.medicine_name.toLowerCase())) {
      toast.info('Medication already added');
      return;
    }
    setMedications([...medications, { ...emptyMed(), ...suggestion }]);
    toast.success(`Added ${suggestion.medicine_name}`);
  };

  // Tapering helpers
  const toggleTapering = (index) => {
    const updated = [...medications];
    updated[index].is_tapering = !updated[index].is_tapering;
    if (updated[index].is_tapering && (!updated[index].taper_schedule || updated[index].taper_schedule.length === 0)) {
      updated[index].taper_schedule = [emptyTaperStep()];
    }
    setMedications(updated);
  };
  const addTaperStep = (medIdx) => {
    const updated = [...medications];
    updated[medIdx].taper_schedule = [...(updated[medIdx].taper_schedule || []), emptyTaperStep()];
    setMedications(updated);
  };
  const removeTaperStep = (medIdx, stepIdx) => {
    const updated = [...medications];
    updated[medIdx].taper_schedule = updated[medIdx].taper_schedule.filter((_, i) => i !== stepIdx);
    setMedications(updated);
  };
  const updateTaperStep = (medIdx, stepIdx, field, value) => {
    const updated = [...medications];
    updated[medIdx].taper_schedule[stepIdx][field] = value;
    setMedications(updated);
  };

  // Drug interactions
  const checkInteractions = async () => {
    const validMeds = medications.filter((m) => m.medicine_name.trim());
    if (validMeds.length === 0) return toast.error('Add at least one medication first');
    setInteractionsLoading(true);
    try {
      const res = await axios.post(`${API_URL}/prescriptions/drug-interactions`, {
        medications: validMeds,
        patient_age: appointment?.patient_details?.age,
        patient_conditions: appointment?.patient_details?.conditions || [],
      });
      setInteractions(res.data);
      const count = (res.data?.alerts || []).length;
      if (count === 0) toast.success('No interactions found');
      else toast.warning(`${count} interaction${count > 1 ? 's' : ''} detected`);
    } catch (err) {
      console.error('Drug interaction check failed:', err);
      toast.error('Failed to check drug interactions');
    } finally {
      setInteractionsLoading(false);
    }
  };

  // Mic recording
  const startRecording = async (target) => {
    if (recordingTarget) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        await uploadAndTranscribe(blob, target);
        setRecordingTarget(null);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecordingTarget(target);
      toast.info('Recording… tap mic again to stop');
    } catch (err) {
      console.error('Mic error', err);
      toast.error('Could not access microphone. Please grant permission.');
      setRecordingTarget(null);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const uploadAndTranscribe = async (blob, target) => {
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append('audio', blob, 'recording.webm');
      form.append('language', 'en');
      const res = await axios.post(`${API_URL}/prescriptions/transcribe`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const text = (res.data?.text || '').trim();
      if (!text) {
        toast.error('No speech detected');
        return;
      }
      applyTranscript(target, text);
      toast.success('Transcribed');
    } catch (err) {
      console.error('Transcription failed', err);
      toast.error(err?.response?.data?.detail || 'Transcription failed');
    } finally {
      setTranscribing(false);
    }
  };

  const applyTranscript = (target, text) => {
    if (target === 'symptoms') {
      setSymptoms((prev) => (prev ? `${prev} ${text}` : text));
    } else if (target === 'private') {
      setPrivateNotes((prev) => (prev ? `${prev} ${text}` : text));
    } else if (target === 'instructions') {
      setGeneralInstructions((prev) => (prev ? `${prev} ${text}` : text));
    } else if (target?.startsWith('med-')) {
      const [, idxStr, field] = target.split('-');
      const idx = parseInt(idxStr, 10);
      const current = medications[idx]?.[field] || '';
      updateMedication(idx, field, current ? `${current} ${text}` : text);
    }
  };

  const MicButton = ({ target, size = 'sm' }) => {
    const active = recordingTarget === target;
    const disabled = (recordingTarget !== null && !active) || transcribing;
    return (
      <Button
        type="button"
        size={size}
        variant={active ? 'destructive' : 'outline'}
        onClick={() => (active ? stopRecording() : startRecording(target))}
        disabled={disabled}
        data-testid={`mic-${target}`}
        title={active ? 'Stop recording' : 'Voice input'}
        className={active ? 'animate-pulse' : ''}
      >
        {transcribing && !active ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>
    );
  };

  const handlePrint = () => {
    const validMeds = medications.filter((m) => m.medicine_name.trim());
    if (validMeds.length === 0) {
      toast.error('Add at least one medication before printing');
      return;
    }
    const html = renderPrescriptionHTML({
      clinic: primaryClinic,
      doctor: { name: user?.name, profession: user?.profession },
      patient: {
        name: appointment?.client_name,
        phone: appointment?.client_phone,
        age: appointment?.patient_details?.age,
        sex: appointment?.patient_details?.sex,
      },
      medications: validMeds,
      instructions: generalInstructions,
      date: new Date().toISOString(),
      vitals,
      labTests,
    });
    printDocument({ title: `Prescription - ${appointment?.client_name || ''}`, html });
  };

  const submitPrescription = async () => {
    const validMeds = medications.filter((m) => m.medicine_name.trim());
    if (validMeds.length === 0) return toast.error('Please add at least one medication');
    if (!generalInstructions.trim()) return toast.error('Please add general instructions');

    setSending(true);
    try {
      await axios.post(`${API_URL}/prescriptions`, {
        appointment_id: id,
        client_name: appointment.client_name,
        medications: validMeds,
        instructions: generalInstructions,
        private_doctor_notes: privateNotes,
        link_to_abha: linkToAbha,
        vitals,
        lab_tests: labTests,
        follow_up_date: followUpDate || null,
        request_feedback: true,
      });
      toast.success('Prescription sent to patient via WhatsApp!');
      // Auto-print so the patient walks out with a printed copy
      try { handlePrint(); } catch (e) { /* non-blocking */ }
      setTimeout(() => navigate('/appointments'), 1500);
    } catch (error) {
      console.error('Failed to send prescription:', error);
      toast.error('Failed to send prescription');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="prescription-writer-page">
        {/* Header */}
        <Card className="border-slate-200 bg-gradient-to-br from-purple-50 to-pink-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-manrope font-bold text-2xl text-slate-900 mb-2">Write Prescription</h1>
                <p className="font-inter text-slate-600">
                  Patient: {appointment?.client_name} | Age: {appointment?.patient_details?.age} | Sex: {appointment?.patient_details?.sex}
                </p>
                {outstanding && outstanding.outstanding > 0 && (
                  <div
                    className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300"
                    data-testid="outstanding-balance-chip"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                    Outstanding Balance: ₹{Number(outstanding.outstanding).toLocaleString('en-IN')}
                    <span className="text-rose-600">· {outstanding.unpaid_count} unpaid</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={importLastRx}
                  disabled={importingLastRx || !appointment?.client_phone}
                  data-testid="import-last-rx-btn"
                  className="border-purple-300 text-purple-700 hover:bg-purple-50"
                >
                  {importingLastRx ? 'Importing…' : 'Import Last Rx'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setTimelineOpen(true)}
                  disabled={!appointment?.client_phone}
                  data-testid="view-patient-timeline-btn"
                >
                  Consult History
                </Button>
                <Button variant="outline" onClick={() => navigate(`/appointments/${id}`)} data-testid="back-to-details-btn">
                  Back to Details
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ambient AI Mode — voice-driven EMR auto-fill */}
        <AmbientAIToggle
          context={appointment ? `Patient: ${appointment.client_name}` : ''}
          onApply={(e) => {
            if (e.symptoms) setSymptoms((prev) => prev ? `${prev}\n${e.symptoms}` : e.symptoms);
            if (e.general_instructions) setGeneralInstructions((prev) => prev ? `${prev}\n${e.general_instructions}` : e.general_instructions);
            if (e.vitals) setVitals((v) => ({ ...v, ...Object.fromEntries(Object.entries(e.vitals).filter(([, val]) => val)) }));
            if (e.medications && e.medications.length > 0) {
              const cleaned = e.medications.map((m) => ({
                ...emptyMed(),
                medicine_name: m.medicine_name || '',
                dosage: m.dosage || '',
                frequency: m.frequency || '',
                duration: m.duration || '',
                instructions: m.instructions || '',
                is_tapering: false, taper_schedule: [],
              }));
              setMedications((prev) => {
                const hasEmpty = prev.length === 1 && !prev[0].medicine_name?.trim();
                return hasEmpty ? cleaned : [...prev, ...cleaned];
              });
            }
            if (e.lab_tests && e.lab_tests.length > 0) {
              setLabTests((prev) => [
                ...prev,
                ...e.lab_tests.map((t) => ({ name: t.name, code: '', category: '', sample: '', notes: t.notes || '' })),
              ]);
            }
          }}
        />

        {/* Vitals header */}
        {safetyAlert && (
          <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 flex items-start gap-3 animate-pulse" data-testid="safety-alert-banner">
            <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white flex-shrink-0">!</div>
            <div className="flex-1">
              <p className="font-semibold text-red-900">Clinical safety alert</p>
              {safetyAlert.allergy_conflicts?.length > 0 && (
                <ul className="text-sm text-red-800 mt-1">
                  {safetyAlert.allergy_conflicts.map((c, i) => (
                    <li key={`a-${i}`}>⚠️ <strong>{c.medication}</strong> conflicts with allergy: <strong>{c.allergy}</strong></li>
                  ))}
                </ul>
              )}
              {safetyAlert.duplicates?.length > 0 && (
                <ul className="text-sm text-red-800 mt-1">
                  {safetyAlert.duplicates.map((d, i) => (
                    <li key={`d-${i}`}>🔁 <strong>{d.medication}</strong> was already prescribed on {d.existing_prescription_date}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {!safetyAlert && safetyCheckError && (
          <div
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 flex items-center gap-2"
            data-testid="safety-check-unavailable-banner"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Allergy &amp; duplicate check is temporarily unavailable — please verify manually before prescribing.
          </div>
        )}
        {vitalsCapturedBy && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2" data-testid="vitals-prefilled-badge">
            <span>✓ Vitals pre-filled by <strong>{vitalsCapturedBy.by}</strong></span>
            {vitalsCapturedBy.at && <span className="text-slate-500">· {new Date(vitalsCapturedBy.at).toLocaleTimeString()}</span>}
          </div>
        )}
        <VitalsHeader vitals={vitals} onChange={setVitals} />

        {/* Rx Presets */}
        <RxPresets
          medications={medications}
          defaultInstructions={generalInstructions}
          onLoad={(meds, defInstr) => {
            const cleaned = meds.map((m) => ({
              ...emptyMed(),
              medicine_name: m.medicine_name || '',
              dosage: m.dosage || '',
              frequency: m.frequency || '',
              duration: m.duration || '',
              instructions: m.instructions || '',
              is_tapering: !!m.is_tapering,
              taper_schedule: m.taper_schedule || [],
            }));
            setMedications(cleaned);
            if (defInstr && !generalInstructions.trim()) setGeneralInstructions(defInstr);
          }}
        />

        {/* Symptoms + AI */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">Symptoms & AI Assistant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Intake prefill notice */}
            {intakePrefilled && (
              <div
                className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"
                data-testid="intake-prefill-banner"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                Chief complaint pre-filled from WhatsApp intake · AI-parsed · Edit freely
                <button
                  className="ml-auto text-emerald-500 hover:text-emerald-700 font-medium"
                  onClick={() => setIntakePrefilled(false)}
                  data-testid="dismiss-intake-prefill"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-manrope font-semibold">Patient Symptoms</Label>
                <MicButton target="symptoms" />
              </div>
              <Textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="Describe patient symptoms in detail… or tap the mic to dictate"
                rows={4}
                data-testid="symptoms-input"
                className="font-inter"
              />
            </div>

            <Button onClick={getAISuggestions} disabled={aiLoading || !symptoms.trim()} className="bg-purple-600 hover:bg-purple-700" data-testid="ai-suggest-btn">
              {aiLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating AI Suggestions…</> : <><Sparkles className="mr-2 h-4 w-4" /> Get AI Suggestions</>}
            </Button>

            {aiSuggestions.length > 0 && (
              <Alert className="bg-purple-50 border-purple-200">
                <AlertDescription>
                  <p className="font-manrope font-semibold text-purple-900 mb-3">AI Suggested Medications:</p>
                  <div className="space-y-2">
                    {aiSuggestions.map((suggestion, index) => (
                      <div key={`${suggestion.medicine_name}-${index}`} className="flex items-start justify-between p-3 bg-white rounded-lg border border-purple-200">
                        <div className="flex-1">
                          <p className="font-manrope font-semibold text-slate-900">{suggestion.medicine_name}</p>
                          <p className="text-sm text-slate-600">{suggestion.dosage} | {suggestion.frequency} | {suggestion.duration}</p>
                          {suggestion.instructions && <p className="text-xs text-slate-500 mt-1">{suggestion.instructions}</p>}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => applySuggestion(suggestion)} data-testid={`apply-suggestion-${index}`}>Add</Button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-purple-700 mt-3">Note: AI-generated suggestions. Please review and modify as needed.</p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Medications */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-manrope">Medications</CardTitle>
              <div className="flex space-x-2">
                <Button onClick={checkInteractions} size="sm" variant="outline" disabled={interactionsLoading} className="border-amber-500 text-amber-700 hover:bg-amber-50" data-testid="check-interactions-btn">
                  {interactionsLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
                  Check Drug Interactions
                </Button>
                <Button onClick={addMedication} size="sm" variant="outline" data-testid="add-medication-btn">
                  <Plus className="h-4 w-4 mr-2" /> Add Medication
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {interactions && (
              <Alert className={interactions.alerts?.length > 0 ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}>
                <AlertDescription>
                  <div className="flex items-center gap-2 mb-2">
                    {interactions.alerts?.length > 0
                      ? <AlertTriangle className="h-4 w-4 text-amber-700" />
                      : <ShieldAlert className="h-4 w-4 text-green-700" />}
                    <p className="font-manrope font-semibold">
                      {interactions.alerts?.length > 0 ? `${interactions.alerts.length} potential issue(s)` : 'No interactions detected'}
                    </p>
                  </div>
                  {interactions.summary && <p className="text-sm text-slate-700 mb-3">{interactions.summary}</p>}
                  <div className="space-y-2">
                    {(interactions.alerts || []).map((al, i) => (
                      <div key={`${(al.drugs_involved || []).join('-')}-${i}`} className={`p-3 rounded-lg border ${SEVERITY_COLORS[al.severity] || SEVERITY_COLORS.low}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="uppercase text-[10px]">{al.severity}</Badge>
                          <span className="text-sm font-semibold">{(al.drugs_involved || []).join(' + ')}</span>
                        </div>
                        <p className="text-sm">{al.description}</p>
                        {al.recommendation && <p className="text-xs mt-1 italic">→ {al.recommendation}</p>}
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {medications.map((med, index) => (
              <Card key={med._key} className="bg-slate-50 border-slate-200" data-testid={`medication-${index}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-manrope font-semibold text-sm text-slate-700">Medication {index + 1}</span>
                    {medications.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removeMedication(index)} data-testid={`remove-medication-${index}`}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Medicine Name</Label>
                      <DrugAutocomplete
                        value={med.medicine_name}
                        onChange={(v) => updateMedication(index, 'medicine_name', v)}
                        onSelect={(drug) => {
                          const updated = [...medications];
                          updated[index] = {
                            ...updated[index],
                            medicine_name: drug.name,
                            dosage: drug.default_dose || updated[index].dosage,
                            frequency: drug.default_frequency || updated[index].frequency,
                            duration: drug.default_duration || updated[index].duration,
                          };
                          setMedications(updated);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Dosage</Label>
                      <Input value={med.dosage} onChange={(e) => updateMedication(index, 'dosage', e.target.value)} placeholder="e.g., 500mg" data-testid={`dosage-${index}`} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Frequency</Label>
                      <Input value={med.frequency} onChange={(e) => updateMedication(index, 'frequency', e.target.value)} placeholder="e.g., Twice daily" data-testid={`frequency-${index}`} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Duration</Label>
                      <Input value={med.duration} onChange={(e) => updateMedication(index, 'duration', e.target.value)} placeholder="e.g., 7 days" data-testid={`duration-${index}`} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Special Instructions</Label>
                      <MicButton target={`med-${index}-instructions`} />
                    </div>
                    <Input value={med.instructions} onChange={(e) => updateMedication(index, 'instructions', e.target.value)} placeholder="e.g., Take after meals" data-testid={`instructions-${index}`} />
                  </div>

                  {/* Tapering section */}
                  <div className="border-t border-slate-200 pt-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!med.is_tapering}
                          onChange={() => toggleTapering(index)}
                          data-testid={`tapering-toggle-${index}`}
                          className="rounded border-slate-300"
                        />
                        <span>Tapering / step-down schedule</span>
                      </label>
                      {med.is_tapering && (
                        <Button size="sm" variant="ghost" onClick={() => addTaperStep(index)} data-testid={`add-taper-step-${index}`}>
                          <Plus className="h-3 w-3 mr-1" /> Step
                        </Button>
                      )}
                    </div>

                    {med.is_tapering && (med.taper_schedule || []).length > 0 && (
                      <div className="mt-3 space-y-2">
                        {(med.taper_schedule || []).map((step, sIdx) => (
                          <div key={`${med._key}-taper-${sIdx}`} className="bg-white p-3 rounded-lg border border-slate-200" data-testid={`taper-step-${index}-${sIdx}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-indigo-700">Step {sIdx + 1}</span>
                              <Button size="sm" variant="ghost" onClick={() => removeTaperStep(index, sIdx)} data-testid={`remove-taper-step-${index}-${sIdx}`}>
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </Button>
                            </div>
                            <div className="grid md:grid-cols-3 gap-2">
                              <Input value={step.dosage} onChange={(e) => updateTaperStep(index, sIdx, 'dosage', e.target.value)} placeholder="Dosage (e.g., 20mg)" data-testid={`taper-dosage-${index}-${sIdx}`} />
                              <Input value={step.frequency} onChange={(e) => updateTaperStep(index, sIdx, 'frequency', e.target.value)} placeholder="Frequency" data-testid={`taper-frequency-${index}-${sIdx}`} />
                              <Input value={step.duration} onChange={(e) => updateTaperStep(index, sIdx, 'duration', e.target.value)} placeholder="Duration (e.g., 7 days)" data-testid={`taper-duration-${index}-${sIdx}`} />
                            </div>
                            <Input value={step.notes} onChange={(e) => updateTaperStep(index, sIdx, 'notes', e.target.value)} placeholder="Notes (e.g., Then reduce)" className="mt-2" data-testid={`taper-notes-${index}-${sIdx}`} />
                          </div>
                        ))}
                        <p className="text-xs text-slate-500">Patient will see each step clearly, e.g., "Step 1: 20mg once daily for 7 days, then…"</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        {/* Lab / Imaging Orders */}
        <LabTestPicker tests={labTests} onChange={setLabTests} />

        {/* General instructions */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-manrope">General Instructions</CardTitle>
              <MicButton target="instructions" />
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={generalInstructions}
              onChange={(e) => setGeneralInstructions(e.target.value)}
              placeholder="Diet, precautions, follow-up… or tap mic to dictate"
              rows={6}
              data-testid="general-instructions-input"
              className="font-inter"
            />
          </CardContent>
        </Card>

        {/* Private Doctor Notes (admin/doctor-only) */}
        <Card className="border-slate-200 bg-slate-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-600" />
                <CardTitle className="font-manrope text-base">Private Doctor Notes</CardTitle>
                <Badge variant="outline" className="text-[10px]">Doctor only — never shared with patient</Badge>
              </div>
              <div className="flex items-center gap-2">
                <MicButton target="private" />
                {pastPrivateNotes.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setShowPastNotes(!showPastNotes)} data-testid="toggle-past-notes">
                    <History className="h-4 w-4 mr-1" />
                    {pastPrivateNotes.length} past
                    {showPastNotes ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={privateNotes}
              onChange={(e) => setPrivateNotes(e.target.value)}
              placeholder="Internal observations, differential diagnoses, follow-up reminders… (only you can see this on future visits)"
              rows={4}
              data-testid="private-notes-input"
              className="font-inter bg-white"
            />

            {showPastNotes && (
              <div className="space-y-2 max-h-64 overflow-y-auto" data-testid="past-notes-list">
                {pastPrivateNotes.map((n) => (
                  <div key={n.id} className="bg-white p-3 border border-slate-200 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1">{new Date(n.created_at).toLocaleString()}</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.private_doctor_notes}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ABHA linking */}
        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={linkToAbha}
                onChange={(e) => setLinkToAbha(e.target.checked)}
                data-testid="link-abha-checkbox"
                className="rounded border-slate-300"
              />
              <Link2 className="h-4 w-4 text-indigo-600" />
              <span className="text-sm text-slate-700">One-click link this prescription to patient's ABHA record</span>
            </label>
            <Badge variant="outline" className="text-[10px]">ABDM compliant</Badge>
          </CardContent>
        </Card>

        {/* Prescription footer: vitals summary + BMI + follow-up chips */}
        <Card className="border-slate-200 bg-slate-50" data-testid="rx-footer-card">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs">
                {vitals?.bp && <span className="px-2 py-1 rounded bg-white border border-slate-200"><b>BP</b> {vitals.bp}</span>}
                {vitals?.pulse && <span className="px-2 py-1 rounded bg-white border border-slate-200"><b>Pulse</b> {vitals.pulse}</span>}
                {vitals?.spo2 && <span className="px-2 py-1 rounded bg-white border border-slate-200"><b>SpO₂</b> {vitals.spo2}</span>}
                {vitals?.temperature && <span className="px-2 py-1 rounded bg-white border border-slate-200"><b>Temp</b> {vitals.temperature}</span>}
                {vitals?.weight && <span className="px-2 py-1 rounded bg-white border border-slate-200"><b>Wt</b> {vitals.weight}kg</span>}
                {vitals?.height && <span className="px-2 py-1 rounded bg-white border border-slate-200"><b>Ht</b> {vitals.height}cm</span>}
                {bmi && (
                  <span
                    className={`px-2 py-1 rounded border font-semibold ${bmiCategory?.color || ''}`}
                    data-testid="bmi-chip"
                  >
                    <b>BMI</b> {bmi} · {bmiCategory?.label}
                  </span>
                )}
                {!vitals?.bp && !vitals?.pulse && !vitals?.weight && (
                  <span className="text-slate-500 italic">No vitals recorded yet — ask the nurse to capture them from Vitals Entry.</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2" data-testid="followup-chips">
                <span className="text-xs text-slate-600 font-semibold">Follow-up:</span>
                {[{ l: '+3 D', d: 3 }, { l: '+1 W', d: 7 }, { l: '+2 W', d: 14 }, { l: '+1 M', d: 30 }].map((c) => (
                  <button
                    key={c.d}
                    type="button"
                    onClick={() => applyFollowUpChip(c.d)}
                    className="px-2 py-1 rounded-full text-xs bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    data-testid={`followup-chip-${c.d}`}
                  >
                    {c.l}
                  </button>
                ))}
                <Input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="h-7 text-xs w-36"
                  data-testid="followup-date-input"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action bar */}
        <div className="flex justify-between items-center">
          <Button variant="outline" onClick={() => setPaymentModalOpen(true)} className="border-green-600 text-green-600 hover:bg-green-50">
            <CreditCard className="mr-2 h-4 w-4" /> Request Payment
          </Button>
          <div className="flex space-x-3">
            <Button variant="outline" onClick={() => navigate('/appointments')} data-testid="cancel-btn">Cancel</Button>
            <Button variant="outline" onClick={handlePrint} data-testid="print-prescription-btn">
              <Printer className="mr-2 h-4 w-4" /> Print / PDF
            </Button>
            <Button onClick={submitPrescription} disabled={sending} className="bg-green-600 hover:bg-green-700" data-testid="submit-prescription-btn">
              {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending via WhatsApp…</> : <><Send className="mr-2 h-4 w-4" /> Send Prescription to Patient</>}
            </Button>
          </div>
        </div>
      </div>

      {appointment && (
        <RequestPaymentModalV2
          open={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          clientPhone={appointment.client_phone}
          clientName={appointment.client_name}
        />
      )}

      <PatientTimeline
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        clientName={appointment?.client_name}
        clientPhone={appointment?.client_phone}
      />
    </DashboardLayout>
  );
};

export default PrescriptionWriter;
