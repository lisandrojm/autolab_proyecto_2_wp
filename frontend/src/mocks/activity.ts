import { Activity } from './types';

export const mockActivities: Activity[] = [
  {
    id: '1',
    tipo: 'aprobacion',
    descripcion: 'Carlos Rodríguez aprobó tu solicitud de vacaciones',
    fecha: '2025-01-20T09:30:00',
    usuario: 'Carlos Rodríguez',
    icono: 'check-circle'
  },
  {
    id: '2',
    tipo: 'solicitud',
    descripcion: 'Solicitaste un compensatorio para el 22 de enero',
    fecha: '2025-01-20T14:20:00',
    usuario: 'María González',
    icono: 'calendar'
  },
  {
    id: '3',
    tipo: 'documento',
    descripcion: 'Se agregó tu recibo de sueldo de enero 2025',
    fecha: '2025-01-31T08:00:00',
    usuario: 'Sistema',
    icono: 'file-text'
  },
  {
    id: '4',
    tipo: 'solicitud',
    descripcion: 'Solicitaste una licencia JetBrains',
    fecha: '2025-01-18T10:15:00',
    usuario: 'María González',
    icono: 'package'
  },
  {
    id: '5',
    tipo: 'aprobacion',
    descripcion: 'Laura Pérez aprobó tu pedido de monitor',
    fecha: '2025-01-15T11:45:00',
    usuario: 'Laura Pérez',
    icono: 'check-circle'
  },
  {
    id: '6',
    tipo: 'comentario',
    descripcion: 'Carlos Rodríguez comentó en tu solicitud de vacaciones',
    fecha: '2025-01-15T09:00:00',
    usuario: 'Carlos Rodríguez',
    icono: 'message-circle'
  },
  {
    id: '7',
    tipo: 'solicitud',
    descripcion: 'Solicitaste un monitor de 27 pulgadas',
    fecha: '2025-01-10T16:30:00',
    usuario: 'María González',
    icono: 'package'
  },
  {
    id: '8',
    tipo: 'rechazo',
    descripcion: 'Laura Pérez rechazó tu pedido de teclado mecánico',
    fecha: '2024-12-05T13:20:00',
    usuario: 'Laura Pérez',
    icono: 'x-circle'
  }
];
