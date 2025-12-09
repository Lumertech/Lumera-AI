import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';

const TimeOffModal = ({ isOpen, onClose, onSubmit, selectedDate }) => {
  const [formData, setFormData] = useState({
    date: selectedDate || new Date().toISOString().split('T')[0],
    reason: '',
    is_full_day: true,
    start_time: '09:00',
    end_time: '17:00',
    is_recurring: false,
    recurrence_pattern: 'none'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({
      date: selectedDate || new Date().toISOString().split('T')[0],
      reason: '',
      is_full_day: true,
      start_time: '09:00',
      end_time: '17:00',
      is_recurring: false,
      recurrence_pattern: 'none'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-lg m-4 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="font-manrope">Mark Time Off</CardTitle>
              <CardDescription className="font-inter">
                Block time on your calendar
              </CardDescription>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Date</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Reason</Label>
              <Textarea
                placeholder="e.g., Personal appointment, Holiday, Conference"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                required
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Duration</Label>
              <Select
                value={formData.is_full_day ? 'full' : 'partial'}
                onValueChange={(value) => setFormData({ ...formData, is_full_day: value === 'full' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Day</SelectItem>
                  <SelectItem value="partial">Specific Time Slot</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!formData.is_full_day && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-manrope font-semibold">Start Time</Label>
                  <Input
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-manrope font-semibold">End Time</Label>
                  <Input
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Recurrence</Label>
              <Select
                value={formData.recurrence_pattern}
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  recurrence_pattern: value,
                  is_recurring: value !== 'none'
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">One-time only</SelectItem>
                  <SelectItem value="weekly">Weekly (every week on this day)</SelectItem>
                  <SelectItem value="monthly">Monthly (same date each month)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex space-x-2 pt-4">
              <Button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              >
                Mark Time Off
              </Button>
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default TimeOffModal;
