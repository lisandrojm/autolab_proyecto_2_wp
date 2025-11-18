import { NotificationAPI } from '../mocks/types';

let notifications: NotificationAPI[] = [
  {
    _id: 'notif_001',
    userId: 'user_current',
    title: 'Solicitud de vacaciones aprobada',
    message: 'Tu solicitud de vacaciones para diciembre ha sido aprobada',
    type: 'success',
    read: false,
    createdAt: '2025-11-02T14:30:00.000Z'
  },
  {
    _id: 'notif_002',
    userId: 'user_current',
    title: 'Nuevo documento disponible',
    message: 'Se ha agregado tu recibo de sueldo de octubre',
    type: 'info',
    read: false,
    createdAt: '2025-10-31T16:00:00.000Z'
  },
  {
    _id: 'notif_003',
    userId: 'user_current',
    title: 'Recordatorio: Capacitación obligatoria',
    message: 'No olvides completar el curso de seguridad antes del 15/11',
    type: 'warning',
    read: true,
    createdAt: '2025-10-28T09:00:00.000Z'
  },
  {
    _id: 'notif_004',
    userId: 'user_current',
    title: 'Reunión de equipo',
    message: 'Mañana a las 10:00 hs - Sala de conferencias',
    type: 'info',
    read: true,
    createdAt: '2025-11-07T08:30:00.000Z'
  }
];

export const mockNotificationsService = {
  getNotifications: async (): Promise<NotificationAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return notifications.filter(n => n.userId === 'user_current');
  },

  getUnreadNotifications: async (): Promise<NotificationAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return notifications.filter(n => n.userId === 'user_current' && !n.read);
  },

  getNotificationCount: async (): Promise<{ count: number }> => {
    await new Promise(resolve => setTimeout(resolve, 150));
    const count = notifications.filter(n => n.userId === 'user_current' && !n.read).length;
    return { count };
  },

  markNotificationRead: async (id: string): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const notif = notifications.find(n => n._id === id);
    if (notif) {
      notif.read = true;
    }
  },

  markAllNotificationsRead: async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    notifications.forEach(n => {
      if (n.userId === 'user_current') {
        n.read = true;
      }
    });
  },

  deleteNotification: async (id: string): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    notifications = notifications.filter(n => n._id !== id);
  }
};
