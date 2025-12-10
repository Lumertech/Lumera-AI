import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/Layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AdminAnalytics = () => {
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

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600">Loading analytics...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const professions = Object.entries(analytics?.users_by_profession || {});
  const maxCount = Math.max(...professions.map(([_, count]) => count));

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-manrope font-bold text-3xl text-slate-900 mb-2">Analytics Dashboard</h1>
          <p className="text-slate-600 font-inter">Detailed insights into your platform</p>
        </div>

        {/* Profession Distribution */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Users by Profession
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {professions.map(([profession, count]) => {
                const percentage = (count / maxCount) * 100;
                return (
                  <div key={profession}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-inter text-slate-700 capitalize font-medium">{profession}</span>
                      <span className="font-manrope font-bold text-slate-900">{count} users</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-4">
                      <div
                        className="bg-gradient-to-r from-purple-600 to-indigo-600 h-4 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-slate-200">
            <CardContent className="p-6">
              <p className="text-slate-600 text-sm font-inter mb-1">Total Active Users</p>
              <p className="text-4xl font-bold font-manrope text-slate-900">{analytics?.total_users || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-6">
              <p className="text-slate-600 text-sm font-inter mb-1">Total Appointments</p>
              <p className="text-4xl font-bold font-manrope text-slate-900">{analytics?.total_appointments || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-6">
              <p className="text-slate-600 text-sm font-inter mb-1">New This Month</p>
              <p className="text-4xl font-bold font-manrope text-slate-900">{analytics?.recent_registrations || 0}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminAnalytics;