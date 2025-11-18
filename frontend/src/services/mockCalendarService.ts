import { CalendarEventAPI } from '../mocks/types';

let events: CalendarEventAPI[] = [
  {
    _id: 'event_001',
    title: 'Reunión de equipo',
    description: 'Reunión semanal del equipo de tecnología',
    startDate: '2025-11-08T10:00:00.000Z',
    endDate: '2025-11-08T11:00:00.000Z',
    type: 'meeting',
    createdBy: 'user_current',
    createdAt: '2025-11-01T09:00:00.000Z'
  },
  {
    _id: 'event_002',
    title: 'Feriado Nacional',
    description: 'Día de la Tradición',
    startDate: '2025-11-10T00:00:00.000Z',
    endDate: '2025-11-10T23:59:59.000Z',
    type: 'holiday',
    createdBy: 'admin',
    createdAt: '2025-01-01T00:00:00.000Z'
  },
  {
    _id: 'event_003',
    title: 'Entrega de proyecto',
    description: 'Deadline para la entrega del módulo de reportes',
    startDate: '2025-11-15T17:00:00.000Z',
    type: 'deadline',
    createdBy: 'user_002',
    createdAt: '2025-10-15T14:30:00.000Z'
  },
  {
    _id: 'event_004',
    title: 'Capacitación técnica',
    description: 'Workshop sobre nuevas tecnologías',
    startDate: '2025-11-20T14:00:00.000Z',
    endDate: '2025-11-20T17:00:00.000Z',
    type: 'other',
    createdBy: 'user_005',
    createdAt: '2025-11-05T10:00:00.000Z'
  }
];

export const mockCalendarService = {
  getCalendarEvents: async (): Promise<CalendarEventAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [...events];
  },

  getCalendarEvent: async (id: string): Promise<CalendarEventAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return events.find(e => e._id === id) || null;
  },

  getCalendarEventsMonth: async (year: number, month: number): Promise<CalendarEventAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return events.filter(e => {
      const date = new Date(e.startDate);
      return date.getFullYear() === year && date.getMonth() === month - 1;
    });
  },

  createCalendarEvent: async (data: Partial<CalendarEventAPI>): Promise<CalendarEventAPI> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const newEvent: CalendarEventAPI = {
      _id: `event_${Date.now()}`,
      title: data.title || '',
      description: data.description,
      startDate: data.startDate || new Date().toISOString(),
      endDate: data.endDate,
      type: data.type || 'other',
      createdBy: 'user_current',
      createdAt: new Date().toISOString()
    };
    events.push(newEvent);
    return newEvent;
  },

  updateCalendarEvent: async (id: string, data: Partial<CalendarEventAPI>): Promise<CalendarEventAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = events.findIndex(e => e._id === id);
    if (index === -1) return null;
    events[index] = { ...events[index], ...data };
    return events[index];
  },

  deleteCalendarEvent: async (id: string): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    events = events.filter(e => e._id !== id);
  }
};
