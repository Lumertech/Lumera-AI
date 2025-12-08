import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Plus, Search, Filter } from 'lucide-react';
import { formatDate, formatTime } from '@/lib/utils';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const Appointments = () => {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewAppointment, setShowNewAppointment] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [formData, setFormData] = useState({
    client_name: '',
    client_phone: '',
    client_email: '',
    appointment_date: '',
    start_time: '',
    end_time: '',
    consultation_mode: 'in-person',
    notes: '',
  });

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      const response = await axios.get(`${API_URL}/appointments`);
      setAppointments(response.data);
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/appointments`, formData);
      toast.success('Appointment created successfully!');
      setShowNewAppointment(false);
      setFormData({
        client_name: '',
        client_phone: '',
        client_email: '',
        appointment_date: '',
        start_time: '',
        end_time: '',
        consultation_mode: 'in-person',
        notes: '',
      });
      fetchAppointments();
    } catch (error) {
      console.error('Failed to create appointment:', error);
      toast.error('Failed to create appointment');
    }
  };

  const filteredAppointments = appointments.filter((appt) => {
    const matchesSearch =
      appt.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appt.client_phone.includes(searchTerm);
    const matchesFilter = filterStatus === 'all' || appt.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="appointments-page">
        {/* Header */}
        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
              <div className="flex-1 flex items-center space-x-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search appointments..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="search-input"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40" data-testid="filter-select">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Dialog open={showNewAppointment} onOpenChange={setShowNewAppointment}>
                <DialogTrigger asChild>
                  <Button className="bg-indigo-600 hover:bg-indigo-700" data-testid="new-appointment-btn">
                    <Plus className="h-4 w-4 mr-2" />
                    New Appointment
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-manrope text-2xl">Create Appointment</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Client Name *</Label>
                        <Input
                          value={formData.client_name}
                          onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                          required
                          data-testid="client-name-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone Number *</Label>
                        <Input
                          value={formData.client_phone}
                          onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                          required
                          data-testid="client-phone-input"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={formData.client_email}
                        onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                        data-testid="client-email-input"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Date *</Label>
                        <Input
                          type="date"
                          value={formData.appointment_date}
                          onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                          required
                          data-testid="appointment-date-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Start Time *</Label>
                        <Input
                          type="time"
                          value={formData.start_time}
                          onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                          required
                          data-testid="start-time-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>End Time *</Label>
                        <Input
                          type="time"
                          value={formData.end_time}
                          onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                          required
                          data-testid="end-time-input"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Consultation Mode</Label>
                      <Select
                        value={formData.consultation_mode}
                        onValueChange={(value) => setFormData({ ...formData, consultation_mode: value })}
                      >
                        <SelectTrigger data-testid="consultation-mode-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in-person">In Person</SelectItem>
                          <SelectItem value="phone">Phone</SelectItem>
                          <SelectItem value="video">Video Call</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Input
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Additional notes..."
                        data-testid="notes-input"
                      />
                    </div>
                    <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="submit-appointment-btn">
                      Create Appointment
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {/* Appointments List */}
        {loading ? (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-inter">Loading appointments...</p>
            </CardContent>
          </Card>
        ) : filteredAppointments.length > 0 ? (
          <div className="grid gap-4">
            {filteredAppointments.map((appt, index) => (
              <Card
                key={appt.id}
                className="border-slate-200 card-hover cursor-pointer"
                onClick={() => navigate(`/appointments/${appt.id}`)}
                data-testid={`appointment-card-${index}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Calendar className="h-6 w-6 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-manrope font-semibold text-lg text-slate-900">
                          {appt.client_name}
                        </h3>
                        <p className="font-inter text-sm text-slate-600">{appt.client_phone}</p>
                        <p className="font-inter text-sm text-slate-500 mt-1">
                          {formatDate(appt.appointment_date)} at {formatTime(appt.start_time)} -{' '}
                          {formatTime(appt.end_time)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-manrope font-semibold ${getStatusColor(appt.status)}`}>
                        {appt.status}
                      </span>
                      <span className="px-3 py-1 rounded-full text-xs font-manrope font-semibold bg-slate-100 text-slate-700">
                        {appt.consultation_mode}
                      </span>
                    </div>
                  </div>
                  {appt.notes && (
                    <p className="font-inter text-sm text-slate-600 mt-4 pl-16">{appt.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <Calendar className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h3 className="font-manrope font-semibold text-xl text-slate-900 mb-2">
                No appointments found
              </h3>
              <p className="font-inter text-slate-600 mb-6">Create your first appointment to get started.</p>
              <Button
                onClick={() => setShowNewAppointment(true)}
                className="bg-indigo-600 hover:bg-indigo-700"
                data-testid="create-first-appointment-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Appointment
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Appointments;