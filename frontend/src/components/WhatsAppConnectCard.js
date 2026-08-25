import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, CheckCircle2, AlertTriangle, Loader2, Unlink, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const WhatsAppConnectCard = () => {
  const [platform, setPlatform] = useState({ app_id: '', config_id: '', ready: false });
  const [status, setStatus] = useState({ connected: false, status: 'DISCONNECTED', waba_id: '', phone_number_id: '' });
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const signupDataRef = useRef({ phone_number_id: '', waba_id: '' });
  const sdkLoaded = useRef(false);

  useEffect(() => {
    loadStatus();
    loadPlatformConfig();
  }, []);

  const loadPlatformConfig = async () => {
    try {
      const res = await axios.get(`${API_URL}/whatsapp/platform-config`);
      setPlatform(res.data);
      if (res.data.app_id) initFbSdk(res.data.app_id);
    } catch {}
  };

  const loadStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/whatsapp/status`);
      setStatus(res.data);
    } catch {}
  };

  const initFbSdk = (appId) => {
    if (sdkLoaded.current || !appId) return;
    sdkLoaded.current = true;
    window.fbAsyncInit = function () {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: 'v22.0' });
    };
    if (!document.getElementById('fb-sdk-script')) {
      const s = document.createElement('script');
      s.id = 'fb-sdk-script';
      s.src = 'https://connect.facebook.net/en_US/sdk.js';
      s.async = true;
      document.body.appendChild(s);
    }
    // Listen for embedded signup data from Meta's popup
    window.addEventListener('message', (event) => {
      if (event.origin !== 'https://www.facebook.com') return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          const { phone_number_id, waba_id } = data.data || {};
          if (phone_number_id) signupDataRef.current = { phone_number_id, waba_id };
        }
      } catch {}
    });
  };

  const launchSignup = () => {
    if (!window.FB) {
      toast.error('Facebook SDK not loaded yet. Try again in a moment.');
      return;
    }
    if (!platform.config_id) {
      toast.error('Admin has not set a Facebook Login Config ID. Ask your admin to configure it in Admin → WhatsApp Config.');
      return;
    }
    setConnecting(true);
    window.FB.login(async (response) => {
      try {
        if (!response.authResponse) {
          toast.info('Signup cancelled.');
          return;
        }
        const { code } = response.authResponse;
        const { phone_number_id, waba_id } = signupDataRef.current;
        if (!phone_number_id || !waba_id) {
          toast.error('Could not capture Phone Number ID or WABA ID from Meta. Please try again.');
          return;
        }
        const res = await axios.post(`${API_URL}/whatsapp/embedded-signup`, { code, phone_number_id, waba_id });
        setStatus({ connected: true, status: 'CONNECTED', ...res.data });
        toast.success('WhatsApp Business connected successfully!');
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Connection failed');
      } finally {
        setConnecting(false);
      }
    }, {
      config_id: platform.config_id,
      response_type: 'code',
      override_default_response_type: true,
      extras: { sessionInfoVersion: '3' },
    });
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect WhatsApp? You will need to reconnect to receive messages.')) return;
    setDisconnecting(true);
    try {
      await axios.post(`${API_URL}/whatsapp/disconnect`);
      setStatus({ connected: false, status: 'DISCONNECTED', waba_id: '', phone_number_id: '' });
      toast.success('WhatsApp disconnected.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to disconnect');
    } finally { setDisconnecting(false); }
  };

  return (
    <Card className="border-slate-200" data-testid="whatsapp-connect-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">WhatsApp Business</CardTitle>
              <CardDescription>Connect your WABA to receive and send WhatsApp messages</CardDescription>
            </div>
          </div>
          <Badge
            data-testid="wa-connection-status-badge"
            className={status.connected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}
          >
            {status.connected
              ? <><CheckCircle2 className="h-3 w-3 mr-1 inline" />Connected</>
              : <><AlertTriangle className="h-3 w-3 mr-1 inline" />Disconnected</>}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.connected ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm bg-slate-50 rounded-lg p-3">
              <div>
                <p className="text-slate-500 text-xs mb-0.5">WABA ID</p>
                <p className="font-mono font-medium" data-testid="wa-waba-id">{status.waba_id}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-0.5">Phone Number ID</p>
                <p className="font-mono font-medium" data-testid="wa-phone-id">{status.phone_number_id}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={disconnect}
                disabled={disconnecting}
                className="text-red-600 border-red-200 hover:bg-red-50"
                data-testid="wa-disconnect-btn"
              >
                {disconnecting
                  ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  : <Unlink className="h-4 w-4 mr-1.5" />}
                Disconnect
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={launchSignup}
                disabled={connecting}
                data-testid="wa-reconnect-btn"
              >
                Reconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Connect your WhatsApp Business Account to enable two-way messaging, appointment confirmations,
              payment links, and automated reminders.
            </p>
            {!platform.ready && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                Admin setup required — App ID and Config ID not yet configured. 
                Contact your admin to complete platform setup.
              </div>
            )}
            <Button
              onClick={launchSignup}
              disabled={connecting || !platform.ready}
              className="bg-green-600 hover:bg-green-700"
              data-testid="wa-connect-btn"
            >
              {connecting
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting…</>
                : <><MessageSquare className="h-4 w-4 mr-2" />Connect WhatsApp Business</>}
            </Button>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              A Meta popup will open to authorize access to your WhatsApp Business Account.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WhatsAppConnectCard;
