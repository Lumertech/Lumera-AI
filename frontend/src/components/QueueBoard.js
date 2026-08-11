import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, PlayCircle, CheckCircle2, XCircle, LogIn, Copy, Monitor, RefreshCw, CheckCheck, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const STATUS_META = {
  scheduled:       { label: 'Scheduled',     color: 'bg-slate-100 text-slate-700' },
  checked_in:      { label: 'Checked In',    color: 'bg-blue-100 text-blue-800' },
  in_consultation: { label: 'In Consult',    color: 'bg-amber-100 text-amber-800' },
  completed:       { label: 'Completed',     color: 'bg-emerald-100 text-emerald-800' },
  no_show:         { label: 'No-Show',       color: 'bg-red-100 text-red-800' },
  cancelled:       { label: 'Cancelled',     color: 'bg-slate-100 text-slate-500 line-through' },
};

// WhatsApp delivery status tick icon
const WaTick = ({ status }) => {
  if (!status || status === 'none') return null;
  const base = 'h-3.5 w-3.5 flex-shrink-0';
  if (status === 'read')      return <CheckCheck className={`${base} text-blue-500`} title="Read" />;
  if (status === 'delivered') return <CheckCheck className={`${base} text-slate-400`} title="Delivered" />;
  if (status === 'sent')      return <Check      className={`${base} text-slate-400`} title="Sent" />;
  if (status === 'failed')    return <AlertCircle className={`${base} text-red-400`} title="Failed" />;
  return null;
};

const QueueBoard = () => {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [wrToken, setWrToken] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState({}); // phone -> status string

  const load = async () => {
    try {
      const res = await axios.get(`${API_URL}/queue/today`);
      setData(res.data);
      // Fetch delivery status for all patients with phone numbers
      const phones = (res.data?.appointments || [])
        .map((a) => a.client_phone)
        .filter(Boolean)
        .filter((p, i, arr) => arr.indexOf(p) === i); // unique
      if (phones.length > 0) {
        const statuses = await Promise.allSettled(
          phones.map((p) =>
            axios.get(`${API_URL}/meta-whatsapp/delivery-status/${encodeURIComponent(p)}`)
              .then((r) => ({ phone: p, status: r.data.status }))
              .catch(() => ({ phone: p, status: 'none' }))
          )
        );
        const map = {};
        statuses.forEach((r) => {
          if (r.status === 'fulfilled') map[r.value.phone] = r.value.status;
        });
        setDeliveryStatus(map);
      }
    } catch (e) {
      /* silent */
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  const act = async (id, endpoint, body = null) => {
    setBusy(id + endpoint);
    try {
      if (body) {
        await axios.post(`${API_URL}${endpoint}`, body);
      } else {
        await axios.post(`${API_URL}${endpoint}`);
      }
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally { setBusy(null); }
  };

  const getWaitingRoomUrl = async () => {
    try {
      const res = await axios.post(`${API_URL}/queue/waiting-room/token`);
      const url = `${window.location.origin}/waiting-room/${res.data.waiting_room_token}`;
      setWrToken(res.data.waiting_room_token);
      try { await navigator.clipboard.writeText(url); toast.success('Waiting Room link copied'); }
      catch { toast.info(url); }
      return url;
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to get link');
    }
  };

  const openWaitingRoom = async () => {
    let token = wrToken;
    if (!token) {
      try {
        const res = await axios.post(`${API_URL}/queue/waiting-room/token`);
        token = res.data.waiting_room_token;
        setWrToken(token);
      } catch (e) { return toast.error('Failed to open'); }
    }
    window.open(`/waiting-room/${token}`, '_blank', 'noopener');
  };

  if (!data) return null;
  const { counts = {}, now_serving, appointments = [], total = 0 } = data;
  if (total === 0) return null;

  return (
    <Card className="border-slate-200 mb-6" data-testid="queue-board">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center text-lg">
            <Users className="h-5 w-5 mr-2 text-indigo-600" /> Today&apos;s Queue
            <Badge variant="secondary" className="ml-2">{total}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} data-testid="queue-refresh-btn">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={getWaitingRoomUrl} data-testid="queue-copy-wr-link">
              <Copy className="h-4 w-4 mr-1" /> Copy WR link
            </Button>
            <Button size="sm" onClick={openWaitingRoom} className="bg-slate-900 hover:bg-slate-800" data-testid="queue-open-wr">
              <Monitor className="h-4 w-4 mr-1" /> Open Waiting Room
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => (
            <span key={k} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${STATUS_META[k]?.color || 'bg-slate-100'}`}>
              {STATUS_META[k]?.label || k}: <strong className="ml-1">{v}</strong>
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {now_serving && (
          <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between" data-testid="queue-now-serving">
            <div>
              <div className="text-xs text-amber-800 uppercase font-semibold">Now serving</div>
              <div className="text-lg font-bold text-slate-900">
                Token <span className="text-amber-700">{now_serving.token_number}</span> · {now_serving.client_name}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => act(now_serving.id, `/queue/${now_serving.id}/status`, { status: 'completed' })}
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={busy === now_serving.id + `/queue/${now_serving.id}/status`}
              data-testid={`queue-complete-${now_serving.id}`}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Complete
            </Button>
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {appointments.map((a) => {
            const meta = STATUS_META[a.status] || STATUS_META.scheduled;
            const rowBusy = (ep) => busy === a.id + ep;
            return (
              <div key={a.id} className="py-3 flex items-center gap-3" data-testid={`queue-row-${a.id}`}>
                <div className="w-16 shrink-0 font-bold text-slate-900">{a.token_number || a.start_time}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{a.client_name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1 truncate">
                    {a.start_time} · {a.client_phone}
                    {a.client_phone && (
                      <span
                        className="inline-flex items-center gap-0.5 ml-1"
                        title={`WA: ${deliveryStatus[a.client_phone] || 'no message'}`}
                        data-testid={`wa-tick-${a.id}`}
                      >
                        <WaTick status={deliveryStatus[a.client_phone]} />
                      </span>
                    )}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${meta.color}`}>{meta.label}</span>
                <div className="flex items-center gap-1">
                  {a.status === 'scheduled' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => act(a.id, `/queue/${a.id}/check-in`)}
                        disabled={rowBusy(`/queue/${a.id}/check-in`)} data-testid={`queue-checkin-${a.id}`}>
                        <LogIn className="h-4 w-4 mr-1" /> Check in
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => act(a.id, `/queue/${a.id}/status`, { status: 'no_show' })}
                        className="text-slate-500 hover:bg-red-50 hover:text-red-600"
                        data-testid={`queue-noshow-${a.id}`}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {a.status === 'checked_in' && (
                    <Button size="sm" onClick={() => act(a.id, `/queue/${a.id}/status`, { status: 'in_consultation' })}
                      className="bg-amber-500 hover:bg-amber-600" disabled={rowBusy(`/queue/${a.id}/status`)}
                      data-testid={`queue-start-${a.id}`}>
                      <PlayCircle className="h-4 w-4 mr-1" /> Start
                    </Button>
                  )}
                  {a.status === 'in_consultation' && (
                    <Button size="sm" onClick={() => act(a.id, `/queue/${a.id}/status`, { status: 'completed' })}
                      className="bg-emerald-600 hover:bg-emerald-700" disabled={rowBusy(`/queue/${a.id}/status`)}
                      data-testid={`queue-complete-row-${a.id}`}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Complete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default QueueBoard;
