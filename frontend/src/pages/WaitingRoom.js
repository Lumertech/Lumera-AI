import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Monitor, Users } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const WaitingRoom = () => {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await axios.get(`${API_URL}/queue/waiting-room/public/${token}`);
        if (alive) { setData(res.data); setError(null); }
      } catch (e) {
        if (alive) setError(e.response?.data?.detail || 'Waiting room not found');
      }
    };
    load();
    const t = setInterval(load, 8_000);
    return () => { alive = false; clearInterval(t); };
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-8">
        <div className="text-center">
          <Monitor className="h-16 w-16 mx-auto text-slate-500 mb-4" />
          <p className="text-2xl">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const now = data.now_serving;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-8 md:p-12" data-testid="waiting-room-page">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div>
            <h1 className="font-manrope font-bold text-3xl md:text-5xl">{data.clinic_name}</h1>
            <p className="text-indigo-200 mt-1 text-lg">{data.doctor_name}{data.profession ? ` · ${data.profession}` : ''}</p>
          </div>
          <div className="text-right">
            <div className="text-indigo-200 text-sm uppercase tracking-wider">Waiting Room</div>
            <div className="font-mono text-2xl">{new Date().toLocaleTimeString()}</div>
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Now serving — dominant */}
          <div className="lg:col-span-2 rounded-3xl p-8 md:p-12 bg-gradient-to-br from-amber-500 to-orange-600 shadow-2xl relative overflow-hidden" data-testid="wr-now-serving">
            <div className="absolute -top-8 -right-8 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
            <p className="uppercase text-amber-100 tracking-widest text-sm md:text-base font-semibold">Now Serving</p>
            {now ? (
              <>
                <div className="mt-4 flex items-baseline gap-4">
                  <span className="text-white/80 text-2xl md:text-4xl font-light">Token</span>
                  <span className="text-white font-manrope font-bold text-7xl md:text-9xl leading-none">
                    {now.token_number}
                  </span>
                </div>
                <p className="mt-4 text-2xl md:text-3xl text-white/95 font-medium">{now.masked_name || 'Patient'}</p>
                <p className="mt-2 text-amber-100 text-sm">Please proceed to the doctor&apos;s room.</p>
              </>
            ) : (
              <div className="mt-6 text-3xl text-white/90">Please wait — next token will be called shortly.</div>
            )}
          </div>

          {/* Stats + Up next */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl p-5 bg-white/5 border border-white/10">
                <div className="text-indigo-200 text-xs uppercase">Waiting</div>
                <div className="text-4xl font-bold">{data.total_waiting}</div>
              </div>
              <div className="rounded-2xl p-5 bg-white/5 border border-white/10">
                <div className="text-indigo-200 text-xs uppercase">Done today</div>
                <div className="text-4xl font-bold">{data.completed_count}</div>
              </div>
            </div>
            <div className="rounded-2xl p-5 bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 text-indigo-200 text-xs uppercase mb-3">
                <Users className="h-4 w-4" /> Up Next
              </div>
              {data.up_next.length === 0 ? (
                <p className="text-slate-400 text-sm">No one else waiting.</p>
              ) : (
                <ul className="space-y-2">
                  {data.up_next.map((r) => (
                    <li key={r.token_number} className="flex items-center justify-between text-lg">
                      <span className="font-mono font-semibold">{r.token_number}</span>
                      <span className="text-slate-300">{r.masked_name || 'Patient'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <footer className="pt-4 text-center text-indigo-300 text-sm">
          Powered by <span className="font-semibold text-white">Lumera</span>
        </footer>
      </div>
    </div>
  );
};

export default WaitingRoom;
