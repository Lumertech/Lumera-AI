import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/Layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, Trash2, Edit2, UserCheck, UserX, Users, Shield, Phone, Mail,
  Key, Lock, Unlock, UserCog, ClipboardList, AlertTriangle, Copy, Check,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('users');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone_number: '', profession: '', is_active: true });
  const [stats, setStats] = useState({ total: 0, doctors: 0, active: 0 });

  // Security action modals
  const [resetModal, setResetModal] = useState({ open: false, user: null, url: '', loading: false, copied: false });
  const [roleModal, setRoleModal] = useState({ open: false, user: null, role: '', loading: false });
  const [suspendModal, setSuspendModal] = useState({ open: false, user: null, loading: false });

  // Audit logs
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    const filtered = users.filter(user => 
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.profession?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredUsers(filtered);
  }, [searchTerm, users]);

  useEffect(() => {
    // Calculate stats
    const doctors = users.filter(u => u.profession === 'doctor').length;
    const active = users.filter(u => u.is_active !== false).length;
    setStats({
      total: users.length,
      doctors,
      active
    });
  }, [users]);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/users`);
      setUsers(response.data);
      setFilteredUsers(response.data);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/security-audit-logs?limit=50`);
      setAuditLogs(r.data.logs || []);
    } catch { toast.error('Failed to load audit logs'); }
    finally { setAuditLoading(false); }
  };

  const handleResetPassword = async (user) => {
    setResetModal({ open: true, user, url: '', loading: true, copied: false });
    try {
      const r = await axios.post(`${API_URL}/admin/users/${user.id}/reset-password-trigger`);
      setResetModal(prev => ({ ...prev, url: r.data.reset_url, loading: false }));
      toast.success(`Reset email sent to ${user.email}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to trigger reset');
      setResetModal(prev => ({ ...prev, open: false, loading: false }));
    }
  };

  const handleSuspend = async () => {
    setSuspendModal(prev => ({ ...prev, loading: true }));
    const user = suspendModal.user;
    try {
      if (user.is_suspended) {
        await axios.post(`${API_URL}/admin/users/${user.id}/unsuspend`);
        toast.success(`${user.name} unsuspended`);
      } else {
        await axios.post(`${API_URL}/admin/users/${user.id}/suspend`, { reason: 'Admin action' });
        toast.success(`${user.name} suspended — sessions revoked`);
      }
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Action failed'); }
    finally { setSuspendModal({ open: false, user: null, loading: false }); }
  };

  const handleSetRole = async () => {
    if (!roleModal.role) { toast.error('Select a role'); return; }
    setRoleModal(prev => ({ ...prev, loading: true }));
    try {
      await axios.post(`${API_URL}/admin/users/${roleModal.user.id}/set-role`, { role: roleModal.role });
      toast.success(`Role updated to ${roleModal.role}`);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to set role'); }
    finally { setRoleModal({ open: false, user: null, role: '', loading: false }); }
  };

  const handleEditClick = (user) => {
    setSelectedUser(user);
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      phone_number: user.phone_number || '',
      profession: user.profession || 'doctor',
      is_active: user.is_active !== false
    });
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    try {
      await axios.put(`${API_URL}/admin/users/${selectedUser.id}`, editForm);
      toast.success('User updated successfully');
      setEditModalOpen(false);
      fetchUsers();
    } catch (error) {
      console.error('Failed to update user:', error);
      toast.error(error.response?.data?.detail || 'Failed to update user');
    }
  };

  const handleToggleStatus = async (user) => {
    const newStatus = user.is_active === false;
    try {
      await axios.put(`${API_URL}/admin/users/${user.id}`, {
        is_active: newStatus
      });
      toast.success(`User ${newStatus ? 'activated' : 'deactivated'} successfully`);
      fetchUsers();
    } catch (error) {
      console.error('Failed to toggle user status:', error);
      toast.error('Failed to update user status');
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to delete ${userName}? This will also delete all their appointments and data.`)) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/admin/users/${userId}`);
      toast.success('User deleted successfully');
      fetchUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast.error('Failed to delete user');
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600">Loading users...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-manrope font-bold text-3xl text-slate-900 mb-2">User Management</h1>
            <p className="text-slate-600 font-inter">Manage all registered users and security events</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 border-b border-slate-200">
          {[
            { key: 'users', label: 'Users', icon: <Users className="h-4 w-4" /> },
            { key: 'audit', label: 'Security Audit Log', icon: <ClipboardList className="h-4 w-4" /> },
          ].map(t => (
            <button key={t.key} onClick={() => { setActiveTab(t.key); if (t.key === 'audit') fetchAuditLogs(); }}
              data-testid={`admin-tab-${t.key}`}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-all ${activeTab === t.key ? 'border-indigo-500 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {activeTab === 'audit' && (
          <Card className="border-slate-200" data-testid="audit-log-card">
            <CardHeader>
              <CardTitle className="font-manrope flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-indigo-500" /> Security Audit Log
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {auditLoading ? <div className="p-6 text-center text-slate-500">Loading…</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {['Event', 'User ID', 'Performed By', 'IP Address', 'Timestamp', 'Details'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogs.length === 0 ? (
                        <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">No audit events yet</td></tr>
                      ) : auditLogs.map((log, i) => (
                        <tr key={i} className="hover:bg-slate-50" data-testid={`audit-row-${i}`}>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              log.event_type?.includes('suspend') ? 'bg-red-100 text-red-700' :
                              log.event_type?.includes('reset') ? 'bg-amber-100 text-amber-700' :
                              log.event_type?.includes('role') ? 'bg-purple-100 text-purple-700' :
                              log.event_type === 'login' ? 'bg-green-100 text-green-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>{log.event_type}</span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{log.user_id?.slice(0,8)}…</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{log.performed_by?.slice(0,8)}…</td>
                          <td className="px-4 py-3 text-slate-500">{log.ip_address || '—'}</td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 font-mono">{JSON.stringify(log.details || {})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'users' && (<>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-slate-200">
            <CardContent className="p-4 flex items-center space-x-4">
              <div className="p-3 bg-blue-100 rounded-full">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                <p className="text-sm text-slate-600">Total Users</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-4 flex items-center space-x-4">
              <div className="p-3 bg-green-100 rounded-full">
                <Shield className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.doctors}</p>
                <p className="text-sm text-slate-600">Doctors</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-4 flex items-center space-x-4">
              <div className="p-3 bg-purple-100 rounded-full">
                <UserCheck className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.active}</p>
                <p className="text-sm text-slate-600">Active Users</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
              <Input
                placeholder="Search by name, email, or profession..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Profession</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Joined</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="font-semibold text-slate-900">{user.name}</div>
                            <div className="text-sm text-slate-500">{user.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 capitalize">
                            {user.profession}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col text-sm">
                            <span className="flex items-center text-slate-600">
                              <Phone className="h-3 w-3 mr-1" />
                              {user.phone_number || 'N/A'}
                            </span>
                            {user.whatsapp_verified && (
                              <span className="text-xs text-green-600">WhatsApp verified</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            user.is_active !== false 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {user.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex gap-1 flex-wrap">
                            <Button onClick={() => handleEditClick(user)} variant="outline" size="sm" title="Edit" className="hover:bg-blue-50">
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button onClick={() => handleResetPassword(user)} variant="outline" size="sm" title="Reset Password" className="hover:bg-amber-50" data-testid={`reset-pw-${user.id}`}>
                              <Key className="h-3.5 w-3.5 text-amber-600" />
                            </Button>
                            <Button
                              onClick={() => setSuspendModal({ open: true, user, loading: false })}
                              variant="outline" size="sm"
                              title={user.is_suspended ? 'Unsuspend' : 'Suspend'}
                              className={user.is_suspended ? 'hover:bg-green-50' : 'hover:bg-red-50'}
                              data-testid={`suspend-${user.id}`}
                            >
                              {user.is_suspended ? <Unlock className="h-3.5 w-3.5 text-green-600" /> : <Lock className="h-3.5 w-3.5 text-red-600" />}
                            </Button>
                            <Button
                              onClick={() => setRoleModal({ open: true, user, role: user.role || 'doctor', loading: false })}
                              variant="outline" size="sm" title="Set Role"
                              className="hover:bg-purple-50" data-testid={`role-${user.id}`}
                            >
                              <UserCog className="h-3.5 w-3.5 text-purple-600" />
                            </Button>
                            <Button onClick={() => handleDeleteUser(user.id, user.name)} variant="destructive" size="sm">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        </>)}
      </div>

      {/* Edit User Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-manrope text-xl">Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Phone Number</Label>
              <Input value={editForm.phone_number} onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Profession</Label>
              <Select value={editForm.profession} onValueChange={(value) => setEditForm({ ...editForm, profession: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['doctor','dentist','therapist','physiotherapist','dietitian','consultant','other'].map(p => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex space-x-3 pt-4">
              <Button variant="outline" onClick={() => setEditModalOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleEditSave} className="flex-1 bg-purple-600 hover:bg-purple-700">Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={resetModal.open} onOpenChange={(o) => !resetModal.loading && setResetModal(prev => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-manrope flex items-center gap-2">
              <Key className="h-5 w-5 text-amber-500" /> Password Reset — {resetModal.user?.name}
            </DialogTitle>
          </DialogHeader>
          {resetModal.loading ? (
            <div className="py-8 text-center text-slate-500">Sending reset email…</div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                Reset email sent to <strong>{resetModal.user?.email}</strong>. The link expires in 1 hour.
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Reset link (share manually if email bounced)</Label>
                <div className="flex gap-2">
                  <Input value={resetModal.url} readOnly className="text-xs font-mono" data-testid="reset-url-field" />
                  <Button size="sm" variant="outline" onClick={() => {
                    navigator.clipboard.writeText(resetModal.url);
                    setResetModal(prev => ({ ...prev, copied: true }));
                    setTimeout(() => setResetModal(prev => ({ ...prev, copied: false })), 2000);
                  }} data-testid="copy-reset-url">
                    {resetModal.copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button onClick={() => setResetModal({ open: false, user: null, url: '', loading: false, copied: false })} className="w-full">Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Suspend Modal */}
      <Dialog open={suspendModal.open} onOpenChange={(o) => !suspendModal.loading && setSuspendModal(prev => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-manrope flex items-center gap-2">
              {suspendModal.user?.is_suspended ? <Unlock className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-red-500" />}
              {suspendModal.user?.is_suspended ? 'Unsuspend Account' : 'Suspend Account'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            {suspendModal.user?.is_suspended
              ? `Restore access for ${suspendModal.user?.name}?`
              : `Suspend ${suspendModal.user?.name}? Their active sessions will be immediately revoked.`}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSuspendModal({ open: false, user: null, loading: false })}>Cancel</Button>
            <Button onClick={handleSuspend} disabled={suspendModal.loading}
              className={suspendModal.user?.is_suspended ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
              data-testid="confirm-suspend-btn">
              {suspendModal.user?.is_suspended ? 'Unsuspend' : 'Suspend & Revoke'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Modal */}
      <Dialog open={roleModal.open} onOpenChange={(o) => !roleModal.loading && setRoleModal(prev => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-manrope flex items-center gap-2">
              <UserCog className="h-5 w-5 text-purple-500" /> Set Role — {roleModal.user?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Label className="font-manrope font-semibold">New Role</Label>
            <Select value={roleModal.role} onValueChange={(v) => setRoleModal(prev => ({ ...prev, role: v }))}>
              <SelectTrigger data-testid="role-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['admin','staff','doctor','receptionist','front_desk','assistant','user'].map(r => (
                  <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRoleModal({ open: false, user: null, role: '', loading: false })}>Cancel</Button>
            <Button onClick={handleSetRole} disabled={roleModal.loading} className="bg-purple-600 hover:bg-purple-700" data-testid="confirm-role-btn">
              {roleModal.loading ? 'Saving…' : 'Update Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminUsers;
