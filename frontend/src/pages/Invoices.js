import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Receipt, Plus, Trash2, Printer, Loader2, CheckCircle2, Search, Settings as SettingsIcon, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';
import { printDocument, renderInvoiceHTML } from '@/lib/print';
import CollectPaymentDialog from '@/components/CollectPaymentDialog';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const STATUS_STYLES = {
  pending: 'bg-rose-100 text-rose-800 border-rose-300',
  partial: 'bg-amber-100 text-amber-800 border-amber-300',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const emptyItem = () => ({ description: '', consultation_type: '', qty: 1, rate: 0 });

const Invoices = () => {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [collectFor, setCollectFor] = useState(null);
  const [types, setTypes] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  // Types management
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [newType, setNewType] = useState({ name: '', fee: 0, description: '' });

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const [inv, t, cl] = await Promise.all([
        axios.get(`${API_URL}/invoices`),
        axios.get(`${API_URL}/consultation-types`),
        axios.get(`${API_URL}/clinics`),
      ]);
      setInvoices(inv.data || []);
      setTypes(t.data || []);
      setClinics(cl.data || []);
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to load invoices'));
    } finally {
      setLoading(false);
    }
  };

  const primaryClinic = useMemo(
    () => clinics.find((c) => c.is_primary) || clinics[0] || null,
    [clinics]
  );

  const openCreate = () => {
    setDraft({
      client_name: '',
      client_phone: '',
      clinic_id: primaryClinic?.id || '',
      items: [emptyItem()],
      discount: 0,
      tax_rate: 0,
      notes: '',
      payment_status: 'pending',
      amount_paid: 0,
    });
    setEditorOpen(true);
  };

  const closeEditor = () => { setEditorOpen(false); setDraft(null); };

  const addItem = () => setDraft({ ...draft, items: [...draft.items, emptyItem()] });
  const removeItem = (i) => setDraft({ ...draft, items: draft.items.filter((_, idx) => idx !== i) });
  const updateItem = (i, patch) => {
    const next = [...draft.items];
    next[i] = { ...next[i], ...patch };
    setDraft({ ...draft, items: next });
  };
  const applyType = (i, typeId) => {
    const t = types.find((x) => x.id === typeId);
    if (!t) return;
    updateItem(i, { description: t.name, consultation_type: t.name, rate: t.fee });
  };

  const totals = useMemo(() => {
    if (!draft) return { subtotal: 0, tax_amount: 0, total: 0 };
    const subtotal = draft.items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
    const taxable = Math.max(0, subtotal - (Number(draft.discount) || 0));
    const tax_amount = Math.round(taxable * (Number(draft.tax_rate) || 0)) / 100;
    return { subtotal, tax_amount, total: taxable + tax_amount };
  }, [draft]);

  const saveDraft = async () => {
    if (!draft.client_name.trim()) return toast.error('Patient name required');
    const validItems = draft.items.filter((it) => it.description.trim());
    if (validItems.length === 0) return toast.error('Add at least one line item');
    setSaving(true);
    try {
      await axios.post(`${API_URL}/invoices`, {
        ...draft,
        items: validItems.map((it) => ({ ...it, qty: Number(it.qty) || 1, rate: Number(it.rate) || 0 })),
        discount: Number(draft.discount) || 0,
        tax_rate: Number(draft.tax_rate) || 0,
        amount_paid: Number(draft.amount_paid) || 0,
      });
      toast.success('Invoice created');
      closeEditor();
      refresh();
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to create invoice'));
    } finally {
      setSaving(false);
    }
  };

  const markStatus = async (inv, status) => {
    try {
      const body = { payment_status: status };
      if (status === 'paid') body.amount_paid = inv.total;
      await axios.put(`${API_URL}/invoices/${inv.id}`, body);
      toast.success(`Marked ${status}`);
      refresh();
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to update'));
    }
  };

  const deleteInvoice = async (id) => {
    if (!window.confirm('Delete this invoice?')) return;
    try {
      await axios.delete(`${API_URL}/invoices/${id}`);
      toast.success('Invoice deleted');
      refresh();
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to delete'));
    }
  };

  const printInvoice = (inv) => {
    const clinic = clinics.find((c) => c.id === inv.clinic_id) || primaryClinic;
    const html = renderInvoiceHTML({
      clinic,
      doctor: { name: user?.name, profession: user?.profession, phone_number: user?.phone_number },
      patient: { name: inv.client_name, phone: inv.client_phone },
      invoice: inv,
    });
    printDocument({ title: `${inv.invoice_number} - ${inv.client_name}`, html });
  };

  const addType = async () => {
    if (!newType.name.trim()) return toast.error('Name required');
    try {
      await axios.post(`${API_URL}/consultation-types`, {
        ...newType,
        fee: Number(newType.fee) || 0,
      });
      setNewType({ name: '', fee: 0, description: '' });
      toast.success('Consultation type added');
      refresh();
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to add'));
    }
  };

  const removeType = async (id) => {
    if (!window.confirm('Delete this consultation type?')) return;
    try {
      await axios.delete(`${API_URL}/consultation-types/${id}`);
      toast.success('Deleted');
      refresh();
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to delete'));
    }
  };

  const filtered = useMemo(() => {
    let list = invoices;
    if (filter !== 'all') list = list.filter((i) => i.payment_status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) => (i.client_name || '').toLowerCase().includes(q)
            || (i.invoice_number || '').toLowerCase().includes(q)
            || (i.client_phone || '').includes(q)
      );
    }
    return list;
  }, [invoices, filter, search]);

  const summary = useMemo(() => {
    const tot = invoices.reduce((sum, i) => sum + (i.total || 0), 0);
    const paid = invoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0);
    const due = tot - paid;
    return { tot, paid, due };
  }, [invoices]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="invoices-page">
        {/* Header */}
        <Card className="border-slate-200 bg-gradient-to-br from-indigo-50 to-purple-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-manrope font-bold text-2xl text-slate-900 mb-1 flex items-center gap-2">
                  <Receipt className="h-6 w-6 text-indigo-600" /> Invoices
                </h1>
                <p className="text-sm text-slate-600">Auto-numbered, clinic-branded invoices · print or share.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowTypeManager(!showTypeManager)} data-testid="toggle-type-manager">
                  <SettingsIcon className="h-4 w-4 mr-2" /> Consultation Types
                </Button>
                <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700" data-testid="create-invoice-btn">
                  <Plus className="h-4 w-4 mr-2" /> New Invoice
                </Button>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-xs text-slate-500">Total billed</p>
                <p className="font-manrope font-bold text-lg">₹{summary.tot.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-xs text-slate-500">Collected</p>
                <p className="font-manrope font-bold text-lg text-emerald-700">₹{summary.paid.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-xs text-slate-500">Outstanding</p>
                <p className="font-manrope font-bold text-lg text-rose-700">₹{summary.due.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Consultation types manager */}
        {showTypeManager && (
          <Card data-testid="type-manager">
            <CardHeader>
              <CardTitle className="font-manrope text-base">Reusable Consultation Types</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {types.length === 0 && <p className="text-sm text-slate-500">No types yet. Add common consultation types and fees for quick invoicing.</p>}
              {types.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <p className="font-semibold text-sm">{t.name}</p>
                    {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">₹{Number(t.fee).toLocaleString('en-IN')}</span>
                    <Button size="sm" variant="ghost" onClick={() => removeType(t.id)} data-testid={`del-type-${t.id}`}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-200">
                <Input placeholder="Name (e.g., Follow-up)" value={newType.name} onChange={(e) => setNewType({ ...newType, name: e.target.value })} className="sm:col-span-2" data-testid="new-type-name" />
                <Input type="number" placeholder="Fee" value={newType.fee} onChange={(e) => setNewType({ ...newType, fee: e.target.value })} data-testid="new-type-fee" />
                <Button onClick={addType} className="bg-indigo-600 hover:bg-indigo-700" data-testid="add-type-btn">
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {['all', 'pending', 'partial', 'paid'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'}`}
              data-testid={`filter-${s}`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
          <div className="relative flex-1 max-w-xs ml-auto">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by patient, #, phone" className="pl-8" data-testid="invoice-search" />
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-sm text-slate-500">No invoices match your filters. Click "New Invoice" to create your first one.</CardContent></Card>
        ) : (
          <div className="space-y-2" data-testid="invoices-list">
            {filtered.map((inv) => (
              <Card key={inv.id} className="border-slate-200" data-testid={`invoice-${inv.id}`}>
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 flex-shrink-0">
                      <Receipt className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-manrope font-semibold text-sm flex items-center gap-2 flex-wrap">
                        <span>{inv.invoice_number}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLES[inv.payment_status] || ''}`}>{inv.payment_status}</span>
                      </p>
                      <p className="text-xs text-slate-500 truncate">{inv.client_name} · {inv.client_phone || 'no phone'} · {new Date(inv.issue_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-manrope font-bold text-base">₹{Number(inv.total).toLocaleString('en-IN')}</p>
                    <Button size="sm" variant="outline" onClick={() => printInvoice(inv)} data-testid={`print-${inv.id}`}>
                      <Printer className="h-4 w-4" />
                    </Button>
                    {inv.payment_status !== 'paid' && (
                      <Button size="sm" variant="outline" onClick={() => setCollectFor(inv)} data-testid={`collect-${inv.id}`} className="text-indigo-700 border-indigo-300 hover:bg-indigo-50">
                        <Wallet className="h-4 w-4 mr-1" /> Collect
                      </Button>
                    )}
                    {inv.payment_status !== 'paid' && (
                      <Button size="sm" variant="outline" onClick={() => markStatus(inv, 'paid')} data-testid={`mark-paid-${inv.id}`} className="text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Paid
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => deleteInvoice(inv.id)} data-testid={`delete-${inv.id}`}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Editor (drawer / modal) */}
        {editorOpen && draft && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={closeEditor}>
            <Card className="max-w-3xl w-full my-8" onClick={(e) => e.stopPropagation()} data-testid="invoice-editor">
              <CardHeader>
                <CardTitle className="font-manrope">New Invoice</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Patient name</Label>
                    <Input value={draft.client_name} onChange={(e) => setDraft({ ...draft, client_name: e.target.value })} data-testid="editor-name" />
                  </div>
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input value={draft.client_phone} onChange={(e) => setDraft({ ...draft, client_phone: e.target.value })} data-testid="editor-phone" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Clinic</Label>
                    <select value={draft.clinic_id} onChange={(e) => setDraft({ ...draft, clinic_id: e.target.value })} className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" data-testid="editor-clinic">
                      <option value="">— None —</option>
                      {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_primary ? ' (Primary)' : ''}</option>)}
                    </select>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">Line items</p>
                    <Button size="sm" variant="outline" onClick={addItem} data-testid="add-item-btn"><Plus className="h-4 w-4 mr-1" /> Item</Button>
                  </div>
                  {draft.items.map((it, i) => (
                    <div key={i} className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2" data-testid={`editor-item-${i}`}>
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                        <Input className="sm:col-span-2" placeholder="Description" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} data-testid={`item-desc-${i}`} />
                        {types.length > 0 && (
                          <select value="" onChange={(e) => applyType(i, e.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-2 text-xs" data-testid={`item-type-${i}`}>
                            <option value="">— Apply type —</option>
                            {types.map((t) => <option key={t.id} value={t.id}>{t.name} (₹{t.fee})</option>)}
                          </select>
                        )}
                        <Input type="number" placeholder="Qty" value={it.qty} onChange={(e) => updateItem(i, { qty: e.target.value })} data-testid={`item-qty-${i}`} />
                        <Input type="number" placeholder="Rate" value={it.rate} onChange={(e) => updateItem(i, { rate: e.target.value })} data-testid={`item-rate-${i}`} />
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">Line total: ₹{((Number(it.qty) || 0) * (Number(it.rate) || 0)).toLocaleString('en-IN')}</p>
                        {draft.items.length > 1 && (
                          <Button size="sm" variant="ghost" onClick={() => removeItem(i)} data-testid={`remove-item-${i}`}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-200 pt-3">
                  <div>
                    <Label className="text-xs">Discount (₹)</Label>
                    <Input type="number" value={draft.discount} onChange={(e) => setDraft({ ...draft, discount: e.target.value })} data-testid="editor-discount" />
                  </div>
                  <div>
                    <Label className="text-xs">GST (%)</Label>
                    <Input type="number" value={draft.tax_rate} onChange={(e) => setDraft({ ...draft, tax_rate: e.target.value })} data-testid="editor-tax" />
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <select value={draft.payment_status} onChange={(e) => setDraft({ ...draft, payment_status: e.target.value })} className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" data-testid="editor-status">
                      <option value="pending">Pending</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} data-testid="editor-notes" />
                </div>

                <div className="bg-indigo-50 rounded-lg p-3 text-sm space-y-1 border border-indigo-200">
                  <div className="flex justify-between"><span>Subtotal</span><span>₹{totals.subtotal.toLocaleString('en-IN')}</span></div>
                  {Number(draft.discount) > 0 && <div className="flex justify-between"><span>Discount</span><span>− ₹{Number(draft.discount).toLocaleString('en-IN')}</span></div>}
                  {Number(draft.tax_rate) > 0 && <div className="flex justify-between"><span>GST ({draft.tax_rate}%)</span><span>₹{totals.tax_amount.toLocaleString('en-IN')}</span></div>}
                  <div className="flex justify-between font-bold border-t border-indigo-300 pt-1 mt-1"><span>Total</span><span>₹{totals.total.toLocaleString('en-IN')}</span></div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={closeEditor} data-testid="editor-cancel">Cancel</Button>
                  <Button onClick={saveDraft} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="editor-save">
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />} Create Invoice
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <CollectPaymentDialog
        open={!!collectFor}
        onOpenChange={(open) => !open && setCollectFor(null)}
        invoice={collectFor}
        onPaid={refresh}
      />
    </DashboardLayout>
  );
};

export default Invoices;
