import React, { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Sparkles, MessageSquare } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AmbientHistory = () => {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async (query = '') => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/ambient/sessions?limit=50&q=${encodeURIComponent(query)}`);
      setRows(res.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const onSearch = (e) => { e.preventDefault(); load(q); };

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6" data-testid="ambient-history-page">
        <div>
          <h1 className="font-manrope font-bold text-3xl text-slate-900 flex items-center">
            <Sparkles className="h-6 w-6 mr-2 text-purple-600" /> Ambient AI History
          </h1>
          <p className="text-slate-600 font-inter mt-1">Every ambient consultation you&apos;ve recorded is saved here — searchable by diagnosis, patient or keyword.</p>
        </div>

        <form onSubmit={onSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search: gastritis, Amit, Pan 40…"
            className="pl-9"
            data-testid="ambient-history-search"
          />
        </form>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="py-10 text-center text-slate-500">
              <MessageSquare className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <p>No ambient sessions yet. Open a prescription and turn on Ambient AI Mode to start.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((s) => (
              <Card
                key={s.id}
                className="border-slate-200 cursor-pointer hover:border-purple-300"
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                data-testid={`ambient-session-${s.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {s.extracted?.provisional_diagnosis || 'Consultation'}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {s.extracted?.medications?.length > 0 && (
                        <Badge variant="secondary">{s.extracted.medications.length} med{s.extracted.medications.length > 1 ? 's' : ''}</Badge>
                      )}
                      {s.extracted?.lab_tests?.length > 0 && (
                        <Badge variant="secondary">{s.extracted.lab_tests.length} lab{s.extracted.lab_tests.length > 1 ? 's' : ''}</Badge>
                      )}
                      <span>{new Date(s.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  {s.context && <p className="text-xs text-slate-500 mt-1">{s.context}</p>}
                </CardHeader>
                {expanded === s.id && (
                  <CardContent className="text-sm space-y-3">
                    {s.extracted?.symptoms && (
                      <div><span className="text-xs uppercase tracking-wider text-slate-500">Symptoms</span><p className="mt-1">{s.extracted.symptoms}</p></div>
                    )}
                    {(s.extracted?.medications || []).length > 0 && (
                      <div>
                        <span className="text-xs uppercase tracking-wider text-slate-500">Medications</span>
                        <ul className="mt-1 space-y-1">
                          {s.extracted.medications.map((m, i) => (
                            <li key={i} className="text-sm">• <strong>{m.medicine_name}</strong> — {m.dosage} · {m.frequency} · {m.duration}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(s.extracted?.lab_tests || []).length > 0 && (
                      <div>
                        <span className="text-xs uppercase tracking-wider text-slate-500">Labs</span>
                        <ul className="mt-1 space-y-1">
                          {s.extracted.lab_tests.map((l, i) => (<li key={i} className="text-sm">• {l.name}</li>))}
                        </ul>
                      </div>
                    )}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-slate-500">View raw transcript</summary>
                      <p className="mt-2 p-2 bg-slate-50 rounded whitespace-pre-wrap">{s.transcript}</p>
                    </details>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AmbientHistory;
