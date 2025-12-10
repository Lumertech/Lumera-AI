import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/Layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Calendar, TrendingUp, Activity } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AdminDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/analytics`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const stats = [
    {
      title: 'Total Users',
      value: analytics?.total_users || 0,
      icon: Users,
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Total Appointments',
      value: analytics?.total_appointments || 0,
      icon: Calendar,
      color: 'from-green-500 to-green-600',
    },
    {
      title: 'New This Month',
      value: analytics?.recent_registrations || 0,
      icon: TrendingUp,
      color: 'from-purple-500 to-purple-600',
    },
    {
      title: 'Active Professions',
      value: Object.keys(analytics?.users_by_profession || {}).length,
      icon: Activity,
      color: 'from-orange-500 to-orange-600',
    },
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600">Loading dashboard...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="font-manrope font-bold text-3xl text-slate-900 mb-2">Admin Dashboard</h1>
          <p className="text-slate-600 font-inter">Monitor your platform's performance</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="border-slate-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-600 text-sm font-inter mb-1">{stat.title}</p>
                      <p className="text-3xl font-bold font-manrope text-slate-900">{stat.value}</p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Users by Profession */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">Users by Profession</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(analytics?.users_by_profession || {}).map(([profession, count]) => (
                <div key={profession} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                      <span className="text-white font-bold text-lg">{profession.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="font-inter text-slate-900 capitalize">{profession}</span>
                  </div>
                  <span className="font-manrope font-bold text-slate-900 text-xl">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;