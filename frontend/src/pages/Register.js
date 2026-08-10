import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, Home } from 'lucide-react';

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone_number: '',
    profession: 'doctor',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!agreedToTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy to continue');
      return;
    }

    setLoading(true);

    const result = await register(
      formData.name,
      formData.email,
      formData.password,
      formData.phone_number,
      formData.profession
    );

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-teal-50 flex items-center justify-center p-4">
      <Link
        to="/"
        className="absolute top-6 left-6 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-slate-700 hover:text-indigo-700 hover:bg-white/80 transition-colors font-inter text-sm font-medium"
        data-testid="register-back-home-link"
      >
        <Home className="h-4 w-4" />
        Back to home
      </Link>
      <Card className="w-full max-w-md border-slate-200 shadow-xl">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="flex items-center justify-center space-x-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-600 flex items-center justify-center">
              <span className="text-white font-manrope font-bold text-xl">L</span>
            </div>
            <span className="font-manrope font-bold text-2xl text-slate-900">Lumera</span>
          </div>
          <CardTitle className="font-manrope text-2xl">Create your account</CardTitle>
          <CardDescription className="font-inter">
            Start managing your appointments with ease
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription data-testid="register-error">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" className="font-manrope font-semibold">Full Name</Label>
              <Input
                id="name"
                placeholder="Dr. Sarah Johnson"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                data-testid="name-input"
                className="font-inter"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="font-manrope font-semibold">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="doctor@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                data-testid="email-input"
                className="font-inter"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="font-manrope font-semibold">WhatsApp Business Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1234567890"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                required
                data-testid="phone-input"
                className="font-inter"
              />
              <Alert className="bg-blue-50 border-blue-200">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-xs text-blue-800 font-inter">
                  Your WhatsApp account will be authenticated as per Meta Business API guidelines. Ensure this number is registered with WhatsApp Business.
                </AlertDescription>
              </Alert>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profession" className="font-manrope font-semibold">Profession</Label>
              <Select
                value={formData.profession}
                onValueChange={(value) => setFormData({ ...formData, profession: value })}
              >
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

            <div className="space-y-2">
              <Label htmlFor="password" className="font-manrope font-semibold">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                data-testid="password-input"
                className="font-inter"
              />
            </div>

            {/* Consent Checkbox */}
            <div className="flex items-start space-x-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <Checkbox
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={setAgreedToTerms}
                className="mt-1"
              />
              <label
                htmlFor="terms"
                className="text-sm font-inter text-slate-700 leading-relaxed cursor-pointer"
              >
                I agree to Lumera Solutions LLP&apos;s{' '}
                <Link to="/policies#terms-of-service" target="_blank" className="text-indigo-600 hover:underline font-semibold">
                  Terms of Service
                </Link>
                ,{' '}
                <Link to="/policies#privacy-policy" target="_blank" className="text-indigo-600 hover:underline font-semibold">
                  Privacy Policy
                </Link>
                , and{' '}
                <Link to="/policies" target="_blank" className="text-indigo-600 hover:underline font-semibold">
                  Disclaimers
                </Link>
                .
              </label>
            </div>

            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 font-manrope font-semibold"
              disabled={loading || !agreedToTerms}
              data-testid="register-submit-btn"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="font-inter text-sm text-slate-600">
              Already have an account?{' '}
              <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-semibold" data-testid="login-link">
                Sign in
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Register;