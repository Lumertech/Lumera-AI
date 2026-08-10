import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Home, ShieldOff, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const DataDeletion = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!phone.trim()) return toast.error('Please enter your WhatsApp number');
    setSubmitting(true);
    try {
      const res = await axios.post(`${API_URL}/data-deletion/request`, {
        phone: phone.trim(),
        email: email.trim() || null,
        reason: reason.trim() || null,
      });
      setResult(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not submit request. Please email ravee@lumer.me.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" data-testid="data-deletion-page">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-600 flex items-center justify-center">
              <span className="text-white font-manrope font-bold text-lg">L</span>
            </div>
            <span className="font-manrope font-bold text-xl text-slate-900">Lumera</span>
          </div>
          <Button variant="outline" onClick={() => navigate('/')}>
            <Home className="h-4 w-4 mr-2" /> Back to Home
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-12">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 mb-4">
              <ShieldOff className="h-7 w-7" />
            </div>
            <h1 className="font-manrope font-bold text-3xl text-slate-900 mb-2">
              Request Data Deletion
            </h1>
            <p className="text-slate-600 font-inter">
              Lumera Solutions LLP will purge every appointment, message, prescription, and
              payment record tied to the phone number below across every doctor tenant.
              Deletion is completed within 30 days.
            </p>
          </div>

          {result ? (
            <Card className="border-emerald-200 bg-emerald-50" data-testid="deletion-success">
              <CardContent className="p-8 text-center space-y-4">
                <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
                <h2 className="font-manrope font-bold text-xl text-slate-900">
                  Request received
                </h2>
                <p className="text-slate-700 font-inter">{result.message}</p>
                <p className="text-slate-900 font-semibold">
                  Ticket ID: <span data-testid="deletion-ticket-id" className="font-mono">{result.ticket_id}</span>
                </p>
                <Button variant="outline" onClick={() => { setResult(null); setPhone(''); setEmail(''); setReason(''); }}>
                  Submit another request
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-slate-200">
              <CardContent className="p-8">
                <form onSubmit={submit} className="space-y-5" data-testid="deletion-form">
                  <div>
                    <Label htmlFor="phone">WhatsApp phone number *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      required
                      data-testid="deletion-phone-input"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      The number you used with any doctor onboarded on Lumera.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="email">Confirmation email (optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      data-testid="deletion-email-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reason">Reason (optional)</Label>
                    <Textarea
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Tell us why you want your data deleted."
                      rows={3}
                      data-testid="deletion-reason-input"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-rose-600 hover:bg-rose-700"
                    data-testid="deletion-submit-btn"
                  >
                    {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : 'Request deletion'}
                  </Button>

                  <p className="text-xs text-slate-500 text-center">
                    Prefer email? Write to{' '}
                    <a href="mailto:ravee@lumer.me" className="text-indigo-600 hover:underline">ravee@lumer.me</a>{' '}
                    with your phone number.
                  </p>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataDeletion;
