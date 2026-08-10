import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { UserPlus, Users, Trash2, Mail } from 'lucide-react';
import PolyclinicLayout from '@/components/Layout/PolyclinicLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const PolyclinicDoctors = () => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    try {
      const res = await axios.get(`${API_URL}/polyclinic/doctors`);
      setDoctors(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const invite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    try {
      const res = await axios.post(`${API_URL}/polyclinic/doctors/invite`, { email });
      toast.success(res.data.message || 'Doctor added');
      setEmail('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add doctor');
    } finally {
      setInviting(false);
    }
  };

  const remove = async (doc) => {
    if (!window.confirm(`Remove ${doc.name || doc.email} from the polyclinic?`)) return;
    try {
      await axios.delete(`${API_URL}/polyclinic/doctors/${doc.id}`);
      toast.success('Doctor removed');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove doctor');
    }
  };

  return (
    <PolyclinicLayout>
      <div className="space-y-6" data-testid="polyclinic-doctors-page">
        <div>
          <h1 className="font-manrope font-bold text-3xl text-slate-900 mb-1">Doctors</h1>
          <p className="text-slate-600">Add existing Lumera doctors to your polyclinic.</p>
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center">
              <UserPlus className="h-5 w-5 mr-2 text-indigo-600" /> Add a doctor
            </CardTitle>
            <CardDescription>
              The doctor must already have a Lumera account. They&apos;ll be linked as soon as you add their email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={invite} className="flex gap-2">
              <div className="flex-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor@example.com"
                  type="email"
                  required
                  className="pl-9"
                  data-testid="polyclinic-invite-email"
                />
              </div>
              <Button type="submit" disabled={inviting} className="bg-indigo-600 hover:bg-indigo-700" data-testid="polyclinic-invite-submit">
                {inviting ? 'Adding…' : 'Add doctor'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="h-5 w-5 mr-2 text-indigo-600" /> Doctors in your polyclinic ({doctors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-slate-500 py-6 text-center">Loading…</div>
            ) : doctors.length === 0 ? (
              <div className="text-sm text-slate-500 py-6 text-center">No doctors added yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {doctors.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-3" data-testid={`polyclinic-doctor-${d.id}`}>
                    <div>
                      <p className="font-medium text-slate-900">{d.name || d.email}</p>
                      <p className="text-xs text-slate-500">{d.email} · {d.profession}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(d)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      data-testid={`polyclinic-remove-${d.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PolyclinicLayout>
  );
};

export default PolyclinicDoctors;
