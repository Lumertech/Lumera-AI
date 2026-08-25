import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import ErrorBoundary from '@/components/ErrorBoundary';
import '@/App.css';

// Pages
import Landing from '@/pages/Landing';
import Policies from '@/pages/Policies';
import DataDeletion from '@/pages/DataDeletion';
import PayLink from '@/pages/PayLink';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import WhatsAppLogin from '@/pages/WhatsAppLogin';
import Dashboard from '@/pages/Dashboard';
import Appointments from '@/pages/Appointments';
import AppointmentDetails from '@/pages/AppointmentDetails';
import PrescriptionWriter from '@/pages/PrescriptionWriter';
import VitalsEntry from '@/pages/VitalsEntry';
import WaitingRoom from '@/pages/WaitingRoom';
import LetterheadBuilder from '@/pages/LetterheadBuilder';
import AmbientHistory from '@/pages/AmbientHistory';
import Clients from '@/pages/Clients';
import WhatsAppConfig from '@/pages/WhatsAppConfig';
import WhatsAppInbox from '@/pages/WhatsAppInbox';
import VoiceBotConfig from '@/pages/VoiceBotConfig';
import Payments from '@/pages/Payments';
import Reminders from '@/pages/Reminders';
import Settings from '@/pages/Settings';
import Subscription from '@/pages/Subscription';
import Profile from '@/pages/Profile';
import ClinicSettings from '@/pages/ClinicSettings';
import Consultations from '@/pages/Consultations';
import ConsultationNotesWriter from '@/pages/ConsultationNotesWriter';
import PatientPortal from '@/pages/PatientPortal';
import Invoices from '@/pages/Invoices';

// Admin Pages
import AdminLogin from '@/pages/AdminLogin';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminUsers from '@/pages/AdminUsers';
import AdminAnalytics from '@/pages/AdminAnalytics';
import AdminContentEditor from '@/pages/AdminContentEditor';
import AdminLicenses from '@/pages/AdminLicenses';
import AdminWhatsAppConfig from '@/pages/AdminWhatsAppConfig';
import ResetPassword from '@/pages/ResetPassword';
import WhatsAppTemplates from '@/pages/WhatsAppTemplates';

// Polyclinic Pages
import PolyclinicRegister from '@/pages/PolyclinicRegister';
import PolyclinicDashboard from '@/pages/PolyclinicDashboard';
import PolyclinicDoctors from '@/pages/PolyclinicDoctors';
import PolyclinicSettings from '@/pages/PolyclinicSettings';
import { useLocation } from 'react-router-dom';

const ProtectedRoute = ({ children, adminOnly = false, polyclinicOnly = false }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-inter">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Admin routes redirect to admin login; everything else to user login
    const path = location.pathname || '';
    const target = path.startsWith('/admin') ? '/admin/login' : '/login';
    return <Navigate to={target} replace />;
  }

  // Admins should always be in /admin/*; auto-redirect if they hit user routes
  const path = location.pathname || '';
  if (user.role === 'admin' && !path.startsWith('/admin')) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  // Polyclinic admins should always be in /polyclinic/*
  if (user.role === 'polyclinic_admin' && !path.startsWith('/polyclinic')) {
    return <Navigate to="/polyclinic/dashboard" replace />;
  }
  // Non-admins cannot access /admin/*
  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  // Non-polyclinic-admins cannot access /polyclinic/* (except registration which is public)
  if (polyclinicOnly && user.role !== 'polyclinic_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-inter">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
    if (user.role === 'polyclinic_admin') return <Navigate to="/polyclinic/dashboard" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/privacy" element={<Navigate to="/policies#privacy-policy" replace />} />
          <Route path="/terms" element={<Navigate to="/policies#terms-of-service" replace />} />
          <Route path="/data-deletion" element={<DataDeletion />} />
          <Route path="/pay/:intentId" element={<PayLink />} />
          <Route
            path="/whatsapp-login"
            element={
              <PublicRoute>
                <WhatsAppLogin />
              </PublicRoute>
            }
          />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/appointments"
            element={
              <ProtectedRoute>
                <Appointments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <ProtectedRoute>
                <Clients />
              </ProtectedRoute>
            }
          />
          <Route
            path="/whatsapp/inbox"
            element={
              <ProtectedRoute>
                <WhatsAppInbox />
              </ProtectedRoute>
            }
          />
          <Route
            path="/whatsapp"
            element={
              <ProtectedRoute>
                <WhatsAppConfig />
              </ProtectedRoute>
            }
          />
          <Route
            path="/voice-bot"
            element={
              <ProtectedRoute>
                <VoiceBotConfig />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payments"
            element={
              <ProtectedRoute>
                <Payments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reminders"
            element={
              <ProtectedRoute>
                <Reminders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscription"
            element={
              <ProtectedRoute>
                <Subscription />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clinics"
            element={
              <ProtectedRoute>
                <ClinicSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/consultations"
            element={
              <ProtectedRoute>
                <Consultations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/appointments/:id/notes"
            element={
              <ProtectedRoute>
                <ConsultationNotesWriter />
              </ProtectedRoute>
            }
          />

          {/* Public patient self-service portal — no auth needed, token in URL */}
          <Route path="/p/:token" element={<PatientPortal />} />
          <Route path="/waiting-room/:token" element={<WaitingRoom />} />
          <Route path="/letterhead" element={<ProtectedRoute><LetterheadBuilder /></ProtectedRoute>} />
          <Route path="/ambient-history" element={<ProtectedRoute><AmbientHistory /></ProtectedRoute>} />

          <Route
            path="/invoices"
            element={
              <ProtectedRoute>
                <Invoices />
              </ProtectedRoute>
            }
          />
          <Route
            path="/appointments/:id"
            element={
              <ProtectedRoute>
                <AppointmentDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/appointments/:id/prescription"
            element={
              <ProtectedRoute>
                <PrescriptionWriter />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vitals/:appointmentId"
            element={
              <ProtectedRoute>
                <VitalsEntry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/appointments/:appointmentId/vitals"
            element={
              <ProtectedRoute>
                <VitalsEntry />
              </ProtectedRoute>
            }
          />
          
          {/* Admin Routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/admin/dashboard" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/licenses" element={<ProtectedRoute adminOnly><AdminLicenses /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute adminOnly><AdminAnalytics /></ProtectedRoute>} />
          <Route path="/admin/content" element={<ProtectedRoute adminOnly><AdminContentEditor /></ProtectedRoute>} />
          <Route path="/admin/whatsapp-config" element={<ProtectedRoute adminOnly><AdminWhatsAppConfig /></ProtectedRoute>} />
          <Route path="/whatsapp-templates" element={<ProtectedRoute><WhatsAppTemplates /></ProtectedRoute>} />

          {/* Polyclinic Routes */}
          <Route path="/polyclinic/register" element={<PublicRoute><PolyclinicRegister /></PublicRoute>} />
          <Route path="/polyclinic/dashboard" element={<ProtectedRoute polyclinicOnly><PolyclinicDashboard /></ProtectedRoute>} />
          <Route path="/polyclinic/doctors" element={<ProtectedRoute polyclinicOnly><PolyclinicDoctors /></ProtectedRoute>} />
          <Route path="/polyclinic/settings" element={<ProtectedRoute polyclinicOnly><PolyclinicSettings /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;