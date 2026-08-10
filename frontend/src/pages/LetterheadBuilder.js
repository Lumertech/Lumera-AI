import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileImage, PenLine, Upload, Trash2, Save, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { printDocument, renderPrescriptionHTML } from '@/lib/print';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const LetterheadBuilder = () => {
  const [form, setForm] = useState({
    clinic_name: '', clinic_address: '', clinic_phone: '', clinic_email: '',
    doctor_name: '', doctor_qualifications: '', doctor_specialty: '',
    mci_registration: '', footer_note: '',
  });
  const [logo, setLogo] = useState('');
  const [signature, setSignature] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const logoInput = useRef(null);
  const sigInput = useRef(null);

  const load = async () => {
    try {
      const res = await axios.get(`${API_URL}/letterhead`);
      const d = res.data || {};
      setForm({
        clinic_name: d.clinic_name || '',
        clinic_address: d.clinic_address || '',
        clinic_phone: d.clinic_phone || '',
        clinic_email: d.clinic_email || '',
        doctor_name: d.doctor_name || '',
        doctor_qualifications: d.doctor_qualifications || '',
        doctor_specialty: d.doctor_specialty || '',
        mci_registration: d.mci_registration || '',
        footer_note: d.footer_note || '',
      });
      setLogo(d.logo_data_url || '');
      setSignature(d.signature_data_url || '');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/letterhead`, form);
      toast.success('Letterhead saved — will appear on every printed prescription');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const uploadImage = async (kind, file) => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await axios.post(`${API_URL}/letterhead/${kind}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (kind === 'logo') setLogo(res.data.data_url);
      else setSignature(res.data.data_url);
      toast.success(`${kind === 'logo' ? 'Logo' : 'Signature'} uploaded`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed');
    }
  };

  const removeImage = async (kind) => {
    try {
      await axios.delete(`${API_URL}/letterhead/${kind}`);
      if (kind === 'logo') setLogo(''); else setSignature('');
      toast.success('Removed');
    } catch (e) { toast.error('Failed'); }
  };

  const previewPrint = () => {
    const html = renderPrescriptionHTML({
      doctor: { name: form.doctor_name || 'Your Name', profession: form.doctor_specialty },
      patient: { name: 'Sample Patient', phone: '+91 90000 00000', age: '35', sex: 'F' },
      medications: [
        { medicine_name: 'Pan 40', dosage: '40mg', frequency: '1-0-0 before breakfast', duration: '14 days', instructions: 'Empty stomach' },
        { medicine_name: 'Crocin 500', dosage: '500mg', frequency: '1-1-1 after food', duration: '5 days', instructions: '' },
      ],
      instructions: 'Drink plenty of water. Avoid oily food. Follow up if symptoms persist.',
      vitals: { bp: '120/80', pulse: '72', spo2: '98', temperature: '98.6' },
      labTests: [{ name: 'Complete Blood Count (CBC)', code: 'CBC', category: 'Hematology', sample: 'Blood', notes: '' }],
      letterhead: { ...form, logo_data_url: logo, signature_data_url: signature },
    });
    printDocument({ title: 'Letterhead Preview', html });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6" data-testid="letterhead-builder">
        <div>
          <h1 className="font-manrope font-bold text-3xl text-slate-900">Prescription Letterhead</h1>
          <p className="text-slate-600 font-inter mt-1">
            Upload your logo, doctor signature, and clinic details. They&apos;ll appear on every printed prescription.
          </p>
        </div>

        {/* Clinic + Doctor details */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Clinic &amp; Doctor</CardTitle>
            <CardDescription>Shown at the top and bottom of every prescription</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Clinic name</Label><Input value={form.clinic_name} onChange={set('clinic_name')} placeholder="Sunrise Polyclinic" data-testid="lh-clinic-name" /></div>
              <div><Label>Clinic phone</Label><Input value={form.clinic_phone} onChange={set('clinic_phone')} placeholder="+91…" data-testid="lh-clinic-phone" /></div>
              <div className="md:col-span-2"><Label>Clinic address</Label><Input value={form.clinic_address} onChange={set('clinic_address')} placeholder="12 Marine Drive, Mumbai 400001" data-testid="lh-clinic-address" /></div>
              <div><Label>Clinic email</Label><Input type="email" value={form.clinic_email} onChange={set('clinic_email')} placeholder="care@…" data-testid="lh-clinic-email" /></div>
              <div><Label>Doctor name (as printed)</Label><Input value={form.doctor_name} onChange={set('doctor_name')} placeholder="Sarah Johnson" data-testid="lh-doctor-name" /></div>
              <div><Label>Qualifications</Label><Input value={form.doctor_qualifications} onChange={set('doctor_qualifications')} placeholder="MBBS, MD (Medicine)" data-testid="lh-quals" /></div>
              <div><Label>Specialty</Label><Input value={form.doctor_specialty} onChange={set('doctor_specialty')} placeholder="Consultant Physician" data-testid="lh-specialty" /></div>
              <div><Label>Medical Council Reg. No.</Label><Input value={form.mci_registration} onChange={set('mci_registration')} placeholder="MMC 12345 / MCI 67890" data-testid="lh-mci" /></div>
            </div>
            <div><Label>Footer note (optional)</Label>
              <Textarea rows={2} value={form.footer_note} onChange={set('footer_note')} placeholder="Consulting hours: Mon-Sat 10am–7pm · Emergency 24×7" data-testid="lh-footer" />
            </div>
          </CardContent>
        </Card>

        {/* Logo + Signature */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center"><FileImage className="h-5 w-5 mr-2 text-indigo-600" /> Clinic Logo</CardTitle>
              <CardDescription>PNG / JPG, ≤ 350 KB</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {logo ? (
                <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-center h-32">
                  <img src={logo} alt="clinic logo" className="max-h-24" />
                </div>
              ) : (
                <div className="p-6 bg-slate-50 rounded-lg text-center text-slate-500 text-sm">No logo uploaded yet</div>
              )}
              <div className="flex gap-2">
                <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage('logo', e.target.files?.[0])} data-testid="lh-logo-input" />
                <Button variant="outline" onClick={() => logoInput.current?.click()} data-testid="lh-logo-upload"><Upload className="h-4 w-4 mr-1" /> Upload</Button>
                {logo && <Button variant="ghost" onClick={() => removeImage('logo')} className="text-red-600" data-testid="lh-logo-remove"><Trash2 className="h-4 w-4 mr-1" /> Remove</Button>}
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center"><PenLine className="h-5 w-5 mr-2 text-indigo-600" /> Doctor Signature</CardTitle>
              <CardDescription>Transparent PNG works best</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {signature ? (
                <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-center h-32">
                  <img src={signature} alt="doctor signature" className="max-h-24" />
                </div>
              ) : (
                <div className="p-6 bg-slate-50 rounded-lg text-center text-slate-500 text-sm">No signature uploaded yet</div>
              )}
              <div className="flex gap-2">
                <input ref={sigInput} type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage('signature', e.target.files?.[0])} data-testid="lh-sig-input" />
                <Button variant="outline" onClick={() => sigInput.current?.click()} data-testid="lh-sig-upload"><Upload className="h-4 w-4 mr-1" /> Upload</Button>
                {signature && <Button variant="ghost" onClick={() => removeImage('signature')} className="text-red-600" data-testid="lh-sig-remove"><Trash2 className="h-4 w-4 mr-1" /> Remove</Button>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="lh-save"><Save className="h-4 w-4 mr-1" />{saving ? 'Saving…' : 'Save letterhead'}</Button>
          <Button variant="outline" onClick={previewPrint} data-testid="lh-preview"><Printer className="h-4 w-4 mr-1" /> Preview print</Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default LetterheadBuilder;
