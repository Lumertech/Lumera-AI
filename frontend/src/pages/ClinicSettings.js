import React, { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, Trash2, Star, Users, UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/errors';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const emptyClinic = { name: '', address: '', phone: '', email: '', branding_color: '#4F46E5', is_primary: false };
const emptySub = { name: '', email: '', phone_number: '', password: '', clinic_id: '', role: 'front_desk' };

const ClinicSettings = () => {
  const [clinics, setClinics] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clinicForm, setClinicForm] = useState(emptyClinic);
  const [subForm, setSubForm] = useState(emptySub);
  const [creatingClinic, setCreatingClinic] = useState(false);
  const [creatingSub, setCreatingSub] = useState(false);

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        axios.get(`${API_URL}/clinics`),
        axios.get(`${API_URL}/clinics/sub-users`),
      ]);
      setClinics(c.data || []);
      setSubs(s.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load clinic settings');
    } finally {
      setLoading(false);
    }
  };

  const createClinic = async () => {
    if (!clinicForm.name.trim()) return toast.error('Clinic name is required');
    setCreatingClinic(true);
    try {
      await axios.post(`${API_URL}/clinics`, clinicForm);
      toast.success('Clinic added');
      setClinicForm(emptyClinic);
      refresh();
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to add clinic'));
    } finally {
      setCreatingClinic(false);
    }
  };

  const deleteClinic = async (id) => {
    if (!window.confirm('Delete this clinic?')) return;
    try {
      await axios.delete(`${API_URL}/clinics/${id}`);
      toast.success('Clinic deleted');
      refresh();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const setPrimary = async (clinic) => {
    try {
      await axios.put(`${API_URL}/clinics/${clinic.id}`, { is_primary: true });
      toast.success(`${clinic.name} is now primary`);
      refresh();
    } catch (err) {
      toast.error('Failed to update');
    }
  };

  const createSubUser = async () => {
    if (!subForm.name.trim() || !subForm.email.trim() || !subForm.password.trim() || !subForm.clinic_id) {
      return toast.error('All fields required (name, email, password, clinic)');
    }
    setCreatingSub(true);
    try {
      await axios.post(`${API_URL}/clinics/sub-users`, subForm);
      toast.success('Team member added');
      setSubForm(emptySub);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to add team member');
    } finally {
      setCreatingSub(false);
    }
  };

  const deleteSubUser = async (id) => {
    if (!window.confirm('Remove this team member?')) return;
    try {
      await axios.delete(`${API_URL}/clinics/sub-users/${id}`);
      toast.success('Team member removed');
      refresh();
    } catch (err) {
      toast.error('Failed to delete');
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
      <div className="space-y-6" data-testid="clinic-settings-page">
        <Card className="border-slate-200 bg-gradient-to-br from-indigo-50 to-teal-50">
          <CardContent className="p-6">
            <h1 className="font-manrope font-bold text-2xl text-slate-900 mb-1 flex items-center gap-2">
              <Building2 className="h-6 w-6 text-indigo-600" /> Clinic Management
            </h1>
            <p className="text-sm text-slate-600 font-inter">Manage multi-location clinics and clinic staff (Front Desk and Assistants). Sub-users cannot edit pricing, bot instructions, or view prescriptions.</p>
          </CardContent>
        </Card>

        {/* Clinics list */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-manrope flex items-center gap-2"><Building2 className="h-5 w-5" /> Your Clinics ({clinics.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {clinics.length === 0 && <p className="text-sm text-slate-500">No clinics yet. Add your first clinic below.</p>}
            {clinics.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200" data-testid={`clinic-${c.id}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: c.branding_color }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-manrope font-semibold text-slate-900 flex items-center gap-2">
                      {c.name}
                      {c.is_primary && <Badge className="bg-amber-100 text-amber-800 text-[10px]"><Star className="h-3 w-3 mr-1" />Primary</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">{c.address || 'No address'} · {c.phone || 'No phone'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!c.is_primary && (
                    <Button size="sm" variant="ghost" onClick={() => setPrimary(c)} data-testid={`set-primary-${c.id}`}>
                      <Star className="h-4 w-4 mr-1" /> Make primary
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => deleteClinic(c.id)} data-testid={`delete-clinic-${c.id}`}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Add clinic */}
        <Card>
          <CardHeader>
            <CardTitle className="font-manrope flex items-center gap-2"><Plus className="h-5 w-5" /> Add Clinic Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Clinic name</Label>
                <Input value={clinicForm.name} onChange={(e) => setClinicForm({ ...clinicForm, name: e.target.value })} placeholder="e.g., Lumera Andheri" data-testid="clinic-name-input" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={clinicForm.phone} onChange={(e) => setClinicForm({ ...clinicForm, phone: e.target.value })} placeholder="+91 9999 9999" data-testid="clinic-phone-input" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Address</Label>
                <Input value={clinicForm.address} onChange={(e) => setClinicForm({ ...clinicForm, address: e.target.value })} placeholder="Shop 3, MG Road, Mumbai 400001" data-testid="clinic-address-input" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={clinicForm.email} onChange={(e) => setClinicForm({ ...clinicForm, email: e.target.value })} placeholder="clinic@example.com" data-testid="clinic-email-input" />
              </div>
              <div>
                <Label className="text-xs">Branding color</Label>
                <input type="color" value={clinicForm.branding_color} onChange={(e) => setClinicForm({ ...clinicForm, branding_color: e.target.value })} className="h-10 w-20 rounded border border-slate-300" data-testid="clinic-color-input" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={clinicForm.is_primary} onChange={(e) => setClinicForm({ ...clinicForm, is_primary: e.target.checked })} data-testid="clinic-primary-checkbox" />
              Set as primary (used for patient communications)
            </label>
            <Button onClick={createClinic} disabled={creatingClinic} className="bg-indigo-600 hover:bg-indigo-700" data-testid="create-clinic-btn">
              {creatingClinic ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Add Clinic
            </Button>
          </CardContent>
        </Card>

        {/* Receptionists */}
        <Card>
          <CardHeader>
            <CardTitle className="font-manrope flex items-center gap-2"><Users className="h-5 w-5" /> Clinic Staff ({subs.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {subs.length === 0 && <p className="text-sm text-slate-500">No staff yet. Add up to 2 Front Desk + 2 Assistant per clinic.</p>}
            {subs.map((s) => {
              const clinic = clinics.find((c) => c.id === s.clinic_id);
              const roleLabel = s.role === 'assistant' ? 'Assistant' : 'Front Desk';
              const roleClass = s.role === 'assistant' ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800';
              return (
                <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200" data-testid={`sub-user-${s.id}`}>
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-manrope font-semibold">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.email} · {clinic ? clinic.name : 'No clinic'}</p>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${roleClass}`}>{roleLabel}</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => deleteSubUser(s.id)} data-testid={`delete-sub-${s.id}`}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Add receptionist */}
        <Card>
          <CardHeader>
            <CardTitle className="font-manrope flex items-center gap-2"><UserPlus className="h-5 w-5" /> Add Staff Member</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} data-testid="sub-name-input" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" value={subForm.email} onChange={(e) => setSubForm({ ...subForm, email: e.target.value })} data-testid="sub-email-input" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={subForm.phone_number} onChange={(e) => setSubForm({ ...subForm, phone_number: e.target.value })} data-testid="sub-phone-input" />
              </div>
              <div>
                <Label className="text-xs">Password</Label>
                <Input type="password" value={subForm.password} onChange={(e) => setSubForm({ ...subForm, password: e.target.value })} data-testid="sub-password-input" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Assign to clinic</Label>
                <select value={subForm.clinic_id} onChange={(e) => setSubForm({ ...subForm, clinic_id: e.target.value })} className="w-full h-10 rounded-md border border-slate-300 px-3 bg-white text-sm" data-testid="sub-clinic-select">
                  <option value="">— Select clinic —</option>
                  {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Role</Label>
                <select
                  value={subForm.role}
                  onChange={(e) => setSubForm({ ...subForm, role: e.target.value })}
                  className="w-full h-10 rounded-md border border-slate-300 px-3 bg-white text-sm"
                  data-testid="sub-role-select"
                >
                  <option value="front_desk">Front Desk — manage appointments, clients, reminders</option>
                  <option value="assistant">Assistant — view schedules, update appointment status, read-only clients</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-500">Neither role can view/edit pricing, bot instructions, prescriptions, or revenue. Assistants have stricter read-mostly access.</p>
            <Button onClick={createSubUser} disabled={creatingSub} className="bg-indigo-600 hover:bg-indigo-700" data-testid="create-sub-btn">
              {creatingSub ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />} Add Staff Member
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ClinicSettings;
