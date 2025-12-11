import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, Mail, Phone, Shield, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const Profile = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Edit states
  const [name, setName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  
  // OTP verification
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [verificationType, setVerificationType] = useState(''); // 'email' or 'phone'
  const [otp, setOtp] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/profile`);
      setProfile(response.data);
      setName(response.data.name || '');
      setNewEmail(response.data.email || '');
      setNewPhone(response.data.phone_number || '');
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (name === profile.name) {
      toast.info('No changes to save');
      return;
    }

    setSaving(true);
    try {
      await axios.put(`${API_URL}/profile`, { name });
      toast.success('Name updated successfully!');
      fetchProfile();
    } catch (error) {
      console.error('Failed to update name:', error);
      toast.error('Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const handleSendOTP = async (type) => {
    const contact = type === 'email' ? newEmail : newPhone;
    
    if (!contact) {
      toast.error(`Please enter a ${type}`);
      return;
    }

    // Validate
    if (type === 'email' && !contact.includes('@')) {
      toast.error('Invalid email format');
      return;
    }

    if (type === 'phone' && !contact.startsWith('+')) {
      toast.error('Phone must start with country code (e.g., +91)');
      return;
    }

    setSendingOtp(true);
    try {
      const response = await axios.post(`${API_URL}/profile/send-otp`, {
        verification_type: type,
        contact: contact
      });
      
      setVerificationType(type);
      setOtpSent(true);
      setOtpModalOpen(true);
      
      toast.success(response.data.message);
      
      // Debug mode - show OTP
      if (response.data.debug_otp) {
        toast.info(`Debug OTP: ${response.data.debug_otp}`, { duration: 10000 });
      }
    } catch (error) {
      console.error('Failed to send OTP:', error);
      toast.error(error.response?.data?.detail || 'Failed to send OTP');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      toast.error('Please enter 6-digit OTP');
      return;
    }

    setVerifyingOtp(true);
    try {
      const contact = verificationType === 'email' ? newEmail : newPhone;
      
      await axios.post(`${API_URL}/profile/verify-otp`, {
        contact: contact,
        otp: otp,
        verification_type: verificationType
      });

      toast.success(`${verificationType.charAt(0).toUpperCase() + verificationType.slice(1)} verified and updated!`);
      setOtpModalOpen(false);
      setOtp('');
      setOtpSent(false);
      fetchProfile();
    } catch (error) {
      console.error('Failed to verify OTP:', error);
      toast.error(error.response?.data?.detail || 'Invalid OTP');
    } finally {
      setVerifyingOtp(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="font-manrope font-bold text-3xl text-slate-900">User Profile</h1>
          <p className="font-inter text-slate-600 mt-2">Manage your account information</p>
        </div>

        {/* Profile Card */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope flex items-center space-x-2">
              <User className="h-5 w-5 text-indigo-600" />
              <span>Basic Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Full Name</Label>
              <div className="flex space-x-3">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="flex-1"
                />
                <Button
                  onClick={handleSaveName}
                  disabled={saving || name === profile.name}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>

            {/* Profession */}
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Profession</Label>
              <Input
                value={profile.profession || 'Doctor'}
                disabled
                className="bg-slate-50"
              />
              <p className="text-xs text-slate-500">Contact support to change profession</p>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information Card */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope flex items-center space-x-2">
              <Shield className="h-5 w-5 text-green-600" />
              <span>Contact Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Email */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-manrope font-semibold">Email Address</Label>
                {profile.email_verified ? (
                  <span className="flex items-center text-xs text-green-600 font-semibold">
                    <Check className="h-3 w-3 mr-1" />
                    Verified
                  </span>
                ) : (
                  <span className="flex items-center text-xs text-orange-600 font-semibold">
                    <X className="h-3 w-3 mr-1" />
                    Not Verified
                  </span>
                )}
              </div>
              <div className="flex space-x-3">
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="flex-1"
                />
                <Button
                  onClick={() => handleSendOTP('email')}
                  disabled={sendingOtp || newEmail === profile.email}
                  variant="outline"
                  className="border-indigo-600 text-indigo-600"
                >
                  {sendingOtp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  {newEmail === profile.email ? 'Verified' : 'Verify'}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Change requires email verification via OTP
              </p>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-manrope font-semibold">Phone Number (WhatsApp)</Label>
                {profile.phone_verified ? (
                  <span className="flex items-center text-xs text-green-600 font-semibold">
                    <Check className="h-3 w-3 mr-1" />
                    Verified
                  </span>
                ) : (
                  <span className="flex items-center text-xs text-orange-600 font-semibold">
                    <X className="h-3 w-3 mr-1" />
                    Not Verified
                  </span>
                )}
              </div>
              <div className="flex space-x-3">
                <Input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+911234567890"
                  className="flex-1"
                />
                <Button
                  onClick={() => handleSendOTP('phone')}
                  disabled={sendingOtp || newPhone === profile.phone_number}
                  variant="outline"
                  className="border-green-600 text-green-600"
                >
                  {sendingOtp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Phone className="h-4 w-4 mr-2" />
                  )}
                  {newPhone === profile.phone_number ? 'Verified' : 'Verify'}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Change requires WhatsApp OTP verification
              </p>
            </div>

            {/* Security Alert */}
            <Alert className="bg-blue-50 border-blue-200">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm text-blue-900 font-inter">
                <strong>Security:</strong> Changing email or phone requires OTP verification for your account safety.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3 text-sm text-slate-600">
              <AlertCircle className="h-4 w-4" />
              <span className="font-inter">
                Account created: {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* OTP Verification Modal */}
      <Dialog open={otpModalOpen} onOpenChange={setOtpModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-manrope">Verify {verificationType === 'email' ? 'Email' : 'Phone Number'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert className="bg-blue-50 border-blue-200">
              <Mail className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm text-blue-900 font-inter">
                {verificationType === 'email' 
                  ? `OTP has been sent to ${newEmail}. Check your inbox.`
                  : `OTP has been sent to ${newPhone} via WhatsApp.`
                }
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Enter 6-digit OTP</Label>
              <Input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="text-center text-2xl tracking-widest font-mono"
              />
              <p className="text-xs text-slate-500 text-center">
                OTP expires in 5 minutes
              </p>
            </div>

            <div className="flex justify-between items-center">
              <Button
                variant="ghost"
                onClick={() => handleSendOTP(verificationType)}
                disabled={sendingOtp}
                className="text-sm"
              >
                {sendingOtp ? 'Sending...' : 'Resend OTP'}
              </Button>
              <Button
                onClick={handleVerifyOTP}
                disabled={verifyingOtp || otp.length !== 6}
                className="bg-green-600 hover:bg-green-700"
              >
                {verifyingOtp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Verify
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Profile;
