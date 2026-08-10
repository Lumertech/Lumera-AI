// Print helper — opens a new window with a clean print-friendly HTML document
// and triggers the browser print dialog. No backend required.
//
// Usage:
//   printDocument({ title: 'Prescription', html: '<h1>...</h1>' })
//
// The renderer must produce semantic HTML; the wrapper injects print-optimised
// CSS (A4 width, hides nav, sane margins, Inter font fallback).

export function printDocument({ title, html, autoPrint = true }) {
  const w = window.open('', '_blank', 'width=900,height=900');
  if (!w) {
    // popup blocked
    alert('Please allow popups for this site to print.');
    return false;
  }
  w.document.open();
  w.document.write(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${(title || 'Document').replace(/</g, '&lt;')}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f7f7f8; }
  body { font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; line-height: 1.45; }
  .page { width: 210mm; min-height: 297mm; margin: 16px auto; padding: 18mm 16mm; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  h1, h2, h3 { font-family: 'Manrope', 'Inter', sans-serif; margin: 0 0 6px; }
  h1 { font-size: 22px; }
  h2 { font-size: 16px; color: #4338ca; letter-spacing: .04em; text-transform: uppercase; margin-top: 18px; }
  h3 { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 600; }
  .muted { color: #64748b; font-size: 12px; }
  .right { text-align: right; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-paid { background: #d1fae5; color: #065f46; }
  .badge-pending { background: #fee2e2; color: #991b1b; }
  .badge-partial { background: #fef3c7; color: #92400e; }
  .row { display: flex; justify-content: space-between; gap: 16px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .tag { background: #f1f5f9; color: #334155; padding: 2px 8px; border-radius: 6px; font-size: 11px; }
  .step { margin-left: 14px; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
  .totals { width: 280px; margin-left: auto; }
  .totals td { padding: 4px 10px; border: 0; font-size: 13px; }
  .totals .lbl { color: #64748b; }
  .totals .grand { font-weight: 700; font-size: 16px; border-top: 1px solid #cbd5e1; padding-top: 8px; }
  @media print {
    body { background: #fff; }
    .page { box-shadow: none; margin: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="page">${html}</div>
<script>
  ${autoPrint ? 'window.onload = () => { setTimeout(() => window.print(), 250); };' : ''}
</script>
</body>
</html>`);
  w.document.close();
  return true;
}

// ---- Document renderers ----

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export function renderPrescriptionHTML({ clinic, doctor, patient, medications = [], instructions = '', date, vitals = null, labTests = [] }) {
  const dateStr = date ? new Date(date).toLocaleDateString() : new Date().toLocaleDateString();
  const clinicBlock = clinic ? `
    <h1>${escape(clinic.name)}</h1>
    ${clinic.address ? `<div class="muted">${escape(clinic.address)}</div>` : ''}
    ${clinic.phone ? `<div class="muted">${escape(clinic.phone)}${clinic.email ? ' · ' + escape(clinic.email) : ''}</div>` : ''}
  ` : `<h1>${escape(doctor?.name || 'Prescription')}</h1>`;

  const medsRows = medications.map((m, i) => {
    const taper = m.is_tapering && (m.taper_schedule || []).length > 0
      ? `<div class="muted step">Tapering: ${m.taper_schedule.map((s, idx) => `Step ${idx + 1}: ${escape(s.dosage)} ${escape(s.frequency)} for ${escape(s.duration)}${s.notes ? ' (' + escape(s.notes) + ')' : ''}`).join(' → ')}</div>`
      : '';
    return `<tr>
      <td>${i + 1}</td>
      <td>
        <strong>${escape(m.medicine_name)}</strong>
        ${m.instructions ? `<div class="muted">${escape(m.instructions)}</div>` : ''}
        ${taper}
      </td>
      <td>${escape(m.dosage)}</td>
      <td>${escape(m.frequency)}</td>
      <td>${escape(m.duration)}</td>
    </tr>`;
  }).join('');

  // Vitals block (only if any value is present)
  const vitalOrder = [
    ['bp', 'BP'], ['pulse', 'Pulse'], ['spo2', 'SpO2'], ['temperature', 'Temp'],
    ['weight', 'Weight'], ['height', 'Height'], ['respiratory_rate', 'RR'],
  ];
  const vitalsPresent = vitals && vitalOrder.some(([k]) => vitals[k]);
  const vitalsBlock = vitalsPresent
    ? `<h2>Vitals</h2>
       <table>
         <thead><tr>${vitalOrder.map(([k, label]) => vitals[k] ? `<th>${escape(label)}</th>` : '').join('')}</tr></thead>
         <tbody><tr>${vitalOrder.map(([k]) => vitals[k] ? `<td>${escape(vitals[k])}</td>` : '').join('')}</tr></tbody>
       </table>`
    : '';

  // Lab / Imaging orders
  const labBlock = (labTests && labTests.length > 0)
    ? `<h2>Lab / Imaging Orders</h2>
       <table>
         <thead><tr><th>#</th><th>Test</th><th>Code</th><th>Sample</th><th>Notes</th></tr></thead>
         <tbody>${labTests.map((t, i) => `<tr>
           <td>${i + 1}</td>
           <td><strong>${escape(t.name || '')}</strong>${t.category ? `<div class="muted">${escape(t.category)}</div>` : ''}</td>
           <td>${escape(t.code || '')}</td>
           <td>${escape(t.sample || '')}</td>
           <td>${escape(t.notes || '')}</td>
         </tr>`).join('')}</tbody>
       </table>`
    : '';

  return `
    <div class="row">
      <div>${clinicBlock}</div>
      <div class="right">
        <h3>Prescription</h3>
        <div class="muted">Date: ${escape(dateStr)}</div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:18px;">
      <div>
        <h2>Patient</h2>
        <div><strong>${escape(patient?.name || '')}</strong></div>
        ${patient?.age || patient?.sex ? `<div class="muted">${escape(patient?.age || '')}${patient?.age && patient?.sex ? ' · ' : ''}${escape(patient?.sex || '')}</div>` : ''}
        ${patient?.phone ? `<div class="muted">${escape(patient.phone)}</div>` : ''}
      </div>
      <div>
        <h2>Doctor</h2>
        <div><strong>Dr. ${escape(doctor?.name || '')}</strong></div>
        ${doctor?.profession ? `<div class="muted">${escape(doctor.profession)}</div>` : ''}
      </div>
    </div>

    ${vitalsBlock}

    <h2>Rx</h2>
    <table>
      <thead><tr><th>#</th><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th></tr></thead>
      <tbody>${medsRows || '<tr><td colspan="5" class="muted">No medications</td></tr>'}</tbody>
    </table>

    ${labBlock}

    ${instructions ? `<h2>General instructions</h2><div>${escape(instructions).replace(/\n/g, '<br/>')}</div>` : ''}

    <div class="footer">
      <div>Generated by Lumera · ${escape(dateStr)}</div>
      <div>Dr. ${escape(doctor?.name || '')}</div>
    </div>
  `;
}

export function renderConsultationNotesHTML({ clinic, practitioner, patient, summary, recommendations, date }) {
  const dateStr = date ? new Date(date).toLocaleDateString() : new Date().toLocaleDateString();
  const clinicBlock = clinic ? `<h1>${escape(clinic.name)}</h1>${clinic.address ? `<div class="muted">${escape(clinic.address)}</div>` : ''}` : `<h1>Consultation Notes</h1>`;
  return `
    <div class="row">
      <div>${clinicBlock}</div>
      <div class="right">
        <h3>Consultation Notes</h3>
        <div class="muted">Date: ${escape(dateStr)}</div>
      </div>
    </div>
    <div class="grid-2" style="margin-top:18px;">
      <div><h2>Client</h2><div><strong>${escape(patient?.name || '')}</strong></div>${patient?.phone ? `<div class="muted">${escape(patient.phone)}</div>` : ''}</div>
      <div><h2>Practitioner</h2><div><strong>${escape(practitioner?.name || '')}</strong></div>${practitioner?.profession ? `<div class="muted">${escape(practitioner.profession)}</div>` : ''}</div>
    </div>
    <h2>Session summary</h2><div>${escape(summary || '').replace(/\n/g, '<br/>')}</div>
    ${recommendations ? `<h2>Recommendations</h2><div>${escape(recommendations).replace(/\n/g, '<br/>')}</div>` : ''}
    <div class="footer"><div>Generated by Lumera</div><div>${escape(practitioner?.name || '')}</div></div>
  `;
}

export function renderInvoiceHTML({ clinic, doctor, patient, invoice }) {
  const dateStr = new Date(invoice?.issue_date || Date.now()).toLocaleDateString();
  const statusClass = invoice?.payment_status === 'paid' ? 'badge-paid'
                    : invoice?.payment_status === 'partial' ? 'badge-partial' : 'badge-pending';
  const rows = (invoice?.items || []).map((it) => `<tr>
      <td>${escape(it.description)}${it.consultation_type ? `<div class="muted">${escape(it.consultation_type)}</div>` : ''}</td>
      <td class="right">${escape(it.qty ?? 1)}</td>
      <td class="right">₹${Number(it.rate || 0).toLocaleString('en-IN')}</td>
      <td class="right">₹${Number((it.qty || 1) * (it.rate || 0)).toLocaleString('en-IN')}</td>
    </tr>`).join('');

  return `
    <div class="row">
      <div>
        ${clinic ? `<h1>${escape(clinic.name)}</h1>
        ${clinic.address ? `<div class="muted">${escape(clinic.address)}</div>` : ''}
        ${clinic.phone ? `<div class="muted">${escape(clinic.phone)}${clinic.email ? ' · ' + escape(clinic.email) : ''}</div>` : ''}` : `<h1>Invoice</h1>`}
      </div>
      <div class="right">
        <h3>Invoice</h3>
        <div class="muted">#${escape(invoice?.invoice_number || '')}</div>
        <div class="muted">Date: ${escape(dateStr)}</div>
        <div style="margin-top:6px;"><span class="badge ${statusClass}">${escape((invoice?.payment_status || 'pending').toUpperCase())}</span></div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:18px;">
      <div>
        <h2>Bill to</h2>
        <div><strong>${escape(patient?.name || invoice?.client_name || '')}</strong></div>
        ${patient?.phone || invoice?.client_phone ? `<div class="muted">${escape(patient?.phone || invoice?.client_phone)}</div>` : ''}
      </div>
      <div>
        <h2>From</h2>
        <div><strong>Dr. ${escape(doctor?.name || '')}</strong></div>
        ${doctor?.profession ? `<div class="muted">${escape(doctor.profession)}</div>` : ''}
      </div>
    </div>

    <h2>Charges</h2>
    <table>
      <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted">No items</td></tr>'}</tbody>
    </table>

    <table class="totals" style="margin-top:14px;">
      <tr><td class="lbl">Subtotal</td><td class="right">₹${Number(invoice?.subtotal || 0).toLocaleString('en-IN')}</td></tr>
      ${invoice?.discount ? `<tr><td class="lbl">Discount</td><td class="right">- ₹${Number(invoice.discount).toLocaleString('en-IN')}</td></tr>` : ''}
      ${invoice?.tax_amount ? `<tr><td class="lbl">GST (${invoice.tax_rate || 0}%)</td><td class="right">₹${Number(invoice.tax_amount).toLocaleString('en-IN')}</td></tr>` : ''}
      <tr><td class="lbl grand">Total</td><td class="right grand">₹${Number(invoice?.total || 0).toLocaleString('en-IN')}</td></tr>
      ${invoice?.amount_paid ? `<tr><td class="lbl">Paid</td><td class="right">₹${Number(invoice.amount_paid).toLocaleString('en-IN')}</td></tr>` : ''}
      ${(invoice?.total - (invoice?.amount_paid || 0)) > 0 ? `<tr><td class="lbl">Balance due</td><td class="right">₹${Number(invoice.total - (invoice.amount_paid || 0)).toLocaleString('en-IN')}</td></tr>` : ''}
    </table>

    ${invoice?.notes ? `<h2>Notes</h2><div>${escape(invoice.notes).replace(/\n/g, '<br/>')}</div>` : ''}

    <div class="footer">
      <div>Thank you for choosing ${escape(clinic?.name || 'us')}. Generated by Lumera.</div>
      <div>For queries: ${escape(clinic?.phone || doctor?.phone_number || '')}</div>
    </div>
  `;
}
