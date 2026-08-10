import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, Pill, Receipt, Mic2, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const KIND_META = {
  appointment: { icon: Calendar, color: 'bg-indigo-100 text-indigo-700', label: 'Appointment' },
  prescription: { icon: Pill, color: 'bg-emerald-100 text-emerald-700', label: 'Prescription' },
  invoice: { icon: Receipt, color: 'bg-amber-100 text-amber-700', label: 'Invoice' },
  ambient: { icon: Mic2, color: 'bg-purple-100 text-purple-700', label: 'Ambient AI' },
};

const PatientTimeline = ({ open, onOpenChange, clientName, clientPhone }) => {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !clientPhone) return;
    setLoading(true);
    setError(null);
    axios
      .get(`${API_URL}/safety/timeline/${encodeURIComponent(clientPhone)}`)
      .then((r) => setEvents(r.data.events || []))
      .catch((e) => setError(e.response?.data?.detail || 'Failed to load timeline'))
      .finally(() => setLoading(false));
  }, [open, clientPhone]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="patient-timeline-dialog">
        <DialogHeader>
          <DialogTitle className="font-manrope text-xl">
            Consult History — {clientName}
          </DialogTitle>
          <DialogDescription>
            Chronological view of appointments, prescriptions, invoices, and ambient AI sessions.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-600 text-sm">{error}</div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Clock className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              No history yet for this patient.
            </div>
          ) : (
            <ol className="relative border-l-2 border-slate-200 ml-3 space-y-4" data-testid="timeline-events">
              {events.map((ev, i) => {
                const meta = KIND_META[ev.kind] || KIND_META.appointment;
                const Icon = meta.icon;
                return (
                  <li key={`${ev.kind}-${ev.id || i}`} className="ml-6" data-testid={`timeline-event-${ev.kind}`}>
                    <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full ${meta.color} ring-4 ring-white`}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{meta.label}</Badge>
                        <span className="text-xs text-slate-500">
                          {ev.when ? formatDate(ev.when) : '—'}
                        </span>
                      </div>
                      <p className="font-manrope font-semibold text-slate-900 text-sm">{ev.title}</p>
                      {ev.meta?.medications?.length > 0 && (
                        <p className="text-xs text-slate-600 mt-1">
                          Meds: {ev.meta.medications.filter(Boolean).slice(0, 4).join(', ')}
                          {ev.meta.medications.length > 4 ? ` +${ev.meta.medications.length - 4} more` : ''}
                        </p>
                      )}
                      {ev.meta?.status && (
                        <p className="text-xs text-slate-600 mt-1">
                          Status: <span className="font-semibold">{ev.meta.status}</span>
                          {ev.meta.token ? <> · Token #{ev.meta.token}</> : null}
                        </p>
                      )}
                      {ev.meta?.total !== undefined && (
                        <p className="text-xs text-slate-600 mt-1">Total: ₹{ev.meta.total}</p>
                      )}
                      {ev.meta?.symptoms && (
                        <p className="text-xs text-slate-600 mt-1 italic line-clamp-2">
                          {typeof ev.meta.symptoms === 'string' ? ev.meta.symptoms : JSON.stringify(ev.meta.symptoms)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PatientTimeline;
