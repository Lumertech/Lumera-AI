import React, { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const SealOfPrivacy = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 hover:border-emerald-400 transition-colors"
        data-testid="seal-of-privacy-badge"
      >
        <ShieldCheck className="h-4 w-4 text-emerald-700" />
        <span className="text-xs font-medium text-emerald-800">Lumera Seal of Privacy</span>
        <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">ABDM · HIPAA-ready</Badge>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <Card className="max-w-lg w-full" onClick={(e) => e.stopPropagation()} data-testid="seal-of-privacy-dialog">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <ShieldCheck className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-manrope font-bold text-lg text-slate-900">Seal of Privacy</h3>
                    <p className="text-xs text-slate-500">Your patient data is protected end-to-end</p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" data-testid="seal-close">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <ul className="space-y-3 text-sm">
                <li className="flex gap-2"><span className="text-emerald-600">✓</span> <span><strong>Consent-based sharing</strong> — every health record release is logged and reversible by the patient via WhatsApp.</span></li>
                <li className="flex gap-2"><span className="text-emerald-600">✓</span> <span><strong>ABDM compliant</strong> — ABHA linking, consent flows, audit trail.</span></li>
                <li className="flex gap-2"><span className="text-emerald-600">✓</span> <span><strong>Encrypted at rest</strong> — health records and PII encrypted before storage.</span></li>
                <li className="flex gap-2"><span className="text-emerald-600">✓</span> <span><strong>Role-based access</strong> — receptionists never see prescriptions or private notes.</span></li>
                <li className="flex gap-2"><span className="text-emerald-600">✓</span> <span><strong>Private doctor notes</strong> — visible only to the prescribing doctor, never sent to the patient.</span></li>
                <li className="flex gap-2"><span className="text-emerald-600">✓</span> <span><strong>HIPAA-ready architecture</strong> — audit logging, request tracing, rate limiting, brute-force lockout.</span></li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};

export default SealOfPrivacy;
