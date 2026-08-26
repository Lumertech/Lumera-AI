import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Calendar, Users, MessageSquare, Settings, CreditCard, Bell, BarChart3,
  LogOut, Menu, X, User, Phone, Building2, Wrench, Mic, Sparkles, Receipt,
  FileText, ChevronDown, ChevronRight, Wallet,
} from 'lucide-react';
import HexaAssistant from '@/components/HexaAssistant';
import SealOfPrivacy from '@/components/SealOfPrivacy';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

/* ── nav items ─────────────────────────────────────────────────────────────── */
const ALL_NAV = [
  // ungrouped top
  { name: 'Dashboard',          href: '/dashboard',           icon: BarChart3,     roles: ['doctor','front_desk','assistant'] },
  { name: 'Appointments & OPD', href: '/appointments',        icon: Calendar,      roles: ['doctor','front_desk','assistant'] },
  { name: 'Patients',           href: '/clients',             icon: Users,         roles: ['doctor','front_desk','assistant'] },
  { name: 'Consultations & EMR',href: '/consultations',       icon: Mic,           roles: ['doctor'] },
  // billing group
  { name: 'Invoices & Billing', href: '/invoices',            icon: Receipt,       roles: ['doctor'], group: 'billing' },
  { name: 'Payments',           href: '/payments',            icon: Wallet,        roles: ['doctor'], group: 'billing' },
  // communications group
  { name: 'WhatsApp Inbox',     href: '/whatsapp/inbox',      icon: MessageSquare, roles: ['doctor','front_desk'], group: 'comms' },
  { name: 'AI Voice & WA',      href: '/voice-bot',           icon: Phone,         roles: ['doctor'], group: 'comms' },
  { name: 'WhatsApp Bot',       href: '/whatsapp',            icon: MessageSquare, roles: ['doctor'], group: 'comms' },
  { name: 'WA Templates',       href: '/whatsapp-templates',  icon: FileText,      roles: ['doctor'], group: 'comms' },
  { name: 'Reminders',          href: '/reminders',           icon: Bell,          roles: ['doctor','front_desk'], group: 'comms' },
  // ungrouped bottom
  { name: 'Clinics & Staff',    href: '/clinics',             icon: Building2,     roles: ['doctor'] },
  { name: 'Practice Tools',     href: '/letterhead',          icon: Wrench,        roles: ['doctor'] },
  { name: 'Profile',            href: '/profile',             icon: User,          roles: ['doctor','front_desk','assistant'] },
  { name: 'Settings',           href: '/settings',            icon: Settings,      roles: ['doctor'] },
  { name: 'Subscription',       href: '/subscription',        icon: CreditCard,    roles: ['doctor'] },
];

const GROUPS = {
  billing: { label: 'Billing & Payments', icon: Wallet,        paths: ['/invoices','/payments'] },
  comms:   { label: 'Communications',      icon: MessageSquare, paths: ['/voice-bot','/whatsapp','/whatsapp-templates','/reminders'] },
};

/* ── helpers ────────────────────────────────────────────────────────────────── */
const ROLE_LABEL = { admin:'Admin', doctor:'Doctor', front_desk:'Front Desk', assistant:'Assistant' };
const ROLE_STYLE = {
  admin: 'bg-purple-100 text-purple-800 border-purple-300',
  doctor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  front_desk: 'bg-teal-100 text-teal-800 border-teal-300',
  assistant: 'bg-amber-100 text-amber-800 border-amber-300',
};

/* ── page title map for paths not directly in nav ───────────────────────────── */
const EXTRA_TITLES = {
  '/whatsapp/inbox': 'WhatsApp Inbox',
};

/* ─────────────────────────────────────────────────────────────────────────────
   NavLink helper
──────────────────────────────────────────────────────────────────────────────*/
const NavLink = ({ item, active, indent = false, onClick }) => {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      onClick={onClick}
      className={`flex items-center space-x-3 px-4 py-2.5 rounded-lg font-manrope font-medium transition-colors duration-150
        ${indent ? 'ml-3 pl-3 border-l-2 border-slate-200' : ''}
        ${active
          ? 'bg-indigo-600 text-white shadow-[0_1px_2px_rgba(79,70,229,0.3)]'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
      data-testid={`nav-${item.name.toLowerCase().replace(/[^a-z0-9]/g,'-')}`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm leading-tight">{item.name}</span>
    </Link>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   CollapsibleGroup
──────────────────────────────────────────────────────────────────────────────*/
const CollapsibleGroup = ({ groupKey, items, location, onLinkClick }) => {
  const cfg = GROUPS[groupKey];
  const GroupIcon = cfg.icon;
  const anyActive = items.some(i => location.pathname === i.href || location.pathname.startsWith(i.href + '/'));
  const [open, setOpen] = useState(anyActive);

  // Auto-expand when navigating into this group
  useEffect(() => { if (anyActive) setOpen(true); }, [anyActive]);

  return (
    <div className="space-y-0.5">
      {/* Group header button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-manrope font-semibold text-xs uppercase tracking-wider transition-colors
          ${anyActive ? 'text-indigo-700 bg-indigo-50' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
        data-testid={`nav-group-${groupKey}`}
      >
        <span className="flex items-center gap-2">
          <GroupIcon className="h-4 w-4" />
          {cfg.label}
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      {/* Children */}
      {open && (
        <div className="space-y-0.5 pl-1">
          {items.map(item => (
            <NavLink
              key={item.href}
              item={item}
              active={location.pathname === item.href || location.pathname.startsWith(item.href + '/')}
              indent
              onClick={onLinkClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   DashboardLayout
──────────────────────────────────────────────────────────────────────────────*/
const DashboardLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [waStatus, setWaStatus] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get(`${API_URL}/whatsapp/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setWaStatus(r.data.status))
      .catch(() => {});
  }, []);

  const rawRole = user?.role || 'doctor';
  let role = rawRole;
  if (rawRole === 'receptionist') role = 'front_desk';
  else if (rawRole === 'user') role = 'doctor';
  const isSubUser = role === 'front_desk' || role === 'assistant';

  const roleLabel = ROLE_LABEL[role] || (role[0]?.toUpperCase() + role.slice(1));
  const roleStyle = ROLE_STYLE[role] || 'bg-slate-100 text-slate-800 border-slate-300';

  const visibleNav = ALL_NAV.filter(i => i.roles.includes(role));

  // Partition into ungrouped + groups
  const ungroupedTop = visibleNav.filter(i => !i.group && ['Dashboard','Appointments & OPD','Patients','Consultations & EMR'].includes(i.name));
  const billingItems  = visibleNav.filter(i => i.group === 'billing');
  const commsItems    = visibleNav.filter(i => i.group === 'comms');
  const ungroupedBot  = visibleNav.filter(i => !i.group && ['Clinics & Staff','Practice Tools'].includes(i.name));
  const accountItems  = visibleNav.filter(i => !i.group && ['Profile','Settings','Subscription'].includes(i.name));

  // Page title — look in nav, then extras, then pathname
  const currentTitle =
    ALL_NAV.find(i => location.pathname === i.href || location.pathname.startsWith(i.href + '/'))?.name ||
    EXTRA_TITLES[location.pathname] ||
    'Dashboard';

  const handleLogout = () => { logout(); navigate('/login'); };
  const closeSidebar = () => setSidebarOpen(false);

  const renderSidebarNav = () => (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
      {/* Top ungrouped */}
      {ungroupedTop.map(i => (
        <NavLink key={i.href} item={i} active={location.pathname === i.href} onClick={closeSidebar} />
      ))}

      {/* Billing group */}
      {billingItems.length > 0 && (
        <>
          <div className="my-2 border-t border-slate-100" />
          <CollapsibleGroup groupKey="billing" items={billingItems} location={location} onLinkClick={closeSidebar} />
        </>
      )}

      {/* Communications group */}
      {commsItems.length > 0 && (
        <>
          <div className="my-2 border-t border-slate-100" />
          <CollapsibleGroup groupKey="comms" items={commsItems} location={location} onLinkClick={closeSidebar} />
        </>
      )}

      {/* Middle ungrouped */}
      {ungroupedBot.length > 0 && (
        <>
          <div className="my-2 border-t border-slate-100" />
          {ungroupedBot.map(i => (
            <NavLink key={i.href} item={i} active={location.pathname === i.href} onClick={closeSidebar} />
          ))}
        </>
      )}

      {/* Account */}
      {accountItems.length > 0 && (
        <>
          <div className="my-2 border-t border-slate-100" />
          {accountItems.map(i => (
            <NavLink key={i.href} item={i} active={location.pathname === i.href} onClick={closeSidebar} />
          ))}
        </>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-teal-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden" onClick={closeSidebar} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white/90 backdrop-blur-xl border-r border-slate-200/50
          transform transition-transform duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        data-testid="dashboard-sidebar"
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-5 py-5 border-b border-slate-200">
            <Link to="/dashboard" className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-600 flex items-center justify-center">
                <span className="text-white font-manrope font-bold text-base">L</span>
              </div>
              <span className="font-manrope font-bold text-xl text-slate-900">Lumera</span>
            </Link>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={closeSidebar} data-testid="close-sidebar-btn">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {renderSidebarNav()}

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 space-y-2">
            {/* WA status pill */}
            {waStatus !== null && (
              <Link to="/settings?tab=whatsapp" className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                waStatus === 'CONNECTED' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`} data-testid="wa-sidebar-status">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${waStatus === 'CONNECTED' ? 'bg-emerald-500' : 'bg-red-400 animate-pulse'}`} />
                WhatsApp {waStatus === 'CONNECTED' ? 'Active' : 'Disconnected — Tap to fix'}
              </Link>
            )}

            <div className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-slate-50">
              <Avatar>
                <AvatarFallback className="bg-indigo-600 text-white font-manrope text-sm">
                  {user?.name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-manrope font-semibold text-sm text-slate-900 truncate">{user?.name}</p>
                <p className="font-inter text-xs text-slate-500 truncate">{user?.email}</p>
                <span data-testid="role-badge" className={`inline-flex items-center px-2 py-0.5 mt-0.5 rounded-full text-[10px] font-semibold border ${roleStyle}`}>
                  {roleLabel}
                </span>
              </div>
            </div>

            <Button variant="ghost" className="w-full text-slate-600 hover:text-red-600 hover:bg-red-50" onClick={handleLogout} data-testid="logout-btn">
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
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)} data-testid="open-sidebar-btn">
              <Menu className="h-6 w-6" />
            </Button>
            <h1 className="font-manrope font-bold text-xl sm:text-2xl text-slate-900 truncate">{currentTitle}</h1>
            <div className="flex items-center space-x-1">
              <Link to="/whatsapp/inbox">
                <Button variant="ghost" size="icon" data-testid="whatsapp-status-btn" title="WhatsApp Inbox">
                  <MessageSquare className="h-5 w-5" />
                </Button>
              </Link>
              <Button variant="ghost" size="icon" data-testid="notifications-btn" title="Notifications">
                <Bell className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content — extra bottom padding so Hexa button never overlaps */}
        <main className="px-4 sm:px-6 lg:px-8 py-6 pb-24 sm:pb-8">{children}</main>

        <div className="px-4 sm:px-6 lg:px-8 pb-6">
          <SealOfPrivacy />
        </div>
      </div>

      {/* Hexa AI Assistant — doctors only */}
      {!isSubUser && <HexaAssistant />}
    </div>
  );
};

export default DashboardLayout;
