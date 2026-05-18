import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import ErrorBoundary from '@/components/ErrorBoundary';
import '@/App.css';

// Pages
import Landing from '@/pages/Landing';
import Policies from '@/pages/Policies';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import WhatsAppLogin from '@/pages/WhatsAppLogin';
import Dashboard from '@/pages/Dashboard';
import Appointments from '@/pages/Appointments';
import AppointmentDetails from '@/pages/AppointmentDetails';
import PrescriptionWriter from '@/pages/PrescriptionWriter';
import Clients from '@/pages/Clients';
import WhatsAppConfig from '@/pages/WhatsAppConfig';
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

const ProtectedRoute = ({ children }) => {
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

  if (!user) {
    return <Navigate to="/login" replace />;
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
          
          {/* Admin Routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />
          <Route path="/admin/content" element={<AdminContentEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;