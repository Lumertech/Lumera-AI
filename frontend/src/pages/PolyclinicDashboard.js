import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Building2, Users, Calendar, IndianRupee, TrendingUp } from 'lucide-react';
import PolyclinicLayout from '@/components/Layout/PolyclinicLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const Stat = ({ icon: Icon, label, value, color }) => (
  <Card className="border-slate-200">
    <CardContent className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500 font-inter">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const PolyclinicDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/polyclinic/dashboard`);
        setData(res.data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <PolyclinicLayout>
        <div className="flex items-center justify-center h-96">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </PolyclinicLayout>
    );
  }

  const totals = data?.totals || {};
  const doctors = data?.doctors || [];
  const pc = data?.polyclinic || {};

  return (
    <PolyclinicLayout>
      <div className="space-y-6" data-testid="polyclinic-dashboard">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Building2 className="h-7 w-7 text-indigo-600" />
            <h1 className="font-manrope font-bold text-3xl text-slate-900">{pc.name || 'Polyclinic'}</h1>
          </div>
          <p className="text-slate-600 font-inter">{pc.address || 'Aggregate view across all your affiliated doctors'}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={Users} label="Doctors" value={totals.doctors ?? 0} color="bg-indigo-600" />
          <Stat icon={Calendar} label="Appointments (this month)" value={totals.appointments_this_month ?? 0} color="bg-emerald-600" />
          <Stat icon={IndianRupee} label="Revenue (this month)" value={`₹${(totals.revenue_paid_this_month ?? 0).toLocaleString('en-IN')}`} color="bg-purple-600" />
          <Stat icon={TrendingUp} label="Total appointments" value={totals.appointments_all_time ?? 0} color="bg-orange-500" />
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Doctor performance this month</CardTitle>
          </CardHeader>
          <CardContent>
            {doctors.length === 0 ? (
              <p className="text-slate-500 text-sm py-6 text-center">
                No doctors linked yet. Head to the <strong>Doctors</strong> tab to invite them by email.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {doctors.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-3" data-testid={`doctor-row-${d.id}`}>
                    <div>
                      <p className="font-medium text-slate-900">{d.name}</p>
                      <p className="text-xs text-slate-500">{d.email} · {d.profession}</p>
                    </div>
                    <span className="text-lg font-semibold text-indigo-700">
                      {d.appointments_this_month}
                      <span className="text-xs text-slate-500 font-normal ml-1">appts</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PolyclinicLayout>
  );
};

export default PolyclinicDashboard;
