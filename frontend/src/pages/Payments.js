import React, { useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, QrCode, DollarSign, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const Payments = () => {
  const [amount, setAmount] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [loading, setLoading] = useState(false);

  const createCheckout = async (packageType) => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/payments/checkout`,
        { package: packageType },
        {
          headers: {
            origin: window.location.origin,
          },
        }
      );
      window.location.href = response.data.url;
    } catch (error) {
      console.error('Payment failed:', error);
      toast.error('Failed to create payment');
    } finally {
      setLoading(false);
    }
  };

  const generateQR = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/payments/generate-qr`, {
        amount: parseFloat(amount),
      });
      setQrCode(response.data.qr_code);
      toast.success('QR Code generated!');
    } catch (error) {
      console.error('Failed to generate QR:', error);
      toast.error('Failed to generate QR code');
    } finally {
      setLoading(false);
    }
  };

  const packages = [
    {
      name: 'Consultation',
      price: 50,
      description: 'Standard consultation fee',
      features: ['30-minute session', 'Follow-up notes', 'Email support'],
    },
    {
      name: 'Follow-up',
      price: 30,
      description: 'Follow-up appointment',
      features: ['15-minute session', 'Quick check-in', 'Status update'],
    },
    {
      name: 'Full Checkup',
      price: 100,
      description: 'Comprehensive assessment',
      features: ['60-minute session', 'Detailed report', 'Treatment plan'],
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="payments-page">
        <Card className="border-slate-200 bg-gradient-to-br from-purple-50 to-pink-50">
          <CardContent className="p-8">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-xl bg-purple-500 flex items-center justify-center">
                <CreditCard className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="font-manrope font-bold text-2xl text-slate-900 mb-2">Payments</h2>
                <p className="font-inter text-slate-600">
                  Accept secure payments with Stripe and generate QR codes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          {packages.map((pkg, index) => (
            <Card key={index} className="border-slate-200 card-hover" data-testid={`package-card-${index}`}>
              <CardHeader className="border-b border-slate-200">
                <CardTitle className="font-manrope text-xl">{pkg.name}</CardTitle>
                <CardDescription className="font-inter">{pkg.description}</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-6">
                  <div className="flex items-baseline space-x-2 mb-4">
                    <span className="font-manrope font-bold text-4xl text-slate-900">${pkg.price}</span>
                    <span className="font-inter text-slate-600">USD</span>
                  </div>
                  <ul className="space-y-2">
                    {pkg.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center space-x-2 font-inter text-sm text-slate-600">
                        <DollarSign className="h-4 w-4 text-green-600" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  onClick={() => createCheckout(pkg.name.toLowerCase().replace(' ', '_'))}
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  data-testid={`checkout-btn-${index}`}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Pay Now
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">Generate Payment QR Code</CardTitle>
            <CardDescription className="font-inter">
              Create a QR code for custom payment amounts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end space-x-4">
              <div className="flex-1 space-y-2">
                <Label className="font-manrope font-semibold">Amount (USD)</Label>
                <Input
                  type="number"
                  placeholder="50.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  step="0.01"
                  min="0"
                  data-testid="qr-amount-input"
                />
              </div>
              <Button
                onClick={generateQR}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700"
                data-testid="generate-qr-btn"
              >
                <QrCode className="h-4 w-4 mr-2" />
                Generate QR
              </Button>
            </div>
            {qrCode && (
              <div className="mt-6 p-6 bg-slate-50 rounded-lg text-center">
                <img
                  src={`data:image/png;base64,${qrCode}`}
                  alt="Payment QR Code"
                  className="mx-auto w-64 h-64"
                  data-testid="qr-code-image"
                />
                <p className="font-inter text-sm text-slate-600 mt-4">
                  Scan this QR code to complete payment
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Payments;