import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pill, Pause, Play, Trash2, Loader2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/errors';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  paused: 'bg-amber-100 text-amber-800 border-amber-300',
  completed: 'bg-slate-100 text-slate-700 border-slate-300',
};

const MedicationRemindersPanel = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/medication-reminders`);
      setItems(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load medication reminders');
    } finally {
      setLoading(false);
    }
  };

  const setStatus = async (id, status) => {
    try {
      await axios.put(`${API_URL}/medication-reminders/${id}`, { status });
      toast.success(status === 'paused' ? 'Reminder paused' : 'Reminder resumed');
      refresh();
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to update'));
    }
  };

  const removeReminder = async (id) => {
    if (!window.confirm('Delete this medication reminder?')) return;
    try {
      await axios.delete(`${API_URL}/medication-reminders/${id}`);
      toast.success('Reminder deleted');
      refresh();
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to delete'));
    }
  };

  // Group by patient
  const grouped = items.reduce((acc, r) => {
    const key = r.client_phone || 'unknown';
    if (!acc[key]) acc[key] = { phone: r.client_phone, name: r.client_name, reminders: [] };
    acc[key].reminders.push(r);
    return acc;
  }, {});

  return (
    <Card className="border-slate-200" data-testid="medication-reminders-panel">
      <CardHeader>
        <CardTitle className="font-manrope flex items-center space-x-2">
          <Pill className="h-5 w-5 text-rose-600" />
          <span>Medication Reminders</span>
          <Badge variant="outline" className="text-[10px]">Auto from prescriptions</Badge>
        </CardTitle>
        <CardDescription className="font-inter">
          When you send a prescription, Lumera auto-schedules per-dose WhatsApp reminders based on each medicine's frequency and duration. Pause or cancel anytime.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-rose-600" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            No medication reminders yet. Reminders are created automatically when you send a prescription.
          </p>
        ) : (
          <div className="space-y-4" data-testid="medication-reminders-list">
            {Object.values(grouped).map((group) => (
              <div key={group.phone} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
                      <Phone className="h-4 w-4 text-indigo-700" />
                    </div>
                    <div>
                      <p className="font-manrope font-semibold text-sm">{group.name || 'Patient'}</p>
                      <p className="text-xs text-slate-500">{group.phone}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{group.reminders.length} reminder{group.reminders.length > 1 ? 's' : ''}</Badge>
                </div>
                <div className="space-y-2">
                  {group.reminders.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200" data-testid={`medication-reminder-${r.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-manrope font-semibold text-sm">{r.medicine_name}</p>
                          <span className="text-xs text-slate-500">{r.dosage}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_COLORS[r.status] || ''}`}>
                            {r.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">
                          Times: {(r.times || []).join(', ')} · Until {r.end_date}
                          {r.last_sent_at && <span className="ml-2 text-emerald-600">· Last sent {new Date(r.last_sent_at).toLocaleString()}</span>}
                        </p>
                        {r.instructions && <p className="text-xs text-slate-500 mt-0.5 italic">{r.instructions}</p>}
                      </div>
                      <div className="flex gap-1 ml-2">
                        {r.status === 'active' && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, 'paused')} data-testid={`pause-${r.id}`}>
                            <Pause className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {r.status === 'paused' && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, 'active')} data-testid={`resume-${r.id}`}>
                            <Play className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => removeReminder(r.id)} data-testid={`delete-${r.id}`}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MedicationRemindersPanel;
