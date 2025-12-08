import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Trash2, Sparkles, Send } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const PrescriptionWriter = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [symptoms, setSymptoms] = useState('');
  const [medications, setMedications] = useState([
    {
      medicine_name: '',
      dosage: '',
      frequency: '',
      duration: '',
      instructions: '',
    },
  ]);
  const [generalInstructions, setGeneralInstructions] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]);

  useEffect(() => {
    fetchAppointment();
  }, [id]);

  const fetchAppointment = async () => {
    try {
      const response = await axios.get(`${API_URL}/appointments/${id}`);
      setAppointment(response.data);
      
      if (response.data.notes) {
        setSymptoms(response.data.notes);
      }
    } catch (error) {
      console.error('Failed to fetch appointment:', error);
      toast.error('Failed to load appointment');
    } finally {
      setLoading(false);
    }
  };

  const getAISuggestions = async () => {
    if (!symptoms.trim()) {
      toast.error('Please enter symptoms first');
      return;
    }

    if (!appointment?.patient_details) {
      toast.error('Please add patient details first');
      return;
    }

    setAiLoading(true);
    try {
      const response = await axios.post(`${API_URL}/prescriptions/ai-suggest`, {
        symptoms,
        patient_age: appointment.patient_details.age,
        patient_sex: appointment.patient_details.sex,
      });

      let suggestions = [];
      try {
        suggestions = JSON.parse(response.data.suggestions);
      } catch (parseError) {
        console.error('Failed to parse suggestions:', parseError);
        // If parsing fails, try to extract JSON from text
        const match = response.data.suggestions.match(/\[[\s\S]*\]/);
        if (match) {
          suggestions = JSON.parse(match[0]);
        }
      }
      
      if (suggestions.length > 0) {
        setAiSuggestions(suggestions);
        toast.success(`${suggestions.length} medication suggestions generated!`);
      } else {
        toast.error('No suggestions generated. Try different symptoms.');
      }
    } catch (error) {
      console.error('AI suggestion failed:', error);
      toast.error('Failed to get AI suggestions');
    } finally {
      setAiLoading(false);
    }
  };

  const addMedication = () => {
    setMedications([
      ...medications,
      {
        medicine_name: '',
        dosage: '',
        frequency: '',
        duration: '',
        instructions: '',
      },
    ]);
  };

  const removeMedication = (index) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  const updateMedication = (index, field, value) => {
    const updated = [...medications];
    updated[index][field] = value;
    setMedications(updated);
  };

  const applySuggestion = (suggestion) => {
    const existingNames = medications.map((m) => m.medicine_name.toLowerCase());
    if (!existingNames.includes(suggestion.medicine_name.toLowerCase())) {
      setMedications([...medications, suggestion]);
      toast.success(`Added ${suggestion.medicine_name}`);
    } else {
      toast.info('Medication already added');
    }
  };

  const submitPrescription = async () => {
    const validMeds = medications.filter((m) => m.medicine_name.trim());
    if (validMeds.length === 0) {
      toast.error('Please add at least one medication');
      return;
    }

    if (!generalInstructions.trim()) {
      toast.error('Please add general instructions');
      return;
    }

    setSending(true);
    try {
      await axios.post(`${API_URL}/prescriptions`, {
        appointment_id: id,
        client_name: appointment.client_name,
        medications: validMeds,
        instructions: generalInstructions,
      });

      toast.success('Prescription sent to patient via WhatsApp!');
      setTimeout(() => {
        navigate('/appointments');
      }, 2000);
    } catch (error) {
      console.error('Failed to send prescription:', error);
      toast.error('Failed to send prescription');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="prescription-writer-page">
        <Card className="border-slate-200 bg-gradient-to-br from-purple-50 to-pink-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-manrope font-bold text-2xl text-slate-900 mb-2">
                  Write Prescription
                </h1>
                <p className="font-inter text-slate-600">
                  Patient: {appointment?.client_name} | Age: {appointment?.patient_details?.age} | Sex: {appointment?.patient_details?.sex}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate(`/appointments/${id}`)}
                data-testid="back-to-details-btn"
              >
                Back to Details
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">Symptoms & AI Assistant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Patient Symptoms</Label>
              <Textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="Describe patient symptoms in detail..."
                rows={4}
                data-testid="symptoms-input"
                className="font-inter"
              />
            </div>

            <Button
              onClick={getAISuggestions}
              disabled={aiLoading || !symptoms.trim()}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="ai-suggest-btn"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating AI Suggestions...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Get AI Suggestions
                </>
              )}
            </Button>

            {aiSuggestions.length > 0 && (
              <Alert className="bg-purple-50 border-purple-200">
                <AlertDescription>
                  <p className="font-manrope font-semibold text-purple-900 mb-3">
                    AI Suggested Medications:
                  </p>
                  <div className="space-y-2">
                    {aiSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="flex items-start justify-between p-3 bg-white rounded-lg border border-purple-200"
                      >
                        <div className="flex-1">
                          <p className="font-manrope font-semibold text-slate-900">
                            {suggestion.medicine_name}
                          </p>
                          <p className="text-sm text-slate-600">
                            {suggestion.dosage} | {suggestion.frequency} | {suggestion.duration}
                          </p>
                          {suggestion.instructions && (
                            <p className="text-xs text-slate-500 mt-1">
                              {suggestion.instructions}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => applySuggestion(suggestion)}
                          data-testid={`apply-suggestion-${index}`}
                        >
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-purple-700 mt-3">
                    Note: These are AI-generated suggestions. Please review and modify as needed.
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-manrope">Medications</CardTitle>
              <Button
                onClick={addMedication}
                size="sm"
                variant="outline"
                data-testid="add-medication-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Medication
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {medications.map((med, index) => (
              <Card key={index} className="bg-slate-50 border-slate-200" data-testid={`medication-${index}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-manrope font-semibold text-sm text-slate-700">
                      Medication {index + 1}
                    </span>
                    {medications.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeMedication(index)}
                        data-testid={`remove-medication-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Medicine Name</Label>
                      <Input
                        value={med.medicine_name}
                        onChange={(e) => updateMedication(index, 'medicine_name', e.target.value)}
                        placeholder="e.g., Paracetamol"
                        data-testid={`medicine-name-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Dosage</Label>
                      <Input
                        value={med.dosage}
                        onChange={(e) => updateMedication(index, 'dosage', e.target.value)}
                        placeholder="e.g., 500mg"
                        data-testid={`dosage-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Frequency</Label>
                      <Input
                        value={med.frequency}
                        onChange={(e) => updateMedication(index, 'frequency', e.target.value)}
                        placeholder="e.g., Twice daily"
                        data-testid={`frequency-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Duration</Label>
                      <Input
                        value={med.duration}
                        onChange={(e) => updateMedication(index, 'duration', e.target.value)}
                        placeholder="e.g., 7 days"
                        data-testid={`duration-${index}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Special Instructions</Label>
                    <Input
                      value={med.instructions}
                      onChange={(e) => updateMedication(index, 'instructions', e.target.value)}
                      placeholder="e.g., Take after meals"
                      data-testid={`instructions-${index}`}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">General Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={generalInstructions}
              onChange={(e) => setGeneralInstructions(e.target.value)}
              placeholder="Add general instructions for the patient (diet, precautions, follow-up, etc.)"
              rows={6}
              data-testid="general-instructions-input"
              className="font-inter"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-3">
          <Button
            variant="outline"
            onClick={() => navigate('/appointments')}
            data-testid="cancel-btn"
          >
            Cancel
          </Button>
          <Button
            onClick={submitPrescription}
            disabled={sending}
            className="bg-green-600 hover:bg-green-700"
            data-testid="submit-prescription-btn"
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending via WhatsApp...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Prescription to Patient
              </>
            )}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default PrescriptionWriter;
