import React, { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Link2, Copy, Check, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/errors';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const IssuePortalLinkCard = ({ clientPhone, clientName }) => {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [ttl, setTtl] = useState(30);

  const fullUrl = link ? `${window.location.origin}${link.path}` : '';

  const issue = async () => {
    if (!clientPhone) return toast.error('No patient phone on file');
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/patient-portal/issue-link`, {
        client_phone: clientPhone,
        client_name: clientName,
        ttl_days: ttl,
      });
      setLink(res.data);
      toast.success('Portal link issued');
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to issue link'));
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <Card className="border-slate-200" data-testid="issue-portal-link-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-manrope font-semibold text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Patient Portal Link
            </p>
            <p className="text-xs text-slate-500">Give your patient secure, read-only access to their records.</p>
          </div>
          <Badge variant="outline" className="text-[10px]">No login required</Badge>
        </div>
        {!link ? (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-slate-500">Valid for (days)</label>
              <Input type="number" min={1} max={180} value={ttl} onChange={(e) => setTtl(Number(e.target.value) || 30)} data-testid="ttl-input" />
            </div>
            <Button onClick={issue} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700" data-testid="issue-link-btn">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />} Generate link
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input readOnly value={fullUrl} className="font-mono text-xs" data-testid="generated-link" />
              <Button size="icon" variant="outline" onClick={copyLink} data-testid="copy-link-btn">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-500">Expires {new Date(link.expires_at).toLocaleString()}. Share this link via WhatsApp, email, or SMS.</p>
            <Button size="sm" variant="ghost" onClick={() => setLink(null)} data-testid="issue-new-btn">Issue another</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default IssuePortalLinkCard;
