import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Settings as Cog } from 'lucide-react';
import PolyclinicLayout from '@/components/Layout/PolyclinicLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const PolyclinicSettings = () => {
  const [form, setForm] = useState({ polyclinic_name: '', polyclinic_address: '', polyclinic_phone: '', polyclinic_email: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/polyclinic/me`);
        setForm({
          polyclinic_name: res.data.name || '',
          polyclinic_address: res.data.address || '',
          polyclinic_phone: res.data.phone || '',
          polyclinic_email: res.data.email || '',
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API_URL}/polyclinic/me`, form);
      toast.success('Polyclinic settings saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <PolyclinicLayout>
      <div className="max-w-2xl space-y-6" data-testid="polyclinic-settings-page">
        <div>
          <h1 className="font-manrope font-bold text-3xl text-slate-900 mb-1">Settings</h1>
          <p className="text-slate-600">Update your polyclinic profile.</p>
        </div>
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center"><Cog className="h-5 w-5 mr-2 text-indigo-600" /> Polyclinic profile</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : (
              <form onSubmit={save} className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input value={form.polyclinic_name} onChange={set('polyclinic_name')} required data-testid="settings-name" />
                </div>
                <div>
                  <Label>Address</Label>
                  <Input value={form.polyclinic_address} onChange={set('polyclinic_address')} data-testid="settings-address" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Phone</Label>
                    <Input value={form.polyclinic_phone} onChange={set('polyclinic_phone')} data-testid="settings-phone" />
                  </div>
                  <div>
                    <Label>Public email</Label>
                    <Input type="email" value={form.polyclinic_email} onChange={set('polyclinic_email')} data-testid="settings-email" />
                  </div>
                </div>
                <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="settings-save">
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </PolyclinicLayout>
  );
};

export default PolyclinicSettings;
