import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Loader2, CheckCircle2, AlertCircle, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const PayLink = () => {
  const { intentId } = useParams();
  const [loading, setLoading] = useState(true);
  const [intent, setIntent] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/payments/upi/intent/${intentId}`);
        setIntent(r.data);
      } catch (e) {
        setErr(e.response?.data?.detail || 'Payment link not found');
      } finally {
        setLoading(false);
      }
    })();
  }, [intentId]);

  const copyIntent = async () => {
    await navigator.clipboard.writeText(intent.upi_intent);
    toast.success('UPI link copied');
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
    </div>
  );

  if (err) return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md text-center bg-white rounded-2xl p-8 shadow-lg border border-rose-200">
        <AlertCircle className="h-12 w-12 text-rose-600 mx-auto mb-4" />
        <h1 className="font-manrope font-bold text-xl text-slate-900 mb-2">Payment link unavailable</h1>
        <p className="text-slate-600 font-inter">{err}</p>
        <p className="text-slate-500 text-xs mt-4">If your doctor sent you this link, please ask them to resend.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100 py-8 px-4" data-testid="pay-link-page">
      <div className="max-w-md mx-auto">
        <header className="text-center mb-6">
          <div className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-600 flex items-center justify-center">
              <span className="text-white font-manrope font-bold text-lg">L</span>
            </div>
            <span className="font-manrope font-bold text-xl text-slate-900">Lumera</span>
          </div>
        </header>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5 border border-slate-200">
          <div className="text-center">
            <div className="text-xs text-slate-500 uppercase font-semibold">Amount due</div>
            <div className="font-manrope font-bold text-5xl text-slate-900 mt-1" data-testid="pay-amount">
              ₹{Number(intent.amount).toLocaleString('en-IN')}
            </div>
            <div className="text-sm text-slate-600 mt-1">to <strong>{intent.display_name}</strong></div>
            <div className="text-xs text-slate-500 font-mono mt-1">{intent.vpa}</div>
            {intent.note && <div className="text-xs text-slate-500 italic mt-2">&ldquo;{intent.note}&rdquo;</div>}
          </div>

          <div className="flex flex-col items-center gap-2 bg-slate-50 rounded-xl p-4 border">
            <img src={intent.qr_png_data_url} alt="UPI QR" className="w-56 h-56" data-testid="pay-qr-img" />
            <p className="text-xs text-slate-600 text-center">Scan with any UPI app<br />(PhonePe / GPay / Paytm / BHIM)</p>
          </div>

          <a href={intent.upi_intent} className="block" data-testid="pay-intent-btn">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-base">
              <CheckCircle2 className="h-5 w-5 mr-2" /> Pay ₹{Number(intent.amount).toLocaleString('en-IN')} in UPI app
            </Button>
          </a>
          <Button variant="outline" className="w-full" onClick={copyIntent} data-testid="pay-copy-link-btn">
            <Copy className="h-4 w-4 mr-2" /> Copy UPI link
          </Button>

          <p className="text-xs text-slate-500 text-center pt-2 border-t">
            After paying, please share the payment screenshot with your doctor for confirmation.
          </p>
        </div>

        <footer className="text-center text-xs text-slate-500 mt-6">
          Secured by Lumera Solutions LLP · Payments go directly to your doctor&apos;s UPI ID
        </footer>
      </div>
    </div>
  );
};

export default PayLink;
