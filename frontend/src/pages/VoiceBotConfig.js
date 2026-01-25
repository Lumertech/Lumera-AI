import React, { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Phone, Mic, Settings, Globe, Shield, Volume2, PlayCircle, History } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const VoiceBotConfig = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    enabled: false,
    virtual_number: '',
    default_language: 'hi-IN',
    voice_gender: 'female',
    greeting_message: '',
    exotel_configured: false,
    azure_configured: false,
    supported_languages: []
  });
  
  const [exotelConfig, setExotelConfig] = useState({
    exotel_sid: '',
    exotel_api_key: '',
    exotel_api_token: '',
    virtual_numbers: []
  });
  
  const [sessions, setSessions] = useState([]);
  const [testText, setTestText] = useState('');
  const [testAudio, setTestAudio] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchSessions();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await axios.get(`${API_URL}/voice/config`);
      setConfig(response.data);
    } catch (error) {
      console.error('Failed to fetch voice config:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await axios.get(`${API_URL}/voice/sessions?limit=10`);
      setSessions(response.data.sessions || []);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/voice/config`, {
        enabled: config.enabled,
        virtual_number: config.virtual_number,
        default_language: config.default_language,
        voice_gender: config.voice_gender,
        greeting_message: config.greeting_message
      });
      toast.success('Voice bot configuration saved');
    } catch (error) {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const saveExotelConfig = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/voice/exotel-config`, exotelConfig);
      toast.success('Exotel configuration saved');
      fetchConfig();
    } catch (error) {
      toast.error('Failed to save Exotel configuration');
    } finally {
      setSaving(false);
    }
  };

  const testTTS = async () => {
    if (!testText.trim()) {
      toast.error('Please enter text to test');
      return;
    }
    
    setTesting(true);
    try {
      const formData = new FormData();
      formData.append('text', testText);
      formData.append('language', config.default_language);
      formData.append('voice_gender', config.voice_gender);
      
      const response = await axios.post(`${API_URL}/voice/test-tts`, formData);
      
      if (response.data.audio) {
        // Convert base64 to audio
        const audioData = atob(response.data.audio);
        const bytes = new Uint8Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          bytes[i] = audioData.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        setTestAudio(url);
        
        // Auto-play
        const audio = new Audio(url);
        audio.play();
        
        toast.success('TTS test successful!');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'TTS test failed. Check Azure configuration.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-manrope font-bold text-3xl text-slate-900 mb-2">Voice Bot</h1>
            <p className="text-slate-600 font-inter">
              Configure AI-powered voice calls for appointment booking
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              config.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
            }`}>
              {config.enabled ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <Tabs defaultValue="settings" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="settings" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </TabsTrigger>
            <TabsTrigger value="exotel" className="flex items-center space-x-2">
              <Phone className="h-4 w-4" />
              <span>Exotel</span>
            </TabsTrigger>
            <TabsTrigger value="test" className="flex items-center space-x-2">
              <Mic className="h-4 w-4" />
              <span>Test TTS</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center space-x-2">
              <History className="h-4 w-4" />
              <span>Call History</span>
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="settings">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="h-5 w-5 mr-2 text-indigo-600" />
                  Voice Bot Settings
                </CardTitle>
                <CardDescription>
                  Configure your AI voice assistant for phone calls
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Enable Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <Label className="font-semibold">Enable Voice Bot</Label>
                    <p className="text-sm text-slate-600">
                      Allow patients to book appointments via phone calls
                    </p>
                  </div>
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
                  />
                </div>

                {/* Virtual Number */}
                <div className="space-y-2">
                  <Label className="font-semibold">Virtual Phone Number</Label>
                  <Input
                    value={config.virtual_number}
                    onChange={(e) => setConfig({ ...config, virtual_number: e.target.value })}
                    placeholder="+91XXXXXXXXXX"
                  />
                  <p className="text-sm text-slate-500">
                    Your Exotel virtual number for incoming calls
                  </p>
                </div>

                {/* Language Selection */}
                <div className="space-y-2">
                  <Label className="font-semibold">Default Language</Label>
                  <Select
                    value={config.default_language}
                    onValueChange={(value) => setConfig({ ...config, default_language: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {config.supported_languages?.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Voice Gender */}
                <div className="space-y-2">
                  <Label className="font-semibold">Voice Type</Label>
                  <Select
                    value={config.voice_gender}
                    onValueChange={(value) => setConfig({ ...config, voice_gender: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female Voice</SelectItem>
                      <SelectItem value="male">Male Voice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Custom Greeting */}
                <div className="space-y-2">
                  <Label className="font-semibold">Custom Greeting (Optional)</Label>
                  <Textarea
                    value={config.greeting_message}
                    onChange={(e) => setConfig({ ...config, greeting_message: e.target.value })}
                    placeholder="Leave empty for default greeting in selected language"
                    rows={3}
                  />
                </div>

                {/* Status Indicators */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${config.azure_configured ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm">Azure Speech: {config.azure_configured ? 'Configured' : 'Not Configured'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${config.exotel_configured ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm">Exotel: {config.exotel_configured ? 'Configured' : 'Not Configured'}</span>
                  </div>
                </div>

                <Button onClick={saveConfig} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700">
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Exotel Configuration */}
          <TabsContent value="exotel">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Phone className="h-5 w-5 mr-2 text-green-600" />
                  Exotel Configuration
                </CardTitle>
                <CardDescription>
                  Connect your Exotel account for virtual phone numbers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">Setup Instructions</h4>
                  <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Create an account at <a href="https://exotel.com" target="_blank" rel="noopener noreferrer" className="underline">exotel.com</a></li>
                    <li>Get your SID, API Key and Token from the dashboard</li>
                    <li>Purchase a virtual number for incoming calls</li>
                    <li>Configure the webhook URL in Exotel dashboard</li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">Exotel SID</Label>
                  <Input
                    value={exotelConfig.exotel_sid}
                    onChange={(e) => setExotelConfig({ ...exotelConfig, exotel_sid: e.target.value })}
                    placeholder="Your Exotel Account SID"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">API Key</Label>
                  <Input
                    type="password"
                    value={exotelConfig.exotel_api_key}
                    onChange={(e) => setExotelConfig({ ...exotelConfig, exotel_api_key: e.target.value })}
                    placeholder="Your Exotel API Key"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">API Token</Label>
                  <Input
                    type="password"
                    value={exotelConfig.exotel_api_token}
                    onChange={(e) => setExotelConfig({ ...exotelConfig, exotel_api_token: e.target.value })}
                    placeholder="Your Exotel API Token"
                  />
                </div>

                <div className="p-4 bg-slate-50 rounded-lg">
                  <Label className="font-semibold mb-2 block">Webhook URL</Label>
                  <code className="text-sm bg-white p-2 rounded border block break-all">
                    {process.env.REACT_APP_BACKEND_URL}/api/voice/webhook/exotel/incoming
                  </code>
                  <p className="text-xs text-slate-500 mt-2">
                    Configure this URL in your Exotel Flow/Applet settings
                  </p>
                </div>

                <Button onClick={saveExotelConfig} disabled={saving} className="w-full bg-green-600 hover:bg-green-700">
                  {saving ? 'Saving...' : 'Save Exotel Configuration'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Test TTS */}
          <TabsContent value="test">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Volume2 className="h-5 w-5 mr-2 text-purple-600" />
                  Test Text-to-Speech
                </CardTitle>
                <CardDescription>
                  Test how your voice bot will sound in different languages
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!config.azure_configured && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-yellow-800 text-sm">
                      ⚠️ Azure Speech is not configured. Add your Azure Speech key in the environment variables to enable TTS testing.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="font-semibold">Text to Speak</Label>
                  <Textarea
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    placeholder="Enter text to convert to speech..."
                    rows={4}
                  />
                  <p className="text-sm text-slate-500">
                    Enter text in {config.supported_languages?.find(l => l.code === config.default_language)?.name || 'your selected language'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-semibold">Language</Label>
                    <Select
                      value={config.default_language}
                      onValueChange={(value) => setConfig({ ...config, default_language: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {config.supported_languages?.map((lang) => (
                          <SelectItem key={lang.code} value={lang.code}>
                            {lang.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold">Voice</Label>
                    <Select
                      value={config.voice_gender}
                      onValueChange={(value) => setConfig({ ...config, voice_gender: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button 
                  onClick={testTTS} 
                  disabled={testing || !config.azure_configured}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  <PlayCircle className="h-4 w-4 mr-2" />
                  {testing ? 'Converting...' : 'Test Speech'}
                </Button>

                {testAudio && (
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <Label className="font-semibold mb-2 block">Generated Audio</Label>
                    <audio controls src={testAudio} className="w-full" />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Call History */}
          <TabsContent value="history">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <History className="h-5 w-5 mr-2 text-orange-600" />
                  Recent Voice Calls
                </CardTitle>
                <CardDescription>
                  View history of voice bot interactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sessions.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-lg">
                    <Phone className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600">No voice calls yet</p>
                    <p className="text-sm text-slate-500 mt-2">
                      Configure your voice bot to start receiving calls
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessions.map((session) => (
                      <div key={session.call_sid} className="p-4 border border-slate-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{session.phone}</p>
                            <p className="text-sm text-slate-600">
                              {new Date(session.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              session.status === 'completed' ? 'bg-green-100 text-green-700' :
                              session.status === 'ended' ? 'bg-slate-100 text-slate-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {session.status || 'Unknown'}
                            </span>
                            {session.duration && (
                              <p className="text-sm text-slate-500 mt-1">{session.duration}s</p>
                            )}
                          </div>
                        </div>
                        {session.transcript && session.transcript.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <p className="text-sm text-slate-500 mb-2">Transcript:</p>
                            {session.transcript.slice(0, 4).map((item, idx) => (
                              <p key={idx} className={`text-sm ${
                                item.role === 'user' ? 'text-blue-700' : 'text-green-700'
                              }`}>
                                <span className="font-medium">{item.role === 'user' ? 'Caller' : 'Bot'}:</span> {item.content}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default VoiceBotConfig;
