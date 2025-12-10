import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Upload, FileText, Image, Trash2, Download, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatTime } from '@/lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const HealthRecordsTab = ({ clientPhone }) => {
  const [records, setRecords] = useState([]);
  const [whatsappMessages, setWhatsappMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [recordType, setRecordType] = useState('prescription_photo');
  const [notes, setNotes] = useState('');
  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    fetchHealthRecords();
  }, [clientPhone]);

  const fetchHealthRecords = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/health-records/${encodeURIComponent(clientPhone)}`);
      setRecords(response.data.health_records || []);
      setWhatsappMessages(response.data.whatsapp_messages || []);
    } catch (error) {
      console.error('Failed to fetch health records:', error);
      toast.error('Failed to load health records');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setSelectedFile(file);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewImage(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }

    setUploading(true);
    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result.split(',')[1]; // Remove data:image/jpeg;base64, prefix

        await axios.post(`${API_URL}/health-records/upload`, {
          client_phone: clientPhone,
          record_type: recordType,
          file_base64: base64String,
          file_name: selectedFile.name,
          notes: notes
        });

        toast.success('Health record uploaded successfully!');
        setUploadModalOpen(false);
        setSelectedFile(null);
        setPreviewImage(null);
        setNotes('');
        setRecordType('prescription_photo');
        fetchHealthRecords();
      };
      reader.readAsDataURL(selectedFile);
    } catch (error) {
      console.error('Failed to upload:', error);
      toast.error('Failed to upload health record');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (recordId) => {
    if (!window.confirm('Are you sure you want to delete this record?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/health-records/${recordId}`);
      toast.success('Record deleted successfully');
      fetchHealthRecords();
    } catch (error) {
      console.error('Failed to delete record:', error);
      toast.error('Failed to delete record');
    }
  };

  const downloadRecord = (record) => {
    const link = document.createElement('a');
    link.href = `data:image/jpeg;base64,${record.file_base64}`;
    link.download = record.file_name;
    link.click();
  };

  const getRecordTypeIcon = (type) => {
    switch (type) {
      case 'prescription_photo':
      case 'photo':
        return <Image className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const getRecordTypeLabel = (type) => {
    const labels = {
      'prescription_photo': 'Prescription Photo',
      'lab_report': 'Lab Report',
      'case_notes': 'Case Notes',
      'photo': 'Photo',
      'document': 'Document',
      'other': 'Other'
    };
    return labels[type] || 'Document';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Button */}
      <div className="flex justify-between items-center">
        <h3 className="font-manrope font-semibold text-lg">Health Records</h3>
        <Button
          onClick={() => setUploadModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Record
        </Button>
      </div>

      {/* WhatsApp Messages Section */}
      {whatsappMessages.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-manrope font-semibold text-md flex items-center space-x-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            <span>WhatsApp Messages & Media</span>
          </h4>
          <div className="space-y-2">
            {whatsappMessages.map((msg) => (
              <Card key={msg.id} className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <MessageSquare className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-slate-600">
                          {formatDate(msg.created_at)} at {formatTime(msg.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800">{msg.content}</p>
                      {msg.message_type === 'media' && msg.media_url && (
                        <p className="text-xs text-green-600 mt-2">📎 Media file attached</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded Records Section */}
      {records.length > 0 ? (
        <div className="space-y-3">
          <h4 className="font-manrope font-semibold text-md">Uploaded Documents</h4>
          <div className="grid md:grid-cols-2 gap-4">
            {records.map((record) => (
              <Card key={record.id} className="border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      {getRecordTypeIcon(record.record_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-manrope font-semibold text-sm text-slate-900 truncate">
                        {getRecordTypeLabel(record.record_type)}
                      </h4>
                      <p className="text-xs text-slate-600 mt-1 truncate">
                        {record.file_name}
                      </p>
                      {record.notes && (
                        <p className="text-xs text-slate-500 mt-1">{record.notes}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-2">
                        {formatDate(record.created_at)}
                        {record.source === 'whatsapp' && ' • Via WhatsApp'}
                      </p>
                      <div className="flex space-x-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadRecord(record)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                        {record.source !== 'whatsapp' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(record.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        !whatsappMessages.length && (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h3 className="font-manrope font-semibold text-xl text-slate-900 mb-2">
                No health records yet
              </h3>
              <p className="font-inter text-slate-600">
                Upload documents or receive them via WhatsApp
              </p>
            </CardContent>
          </Card>
        )
      )}

      {/* Upload Modal */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-manrope">Upload Health Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Record Type</Label>
              <Select value={recordType} onValueChange={setRecordType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prescription_photo">Prescription Photo</SelectItem>
                  <SelectItem value="lab_report">Lab Report</SelectItem>
                  <SelectItem value="case_notes">Case Notes</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-manrope font-semibold">File</Label>
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
              />
              <p className="text-xs text-slate-500">
                Max file size: 5MB. Supported: Images, PDF
              </p>
            </div>

            {previewImage && (
              <div className="border rounded-lg p-2">
                <img
                  src={previewImage}
                  alt="Preview"
                  className="max-h-48 mx-auto"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Notes (Optional)</Label>
              <Input
                placeholder="Add notes about this record"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setUploadModalOpen(false);
                  setSelectedFile(null);
                  setPreviewImage(null);
                  setNotes('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HealthRecordsTab;
