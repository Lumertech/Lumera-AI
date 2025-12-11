import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Copy, Check, Send, QrCode, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import QRCodeLib from 'qrcode';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const RequestPaymentModalV2 = ({ open, onClose, clientPhone, clientName }) => {
  const [loading, setLoading] = useState(false);
  const [paymentSetup, setPaymentSetup] = useState(null);
  const [paymentFees, setPaymentFees] = useState({});
  const [selectedAmount, setSelectedAmount] = useState('500');
  const [upiQrCode, setUpiQrCode] = useState(null);
  const [upiLink, setUpiLink] = useState(null);
  const [razorpayLink, setRazorpayLink] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      fetchSetup();
    }
  }, [open]);

  const fetchSetup = async () => {
    try {
      const [setupResponse, feesResponse] = await Promise.all([
        axios.get(`${API_URL}/settings/patient-payment`),
        axios.get(`${API_URL}/settings/payment-fees`)
      ]);
      setPaymentSetup(setupResponse.data);
      setPaymentFees(feesResponse.data);
    } catch (error) {
      console.error('Failed to fetch setup:', error);
      toast.error('Failed to load payment setup');
    }
  };

  const generateUpiPayment = async () => {
    if (!paymentSetup?.upi_id) {
      toast.error('UPI not configured. Please set up in Settings.');
      return;
    }

    const amount = parseInt(selectedAmount);
    if (!amount || amount < 1) {
      toast.error('Please enter a valid amount');
      return;
    }

    // Generate UPI deep link
    const upiPaymentLink = `upi://pay?pa=${paymentSetup.upi_id}&pn=${encodeURIComponent(clientName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(`Payment to Dr. for consultation`)}`;
    
    setUpiLink(upiPaymentLink);

    // Generate QR code
    try {
      const qr = await QRCodeLib.toDataURL(upiPaymentLink, { width: 300 });
      setUpiQrCode(qr);
      toast.success('UPI payment link generated!');
    } catch (error) {
      console.error('QR generation failed:', error);
      toast.error('Failed to generate QR code');
    }
  };

  const generateRazorpayPayment = async () => {
    const amount = parseInt(selectedAmount);
    if (!amount || amount < 1) {
      toast.error('Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/clients/${encodeURIComponent(clientPhone)}/request-payment`,
        {
          package: 'custom',
          amount: amount
        }
      );

      setRazorpayLink(response.data.payment_link);
      toast.success('Payment link generated and sent via WhatsApp!');
    } catch (error) {
      console.error('Razorpay payment failed:', error);
      if (error.response?.status === 400) {
        toast.error('Please configure Razorpay in Settings first');
      } else {
        toast.error('Failed to generate payment link');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setUpiLink(null);
    setUpiQrCode(null);
    setRazorpayLink(null);
    setSelectedAmount('500');
    setCopied(false);
    onClose();
  };

  if (!paymentSetup) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const hasUpi = paymentSetup.payment_method === 'upi' || paymentSetup.payment_method === 'both';
  const hasRazorpay = (paymentSetup.payment_method === 'razorpay' || paymentSetup.payment_method === 'both') && paymentSetup.razorpay_configured;

  if (!hasUpi && !hasRazorpay) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-manrope text-xl">Request Payment</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">
            <p className="text-slate-600 font-inter mb-4">
              No payment method configured. Please set up UPI or Razorpay in Settings first.
            </p>
            <Button onClick={handleClose} variant="outline">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-manrope text-xl">
            Request Payment - {clientName}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {/* Amount Selection */}
          <div className="space-y-2 mb-6">
            <Label className="font-manrope font-semibold">Amount (₹)</Label>
            <div className="grid grid-cols-4 gap-3">
              {['500', '1000', '1500', '2000'].map((amount) => (
                <Button
                  key={amount}
                  variant={selectedAmount === amount ? 'default' : 'outline'}
                  onClick={() => setSelectedAmount(amount)}
                  className={selectedAmount === amount ? 'bg-indigo-600' : ''}
                >
                  ₹{amount}
                </Button>
              ))}
            </div>
            <Input
              type="number"
              placeholder="Custom amount"
              value={selectedAmount}
              onChange={(e) => setSelectedAmount(e.target.value)}
              className="mt-2"
            />
          </div>

          {/* Payment Method Tabs */}
          <Tabs defaultValue={hasUpi ? "upi" : "razorpay"} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              {hasUpi && (
                <TabsTrigger value="upi" className="flex items-center space-x-2">
                  <QrCode className="h-4 w-4" />
                  <span>UPI</span>
                </TabsTrigger>
              )}
              {hasRazorpay && (
                <TabsTrigger value="razorpay" className="flex items-center space-x-2">
                  <CreditCard className="h-4 w-4" />
                  <span>Razorpay</span>
                </TabsTrigger>
              )}
            </TabsList>

            {/* UPI Payment Tab */}
            {hasUpi && (
              <TabsContent value="upi" className="space-y-4">
                {!upiQrCode ? (
                  <div className="text-center py-8">
                    <QrCode className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                    <p className="text-slate-600 font-inter mb-4">
                      Generate UPI payment link and QR code
                    </p>
                    <Button
                      onClick={generateUpiPayment}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <QrCode className="mr-2 h-4 w-4" />
                      Generate UPI Payment
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center p-6 bg-green-50 rounded-lg border border-green-200">
                      <Check className="h-16 w-16 text-green-600 mx-auto mb-3" />
                      <h3 className="font-manrope font-bold text-xl text-green-900 mb-2">
                        UPI Payment Ready!
                      </h3>
                      <p className="text-sm text-green-700">
                        Share the QR code or link with {clientName}
                      </p>
                    </div>

                    {/* QR Code */}
                    <div className="text-center">
                      <Label className="font-manrope font-semibold mb-3 block">QR Code</Label>
                      <div className="inline-block p-4 bg-white rounded-lg border-2 border-slate-200">
                        <img src={upiQrCode} alt="UPI QR Code" className="w-48 h-48 mx-auto" />
                      </div>
                      <p className="text-xs text-slate-600 mt-2">
                        Patient can scan this to pay ₹{selectedAmount}
                      </p>
                    </div>

                    {/* UPI Link */}
                    <div className="space-y-2">
                      <Label className="font-manrope font-semibold">UPI Payment Link</Label>
                      <div className="flex space-x-2">
                        <Input value={upiLink} readOnly className="flex-1 font-mono text-xs" />
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => copyToClipboard(upiLink)}
                        >
                          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-xs text-blue-900 font-inter">
                        💡 <strong>Note:</strong> Payment will go directly to your UPI ID: <code className="bg-blue-100 px-2 py-1 rounded">{paymentSetup.upi_id}</code>. You'll need to manually mark it as received once payment is done.
                      </p>
                    </div>

                    <Button onClick={handleClose} variant="outline" className="w-full">
                      Done
                    </Button>
                  </div>
                )}
              </TabsContent>
            )}

            {/* Razorpay Payment Tab */}
            {hasRazorpay && (
              <TabsContent value="razorpay" className="space-y-4">
                {!razorpayLink ? (
                  <div className="text-center py-8">
                    <CreditCard className="h-16 w-16 text-purple-600 mx-auto mb-4" />
                    <p className="text-slate-600 font-inter mb-4">
                      Generate Razorpay payment link (Cards, Net Banking, Wallets)
                    </p>
                    <Button
                      onClick={generateRazorpayPayment}
                      disabled={loading}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <CreditCard className="mr-2 h-4 w-4" />
                          Generate Razorpay Link
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center p-6 bg-green-50 rounded-lg border border-green-200">
                      <Check className="h-16 w-16 text-green-600 mx-auto mb-3" />
                      <h3 className="font-manrope font-bold text-xl text-green-900 mb-2">
                        Payment Link Sent!
                      </h3>
                      <p className="text-sm text-green-700">
                        WhatsApp message sent to {clientName}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-manrope font-semibold">Razorpay Payment Link</Label>
                      <div className="flex space-x-2">
                        <Input value={razorpayLink} readOnly className="flex-1" />
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => copyToClipboard(razorpayLink)}
                        >
                          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <p className="text-xs text-purple-900 font-inter">
                        💡 Payment will be processed via Razorpay and automatically tracked.
                      </p>
                    </div>

                    <Button onClick={handleClose} className="w-full">
                      Done
                    </Button>
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RequestPaymentModalV2;
