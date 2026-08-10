import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const PolyclinicRegister = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone_number: '',
    polyclinic_name: '',
    polyclinic_address: '',
  });
  const [busy, setBusy] = useState(false);
  const { setToken } = useAuth() || {};

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await axios.post(`${API_URL}/polyclinic/register`, form);
      const { token } = res.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      if (setToken) setToken(token);
      toast.success('Polyclinic account created');
      // Full reload to hydrate AuthContext
      window.location.href = '/polyclinic/dashboard';
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg" data-testid="polyclinic-register-card">
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-3">
            <Building2 className="h-8 w-8 text-indigo-600" />
          </div>
          <CardTitle className="text-2xl font-manrope">Create your Polyclinic account</CardTitle>
          <CardDescription>
            Manage multiple doctors and their staff under one umbrella
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Your name</Label>
                <Input value={form.name} onChange={set('name')} required data-testid="polyclinic-name-input" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone_number} onChange={set('phone_number')} placeholder="+91…" data-testid="polyclinic-phone-input" />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={set('email')} required data-testid="polyclinic-email-input" />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={form.password} onChange={set('password')} minLength={8} required data-testid="polyclinic-password-input" />
            </div>
            <div>
              <Label>Polyclinic / Hospital name</Label>
              <Input value={form.polyclinic_name} onChange={set('polyclinic_name')} required data-testid="polyclinic-clinic-name-input" />
            </div>
            <div>
              <Label>Address (optional)</Label>
              <Input value={form.polyclinic_address} onChange={set('polyclinic_address')} data-testid="polyclinic-clinic-address-input" />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              data-testid="polyclinic-register-submit"
            >
              {busy ? 'Creating…' : 'Create Polyclinic'}
            </Button>
            <p className="text-center text-sm text-slate-600">
              Already have an account?{' '}
              <Link to="/login" className="text-indigo-600 hover:underline">Sign in</Link>
            </p>
            <p className="text-center text-xs text-slate-500">
              Single doctor?{' '}
              <Link to="/register" className="text-indigo-600 hover:underline">Create a doctor account</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PolyclinicRegister;
