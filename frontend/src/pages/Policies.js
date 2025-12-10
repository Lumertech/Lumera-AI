import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Home, Shield, FileText, AlertCircle, CreditCard, MessageSquare, Lock, Cookie } from 'lucide-react';

const Policies = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Scroll to section if hash is present
  React.useEffect(() => {
    if (location.hash) {
      const element = document.getElementById(location.hash.substring(1));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [location]);

  const sections = [
    { id: 'privacy-policy', title: 'Privacy Policy', icon: Shield },
    { id: 'terms-of-service', title: 'Terms of Service', icon: FileText },
    { id: 'medical-disclaimer', title: 'Medical Disclaimer', icon: AlertCircle },
    { id: 'payment-disclaimer', title: 'Payment Disclaimer', icon: CreditCard },
    { id: 'whatsapp-disclaimer', title: 'WhatsApp Communication Disclaimer', icon: MessageSquare },
    { id: 'data-security', title: 'Data Security Disclaimer', icon: Lock },
    { id: 'cookie-policy', title: 'Cookie Policy', icon: Cookie },
    { id: 'limitation-liability', title: 'Limitation of Liability', icon: AlertCircle },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-600 flex items-center justify-center">
                <span className="text-white font-manrope font-bold text-lg">L</span>
              </div>
              <span className="font-manrope font-bold text-xl text-slate-900">Lumer</span>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate('/')}
            >
              <Home className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="font-manrope font-bold text-4xl text-slate-900 mb-4">
              📜 Policies & Disclaimers
            </h1>
            <p className="text-lg text-slate-600 font-inter">
              Lumer Tech LLC
            </p>
          </div>

          {/* Quick Navigation */}
          <Card className="mb-8 border-slate-200">
            <CardContent className="p-6">
              <h3 className="font-manrope font-semibold text-lg mb-4">Quick Navigation</h3>
              <div className="grid md:grid-cols-2 gap-2">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="flex items-center space-x-2 p-2 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <Icon className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm font-inter text-slate-700">{section.title}</span>
                    </a>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Privacy Policy */}
          <section id="privacy-policy" className="mb-12 scroll-mt-20">
            <Card className="border-slate-200">
              <CardContent className="p-8">
                <div className="flex items-center space-x-3 mb-4">
                  <Shield className="h-6 w-6 text-indigo-600" />
                  <h2 className="font-manrope font-bold text-2xl text-slate-900">Privacy Policy</h2>
                </div>
                <div className="space-y-4 text-slate-700 font-inter">
                  <p>Lumer Tech LLC ("Lumer") values your privacy.</p>
                  <p>We collect personal information such as name, contact details, appointment history, and payment records to provide scheduling, reminders, and communication services.</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Data is stored securely and used only for service delivery.</li>
                    <li>We do not sell or share personal data with third parties except for trusted integrations (WhatsApp Business API, Razorpay, Google Calendar).</li>
                    <li>You may contact us at <a href="mailto:ravee@lumer.me" className="text-indigo-600 hover:underline">ravee@lumer.me</a> for privacy queries or to request deletion of your data.</li>
                    <li>This policy is governed by <strong>Indian law, Pune jurisdiction</strong>.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Terms of Service */}
          <section id="terms-of-service" className="mb-12 scroll-mt-20">
            <Card className="border-slate-200">
              <CardContent className="p-8">
                <div className="flex items-center space-x-3 mb-4">
                  <FileText className="h-6 w-6 text-indigo-600" />
                  <h2 className="font-manrope font-bold text-2xl text-slate-900">Terms of Service</h2>
                </div>
                <div className="space-y-4 text-slate-700 font-inter">
                  <p>By using Lumer, you agree to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Provide accurate information during registration.</li>
                    <li>Use the service only for lawful purposes.</li>
                    <li>Accept that Lumer is a facilitator of communication and scheduling, not a medical or professional service provider.</li>
                    <li>Acknowledge that liability for advice, prescriptions, or services rests solely with the registered professional.</li>
                  </ul>
                  <p>Refunds and cancellations are subject to the Payment Disclaimer below.</p>
                  <p>These Terms are governed by <strong>Indian law, Pune jurisdiction</strong>.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Medical Disclaimer */}
          <section id="medical-disclaimer" className="mb-12 scroll-mt-20">
            <Card className="border-slate-200">
              <CardContent className="p-8">
                <div className="flex items-center space-x-3 mb-4">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                  <h2 className="font-manrope font-bold text-2xl text-slate-900">Medical Disclaimer</h2>
                </div>
                <div className="space-y-4 text-slate-700 font-inter">
                  <p>Lumer does not provide medical advice.</p>
                  <p>All medical information, prescriptions, and communication are the responsibility of the registered professional.</p>
                  <p>Patients should consult licensed professionals for medical decisions.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Payment Disclaimer */}
          <section id="payment-disclaimer" className="mb-12 scroll-mt-20">
            <Card className="border-slate-200">
              <CardContent className="p-8">
                <div className="flex items-center space-x-3 mb-4">
                  <CreditCard className="h-6 w-6 text-green-600" />
                  <h2 className="font-manrope font-bold text-2xl text-slate-900">Payment Disclaimer</h2>
                </div>
                <div className="space-y-4 text-slate-700 font-inter">
                  <p>Payments are processed via <strong>Razorpay</strong>. Lumer does not store sensitive payment details.</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Refunds are available within <strong>7 days</strong> if an appointment is cancelled at least <strong>24 hours prior</strong> to the scheduled time.</li>
                    <li>Cash payments marked as "collected" are recorded for tracking but not processed by Lumer.</li>
                    <li>Refunds and cancellations are managed directly by the professional or clinic.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* WhatsApp Communication Disclaimer */}
          <section id="whatsapp-disclaimer" className="mb-12 scroll-mt-20">
            <Card className="border-slate-200">
              <CardContent className="p-8">
                <div className="flex items-center space-x-3 mb-4">
                  <MessageSquare className="h-6 w-6 text-green-600" />
                  <h2 className="font-manrope font-bold text-2xl text-slate-900">WhatsApp Communication Disclaimer</h2>
                </div>
                <div className="space-y-4 text-slate-700 font-inter">
                  <p>Communication occurs via the <strong>WhatsApp Business API</strong>.</p>
                  <p>Patients will see the professional's verified WhatsApp number.</p>
                  <p>Lumer is not responsible for delivery issues or delays caused by WhatsApp.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Data Security Disclaimer */}
          <section id="data-security" className="mb-12 scroll-mt-20">
            <Card className="border-slate-200">
              <CardContent className="p-8">
                <div className="flex items-center space-x-3 mb-4">
                  <Lock className="h-6 w-6 text-indigo-600" />
                  <h2 className="font-manrope font-bold text-2xl text-slate-900">Data Security Disclaimer</h2>
                </div>
                <div className="space-y-4 text-slate-700 font-inter">
                  <p>We use encryption and secure storage to protect data.</p>
                  <p>While best efforts are made, no system is 100% secure.</p>
                  <p>Users should report suspicious activity immediately to <a href="mailto:ravee@lumer.me" className="text-indigo-600 hover:underline">ravee@lumer.me</a>.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Cookie Policy */}
          <section id="cookie-policy" className="mb-12 scroll-mt-20">
            <Card className="border-slate-200">
              <CardContent className="p-8">
                <div className="flex items-center space-x-3 mb-4">
                  <Cookie className="h-6 w-6 text-amber-600" />
                  <h2 className="font-manrope font-bold text-2xl text-slate-900">Cookie Policy</h2>
                </div>
                <div className="space-y-4 text-slate-700 font-inter">
                  <p>Lumer uses cookies for session management, personalization, and analytics.</p>
                  <p>We also use <strong>Google Analytics</strong> to improve user experience.</p>
                  <p>Users can opt out of cookies via browser settings.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Limitation of Liability */}
          <section id="limitation-liability" className="mb-12 scroll-mt-20">
            <Card className="border-slate-200">
              <CardContent className="p-8">
                <div className="flex items-center space-x-3 mb-4">
                  <AlertCircle className="h-6 w-6 text-orange-600" />
                  <h2 className="font-manrope font-bold text-2xl text-slate-900">Limitation of Liability</h2>
                </div>
                <div className="space-y-4 text-slate-700 font-inter">
                  <p>Lumer Tech LLC is a medium for communication and scheduling.</p>
                  <p>We are not liable for missed appointments, miscommunication, or errors in medical or service delivery.</p>
                  <p>Responsibility lies solely with the professional.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Contact Section */}
          <Card className="border-indigo-200 bg-indigo-50">
            <CardContent className="p-8 text-center">
              <h3 className="font-manrope font-bold text-xl text-slate-900 mb-4">
                Questions or Concerns?
              </h3>
              <p className="text-slate-700 font-inter mb-4">
                For any questions regarding these policies, please contact us:
              </p>
              <a
                href="mailto:ravee@lumer.me"
                className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
              >
                Contact Us: ravee@lumer.me
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Policies;
