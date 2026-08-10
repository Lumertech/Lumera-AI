import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Building2, Users, BarChart3, LogOut, Home, Settings as Cog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const PolyclinicLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const navItems = [
    { path: '/polyclinic/dashboard', icon: Home, label: 'Dashboard' },
    { path: '/polyclinic/doctors', icon: Users, label: 'Doctors' },
    { path: '/polyclinic/settings', icon: Cog, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="fixed top-0 left-0 h-full w-64 bg-gradient-to-b from-indigo-900 to-indigo-800 text-white" data-testid="polyclinic-sidebar">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-manrope font-bold text-xl">Polyclinic</h2>
              <p className="text-indigo-200 text-xs truncate max-w-[160px]">{user?.email}</p>
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
                    isActive ? 'bg-indigo-600 text-white' : 'text-indigo-100 hover:bg-indigo-700'
                  }`}
                  data-testid={`polyclinic-nav-${item.label.toLowerCase()}`}
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
            className="w-full bg-transparent border-indigo-500 text-indigo-100 hover:bg-indigo-700 hover:text-white"
            data-testid="polyclinic-back-to-landing-btn"
          >
            <Home className="h-4 w-4 mr-2" />
            Back to Landing
          </Button>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full bg-transparent border-indigo-500 text-indigo-100 hover:bg-indigo-700 hover:text-white"
            data-testid="polyclinic-logout-btn"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      <div className="ml-64 p-8">{children}</div>
    </div>
  );
};

export default PolyclinicLayout;
