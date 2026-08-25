import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Calendar,
  Users,
  MessageSquare,
  Settings,
  CreditCard,
  Bell,
  BarChart3,
  LogOut,
  Menu,
  X,
  User,
  Phone,
  Building2,
  Wrench,
  Mic,
  Sparkles,
  Receipt,
  FileText,
} from 'lucide-react';
import HexaAssistant from '@/components/HexaAssistant';
import SealOfPrivacy from '@/components/SealOfPrivacy';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const DashboardLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [waStatus, setWaStatus] = useState(null); // null | 'CONNECTED' | 'DISCONNECTED'

  // Fetch WA connection status once (doctors only)
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get(`${API_URL}/whatsapp/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setWaStatus(r.data.status))
      .catch(() => {});
  }, []);

  // Normalize role: 'receptionist' legacy → 'front_desk'; 'user' legacy → 'doctor'; default 'doctor' for owners
  const rawRole = user?.role || 'doctor';
  let role = rawRole;
  if (rawRole === 'receptionist') role = 'front_desk';
  else if (rawRole === 'user') role = 'doctor';
  const isFrontDesk = role === 'front_desk';
  const isAssistant = role === 'assistant';
  const isSubUser = isFrontDesk || isAssistant;

  const ROLE_LABEL = {
    admin: 'Admin', doctor: 'Doctor', front_desk: 'Front Desk', assistant: 'Assistant',
  };
  const ROLE_STYLE = {
    admin: 'bg-purple-100 text-purple-800 border-purple-300',
    doctor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    front_desk: 'bg-teal-100 text-teal-800 border-teal-300',
    assistant: 'bg-amber-100 text-amber-800 border-amber-300',
  };
  const roleLabel = ROLE_LABEL[role] || (role[0]?.toUpperCase() + role.slice(1));
  const roleStyle = ROLE_STYLE[role] || 'bg-slate-100 text-slate-800 border-slate-300';

  const allNavigation = [
    // Daily Operations
    { name: 'Dashboard', href: '/dashboard', icon: BarChart3, roles: ['doctor', 'front_desk', 'assistant'] },
    { name: 'Appointments & OPD', href: '/appointments', icon: Calendar, roles: ['doctor', 'front_desk', 'assistant'] },
    { name: 'Patients', href: '/clients', icon: Users, roles: ['doctor', 'front_desk', 'assistant'] },
    // Clinical Care
    { name: 'Consultations & EMR', href: '/consultations', icon: Mic, roles: ['doctor'] },
    // Finance
    { name: 'Invoices & Billing', href: '/invoices', icon: Receipt, roles: ['doctor'] },
    { name: 'Payments', href: '/payments', icon: CreditCard, roles: ['doctor'] },
    // Automation
    { name: 'AI Voice & WhatsApp', href: '/voice-bot', icon: Phone, roles: ['doctor'] },
    { name: 'WhatsApp Inbox', href: '/whatsapp/inbox', icon: MessageSquare, roles: ['doctor', 'front_desk'] },
    { name: 'WhatsApp Bot', href: '/whatsapp', icon: MessageSquare, roles: ['doctor'] },
    { name: 'WA Templates', href: '/whatsapp-templates', icon: FileText, roles: ['doctor'] },
    { name: 'Reminders & Retention', href: '/reminders', icon: Bell, roles: ['doctor', 'front_desk'] },
    // Organization
    { name: 'Clinics & Staff', href: '/clinics', icon: Building2, roles: ['doctor'] },
    // Practice Tools
    { name: 'Practice Tools', href: '/letterhead', icon: Wrench, roles: ['doctor'] },
    // Settings
    { name: 'Profile', href: '/profile', icon: User, roles: ['doctor', 'front_desk', 'assistant'] },
    { name: 'Settings', href: '/settings', icon: Settings, roles: ['doctor'] },
    { name: 'Subscription', href: '/subscription', icon: CreditCard, roles: ['doctor'] },
  ];

  const navigation = allNavigation.filter((item) => item.roles.includes(role));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-teal-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-white/80 backdrop-blur-xl border-r border-slate-200/50
          transform transition-transform duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
        data-testid="dashboard-sidebar"
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-6 py-6 border-b border-slate-200">
            <Link to="/dashboard" className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-600 flex items-center justify-center">
                <span className="text-white font-manrope font-bold text-lg">L</span>
              </div>
              <span className="font-manrope font-bold text-xl text-slate-900">Lumera</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
              data-testid="close-sidebar-btn"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`
                    flex items-center space-x-3 px-4 py-3 rounded-lg font-manrope font-medium
                    transition-colors duration-200
                    ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-[0_1px_2px_rgba(79,70,229,0.3)]'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }
                  `}
                  data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t border-slate-200">
            {/* WA status indicator */}
            {waStatus !== null && (
              <div className={`flex items-center gap-2 px-3 py-1.5 mb-2 rounded-lg text-xs font-medium ${
                waStatus === 'CONNECTED'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-600'
              }`} data-testid="wa-sidebar-status">
                <span className={`w-2 h-2 rounded-full ${waStatus === 'CONNECTED' ? 'bg-emerald-500' : 'bg-red-400'}`} />
                WhatsApp {waStatus === 'CONNECTED' ? 'Active' : 'Disconnected'}
              </div>
            )}
            <div className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-slate-50">
              <Avatar>
                <AvatarFallback className="bg-indigo-600 text-white font-manrope">
                  {user?.name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-manrope font-semibold text-sm text-slate-900 truncate">
                  {user?.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="font-inter text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
                <span
                  data-testid="role-badge"
                  className={`inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[10px] font-semibold border ${roleStyle}`}
                >
                  {roleLabel}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full mt-2 text-slate-600 hover:text-red-600 hover:bg-red-50"
              onClick={handleLogout}
              data-testid="logout-btn"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
                data-testid="open-sidebar-btn"
              >
                <Menu className="h-6 w-6" />
              </Button>
              <h1 className="font-manrope font-bold text-2xl text-slate-900">
                {navigation.find((item) => item.href === location.pathname)?.name || 'Dashboard'}
              </h1>
              <div className="flex items-center space-x-2">
                <Link to="/whatsapp">
                  <Button variant="ghost" size="icon" data-testid="whatsapp-status-btn">
                    <MessageSquare className="h-5 w-5" />
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" data-testid="notifications-btn">
                  <Bell className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="px-4 sm:px-6 lg:px-8 py-8">{children}</main>

        {/* Seal of Privacy floating footer */}
        <div className="px-4 sm:px-6 lg:px-8 pb-6">
          <SealOfPrivacy />
        </div>
      </div>

      {/* Hexa AI Assistant (doctors only) */}
      {!isSubUser && <HexaAssistant />}
    </div>
  );
};

export default DashboardLayout;