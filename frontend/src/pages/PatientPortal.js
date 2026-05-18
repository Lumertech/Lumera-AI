import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck, Pill, FileText, Calendar, CreditCard, AlertCircle,
  Loader2, Clock, User, Stethoscope
} from 'lucide-react';
import SealOfPrivacy from '@/components/SealOfPrivacy';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const Section = ({ icon: Icon, title, count, children }) => (
  <Card className="border-slate-200">
    <CardHeader>
      <CardTitle className="font-manrope flex items-center gap-2">
        <Icon className="h-5 w-5 text-indigo-600" />
        <span>{title}</span>
        {typeof count === 'number' && <Badge variant="outline" className="text-[10px]">{count}</Badge>}
      </CardTitle>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const EmptyState = ({ text }) => (
  <p className="text-sm text-slate-500 italic py-4 text-center">{text}</p>
);

const PrescriptionRow = ({ rx }) => (
  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
    <div className="flex items-center justify-between mb-2">
      <p className="font-semibold text-sm text-slate-800">Prescription</p>
      <p className="text-xs text-slate-500">{new Date(rx.created_at).toLocaleDateString()}</p>
    </div>
    <div className="space-y-1.5 mb-2">
      {(rx.medications || []).map((m, i) => (
        <div key={i} className="text-sm text-slate-700">
          <span className="font-medium">{m.medicine_name}</span>
          {m.dosage && <span className="text-slate-500"> · {m.dosage}</span>}
          {m.frequency && <span className="text-slate-500"> · {m.frequency}</span>}
          {m.duration && <span className="text-slate-500"> · {m.duration}</span>}
          {m.instructions && <p className="text-xs text-slate-500 ml-3 italic">{m.instructions}</p>}
          {m.is_tapering && m.taper_schedule?.length > 0 && (
            <div className="ml-3 mt-1 space-y-0.5 text-xs text-indigo-700">
              {m.taper_schedule.map((s, idx) => (
                <div key={idx}>↳ Step {idx + 1}: {s.dosage} · {s.frequency} for {s.duration}{s.notes ? ` (${s.notes})` : ''}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
    {rx.instructions && <p className="text-xs text-slate-600 mt-2 p-2 bg-white rounded border border-slate-200">{rx.instructions}</p>}
    <p className="text-xs text-slate-500 mt-2">Prescribed by Dr. {rx.doctor_name}</p>
  </div>
);

const ConsultationNoteRow = ({ note }) => (
  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
    <div className="flex items-center justify-between mb-2">
      <p className="font-semibold text-sm text-slate-800">Consultation Note</p>
      <p className="text-xs text-slate-500">{new Date(note.created_at).toLocaleDateString()}</p>
    </div>
    <p className="text-sm text-slate-700 whitespace-pre-wrap mb-2">{note.summary}</p>
    {note.recommendations && (
      <div className="text-xs text-slate-600 mt-2 p-2 bg-white rounded border border-slate-200">
        <strong>Recommendations:</strong> {note.recommendations}
      </div>
    )}
    <p className="text-xs text-slate-500 mt-2">From {note.practitioner_name} ({note.practitioner_profession})</p>
  </div>
);

const MedicationRow = ({ med }) => (
  <div className="bg-rose-50 rounded-lg p-3 border border-rose-200">
    <div className="flex items-center justify-between">
      <div>
        <p className="font-semibold text-sm text-slate-900">{med.medicine_name} <span className="text-slate-500 font-normal">({med.dosage})</span></p>
        <p className="text-xs text-slate-600 mt-0.5">{(med.times || []).join(', ')} · until {med.end_date}</p>
        {med.instructions && <p className="text-xs text-slate-500 italic">{med.instructions}</p>}
      </div>
      <Badge className={med.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>{med.status}</Badge>
    </div>
  </div>
);

const AppointmentRow = ({ a, past }) => (
  <div className={`rounded-lg p-3 border ${past ? 'bg-slate-50 border-slate-200' : 'bg-indigo-50 border-indigo-200'}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="font-semibold text-sm text-slate-800">{a.appointment_date} at {a.start_time}</p>
        <p className="text-xs text-slate-500">Mode: {a.consultation_mode || 'in-person'}</p>
      </div>
      <Badge variant="outline" className="text-[10px] capitalize">{a.status}</Badge>
    </div>
  </div>
);

const PaymentRow = ({ p }) => (
  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 flex items-center justify-between">
    <div>
      <p className="font-semibold text-sm text-slate-800">₹{(p.amount || 0).toLocaleString('en-IN')}</p>
      <p className="text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString()} · {p.payment_status}</p>
    </div>
    <Badge variant="outline" className="capitalize text-[10px]">{p.payment_status}</Badge>
  </div>
);

const PatientPortal = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [notes, setNotes] = useState([]);
  const [meds, setMeds] = useState([]);
  const [appts, setAppts] = useState({ upcoming: [], past: [] });
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, rx, cn, m, ap, pay] = await Promise.all([
          axios.get(`${API_URL}/patient-portal/${token}/profile`),
          axios.get(`${API_URL}/patient-portal/${token}/prescriptions`),
          axios.get(`${API_URL}/patient-portal/${token}/consultation-notes`),
          axios.get(`${API_URL}/patient-portal/${token}/medications`),
          axios.get(`${API_URL}/patient-portal/${token}/appointments`),
          axios.get(`${API_URL}/patient-portal/${token}/payments`),
        ]);
        if (cancelled) return;
        setProfile(p.data);
        setPrescriptions(rx.data || []);
        setNotes(cn.data || []);
        setMeds(m.data || []);
        setAppts(ap.data || { upcoming: [], past: [] });
        setPayments(pay.data || []);
      } catch (err) {
        const code = err?.response?.status;
        if (code === 410) setError('This link has expired or been revoked.');
        else if (code === 404) setError('This link is invalid.');
        else setError('Could not load your health information.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-teal-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-rose-50 p-6">
        <Card className="max-w-md w-full" data-testid="portal-error">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-rose-500 mx-auto mb-4" />
            <h1 className="font-manrope font-bold text-xl text-slate-900 mb-2">Link unavailable</h1>
            <p className="text-sm text-slate-600">{error}</p>
            <p className="text-xs text-slate-400 mt-6">Ask your doctor to send you a new link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50" data-testid="patient-portal-page">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-manrope font-bold text-slate-900">Lumera Patient Portal</p>
              <p className="text-xs text-slate-500">Secure · Patient-private</p>
            </div>
          </div>
          <SealOfPrivacy />
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Profile card */}
        <Card className="border-slate-200 bg-gradient-to-br from-indigo-50 to-teal-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white shadow-sm border border-slate-200 flex items-center justify-center">
                  <User className="h-5 w-5 text-indigo-700" />
                </div>
                <div>
                  <h1 className="font-manrope font-bold text-xl text-slate-900">Hi {profile?.client_name || 'there'}</h1>
                  <p className="text-sm text-slate-600">Your records with <strong>{profile?.doctor_name}</strong></p>
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-xs text-slate-500 flex items-center gap-1 justify-end"><Clock className="h-3 w-3" /> Link expires</p>
                <p className="text-xs text-slate-700">{new Date(profile?.expires_at).toLocaleDateString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active medications */}
        <Section icon={Pill} title="Active medications" count={meds.length}>
          {meds.length === 0 ? <EmptyState text="No active medications." /> : (
            <div className="space-y-2" data-testid="portal-medications">
              {meds.map((m) => <MedicationRow key={m.id} med={m} />)}
            </div>
          )}
        </Section>

        {/* Upcoming appointments */}
        <Section icon={Calendar} title="Upcoming appointments" count={appts.upcoming.length}>
          {appts.upcoming.length === 0 ? <EmptyState text="No upcoming appointments." /> : (
            <div className="space-y-2" data-testid="portal-upcoming">
              {appts.upcoming.map((a) => <AppointmentRow key={a.id} a={a} past={false} />)}
            </div>
          )}
        </Section>

        {/* Prescriptions */}
        <Section icon={FileText} title="Prescriptions" count={prescriptions.length}>
          {prescriptions.length === 0 ? <EmptyState text="No prescriptions yet." /> : (
            <div className="space-y-3" data-testid="portal-prescriptions">
              {prescriptions.map((rx) => <PrescriptionRow key={rx.id} rx={rx} />)}
            </div>
          )}
        </Section>

        {/* Consultation notes */}
        <Section icon={ShieldCheck} title="Consultation notes" count={notes.length}>
          {notes.length === 0 ? <EmptyState text="No consultation notes." /> : (
            <div className="space-y-3" data-testid="portal-notes">
              {notes.map((n) => <ConsultationNoteRow key={n.id} note={n} />)}
            </div>
          )}
        </Section>

        {/* Past appointments (collapsed visually if many) */}
        {appts.past.length > 0 && (
          <Section icon={Calendar} title="Past visits" count={appts.past.length}>
            <div className="space-y-2" data-testid="portal-past">
              {appts.past.slice(0, 10).map((a) => <AppointmentRow key={a.id} a={a} past={true} />)}
            </div>
          </Section>
        )}

        {/* Payments */}
        <Section icon={CreditCard} title="Payment history" count={payments.length}>
          {payments.length === 0 ? <EmptyState text="No payment history." /> : (
            <div className="space-y-2" data-testid="portal-payments">
              {payments.map((p) => <PaymentRow key={p.id} p={p} />)}
            </div>
          )}
        </Section>

        <p className="text-center text-xs text-slate-400 pt-6">
          This is a read-only summary of your visits. For changes, please reply on WhatsApp to <strong>{profile?.doctor_name}</strong>.
        </p>
      </main>
    </div>
  );
};

export default PatientPortal;
