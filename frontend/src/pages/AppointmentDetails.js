import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, User, FileText, Save } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatTime } from '@/lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AppointmentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [patientDetails, setPatientDetails] = useState({
    name: '',
    age: '',
    sex: '',
    blood_group: '',
    allergies: '',
    chronic_conditions: '',
    emergency_contact: '',
  });

  useEffect(() => {
    fetchAppointment();
  }, [id]);

  const fetchAppointment = async () => {
    try {
      const response = await axios.get(`${API_URL}/appointments/${id}`);
      setAppointment(response.data);
      
      if (response.data.patient_details) {
        setPatientDetails(response.data.patient_details);
      } else {
        setPatientDetails(prev => ({ ...prev, name: response.data.client_name }));
      }
    } catch (error) {
      console.error('Failed to fetch appointment:', error);
      toast.error('Failed to load appointment details');
    } finally {
      setLoading(false);
    }
  };

  const savePatientDetails = async () => {
    try {
      await axios.put(
        `${API_URL}/appointments/${id}/patient-details`,
        {
          ...patientDetails,
          age: parseInt(patientDetails.age),
        }
      );
      toast.success('Patient details saved successfully!');
      // Refresh appointment data to show updated name
      fetchAppointment();
    } catch (error) {
      console.error('Failed to save:', error);
      toast.error('Failed to save patient details');
    }
  };

  const goToPrescription = () => {
    navigate(`/appointments/${id}/prescription`);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600">Loading appointment...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!appointment) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-slate-600">Appointment not found</p>
          <Button onClick={() => navigate('/appointments')} className="mt-4">
            Back to Appointments
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="appointment-details-page">
        {/* Header */}
        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-manrope font-bold text-2xl text-slate-900 mb-2">
                  {appointment.client_name}
                </h1>
                <p className="font-inter text-slate-600">
                  {formatDate(appointment.appointment_date)} at {formatTime(appointment.start_time)}
                </p>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => navigate('/appointments')}
                  data-testid="back-btn"
                >
                  Back
                </Button>
                <Button
                  onClick={goToPrescription}
                  className="bg-indigo-600 hover:bg-indigo-700"
                  data-testid="write-prescription-btn"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Write Prescription
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Patient Details Form */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Patient Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-manrope font-semibold">Patient Name *</Label>
                <Input
                  value={patientDetails.name}
                  onChange={(e) =>
                    setPatientDetails({ ...patientDetails, name: e.target.value })
                  }
                  required
                  data-testid="patient-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-manrope font-semibold">Age *</Label>
                <Input
                  type="number"
                  value={patientDetails.age}
                  onChange={(e) =>
                    setPatientDetails({ ...patientDetails, age: e.target.value })
                  }
                  required
                  data-testid="patient-age-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-manrope font-semibold">Sex *</Label>
                <Select
                  value={patientDetails.sex}
                  onValueChange={(value) =>
                    setPatientDetails({ ...patientDetails, sex: value })
                  }
                >
                  <SelectTrigger data-testid="patient-sex-select">
                    <SelectValue placeholder="Select sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-manrope font-semibold">Blood Group</Label>
                <Select
                  value={patientDetails.blood_group}
                  onValueChange={(value) =>
                    setPatientDetails({ ...patientDetails, blood_group: value })
                  }
                >
                  <SelectTrigger data-testid="blood-group-select">
                    <SelectValue placeholder="Select blood group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A+">A+</SelectItem>
                    <SelectItem value="A-">A-</SelectItem>
                    <SelectItem value="B+">B+</SelectItem>
                    <SelectItem value="B-">B-</SelectItem>
                    <SelectItem value="O+">O+</SelectItem>
                    <SelectItem value="O-">O-</SelectItem>
                    <SelectItem value="AB+">AB+</SelectItem>
                    <SelectItem value="AB-">AB-</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Known Allergies</Label>
              <Input
                value={patientDetails.allergies}
                onChange={(e) =>
                  setPatientDetails({ ...patientDetails, allergies: e.target.value })
                }
                placeholder="e.g., Penicillin, Peanuts"
                data-testid="allergies-input"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Chronic Conditions</Label>
              <Input
                value={patientDetails.chronic_conditions}
                onChange={(e) =>
                  setPatientDetails({ ...patientDetails, chronic_conditions: e.target.value })
                }
                placeholder="e.g., Diabetes, Hypertension"
                data-testid="chronic-conditions-input"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Emergency Contact</Label>
              <Input
                type="tel"
                value={patientDetails.emergency_contact}
                onChange={(e) =>
                  setPatientDetails({ ...patientDetails, emergency_contact: e.target.value })
                }
                placeholder="+91XXXXXXXXXX"
                data-testid="emergency-contact-input"
              />
            </div>

            <Button
              onClick={savePatientDetails}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              data-testid="save-patient-details-btn"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Patient Details
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AppointmentDetails;