import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const WhatsAppLogin = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: phone, 2: otp, 3: registration
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [profession, setProfession] = useState('doctor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sendOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Format phone number
    let formatted = phoneNumber.trim();
    if (!formatted.startsWith('+')) {
      formatted = '+91' + formatted.replace(/^0+/, '');
    }

    try {
      await axios.post(`${API_URL}/auth/send-otp`, { phone_number: formatted });
      setPhoneNumber(formatted);
      setStep(2);
      toast.success('OTP sent to your WhatsApp!');
    } catch (error) {
      setError(error.response?.data?.detail || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/verify-otp`, {
        phone_number: phoneNumber,
        otp: otp,
      });

      if (response.data.is_new_user) {
        setStep(3);
        toast.success('Phone verified! Please complete registration');
      } else {
        // Existing user - login
        localStorage.setItem('token', response.data.token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        toast.success('Welcome back!');
        navigate('/dashboard');
      }
    } catch (error) {
      setError(error.response?.data?.detail || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const completeRegistration = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/complete-registration`, null, {
        params: {
          name,
          profession,
          phone_number: phoneNumber,
        },
      });

      localStorage.setItem('token', response.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (error) {
      setError(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-teal-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-xl">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="flex items-center justify-center space-x-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-white" />
            </div>
            <span className="font-manrope font-bold text-2xl text-slate-900">Lumera</span>
          </div>
          <CardTitle className="font-manrope text-2xl">WhatsApp Login</CardTitle>
          <CardDescription className="font-inter">
            {step === 1 && 'Enter your phone number to receive OTP'}
            {step === 2 && 'Enter the OTP sent to your WhatsApp'}
            {step === 3 && 'Complete your profile to get started'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription data-testid="error-message">{error}</AlertDescription>
            </Alert>
          )}

          {step === 1 && (
            <form onSubmit={sendOTP} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="font-manrope font-semibold">
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="9876543210"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  data-testid="phone-input"
                  className="font-inter"
                />
                <p className="text-xs text-slate-500">Enter your 10-digit mobile number</p>
              </div>

              <Button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 font-manrope font-semibold"
                disabled={loading}
                data-testid="send-otp-btn"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending OTP...
                  </>
                ) : (
                  'Send OTP via WhatsApp'
                )}
              </Button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={verifyOTP} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp" className="font-manrope font-semibold">
                  Enter OTP
                </Label>
                <Input
                  id="otp"
                  type="text"
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                  required
                  data-testid="otp-input"
                  className="font-inter text-center text-2xl tracking-widest"
                />
                <p className="text-xs text-slate-500">Check your WhatsApp for the 6-digit code</p>
              </div>

              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 font-manrope font-semibold"
                disabled={loading}
                data-testid="verify-otp-btn"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify OTP'
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setStep(1)}
                data-testid="back-btn"
              >
                Back
              </Button>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={completeRegistration} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="font-manrope font-semibold">
                  Full Name
                </Label>
                <Input
                  id="name"
                  placeholder="Dr. Sarah Johnson"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  data-testid="name-input"
                  className="font-inter"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profession" className="font-manrope font-semibold">
                  Profession
                </Label>
                <Select value={profession} onValueChange={setProfession}>
                  <SelectTrigger data-testid="profession-select" className="font-inter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="doctor">Doctor</SelectItem>
                    <SelectItem value="therapist">Therapist</SelectItem>
                    <SelectItem value="spa">Spa/Wellness</SelectItem>
                    <SelectItem value="lawyer">Lawyer</SelectItem>
                    <SelectItem value="astrologer">Astrologer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 font-manrope font-semibold"
                disabled={loading}
                data-testid="complete-registration-btn"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Complete Registration'
                )}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="font-inter text-sm text-slate-600">
              Have email/password account?{' '}
              <button
                onClick={() => navigate('/login')}
                className="text-indigo-600 hover:text-indigo-700 font-semibold"
                data-testid="email-login-link"
              >
                Login with email
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppLogin;