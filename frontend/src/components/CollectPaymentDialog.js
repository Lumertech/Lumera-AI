import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { QrCode, Send, Banknote, Copy, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const CollectPaymentDialog = ({ open, onOpenChange, invoice, onPaid }) => {
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState('upi');
  const [gatewayProvider, setGatewayProvider] = useState(null);
  const [qr, setQr] = useState(null);
  const [cashAmount, setCashAmount] = useState('');
  const [sendReceipt, setSendReceipt] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gatewayLink, setGatewayLink] = useState(null);

  useEffect(() => {
    if (!open || !invoice) return;
    setQr(null); setGatewayLink(null);
    setCashAmount(String(invoice.total || ''));
    (async () => {
      setLoading(true);
      try {
        const s = await axios.get(`${API_URL}/settings/payment`);
        setMethod(s.data.method || 'upi');
        setGatewayProvider(s.data.gateway?.provider || null);

        if (s.data.method === 'upi' && s.data.configured?.upi) {
          const r = await axios.post(`${API_URL}/payments/upi/intent`, {
            amount: invoice.total,
            note: `Invoice ${invoice.invoice_number || invoice.id}`,
            invoice_id: invoice.id,
          });
          setQr(r.data);
        }
      } catch (e) {
        toast.error(e.response?.data?.detail || 'Could not prepare payment');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, invoice]);

  const copyIntent = async () => {
    if (!qr?.upi_intent) return;
    await navigator.clipboard.writeText(qr.upi_intent);
    toast.success('UPI link copied');
  };

  const sendUpiOnWhatsApp = async () => {
    if (!invoice?.client_phone) return toast.error('Patient has no phone number on file');
    const url = `https://wa.me/${invoice.client_phone.replace(/[^0-9]/g, '')}` +
      `?text=${encodeURIComponent(
        `Hi ${invoice.client_name || ''}, please pay ₹${invoice.total} for invoice ` +
        `${invoice.invoice_number || invoice.id}.\n\nUPI link: ${qr.upi_intent}\n\n- Lumera`
      )}`;
    window.open(url, '_blank');
  };

  const createGatewayLink = async () => {
    setSubmitting(true);
    try {
      const r = await axios.post(`${API_URL}/payments/create-order`, null, {
        params: {
          amount: invoice.total,
          client_phone: invoice.client_phone || '',
          appointment_id: invoice.appointment_id || invoice.id,
        },
      });
      setGatewayLink(r.data.payment_link || r.data);
      toast.success('Payment link created');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not create payment link. Ensure Razorpay keys are saved.');
    } finally {
      setSubmitting(false);
    }
  };

  const markCashPaid = async () => {
    const paid = parseFloat(cashAmount);
    if (!paid || paid <= 0) return toast.error('Enter a valid amount');
    setSubmitting(true);
    try {
      const r = await axios.post(`${API_URL}/invoices/${invoice.id}/mark-cash-paid`, {
        amount_paid: paid,
        send_whatsapp_receipt: sendReceipt,
        receipt_phone: invoice.client_phone || null,
      });
      toast.success(`Marked ${r.data.payment_status}${r.data.receipt_sent ? ' · WA receipt sent' : ''}`);
      onPaid?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not mark cash paid');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="collect-payment-dialog">
        <DialogHeader>
          <DialogTitle className="font-manrope">
            Collect ₹{Number(invoice?.total || 0).toLocaleString('en-IN')} · Invoice {invoice?.invoice_number || invoice?.id?.slice(-6)}
          </DialogTitle>
          <DialogDescription>
            From {invoice?.client_name} {invoice?.client_phone ? `· ${invoice.client_phone}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-600" /></div>
        ) : (
          <div className="space-y-4">
            {/* UPI Method */}
            {method === 'upi' && (
              <div className="space-y-3" data-testid="collect-upi-panel">
                {qr ? (
                  <>
                    <div className="flex flex-col items-center gap-3 bg-white rounded-lg p-4 border">
                      <img src={qr.qr_png_data_url} alt="UPI QR" className="w-52 h-52" data-testid="collect-qr-img" />
                      <div className="text-xs text-center">
                        <div className="font-manrope font-semibold">{qr.display_name}</div>
                        <div className="font-mono text-slate-600">{qr.vpa}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={sendUpiOnWhatsApp} className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={!invoice?.client_phone} data-testid="send-upi-whatsapp-btn">
                        <Send className="h-4 w-4 mr-2" /> Send on WhatsApp
                      </Button>
                      <Button variant="outline" onClick={copyIntent} data-testid="copy-upi-intent-btn">
                        <Copy className="h-4 w-4 mr-2" /> Copy link
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500 text-center">
                      Patient scans the QR or taps the link → their UPI app opens pre-filled with the exact amount.
                    </p>
                  </>
                ) : (
                  <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
                    UPI VPA is not configured. Head to <strong>Settings → Payment</strong> and save your UPI ID first.
                  </div>
                )}
              </div>
            )}

            {/* Gateway Method */}
            {method === 'gateway' && (
              <div className="space-y-3" data-testid="collect-gateway-panel">
                {gatewayProvider ? (
                  gatewayLink ? (
                    <div className="space-y-3">
                      <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm break-all font-mono">
                        {gatewayLink.short_url || gatewayLink.url || JSON.stringify(gatewayLink)}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => { navigator.clipboard.writeText(gatewayLink.short_url || gatewayLink.url || ''); toast.success('Copied'); }}>
                          <Copy className="h-4 w-4 mr-2" /> Copy
                        </Button>
                        <a href={gatewayLink.short_url || gatewayLink.url} target="_blank" rel="noreferrer">
                          <Button variant="outline"><ExternalLink className="h-4 w-4 mr-2" /> Open</Button>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-slate-700 bg-slate-50 border rounded p-3">
                        Active gateway: <strong>{gatewayProvider}</strong>. Click below to generate a dynamic
                        payment link and send it to the patient on WhatsApp.
                      </div>
                      <Button onClick={createGatewayLink} disabled={submitting} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="create-gateway-link-btn">
                        {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : 'Create payment link'}
                      </Button>
                    </>
                  )
                ) : (
                  <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
                    Gateway is not configured. Go to <strong>Settings → Payment</strong> to add your gateway credentials.
                  </div>
                )}
              </div>
            )}

            {/* Cash Method */}
            {method === 'cash' && (
              <div className="space-y-3" data-testid="collect-cash-panel">
                <div>
                  <Label htmlFor="cash-amt">Amount received (₹)</Label>
                  <Input
                    id="cash-amt"
                    type="number"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    data-testid="cash-amount-input"
                  />
                </div>
                <div>
                  <Label htmlFor="cash-tendered">Amount tendered (₹) <span className="text-xs text-slate-400">— for change calc</span></Label>
                  <Input
                    id="cash-tendered"
                    type="number"
                    placeholder="e.g. patient handed 1000"
                    onChange={(e) => {
                      const tendered = parseFloat(e.target.value);
                      const due = parseFloat(cashAmount);
                      if (!isNaN(tendered) && !isNaN(due)) {
                        const change = tendered - due;
                        const el = document.getElementById('change-due-display');
                        if (el) {
                          el.textContent = change >= 0 ? `Change to return: ₹${change.toLocaleString('en-IN')}` : `Short by ₹${Math.abs(change).toLocaleString('en-IN')}`;
                          el.className = 'text-sm font-manrope font-semibold ' + (change >= 0 ? 'text-emerald-700' : 'text-rose-700');
                        }
                      }
                    }}
                    data-testid="cash-tendered-input"
                  />
                  <div id="change-due-display" className="mt-1 h-5 text-sm font-manrope font-semibold text-slate-500" data-testid="change-due-display" />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={sendReceipt}
                    onCheckedChange={setSendReceipt}
                    data-testid="cash-send-receipt-checkbox"
                  />
                  Send WhatsApp receipt to {invoice?.client_phone || '(no phone)'}
                </label>
                <Button
                  onClick={markCashPaid}
                  disabled={submitting}
                  className="w-full bg-amber-600 hover:bg-amber-700"
                  data-testid="mark-cash-paid-btn"
                >
                  {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <><Banknote className="h-4 w-4 mr-2" /> Mark Paid (Cash)</>}
                </Button>
              </div>
            )}

            <div className="text-center text-xs text-slate-400">
              Active method: <Badge variant="outline">{method.toUpperCase()}</Badge>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CollectPaymentDialog;
