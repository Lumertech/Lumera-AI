import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mic, MicOff, Send, Lock, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const ConsultationNotesWriter = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [summary, setSummary] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [privateNotes, setPrivateNotes] = useState('');
  const [sendToClient, setSendToClient] = useState(true);

  // Mic
  const [recordingTarget, setRecordingTarget] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const mrRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    fetchAppointment();
  }, [id]);

  const fetchAppointment = async () => {
    try {
      const res = await axios.get(`${API_URL}/appointments/${id}`);
      setAppointment(res.data);
      if (res.data.notes) setSummary(res.data.notes);
    } catch (err) {
      toast.error('Failed to load appointment');
    } finally {
      setLoading(false);
    }
  };

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
      mrRef.current = mr;
      mr.start();
      setRecordingTarget(target);
      toast.info('Recording…');
    } catch (err) {
      toast.error('Microphone permission denied');
      setRecordingTarget(null);
    }
  };

  const stopRecording = () => {
    if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop();
  };

  const uploadAndTranscribe = async (blob, target) => {
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'note.webm');
      fd.append('language', 'en');
      // Reuse the consultation transcribe endpoint (Whisper) — works for all professions
      const endpoint = (user?.profession === 'doctor')
        ? `${API_URL}/prescriptions/transcribe`
        : `${API_URL}/consultations/transcribe`;
      const res = await axios.post(endpoint, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const text = (res.data?.text || '').trim();
      if (!text) { toast.error('No speech detected'); return; }
      if (target === 'summary') setSummary((p) => p ? `${p} ${text}` : text);
      else if (target === 'recommendations') setRecommendations((p) => p ? `${p} ${text}` : text);
      else if (target === 'private') setPrivateNotes((p) => p ? `${p} ${text}` : text);
      toast.success('Transcribed');
    } catch (err) {
      toast.error(extractApiError(err, 'Transcription failed'));
    } finally {
      setTranscribing(false);
    }
  };

  const MicButton = ({ target }) => {
    const active = recordingTarget === target;
    const disabled = (recordingTarget !== null && !active) || transcribing;
    return (
      <Button
        type="button" size="sm" variant={active ? 'destructive' : 'outline'}
        onClick={() => (active ? stopRecording() : startRecording(target))}
        disabled={disabled}
        data-testid={`mic-${target}`}
        className={active ? 'animate-pulse' : ''}
      >
        {transcribing && !active ? <Loader2 className="h-4 w-4 animate-spin" />
          : active ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>
    );
  };

  const submitNotes = async () => {
    if (!summary.trim()) return toast.error('Please add a session summary');
    setSending(true);
    try {
      await axios.post(`${API_URL}/consultation-notes`, {
        appointment_id: id,
        client_name: appointment.client_name,
        summary,
        recommendations,
        private_notes: privateNotes,
        send_to_client: sendToClient,
      });
      toast.success(sendToClient ? 'Notes saved and queued to client via WhatsApp' : 'Notes saved');
      setTimeout(() => navigate('/appointments'), 1200);
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to save notes'));
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

  const professionLabel = user?.profession || 'Practitioner';

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="consultation-notes-page">
        <Card className="border-slate-200 bg-gradient-to-br from-teal-50 to-emerald-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-manrope font-bold text-2xl text-slate-900 mb-1 flex items-center gap-2">
                  <FileText className="h-6 w-6 text-emerald-700" /> Consultation Notes
                </h1>
                <p className="text-sm text-slate-600 font-inter">
                  Patient: <strong>{appointment?.client_name}</strong> · Mode: <Badge variant="outline" className="ml-1 capitalize">{professionLabel}</Badge>
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate(`/appointments/${id}`)} data-testid="back-btn">Back</Button>
            </div>
          </CardContent>
        </Card>

        {/* Session Summary */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-manrope">Session Summary <span className="text-xs font-normal text-slate-500">(shared with client)</span></CardTitle>
              <MicButton target="summary" />
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What was discussed, observed, or assessed during the session…"
              rows={6}
              data-testid="summary-input"
            />
          </CardContent>
        </Card>

        {/* Recommendations */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-manrope">Recommendations & Follow-up <span className="text-xs font-normal text-slate-500">(shared with client)</span></CardTitle>
              <MicButton target="recommendations" />
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              placeholder="Lifestyle changes, exercises, next steps, when to return…"
              rows={5}
              data-testid="recommendations-input"
            />
          </CardContent>
        </Card>

        {/* Private Notes */}
        <Card className="border-slate-200 bg-slate-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-600" />
                <CardTitle className="font-manrope text-base">Private Notes</CardTitle>
                <Badge variant="outline" className="text-[10px]">Practitioner only — never sent</Badge>
              </div>
              <MicButton target="private" />
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={privateNotes}
              onChange={(e) => setPrivateNotes(e.target.value)}
              placeholder="Internal observations, follow-up reminders, anything you want to reference later…"
              rows={4}
              data-testid="private-notes-input"
              className="bg-white"
            />
          </CardContent>
        </Card>

        {/* Send + submit */}
        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendToClient}
                onChange={(e) => setSendToClient(e.target.checked)}
                data-testid="send-to-client-checkbox"
              />
              <span className="text-sm text-slate-700">Send the summary + recommendations to <strong>{appointment?.client_name}</strong> via WhatsApp</span>
            </label>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/appointments')} data-testid="cancel-btn">Cancel</Button>
          <Button onClick={submitNotes} disabled={sending} className="bg-emerald-600 hover:bg-emerald-700" data-testid="submit-notes-btn">
            {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : <><Send className="mr-2 h-4 w-4" /> {sendToClient ? 'Save & Send to Client' : 'Save Notes'}</>}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ConsultationNotesWriter;
