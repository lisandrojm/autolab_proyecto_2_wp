import { useState, useEffect } from 'react';
import { personnelAPI, CalendarEvent } from '../../../../api/personnel';

export const useCalendarEvents = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await personnelAPI.getCalendarEvents();
      setEvents(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cargar eventos');
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEventsByMonth = async (year: number, month: number) => {
    try {
      setLoading(true);
      setError(null);
      const data = await personnelAPI.getCalendarEventsMonth(year, month);
      setEvents(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cargar eventos del mes');
      console.error('Error fetching monthly events:', err);
    } finally {
      setLoading(false);
    }
  };

  const getUpcomingEvents = () => {
    const now = new Date();
    return events
      .filter(event => new Date(event.start) >= now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 10);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  return {
    events,
    loading,
    error,
    refetch: fetchEvents,
    fetchEventsByMonth,
    getUpcomingEvents,
  };
};
