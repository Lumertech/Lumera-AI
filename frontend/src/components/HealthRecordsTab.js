import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileText, Image, Trash2, Download, MessageSquare,
  CheckCircle2, Upload, X, FilePlus, Loader2, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPT_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const ACCEPT_EXT = '.png,.jpg,.jpeg,.webp,.pdf';

const RECORD_TYPE_LABELS = {
  prescription_photo: 'Prescription Photo',
  lab_report: 'Lab Report',
  scan_report: 'Scan / X-Ray',
  case_notes: 'Case Notes',
  discharge_summary: 'Discharge Summary',
  other: 'Other',
};

// ─── Single queued file card ──────────────────────────────────────────────────
const QueuedFile = ({ qf, onTypeChange, onNoteChange, onRemove, uploading }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg border border-indigo-100 bg-indigo-50/40">
    {/* preview */}
    <div className="w-14 h-14 rounded-md overflow-hidden flex-shrink-0 bg-white border border-slate-200 flex items-center justify-center">
      {qf.preview ? (
        <img src={qf.preview} alt="preview" className="w-full h-full object-cover" />
      ) : (
        <FileText className="h-6 w-6 text-slate-400" />
      )}
    </div>
    <div className="flex-1 min-w-0 space-y-1.5">
      <p className="text-sm font-medium text-slate-800 truncate">{qf.file.name}</p>
      <p className="text-xs text-slate-500">{(qf.file.size / 1024).toFixed(0)} KB</p>
      <Select value={qf.record_type} onValueChange={(v) => onTypeChange(qf.id, v)} disabled={uploading}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(RECORD_TYPE_LABELS).map(([v, l]) => (
            <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-7 text-xs"
        placeholder="Notes (optional)"
        value={qf.notes}
        onChange={(e) => onNoteChange(qf.id, e.target.value)}
        disabled={uploading}
      />
      {/* progress */}
      {qf.progress !== undefined && (
        <div className="w-full bg-slate-200 rounded-full h-1.5">
          <div
            className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${qf.progress}%` }}
          />
        </div>
      )}
      {qf.done && <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Uploaded</p>}
      {qf.error && <p className="text-xs text-red-500">{qf.error}</p>}
    </div>
    {!uploading && !qf.done && (
      <button onClick={() => onRemove(qf.id)} className="text-slate-400 hover:text-red-500 mt-0.5">
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const HealthRecordsTab = ({ clientPhone, appointmentId }) => {
  const [records, setRecords] = useState([]);
  const [whatsappMessages, setWhatsappMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState([]); // queued files pending upload
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null); // fullscreen preview
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  const fetchRecords = useCallback(async () => {
    if (!clientPhone) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/health-records/${encodeURIComponent(clientPhone)}`);
      setRecords(res.data.health_records || []);
      setWhatsappMessages(res.data.whatsapp_messages || []);
    } catch {
      toast.error('Failed to load health records');
    } finally {
      setLoading(false);
    }
  }, [clientPhone]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // ── File validation & queuing ──────────────────────────────────────────────
  const enqueueFiles = (fileList) => {
    const valid = [];
    Array.from(fileList).forEach((file) => {
      if (!ACCEPT_MIME.includes(file.type)) {
        toast.error(`${file.name}: unsupported type (use JPG/PNG/WEBP/PDF)`);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name}: exceeds 5 MB limit`);
        return;
      }
      valid.push(file);
    });
    if (!valid.length) return;

    const newItems = valid.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      record_type: 'other',
      notes: '',
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      progress: undefined,
      done: false,
      error: null,
    }));
    setQueue((q) => [...q, ...newItems]);
  };

  // ── Drag & drop handlers ───────────────────────────────────────────────────
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = (e) => { if (!dropZoneRef.current?.contains(e.relatedTarget)) setDragOver(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    enqueueFiles(e.dataTransfer.files);
  };

  // ── Upload all queued files ────────────────────────────────────────────────
  const uploadAll = async () => {
    const pending = queue.filter((q) => !q.done);
    if (!pending.length) return;
    setUploading(true);
    for (const item of pending) {
      setQueue((q) => q.map((x) => x.id === item.id ? { ...x, progress: 10 } : x));
      try {
        const b64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result.split(',')[1]);
          r.onerror = reject;
          r.readAsDataURL(item.file);
        });
        setQueue((q) => q.map((x) => x.id === item.id ? { ...x, progress: 55 } : x));
        await axios.post(`${API_URL}/health-records/upload`, {
          client_phone: clientPhone,
          appointment_id: appointmentId || null,
          record_type: item.record_type,
          file_base64: b64,
          file_name: item.file.name,
          notes: item.notes,
        });
        setQueue((q) => q.map((x) => x.id === item.id ? { ...x, progress: 100, done: true } : x));
      } catch (err) {
        const msg = err.response?.data?.detail || 'Upload failed';
        setQueue((q) => q.map((x) => x.id === item.id ? { ...x, error: msg, progress: undefined } : x));
      }
    }
    setUploading(false);
    await fetchRecords();
    // Clear done items after 2s
    setTimeout(() => setQueue((q) => q.filter((x) => !x.done)), 2000);
  };

  const removeQueued = (id) => {
    setQueue((q) => q.filter((x) => {
      if (x.id === id && x.preview) URL.revokeObjectURL(x.preview);
      return x.id !== id;
    }));
  };

  const handleDelete = async (recordId) => {
    if (!window.confirm('Delete this record?')) return;
    try {
      await axios.delete(`${API_URL}/health-records/${recordId}`);
      toast.success('Record deleted');
      fetchRecords();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const downloadRecord = (record) => {
    const mime = record.file_name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
    const link = document.createElement('a');
    link.href = `data:${mime};base64,${record.file_base64}`;
    link.download = record.file_name;
    link.click();
  };

  // ── Appointment-specific records shown first ───────────────────────────────
  const apptRecords = records.filter((r) => r.appointment_id && r.appointment_id === appointmentId);
  const otherRecords = records.filter((r) => !r.appointment_id || r.appointment_id !== appointmentId);

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="space-y-5" data-testid="health-records-tab">
      {/* ── Drag-and-Drop Upload Zone ── */}
      <div
        ref={dropZoneRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        data-testid="dnd-upload-zone"
        className={`relative border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer select-none
          ${dragOver
            ? 'border-indigo-500 bg-indigo-50 scale-[1.01]'
            : 'border-slate-300 bg-slate-50/50 hover:border-indigo-400 hover:bg-indigo-50/30'
          }`}
        style={{ minHeight: 120 }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_EXT}
          multiple
          className="hidden"
          onChange={(e) => { enqueueFiles(e.target.files); e.target.value = ''; }}
          data-testid="file-input"
        />
        <div className="flex flex-col items-center justify-center py-8 gap-2 pointer-events-none">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors
            ${dragOver ? 'bg-indigo-100' : 'bg-slate-100'}`}>
            {dragOver
              ? <FilePlus className="h-6 w-6 text-indigo-500" />
              : <Upload className="h-6 w-6 text-slate-400" />
            }
          </div>
          <p className="font-medium text-slate-700 text-sm">
            {dragOver ? 'Drop files here' : 'Drag & drop records or click to browse'}
          </p>
          <p className="text-xs text-slate-500">JPG · PNG · WEBP · PDF · Max 5 MB per file</p>
        </div>
      </div>

      {/* ── Queued files ── */}
      {queue.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="font-semibold text-slate-700">{queue.length} file{queue.length > 1 ? 's' : ''} queued</Label>
            {queue.some((q) => !q.done) && (
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 h-8"
                onClick={uploadAll}
                disabled={uploading}
                data-testid="upload-all-btn"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                Upload {queue.filter((q) => !q.done).length} File{queue.filter((q) => !q.done).length > 1 ? 's' : ''}
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {queue.map((qf) => (
              <QueuedFile
                key={qf.id}
                qf={qf}
                onTypeChange={(id, v) => setQueue((q) => q.map((x) => x.id === id ? { ...x, record_type: v } : x))}
                onNoteChange={(id, v) => setQueue((q) => q.map((x) => x.id === id ? { ...x, notes: v } : x))}
                onRemove={removeQueued}
                uploading={uploading}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Visit-specific records ── */}
      {apptRecords.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">This Visit</p>
          <div className="grid md:grid-cols-2 gap-3">
            {apptRecords.map((rec) => <RecordCard key={rec.id} record={rec} onDelete={handleDelete} onDownload={downloadRecord} onPreview={setPreviewUrl} />)}
          </div>
        </div>
      )}

      {/* ── WhatsApp messages with media ── */}
      {whatsappMessages.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" /> WhatsApp Media
          </p>
          <div className="space-y-2">
            {whatsappMessages.map((msg) => (
              <div key={msg.id} className="p-3 rounded-lg bg-green-50 border border-green-100 text-sm text-slate-700">
                <span className="text-xs text-slate-400 mr-2">{formatDate(msg.created_at)}</span>
                {msg.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── All other records ── */}
      {otherRecords.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">All Records</p>
          <div className="grid md:grid-cols-2 gap-3">
            {otherRecords.map((rec) => <RecordCard key={rec.id} record={rec} onDelete={handleDelete} onDownload={downloadRecord} onPreview={setPreviewUrl} />)}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {records.length === 0 && whatsappMessages.length === 0 && queue.length === 0 && (
        <div className="text-center py-10">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No records yet — drag files above to upload</p>
        </div>
      )}

      {/* ── Fullscreen image preview ── */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img src={previewUrl} alt="preview" className="max-w-full max-h-full rounded-lg shadow-2xl" />
          <button className="absolute top-4 right-4 text-white bg-white/10 rounded-full p-2 hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Record card (shared for visit + all records) ─────────────────────────────
const RecordCard = ({ record, onDelete, onDownload, onPreview }) => {
  const isImage = record.file_name?.match(/\.(png|jpg|jpeg|webp)$/i);
  const previewSrc = isImage ? `data:image/jpeg;base64,${record.file_base64}` : null;

  return (
    <Card className="border-slate-200 hover:border-indigo-200 transition-colors" data-testid={`record-card-${record.id}`}>
      <CardContent className="p-3 flex items-start gap-3">
        {/* thumbnail */}
        <div
          className={`w-12 h-12 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-200 bg-slate-50
            ${previewSrc ? 'cursor-pointer' : ''}`}
          onClick={() => previewSrc && onPreview(previewSrc)}
        >
          {previewSrc
            ? <img src={previewSrc} alt="thumb" className="w-full h-full object-cover" />
            : <FileText className="h-5 w-5 text-slate-400" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">
            {RECORD_TYPE_LABELS[record.record_type] || 'Document'}
          </p>
          <p className="text-xs text-slate-500 truncate">{record.file_name}</p>
          {record.notes && <p className="text-xs text-slate-500 mt-0.5 italic">{record.notes}</p>}
          <p className="text-xs text-slate-400 mt-0.5">{formatDate(record.created_at)}</p>
          <div className="flex gap-1.5 mt-2">
            {previewSrc && (
              <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => onPreview(previewSrc)}>
                <Eye className="h-3 w-3 mr-1" /> View
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => onDownload(record)}>
              <Download className="h-3 w-3 mr-1" /> Save
            </Button>
            {record.source !== 'whatsapp' && (
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-red-500 hover:text-red-600" onClick={() => onDelete(record.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default HealthRecordsTab;
