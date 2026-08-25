import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Check, X, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function StrengthBar({ password }) {
  const checks = [
    { ok: password.length >= 8, label: '8+ chars' },
    { ok: /[A-Z]/.test(password), label: 'Uppercase' },
    { ok: /[a-z]/.test(password), label: 'Lowercase' },
    { ok: /\d/.test(password), label: 'Digit' },
    { ok: /[^A-Za-z0-9]/.test(password), label: 'Special' },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['', 'bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-lime-500', 'bg-green-500'];
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1,2,3,4,5].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= score ? colors[score] : 'bg-slate-200'}`} />)}
      </div>
      <div className="flex gap-3 flex-wrap">
        {checks.map(c => <span key={c.label} className={`text-xs flex items-center gap-0.5 ${c.ok ? 'text-green-600' : 'text-slate-400'}`}>
          {c.ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}{c.label}
        </span>)}
      </div>
    </div>
  );
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [form, setForm] = useState({ new_password: '', confirm_password: '' });
  const [show, setShow] = useState({ new: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (form.new_password !== form.confirm_password) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password`, { token, ...form });
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Reset failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="h-8 w-8 text-indigo-600" />
          </div>
          <CardTitle className="font-manrope text-2xl">Reset Password</CardTitle>
          <p className="text-sm text-slate-500 mt-1">Lumera — Secure Password Reset</p>
        </CardHeader>
        <CardContent className="space-y-5 pt-4">
          {done ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-lg font-semibold text-slate-800">Password Reset Successfully</p>
              <p className="text-sm text-slate-500">You can now log in with your new password.</p>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => navigate('/login')}>
                Go to Login
              </Button>
            </div>
          ) : (
            <>
              {!token && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  Invalid or missing reset token. Please request a new reset link.
                </div>
              )}
              {['new_password', 'confirm_password'].map(field => (
                <div key={field} className="space-y-1">
                  <Label className="font-manrope font-semibold">
                    {field === 'new_password' ? 'New Password' : 'Confirm Password'}
                  </Label>
                  <div className="relative">
                    <Input
                      type={show[field === 'new_password' ? 'new' : 'confirm'] ? 'text' : 'password'}
                      value={form[field]}
                      onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                      data-testid={`reset-${field}`}
                    />
                    <button type="button"
                      onClick={() => setShow(prev => ({ ...prev, [field === 'new_password' ? 'new' : 'confirm']: !prev[field === 'new_password' ? 'new' : 'confirm'] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {show[field === 'new_password' ? 'new' : 'confirm'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {field === 'new_password' && form.new_password && <StrengthBar password={form.new_password} />}
                </div>
              ))}
              <Button
                onClick={submit}
                disabled={loading || !token || !form.new_password || !form.confirm_password}
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                data-testid="reset-submit-btn"
              >
                {loading ? 'Resetting…' : 'Reset Password'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
