import React, { useState } from 'react';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bell, Clock, MessageSquare, Pill } from 'lucide-react';
import { toast } from 'sonner';
import MedicationRemindersPanel from '@/components/MedicationRemindersPanel';

const Reminders = () => {
  const [reminderSettings, setReminderSettings] = useState({
    appointment_reminder_enabled: true,
    hours_before_appointment: 24,
    followup_reminder_enabled: true,
    days_after_appointment: 7,
    feedback_reminder_enabled: true,
    days_for_feedback: 1,
  });

  const handleSave = () => {
    toast.success('Reminder settings saved successfully!');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="reminders-page">
        <Card className="border-slate-200 bg-gradient-to-br from-orange-50 to-red-50">
          <CardContent className="p-8">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-xl bg-orange-500 flex items-center justify-center">
                <Bell className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="font-manrope font-bold text-2xl text-slate-900 mb-2">
                  Automated Reminders
                </h2>
                <p className="font-inter text-slate-600">
                  Configure automatic WhatsApp reminders for appointments and follow-ups
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appointment Reminders */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Appointment Reminders</span>
            </CardTitle>
            <CardDescription className="font-inter">
              Send automatic reminders before appointments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-manrope font-semibold">Enable Appointment Reminders</Label>
                <p className="font-inter text-sm text-slate-600">
                  Send WhatsApp reminders to patients before their appointment
                </p>
              </div>
              <Switch
                checked={reminderSettings.appointment_reminder_enabled}
                onCheckedChange={(checked) =>
                  setReminderSettings({ ...reminderSettings, appointment_reminder_enabled: checked })
                }
                data-testid="appointment-reminder-toggle"
              />
            </div>

            {reminderSettings.appointment_reminder_enabled && (
              <div className="space-y-2">
                <Label className="font-manrope font-semibold">Send Reminder (hours before)</Label>
                <Input
                  type="number"
                  value={reminderSettings.hours_before_appointment}
                  onChange={(e) =>
                    setReminderSettings({
                      ...reminderSettings,
                      hours_before_appointment: parseInt(e.target.value),
                    })
                  }
                  min="1"
                  max="168"
                  data-testid="hours-before-input"
                />
                <p className="text-xs text-slate-500">
                  Default: 24 hours (send reminder 1 day before appointment)
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Follow-up Reminders */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope flex items-center space-x-2">
              <MessageSquare className="h-5 w-5" />
              <span>Follow-up Reminders</span>
            </CardTitle>
            <CardDescription className="font-inter">
              Remind patients to schedule follow-up appointments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-manrope font-semibold">Enable Follow-up Reminders</Label>
                <p className="font-inter text-sm text-slate-600">
                  Send reminders for scheduling next appointment
                </p>
              </div>
              <Switch
                checked={reminderSettings.followup_reminder_enabled}
                onCheckedChange={(checked) =>
                  setReminderSettings({ ...reminderSettings, followup_reminder_enabled: checked })
                }
                data-testid="followup-reminder-toggle"
              />
            </div>

            {reminderSettings.followup_reminder_enabled && (
              <div className="space-y-2">
                <Label className="font-manrope font-semibold">Send After (days)</Label>
                <Input
                  type="number"
                  value={reminderSettings.days_after_appointment}
                  onChange={(e) =>
                    setReminderSettings({
                      ...reminderSettings,
                      days_after_appointment: parseInt(e.target.value),
                    })
                  }
                  min="1"
                  max="30"
                  data-testid="days-after-input"
                />
                <p className="text-xs text-slate-500">
                  Default: 7 days after the last appointment
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Feedback Reminders */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              <span>Feedback Collection</span>
            </CardTitle>
            <CardDescription className="font-inter">
              Request feedback from patients after consultation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-manrope font-semibold">Enable Feedback Requests</Label>
                <p className="font-inter text-sm text-slate-600">
                  Ask patients to rate their experience
                </p>
              </div>
              <Switch
                checked={reminderSettings.feedback_reminder_enabled}
                onCheckedChange={(checked) =>
                  setReminderSettings({ ...reminderSettings, feedback_reminder_enabled: checked })
                }
                data-testid="feedback-reminder-toggle"
              />
            </div>

            {reminderSettings.feedback_reminder_enabled && (
              <div className="space-y-2">
                <Label className="font-manrope font-semibold">Send After (days)</Label>
                <Input
                  type="number"
                  value={reminderSettings.days_for_feedback}
                  onChange={(e) =>
                    setReminderSettings({
                      ...reminderSettings,
                      days_for_feedback: parseInt(e.target.value),
                    })
                  }
                  min="0"
                  max="7"
                  data-testid="feedback-days-input"
                />
                <p className="text-xs text-slate-500">
                  Default: 1 day after appointment completion
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            className="bg-indigo-600 hover:bg-indigo-700"
            data-testid="save-reminders-btn"
          >
            Save Reminder Settings
          </Button>
        </div>

        {/* Medication Reminders (auto-scheduled from prescriptions) */}
        <MedicationRemindersPanel />
      </div>
    </DashboardLayout>
  );
};

export default Reminders;
