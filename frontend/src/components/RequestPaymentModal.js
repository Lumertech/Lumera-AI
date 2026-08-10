import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Copy, Check, Send } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const RequestPaymentModal = ({ open, onClose, clientPhone, clientName }) => {
  const [loading, setLoading] = useState(false);
  const [paymentFees, setPaymentFees] = useState({});
  const [selectedPackage, setSelectedPackage] = useState('consultation');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentLink, setPaymentLink] = useState(null);
  const [qrCode, setQRCode] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      fetchPaymentFees();
    }
  }, [open]);

  const fetchPaymentFees = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings/payment-fees`);
      setPaymentFees(response.data);
    } catch (error) {
      console.error('Failed to fetch payment fees:', error);
    }
  };

  const getAmount = () => {
    if (selectedPackage === 'custom') {
      return parseInt(customAmount) || 0;
    }
    const feeMapping = {
      'consultation': paymentFees.consultation_fee || 500,
      'follow_up': paymentFees.followup_fee || 300,
      'full_checkup': paymentFees.full_checkup_fee || 1000
    };
    return feeMapping[selectedPackage] || 500;
  };

  const handleRequestPayment = async () => {
    if (selectedPackage === 'custom' && !customAmount) {
      toast.error('Please enter an amount');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/clients/${encodeURIComponent(clientPhone)}/request-payment`,
        {
          package: selectedPackage,
          amount: selectedPackage === 'custom' ? parseInt(customAmount) : null
        }
      );

      setPaymentLink(response.data.payment_link);
      setQRCode(response.data.qr_code);
      toast.success('Payment request sent to patient via WhatsApp!');
    } catch (error) {
      console.error('Failed to request payment:', error);
      if (error.response?.status === 400 && error.response?.data?.detail?.includes('Razorpay')) {
        toast.error('Please configure Razorpay credentials in Settings first');
      } else {
        toast.error('Failed to send payment request');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(paymentLink);
    setCopied(true);
    toast.success('Payment link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setPaymentLink(null);
    setQRCode(null);
    setSelectedPackage('consultation');
    setCustomAmount('');
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-manrope text-xl">
            Request Payment - {clientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {!paymentLink ? (
            <>
              <div className="space-y-2">
                <Label className="font-manrope font-semibold">Service / Package</Label>
                <Select value={selectedPackage} onValueChange={setSelectedPackage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultation">
                      Consultation - ₹{paymentFees.consultation_fee || 500}
                    </SelectItem>
                    <SelectItem value="follow_up">
                      Follow-up - ₹{paymentFees.followup_fee || 300}
                    </SelectItem>
                    <SelectItem value="full_checkup">
                      Full Check-up - ₹{paymentFees.full_checkup_fee || 1000}
                    </SelectItem>
                    <SelectItem value="custom">Custom Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedPackage === 'custom' && (
                <div className="space-y-2">
                  <Label className="font-manrope font-semibold">Amount (₹)</Label>
                  <Input
                    type="number"
                    placeholder="Enter amount"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                  />
                </div>
              )}

              <Card className="bg-indigo-50 border-indigo-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-manrope font-semibold text-slate-700">
                      Total Amount:
                    </span>
                    <span className="text-2xl font-bold text-indigo-600">
                      ₹{getAmount()}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="text-xs text-slate-600 font-inter p-3 bg-slate-50 rounded-lg border border-slate-200 mb-4">
                By proceeding, you agree to Lumera Solutions LLP's{' '}
                <a href="/policies#terms-of-service" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/policies#payment-disclaimer" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  Payment Disclaimer
                </a>.
              </div>

              <div className="flex justify-end space-x-3">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleRequestPayment}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Payment Request
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <div className="text-center p-6 bg-green-50 rounded-lg border border-green-200">
                <Check className="h-16 w-16 text-green-600 mx-auto mb-3" />
                <h3 className="font-manrope font-bold text-xl text-green-900 mb-2">
                  Payment Request Sent!
                </h3>
                <p className="text-sm text-green-700">
                  WhatsApp message sent to {clientName}
                </p>
              </div>

              {qrCode && (
                <div className="space-y-3">
                  <Label className="font-manrope font-semibold">QR Code</Label>
                  <div className="flex justify-center p-4 bg-white rounded-lg border-2 border-slate-200">
                    <img
                      src={`data:image/png;base64,${qrCode}`}
                      alt="Payment QR Code"
                      className="w-48 h-48"
                    />
                  </div>
                  <p className="text-xs text-center text-slate-600">
                    Patient can scan this QR code to make payment
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="font-manrope font-semibold">Payment Link</Label>
                <div className="flex space-x-2">
                  <Input value={paymentLink} readOnly className="flex-1" />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={copyToClipboard}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button onClick={handleClose} className="w-full">
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RequestPaymentModal;
