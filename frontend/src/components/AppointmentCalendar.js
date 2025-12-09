import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Download, Plus, Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import TimeOffModal from './TimeOffModal';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);
const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AppointmentCalendar = () => {
  const [appointments, setAppointments] = useState([]);
  const [timeOffs, setTimeOffs] = useState([]);
  const [showTimeOffModal, setShowTimeOffModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCalendarData();
  }, []);

  const fetchCalendarData = async () => {
    try {
      setLoading(true);
      const [appointmentsRes, timeOffsRes] = await Promise.all([
        axios.get(`${API_URL}/appointments`),
        axios.get(`${API_URL}/time-off`)
      ]);
      
      setAppointments(appointmentsRes.data);
      setTimeOffs(timeOffsRes.data);
    } catch (error) {
      console.error('Failed to fetch calendar data:', error);
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  const events = useMemo(() => {
    const appointmentEvents = appointments.map(appt => {
      const date = appt.appointment_date;
      const startTime = appt.start_time || '09:00';
      const endTime = appt.end_time || '09:30';
      
      return {
        id: appt.id,
        title: `📅 ${appt.client_name}`,
        start: moment(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm').toDate(),
        end: moment(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm').toDate(),
        resource: {
          type: 'appointment',
          data: appt
        }
      };
    });

    const timeOffEvents = timeOffs.map(timeOff => {
      const date = timeOff.date;
      
      if (timeOff.is_full_day) {
        return {
          id: timeOff.id,
          title: `🚫 ${timeOff.reason}`,
          start: moment(date, 'YYYY-MM-DD').toDate(),
          end: moment(date, 'YYYY-MM-DD').toDate(),
          allDay: true,
          resource: {
            type: 'timeoff',
            data: timeOff
          }
        };
      } else {
        return {
          id: timeOff.id,
          title: `🚫 ${timeOff.reason}`,
          start: moment(`${date} ${timeOff.start_time}`, 'YYYY-MM-DD HH:mm').toDate(),
          end: moment(`${date} ${timeOff.end_time}`, 'YYYY-MM-DD HH:mm').toDate(),
          resource: {
            type: 'timeoff',
            data: timeOff
          }
        };
      }
    });

    return [...appointmentEvents, ...timeOffEvents];
  }, [appointments, timeOffs]);

  const handleSelectSlot = ({ start }) => {
    const dateStr = moment(start).format('YYYY-MM-DD');
    setSelectedDate(dateStr);
    setShowTimeOffModal(true);
  };

  const handleSelectEvent = (event) => {
    setSelectedEvent(event);
  };

  const handleTimeOffSubmit = async (formData) => {
    try {
      await axios.post(`${API_URL}/time-off`, {
        ...formData,
        start_time: formData.is_full_day ? null : formData.start_time,
        end_time: formData.is_full_day ? null : formData.end_time,
        recurrence_pattern: formData.is_recurring ? formData.recurrence_pattern : null
      });
      
      toast.success('Time-off marked successfully!');
      setShowTimeOffModal(false);
      fetchCalendarData();
    } catch (error) {
      console.error('Failed to create time-off:', error);
      toast.error('Failed to mark time-off');
    }
  };

  const handleDeleteTimeOff = async (timeOffId) => {
    if (!window.confirm('Are you sure you want to delete this time-off?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/time-off/${timeOffId}`);
      toast.success('Time-off deleted successfully!');
      setSelectedEvent(null);
      fetchCalendarData();
    } catch (error) {
      console.error('Failed to delete time-off:', error);
      toast.error('Failed to delete time-off');
    }
  };

  const handleExportCalendar = async () => {
    try {
      const response = await axios.get(`${API_URL}/calendar/export`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'lumer_calendar.ics');
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Calendar exported! Import this file to your phone calendar app.');
    } catch (error) {
      console.error('Failed to export calendar:', error);
      toast.error('Failed to export calendar');
    }
  };

  const eventStyleGetter = (event) => {
    const isTimeOff = event.resource?.type === 'timeoff';
    
    return {
      style: {
        backgroundColor: isTimeOff ? '#ef4444' : '#4f46e5',
        borderRadius: '5px',
        opacity: 0.9,
        color: 'white',
        border: '0px',
        display: 'block'
      }
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Clock className="h-8 w-8 animate-spin mx-auto text-indigo-600" />
          <p className="mt-2 text-slate-600">Loading calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <div className="flex gap-2">
          <Button
            onClick={() => setShowTimeOffModal(true)}
            className="bg-red-600 hover:bg-red-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Mark Time Off
          </Button>
          <Button
            onClick={handleExportCalendar}
            variant="outline"
            className="border-indigo-600 text-indigo-600 hover:bg-indigo-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Calendar
          </Button>
        </div>
        
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-indigo-600 rounded"></div>
            <span>Appointments</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-600 rounded"></div>
            <span>Time Off</span>
          </div>
        </div>
      </div>

      <div style={{ height: '700px' }} className="bg-white rounded-lg border border-slate-200 p-4">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventStyleGetter}
          views={['month', 'week', 'day', 'agenda']}
          popup
        />
      </div>

      {selectedEvent && selectedEvent.resource?.type === 'timeoff' && (
        <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg border border-slate-200 p-4 max-w-sm">
          <div className="space-y-2">
            <h3 className="font-manrope font-bold text-lg">Time Off Details</h3>
            <p className="text-slate-600">{selectedEvent.resource.data.reason}</p>
            <p className="text-sm text-slate-500">
              {selectedEvent.resource.data.is_full_day ? 'Full Day' : 
                `${selectedEvent.resource.data.start_time} - ${selectedEvent.resource.data.end_time}`}
            </p>
            {selectedEvent.resource.data.is_recurring && (
              <p className="text-sm text-slate-500">
                🔄 Recurring: {selectedEvent.resource.data.recurrence_pattern}
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => handleDeleteTimeOff(selectedEvent.id)}
                variant="destructive"
                size="sm"
                className="flex-1"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <Button
                onClick={() => setSelectedEvent(null)}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      <TimeOffModal
        isOpen={showTimeOffModal}
        onClose={() => {
          setShowTimeOffModal(false);
          setSelectedDate(null);
        }}
        onSubmit={handleTimeOffSubmit}
        selectedDate={selectedDate}
      />
    </div>
  );
};

export default AppointmentCalendar;
