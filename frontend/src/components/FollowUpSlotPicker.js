import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Input } from './ui/input';
import { Loader2, CheckCircle2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const QUICK_CHIPS = [
  { label: '+3 Days', days: 3 },
  { label: '+1 Week', days: 7 },
  { label: '+2 Weeks', days: 14 },
  { label: '+1 Month', days: 30 },
];

const addDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const FollowUpSlotPicker = ({ value, onChange }) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    setSlots([]);
    const token = localStorage.getItem('lumera_token');
    axios.get(`${API_URL}/calendar/available-slots?date=${selectedDate}&days=1`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => setSlots(r.data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [selectedDate]);

  const pickDate = (dateStr) => {
    setSelectedDate(dateStr);
    onChange(null);
  };

  const pickSlot = (slot) => {
    const isSelected = value?.start_time === slot.start_time && value?.date === slot.date;
    onChange(isSelected ? null : slot);
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3" data-testid="followup-slot-picker">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600">Follow-up in:</span>
        {QUICK_CHIPS.map(c => {
          const chipDate = addDays(c.days);
          const active = selectedDate === chipDate;
          return (
            <button
              key={c.days}
              type="button"
              onClick={() => pickDate(chipDate)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                active
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50'
              }`}
              data-testid={`followup-chip-${c.days}`}
            >
              {c.label}
            </button>
          );
        })}
        <Input
          type="date"
          value={selectedDate}
          onChange={e => pickDate(e.target.value)}
          className="h-7 text-xs w-36"
          min={todayStr}
          data-testid="followup-date-input"
        />
      </div>

      {selectedDate && (
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-600 mb-2">
            Available on {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}:
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading slots&hellip;
            </div>
          ) : slots.length === 0 ? (
            <p className="text-xs text-slate-400 py-1">No available slots. Try a different date.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {slots.map(slot => {
                const isSelected = value?.date === slot.date && value?.start_time === slot.start_time;
                return (
                  <button
                    key={`${slot.date}-${slot.start_time}`}
                    type="button"
                    onClick={() => pickSlot(slot)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
                    }`}
                    data-testid={`slot-btn-${slot.start_time}`}
                  >
                    {isSelected && <CheckCircle2 className="h-3 w-3 inline mr-0.5" />}
                    {slot.start_time}
                  </button>
                );
              })}
            </div>
          )}
          {value && (
            <div className="mt-2 flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Booked: <strong>{new Date(value.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} at {value.start_time}</strong></span>
              <button type="button" className="ml-auto text-slate-400 hover:text-red-500 leading-none" onClick={() => onChange(null)} data-testid="clear-followup-slot">&#x2715;</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FollowUpSlotPicker;
