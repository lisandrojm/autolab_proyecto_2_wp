import { Notification } from './types';

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
