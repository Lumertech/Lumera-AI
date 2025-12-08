import React, { useState } from 'react';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, CheckCircle2, AlertCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';

const WhatsAppConfig = () => {
  const [webhookUrl] = useState(process.env.REACT_APP_BACKEND_URL + '/api/webhook/whatsapp');

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const steps = [
    {
      title: 'Get Twilio Account',
      description: 'Sign up for a Twilio account at twilio.com and get your Account SID and Auth Token.',
      status: 'pending',
    },
    {
      title: 'WhatsApp Business API',
      description: 'Enable WhatsApp messaging in your Twilio Console and get a WhatsApp-enabled number.',
      status: 'pending',
    },
    {
      title: 'Configure Webhook',
      description: 'Add the webhook URL below to your Twilio WhatsApp settings.',
      status: 'action',
    },
    {
      title: 'Test Integration',
      description: 'Send a test message to your WhatsApp number to verify the integration.',
      status: 'pending',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="whatsapp-config-page">
        <Card className="border-slate-200 bg-gradient-to-br from-green-50 to-teal-50">
          <CardContent className="p-8">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-xl bg-green-500 flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="font-manrope font-bold text-2xl text-slate-900 mb-2">
                  WhatsApp Integration
                </h2>
                <p className="font-inter text-slate-600">
                  Connect WhatsApp to enable automated booking and client communication.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">Setup Instructions</CardTitle>
            <CardDescription className="font-inter">
              Follow these steps to integrate WhatsApp with Lumer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {steps.map((step, index) => (
              <div key={index} className="flex items-start space-x-4" data-testid={`setup-step-${index}`}>
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                    ${step.status === 'completed' ? 'bg-green-100' : ''}
                    ${step.status === 'action' ? 'bg-indigo-100' : ''}
                    ${step.status === 'pending' ? 'bg-slate-100' : ''}
                  `}
                >
                  {step.status === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : step.status === 'action' ? (
                    <AlertCircle className="h-5 w-5 text-indigo-600" />
                  ) : (
                    <span className="font-manrope font-semibold text-sm text-slate-500">{index + 1}</span>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-manrope font-semibold text-slate-900 mb-1">{step.title}</h3>
                  <p className="font-inter text-sm text-slate-600">{step.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">Webhook Configuration</CardTitle>
            <CardDescription className="font-inter">
              Use this URL in your Twilio WhatsApp settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Webhook URL</Label>
              <div className="flex space-x-2">
                <Input value={webhookUrl} readOnly className="font-mono text-sm" data-testid="webhook-url-input" />
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(webhookUrl)}
                  data-testid="copy-webhook-btn"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="font-inter text-sm text-blue-900">
                <strong>Note:</strong> Make sure to configure your Twilio credentials in the Settings page before
                testing the integration.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope">Message Templates</CardTitle>
            <CardDescription className="font-inter">
              Customize automated WhatsApp messages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Welcome Message</Label>
              <Input
                defaultValue="Welcome to Lumer! Reply 'Book' to schedule an appointment."
                className="font-inter"
                data-testid="welcome-message-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Appointment Confirmation</Label>
              <Input
                defaultValue="Your appointment is confirmed for {date} at {time}."
                className="font-inter"
                data-testid="confirmation-message-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Reminder Message</Label>
              <Input
                defaultValue="Reminder: Your appointment is tomorrow at {time}. See you then!"
                className="font-inter"
                data-testid="reminder-message-input"
              />
            </div>
            <Button className="bg-indigo-600 hover:bg-indigo-700" data-testid="save-templates-btn">
              Save Templates
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default WhatsAppConfig;