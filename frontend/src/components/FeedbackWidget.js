import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, MessageCircle, TrendingUp, AlertTriangle } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const RatingStars = ({ rating }) => (
  <div className="flex items-center">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        className={`h-3.5 w-3.5 ${n <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`}
      />
    ))}
  </div>
);

const timeAgo = (iso) => {
  if (!iso) return '';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const m = Math.floor(secs / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
};

const FeedbackWidget = () => {
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [s, r] = await Promise.all([
          axios.get(`${API_URL}/feedback/summary`),
          axios.get(`${API_URL}/feedback/recent?limit=8`),
        ]);
        if (!alive) return;
        setSummary(s.data);
        setRecent(r.data || []);
      } catch (e) {
        // silent — widget is optional
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 60_000); // refresh every 60s
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (loading) return null;

  const hasAny = summary && summary.count > 0;

  return (
    <Card className="border-slate-200" data-testid="feedback-widget">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center text-lg">
            <Star className="h-5 w-5 mr-2 text-amber-500" />
            Patient Feedback
          </CardTitle>
          {hasAny && (
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                <span className="font-semibold text-slate-900">{summary.average}</span>
                <span className="text-slate-500">avg</span>
              </div>
              <div className="flex items-center gap-1 text-emerald-600">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="font-medium">{summary.positive_pct}% positive</span>
              </div>
              <span className="text-slate-500">· {summary.count} rating{summary.count !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <p className="text-sm text-slate-500 py-4 text-center" data-testid="feedback-widget-empty">
            No patient ratings yet. Feedback prompts are auto-sent 2 hours after each prescription.
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => {
              const negative = r.rating <= 3;
              return (
                <div
                  key={r.id}
                  className={`flex items-start justify-between gap-3 p-3 rounded-lg ${
                    negative ? 'bg-red-50 border border-red-100' : 'bg-slate-50'
                  }`}
                  data-testid={`feedback-item-${r.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-slate-900 truncate">{r.client_name}</span>
                      {negative && (
                        <Badge variant="destructive" className="text-xs h-5">
                          <AlertTriangle className="h-3 w-3 mr-0.5" /> Needs follow-up
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <RatingStars rating={r.rating} />
                      <span className="text-xs text-slate-500">{timeAgo(r.responded_at)}</span>
                    </div>
                    {r.comment && (
                      <p className="mt-1 text-xs text-slate-700 flex items-start gap-1">
                        <MessageCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-slate-400" />
                        <span className="truncate">{r.comment}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FeedbackWidget;
