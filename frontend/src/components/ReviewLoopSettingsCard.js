import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Star, Loader2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const ReviewLoopSettingsCard = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [delay, setDelay] = useState(2);

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/settings/reviews`);
        setUrl(r.data.google_review_url || '');
        setEnabled(r.data.enabled !== false);
        setDelay(r.data.delay_hours ?? 2);
      } catch (e) {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/settings/reviews`, {
        google_review_url: url.trim(),
        enabled,
        delay_hours: Number(delay) || 2,
      });
      toast.success('Review loop saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <Card><CardContent className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-indigo-600" /></CardContent></Card>
  );

  return (
    <Card className="border-slate-200" data-testid="review-loop-card">
      <CardHeader>
        <CardTitle className="font-manrope flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-500" /> Google Review Loop
        </CardTitle>
        <CardDescription className="font-inter">
          Auto-append your Google review link to the post-consultation feedback WhatsApp — great for growing your online reputation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="review-url">Google Business Profile review URL</Label>
          <Input
            id="review-url"
            placeholder="https://g.page/r/CX_your_review_id/review"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            data-testid="review-url-input"
          />
          <p className="text-xs text-slate-500 mt-1">
            Find yours at{' '}
            <a href="https://business.google.com/reviews" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
              business.google.com/reviews
            </a>
            {' '}→ Share your review form.
          </p>
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="review-enabled-switch" />
            <span>Auto-append to feedback WhatsApp</span>
          </label>
          <div className="flex items-center gap-2 text-sm">
            <Label htmlFor="delay-hrs" className="whitespace-nowrap">Delay (hours):</Label>
            <Input
              id="delay-hrs"
              type="number"
              min={0}
              max={168}
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
              className="w-20 h-8"
              data-testid="review-delay-input"
            />
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="review-save-btn">
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : 'Save review loop'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default ReviewLoopSettingsCard;
