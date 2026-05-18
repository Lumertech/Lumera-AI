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
import { Calendar, User, FileText, Save, CreditCard, FolderOpen, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatTime } from '@/lib/utils';
import RequestPaymentModalV2 from '@/components/RequestPaymentModalV2';
import HealthRecordsTab from '@/components/HealthRecordsTab';
import { useAuth } from '@/contexts/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AppointmentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDoctor = user?.profession === 'doctor';
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
    abha_id: '',
  });
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [consentHistory, setConsentHistory] = useState([]);

  useEffect(() => {
    fetchAppointment();
  }, [id]);

  useEffect(() => {
    if (appointment?.client_phone) {
      fetchConsentHistory();
    }
  }, [appointment?.client_phone]);

  const fetchConsentHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/consent/history/${encodeURIComponent(appointment.client_phone)}`);
      setConsentHistory(response.data.consents || []);
    } catch (error) {
      console.error('Failed to fetch consent history:', error);
    }
  };

  const fetchAppointment = async () => {
    try {
      const response = await axios.get(`${API_URL}/appointments/${id}`);
      setAppointment(response.data);
      
      if (response.data.patient_details) {
        setPatientDetails({
          ...response.data.patient_details,
          abha_id: response.data.patient_details.abha_id || ''
        });
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
      
      // Update local appointment state immediately
      setAppointment(prev => ({
        ...prev,
        client_name: patientDetails.name,
        patient_details: patientDetails
      }));
      
      toast.success('Patient details saved successfully!');
      // Also refresh from server
      await fetchAppointment();
    } catch (error) {
      console.error('Failed to save:', error);
      toast.error('Failed to save patient details');
    }
  };

  const goToPrescription = () => {
    if (isDoctor) {
      navigate(`/appointments/${id}/prescription`);
    } else {
      navigate(`/appointments/${id}/notes`);
    }
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
                  {isDoctor ? 'Write Prescription' : 'Write Consultation Notes'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Patient Details, Request Payment, Health Records, Consent */}
        <Card className="border-slate-200">
          <CardContent className="p-6">
            <Tabs defaultValue="details" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="details" className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span>Patient Details</span>
                </TabsTrigger>
                <TabsTrigger value="payment" className="flex items-center space-x-2">
                  <CreditCard className="h-4 w-4" />
                  <span>Request Payment</span>
                </TabsTrigger>
                <TabsTrigger value="records" className="flex items-center space-x-2">
                  <FolderOpen className="h-4 w-4" />
                  <span>Health Records</span>
                </TabsTrigger>
                <TabsTrigger value="consent" className="flex items-center space-x-2">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Consent</span>
                </TabsTrigger>
              </TabsList>

              {/* Patient Details Tab */}
              <TabsContent value="details" className="space-y-4">
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

            {/* ABDM Compliance - ABHA ID */}
            <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <Label className="font-manrope font-semibold flex items-center">
                <ShieldCheck className="h-4 w-4 mr-2 text-blue-600" />
                ABHA ID (ABDM Compliance)
              </Label>
              <Input
                value={patientDetails.abha_id}
                onChange={(e) =>
                  setPatientDetails({ ...patientDetails, abha_id: e.target.value })
                }
                placeholder="14-digit ABHA ID (Optional)"
                maxLength={17}
                data-testid="abha-id-input"
              />
              <p className="text-xs text-blue-600">
                Ayushman Bharat Health Account ID for national health records integration
              </p>
            </div>

                <Button
                  onClick={savePatientDetails}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  data-testid="save-patient-details-btn"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Patient Details
                </Button>
              </TabsContent>

              {/* Request Payment Tab */}
              <TabsContent value="payment">
                <div className="text-center py-12">
                  <CreditCard className="h-16 w-16 text-indigo-600 mx-auto mb-4" />
                  <h3 className="font-manrope font-semibold text-xl text-slate-900 mb-3">
                    Request Payment
                  </h3>
                  <p className="font-inter text-slate-600 mb-6">
                    Send a payment link to {appointment?.client_name} via WhatsApp
                  </p>
                  <Button
                    onClick={() => setPaymentModalOpen(true)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Generate Payment Link
                  </Button>
                </div>
              </TabsContent>

              {/* Health Records Tab */}
              <TabsContent value="records">
                {appointment && (
                  <HealthRecordsTab clientPhone={appointment.client_phone} />
                )}
              </TabsContent>

              {/* Consent History Tab (ABDM Compliance) */}
              <TabsContent value="consent" className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-manrope font-semibold text-lg">Consent Management</h3>
                    <p className="text-sm text-slate-600">ABDM-compliant consent tracking</p>
                  </div>
                  <Button
                    onClick={async () => {
                      try {
                        await axios.post(`${API_URL}/consent/request`, {
                          client_phone: appointment.client_phone,
                          purpose: "Access health records for treatment",
                          data_types: ["prescriptions", "health_records", "appointments"]
                        });
                        toast.success("Consent request sent via WhatsApp!");
                        fetchConsentHistory();
                      } catch (error) {
                        toast.error("Failed to send consent request");
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Request Consent
                  </Button>
                </div>

                {consentHistory.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-lg">
                    <ShieldCheck className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600">No consent history found</p>
                    <p className="text-sm text-slate-500 mt-2">
                      Request consent from the patient to access their health records
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {consentHistory.map((consent, index) => (
                      <Card key={consent.id || index} className="border-slate-200">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`w-3 h-3 rounded-full ${
                                consent.status === 'approved' ? 'bg-green-500' :
                                consent.status === 'pending' ? 'bg-yellow-500' :
                                consent.status === 'revoked' ? 'bg-red-500' : 'bg-slate-400'
                              }`} />
                              <div>
                                <p className="font-semibold capitalize">{consent.status}</p>
                                <p className="text-sm text-slate-600">{consent.purpose}</p>
                              </div>
                            </div>
                            <div className="text-right text-sm text-slate-500">
                              <p>Requested: {new Date(consent.requested_at).toLocaleDateString()}</p>
                              {consent.approved_at && (
                                <p className="text-green-600">Approved: {new Date(consent.approved_at).toLocaleDateString()}</p>
                              )}
                              {consent.revoked_at && (
                                <p className="text-red-600">Revoked: {new Date(consent.revoked_at).toLocaleDateString()}</p>
                              )}
                            </div>
                          </div>
                          {consent.data_types && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {consent.data_types.map((type, i) => (
                                <span key={i} className="px-2 py-1 bg-slate-100 rounded text-xs capitalize">
                                  {type.replace('_', ' ')}
                                </span>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Payment Request Modal */}
      {appointment && (
        <RequestPaymentModalV2
          open={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          clientPhone={appointment.client_phone}
          clientName={appointment.client_name}
        />
      )}
    </DashboardLayout>
  );
};

export default AppointmentDetails;