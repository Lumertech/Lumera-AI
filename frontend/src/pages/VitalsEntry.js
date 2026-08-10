import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Heart, ArrowLeft, CheckCircle2, Save } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const FIELDS = [
  { key: 'bp', label: 'BP (mmHg)', placeholder: '120/80' },
  { key: 'pulse', label: 'Pulse (bpm)', placeholder: '72' },
  { key: 'spo2', label: 'SpO2 (%)', placeholder: '98' },
  { key: 'temperature', label: 'Temperature (°F)', placeholder: '98.6' },
  { key: 'weight', label: 'Weight (kg)', placeholder: '70' },
  { key: 'height', label: 'Height (cm)', placeholder: '170' },
  { key: 'respiratory_rate', label: 'Respiratory Rate', placeholder: '16' },
];

const VitalsEntry = () => {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const [appt, setAppt] = useState(null);
  const [vitals, setVitals] = useState({});
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [a, v] = await Promise.all([
          axios.get(`${API_URL}/appointments/${appointmentId}`),
          axios.get(`${API_URL}/appointments/${appointmentId}/vitals`),
        ]);
        setAppt(a.data);
        setVitals(v.data.vitals || {});
        setMeta({ by: v.data.captured_by, at: v.data.captured_at });
      } catch (e) {
        toast.error(e.response?.data?.detail || 'Failed to load appointment');
        setTimeout(() => navigate('/appointments'), 1200);
      } finally {
        setLoading(false);
      }
    })();
  }, [appointmentId, navigate]);

  const set = (k) => (e) => setVitals({ ...vitals, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      const clean = Object.fromEntries(Object.entries(vitals).filter(([, v]) => v && String(v).trim()));
      const res = await axios.put(`${API_URL}/appointments/${appointmentId}/vitals`, clean);
      setMeta({ by: res.data.captured_by, at: new Date().toISOString() });
      setSavedOk(true);
      toast.success('Vitals saved — doctor will see these on the prescription');
      setTimeout(() => setSavedOk(false), 2500);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-6" data-testid="vitals-entry-page">
        <div>
          <Link to={`/appointments/${appointmentId}`} className="inline-flex items-center text-sm text-slate-600 hover:text-indigo-700 mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to appointment
          </Link>
          <h1 className="font-manrope font-bold text-3xl text-slate-900">Take Patient Vitals</h1>
          {appt && (
            <p className="text-slate-600 font-inter mt-1">
              Patient: <strong>{appt.client_name}</strong>
              {appt.client_phone ? <span className="text-slate-500 ml-2">· {appt.client_phone}</span> : null}
            </p>
          )}
        </div>

        <Card className="border-slate-200 bg-gradient-to-br from-rose-50 to-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Heart className="h-5 w-5 mr-2 text-rose-600" />
              Vitals
            </CardTitle>
            <CardDescription>
              These readings will pre-populate the doctor&apos;s prescription screen automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <Input
                    value={vitals[f.key] || ''}
                    onChange={set(f.key)}
                    placeholder={f.placeholder}
                    className="h-11 text-lg"
                    data-testid={`vitals-entry-${f.key}`}
                  />
                </div>
              ))}
            </div>

            {meta?.by && (
              <p className="text-xs text-slate-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Last saved by <strong className="ml-0.5">{meta.by}</strong>
                {meta.at ? <> · {new Date(meta.at).toLocaleString()}</> : null}
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={save}
                disabled={saving}
                className="bg-rose-600 hover:bg-rose-700"
                data-testid="vitals-save-btn"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving…' : 'Save vitals'}
              </Button>
              {savedOk && (
                <Badge className="bg-emerald-600" data-testid="vitals-saved-badge">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Saved
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default VitalsEntry;
