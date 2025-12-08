import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Users, IndianRupee, Clock } from 'lucide-react';
import { formatDate, formatTime, formatCurrency } from '@/lib/utils';
import { Link } from 'react-router-dom';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const Dashboard = () => {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await axios.get(`${API_URL}/analytics/dashboard`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = [
    {
      title: 'Total Appointments',
      value: analytics?.total_appointments || 0,
      icon: Calendar,
      color: 'from-blue-500 to-indigo-500',
    },
    {
      title: 'Total Clients',
      value: analytics?.total_clients || 0,
      icon: Users,
      color: 'from-purple-500 to-pink-500',
    },
    {
      title: 'Today\'s Appointments',
      value: analytics?.today_appointments || 0,
      icon: Clock,
      color: 'from-orange-500 to-red-500',
    },
    {
      title: 'Total Revenue',
      value: '₹' + (analytics?.total_revenue || 0).toLocaleString('en-IN'),
      icon: IndianRupee,
      color: 'from-green-500 to-teal-500',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8" data-testid="dashboard-container">
        {/* Welcome Section */}
        <div className="bg-gradient-to-br from-indigo-600 to-teal-600 rounded-xl p-8 text-white shadow-lg">
          <h1 className="font-manrope font-bold text-3xl mb-2">Welcome back, {user?.name}!</h1>
          <p className="font-inter text-indigo-100 text-lg">
            Here's what's happening with your practice today.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="border-slate-200 card-hover" data-testid={`stat-card-${index}`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-manrope text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        {stat.title}
                      </p>
                      <p className="font-manrope text-3xl font-bold text-slate-900">{stat.value}</p>
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

        {/* Upcoming Appointments */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-200">
            <div className="flex items-center justify-between">
              <CardTitle className="font-manrope text-xl">Upcoming Appointments</CardTitle>
              <Link to="/appointments">
                <Button variant="outline" size="sm" data-testid="view-all-appointments-btn">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {loading ? (
              <p className="text-center text-slate-500 py-8">Loading...</p>
            ) : analytics?.upcoming_appointments?.length > 0 ? (
              <div className="space-y-4">
                {analytics.upcoming_appointments.map((appt, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    data-testid={`upcoming-appointment-${index}`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Calendar className="h-6 w-6 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-manrope font-semibold text-slate-900">{appt.client_name}</p>
                        <p className="font-inter text-sm text-slate-600">
                          {formatDate(appt.appointment_date)} at {formatTime(appt.start_time)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-manrope font-semibold bg-green-100 text-green-800">
                        {appt.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="font-inter text-slate-500 mb-4">No upcoming appointments</p>
                <Link to="/appointments">
                  <Button className="bg-indigo-600 hover:bg-indigo-700" data-testid="create-appointment-btn">
                    Schedule Appointment
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6">
          <Link to="/appointments" className="block">
            <Card className="border-slate-200 card-hover cursor-pointer" data-testid="quick-action-appointments">
              <CardContent className="p-6 text-center">
                <Calendar className="h-12 w-12 text-indigo-600 mx-auto mb-3" />
                <h3 className="font-manrope font-semibold text-lg text-slate-900 mb-2">
                  New Appointment
                </h3>
                <p className="font-inter text-sm text-slate-600">
                  Schedule a new appointment with a client
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link to="/clients" className="block">
            <Card className="border-slate-200 card-hover cursor-pointer" data-testid="quick-action-clients">
              <CardContent className="p-6 text-center">
                <Users className="h-12 w-12 text-purple-600 mx-auto mb-3" />
                <h3 className="font-manrope font-semibold text-lg text-slate-900 mb-2">View Clients</h3>
                <p className="font-inter text-sm text-slate-600">Manage your client database</p>
              </CardContent>
            </Card>
          </Link>
          <Link to="/settings" className="block">
            <Card className="border-slate-200 card-hover cursor-pointer" data-testid="quick-action-settings">
              <CardContent className="p-6 text-center">
                <Clock className="h-12 w-12 text-teal-600 mx-auto mb-3" />
                <h3 className="font-manrope font-semibold text-lg text-slate-900 mb-2">
                  Configure Hours
                </h3>
                <p className="font-inter text-sm text-slate-600">Set your availability schedule</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;