import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Shield, Users, BarChart3, FileText, LogOut, Home, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const AdminLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  const navItems = [
    { path: '/admin/dashboard', icon: Home, label: 'Dashboard' },
    { path: '/admin/users', icon: Users, label: 'User Management' },
    { path: '/admin/licenses', icon: KeyRound, label: 'License Management' },
    { path: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/admin/content', icon: FileText, label: 'Content Editor' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <div className="fixed top-0 left-0 h-full w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white" data-testid="admin-sidebar">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-manrope font-bold text-xl">Lumera Admin</h2>
              <p className="text-slate-400 text-xs">{user.email}</p>
            </div>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                  data-testid={`admin-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-inter">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 space-y-2">
          <Button
            onClick={() => navigate('/')}
            variant="outline"
            className="w-full bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
            data-testid="admin-back-to-landing-btn"
          >
            <Home className="h-4 w-4 mr-2" />
            Back to Landing
          </Button>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
            data-testid="admin-logout-btn"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-8">
        {children}
      </div>
    </div>
  );
};

export default AdminLayout;
