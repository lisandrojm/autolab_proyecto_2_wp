import { Notification, NotificationAPI } from './types';

export const mockNotifications: Notification[] = [
  {
    id: '1',
    tipo: 'success',
    titulo: 'Solicitud Aprobada',
    mensaje: 'Tu solicitud de vacaciones ha sido aprobada por Carlos Rodríguez',
    fecha: '2025-01-20T09:30:00',
    leida: false,
    accion: {
      texto: 'Ver detalles',
      url: '/personnel/vacations'
    }
  },
  {
    id: '2',
    tipo: 'info',
    titulo: 'Nuevo Documento Disponible',
    mensaje: 'Tu recibo de sueldo de enero 2025 ya está disponible',
    fecha: '2025-01-31T08:00:00',
    leida: false,
    accion: {
      texto: 'Descargar',
      url: '/personnel/documents'
    }
  },
  {
    id: '3',
    tipo: 'warning',
    titulo: 'Pendiente de Aprobación',
    mensaje: 'Tu solicitud de compensatorio está pendiente de aprobación',
    fecha: '2025-01-20T14:20:00',
    leida: true
  },
  {
    id: '4',
    tipo: 'info',
    titulo: 'Reunión Próxima',
    mensaje: 'Tienes una reunión de equipo mañana a las 10:00',
    fecha: '2025-01-26T16:00:00',
    leida: true,
    accion: {
      texto: 'Ver calendario',
      url: '/personnel/calendar'
    }
  },
  {
    id: '5',
    tipo: 'success',
    titulo: 'Pedido Aprobado',
    mensaje: 'Tu pedido de monitor ha sido aprobado',
    fecha: '2025-01-15T11:45:00',
    leida: true,
    accion: {
      texto: 'Ver pedido',
      url: '/personnel/orders'
    }
  }
];

export const mockNotificationsAPI: NotificationAPI[] = [
  {
    _id: 'notif_001',
    userId: 'user_001',
    title: 'Solicitud Aprobada',
    message: 'Tu solicitud de vacaciones ha sido aprobada por Carlos Rodríguez',
    type: 'success',
    read: false,
    createdAt: '2025-01-20T09:30:00Z'
  },
  {
    _id: 'notif_002',
    userId: 'user_001',
    title: 'Nuevo Documento Disponible',
    message: 'Tu recibo de sueldo de enero 2025 ya está disponible',
    type: 'info',
    read: false,
    createdAt: '2025-01-31T08:00:00Z'
  },
  {
    _id: 'notif_003',
    userId: 'user_001',
    title: 'Pendiente de Aprobación',
    message: 'Tu solicitud de compensatorio está pendiente de aprobación',
    type: 'warning',
    read: true,
    createdAt: '2025-01-20T14:20:00Z'
  },
  {
    _id: 'notif_004',
    userId: 'user_001',
    title: 'Reunión Próxima',
    message: 'Tienes una reunión de equipo mañana a las 10:00',
    type: 'info',
    read: true,
    createdAt: '2025-01-26T16:00:00Z'
  },
  {
    _id: 'notif_005',
    userId: 'user_001',
    title: 'Pedido Aprobado',
    message: 'Tu pedido de monitor ha sido aprobado',
    type: 'success',
    read: true,
    createdAt: '2025-01-15T11:45:00Z'
  }
];
