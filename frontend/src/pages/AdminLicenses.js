import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/Layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { KeyRound, Search, Loader2, Calendar as CalIcon, IndianRupee, Users, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { extractApiError } from '@/lib/errors';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const STATUS_STYLES = {
  trial: 'bg-sky-100 text-sky-800 border-sky-300',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  suspended: 'bg-amber-100 text-amber-800 border-amber-300',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-300',
  expired: 'bg-rose-100 text-rose-800 border-rose-300',
};

const AdminLicenses = () => {
  const [licenses, setLicenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [nearExpiryOnly, setNearExpiryOnly] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([
        axios.get(`${API_URL}/admin/licenses`),
        axios.get(`${API_URL}/admin/licenses/summary`),
      ]);
      setLicenses(l.data || []);
      setSummary(s.data);
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to load licenses'));
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let list = licenses;
    if (filter !== 'all') list = list.filter((r) => r.status === filter);
    if (nearExpiryOnly) list = list.filter((r) => r.days_remaining !== null && r.days_remaining <= 14);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.phone_number || '').includes(q)
      );
    }
    return list;
  }, [licenses, filter, search, nearExpiryOnly]);

  const openEdit = (row) => {
    setEditRow(row);
    setEditForm({
      status: row.status || 'trial',
      plan_type: row.plan_type || 'trial',
      monthly_price: row.monthly_price ?? '',
      extend_days: 0,
      set_end_date: '',
      notes: row.notes || '',
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      const body = {};
      if (editForm.status) body.status = editForm.status;
      if (editForm.plan_type) body.plan_type = editForm.plan_type;
      if (editForm.monthly_price !== '' && editForm.monthly_price !== null) body.monthly_price = Number(editForm.monthly_price);
      if (editForm.notes !== undefined) body.notes = editForm.notes;
      if (editForm.set_end_date) body.set_end_date = new Date(editForm.set_end_date).toISOString();
      else if (Number(editForm.extend_days) !== 0) body.extend_days = Number(editForm.extend_days);
      await axios.put(`${API_URL}/admin/licenses/${editRow.user_id}`, body);
      toast.success('License updated');
      setEditOpen(false);
      refresh();
    } catch (err) {
      toast.error(extractApiError(err, 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="admin-licenses-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-manrope font-bold text-3xl text-slate-900 flex items-center gap-2">
              <KeyRound className="h-7 w-7 text-purple-600" /> License Management
            </h1>
            <p className="text-sm text-slate-500 mt-1">Manage monthly subscriptions, trials, expiries and pricing per user.</p>
          </div>
          <Button variant="outline" onClick={refresh}>Refresh</Button>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="license-summary">
            <Card><CardContent className="p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1"><Users className="h-3 w-3" /> Total users</p>
              <p className="font-manrope font-bold text-2xl">{summary.total_users}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-slate-500">Active</p>
              <p className="font-manrope font-bold text-2xl text-emerald-700">{summary.counts.active}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-slate-500">Trial</p>
              <p className="font-manrope font-bold text-2xl text-sky-700">{summary.counts.trial}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-slate-500 flex items-center gap-1"><IndianRupee className="h-3 w-3" /> Monthly recurring</p>
              <p className="font-manrope font-bold text-2xl text-indigo-700">₹{Number(summary.mrr || 0).toLocaleString('en-IN')}</p>
            </CardContent></Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {['all', 'trial', 'active', 'suspended', 'expired', 'cancelled'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'}`}
              data-testid={`license-filter-${s}`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
          <label className="flex items-center gap-2 text-xs text-slate-700 ml-2">
            <input type="checkbox" checked={nearExpiryOnly} onChange={(e) => setNearExpiryOnly(e.target.checked)} data-testid="near-expiry-toggle" />
            <AlertTriangle className="h-3 w-3 text-amber-500" /> Near expiry (≤14 days)
          </label>
          <div className="relative flex-1 max-w-xs ml-auto">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / email / phone" className="pl-8" data-testid="license-search" />
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardHeader><CardTitle className="font-manrope text-base">{filtered.length} license{filtered.length !== 1 ? 's' : ''}</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-purple-600" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">No licenses match.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="licenses-table">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                      <th className="py-2 px-3">User</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Plan</th>
                      <th className="py-2 px-3">Price</th>
                      <th className="py-2 px-3">Expiry</th>
                      <th className="py-2 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.user_id} className="border-b border-slate-100" data-testid={`license-row-${row.user_id}`}>
                        <td className="py-3 px-3">
                          <p className="font-medium text-slate-900">{row.name || '—'}</p>
                          <p className="text-xs text-slate-500">{row.email}</p>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLES[row.status] || ''}`}>{row.status}</span>
                        </td>
                        <td className="py-3 px-3 capitalize text-slate-700">{row.plan_type}</td>
                        <td className="py-3 px-3">{row.monthly_price ? `₹${Number(row.monthly_price).toLocaleString('en-IN')}` : '—'}</td>
                        <td className="py-3 px-3">
                          {row.end_date ? (
                            <div>
                              <p className="text-xs text-slate-700">{new Date(row.end_date).toLocaleDateString()}</p>
                              <p className={`text-[10px] ${row.days_remaining < 0 ? 'text-rose-700' : row.days_remaining <= 14 ? 'text-amber-700' : 'text-slate-500'}`}>
                                {row.days_remaining === null ? '' : row.days_remaining < 0 ? `${Math.abs(row.days_remaining)}d overdue` : `${row.days_remaining}d left`}
                              </p>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => openEdit(row)} data-testid={`edit-license-${row.user_id}`}>Manage</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg" data-testid="edit-license-dialog">
          <DialogHeader>
            <DialogTitle className="font-manrope">Manage license — {editRow?.name || editRow?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Status</Label>
                <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" data-testid="edit-status">
                  {['trial', 'active', 'suspended', 'cancelled', 'expired'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Plan</Label>
                <select value={editForm.plan_type} onChange={(e) => setEditForm({ ...editForm, plan_type: e.target.value })} className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" data-testid="edit-plan">
                  {['trial', 'monthly', 'annual', 'free', 'custom'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Monthly price (₹)</Label>
                <Input type="number" value={editForm.monthly_price} onChange={(e) => setEditForm({ ...editForm, monthly_price: e.target.value })} data-testid="edit-price" />
              </div>
              <div>
                <Label className="text-xs">Extend by (days)</Label>
                <Input type="number" value={editForm.extend_days} onChange={(e) => setEditForm({ ...editForm, extend_days: e.target.value })} placeholder="+30 or -7" data-testid="edit-extend" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs flex items-center gap-1"><CalIcon className="h-3 w-3" /> Or set exact end date</Label>
                <Input type="date" value={editForm.set_end_date} onChange={(e) => setEditForm({ ...editForm, set_end_date: e.target.value })} data-testid="edit-enddate" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Admin notes</Label>
              <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} data-testid="edit-notes" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={saving} className="bg-purple-600 hover:bg-purple-700" data-testid="save-license-btn">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminLicenses;
