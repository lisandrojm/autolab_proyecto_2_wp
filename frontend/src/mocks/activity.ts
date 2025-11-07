import { Activity, ActivityRecordAPI } from './types';

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

export const mockActivityRecordsAPI: ActivityRecordAPI[] = [
  {
    _id: 'act_001',
    userId: 'user_001',
    action: 'Solicitud aprobada',
    description: 'Carlos Rodríguez aprobó tu solicitud de vacaciones',
    type: 'vacation',
    createdAt: '2025-01-20T09:30:00Z'
  },
  {
    _id: 'act_002',
    userId: 'user_001',
    action: 'Nueva solicitud',
    description: 'Solicitaste un compensatorio para el 22 de enero',
    type: 'vacation',
    createdAt: '2025-01-20T14:20:00Z'
  },
  {
    _id: 'act_003',
    userId: 'user_001',
    action: 'Documento agregado',
    description: 'Se agregó tu recibo de sueldo de enero 2025',
    type: 'document',
    createdAt: '2025-01-31T08:00:00Z'
  },
  {
    _id: 'act_004',
    userId: 'user_001',
    action: 'Nueva solicitud',
    description: 'Solicitaste una licencia JetBrains',
    type: 'notification',
    createdAt: '2025-01-18T10:15:00Z'
  },
  {
    _id: 'act_005',
    userId: 'user_001',
    action: 'Pedido aprobado',
    description: 'Laura Pérez aprobó tu pedido de monitor',
    type: 'notification',
    createdAt: '2025-01-15T11:45:00Z'
  },
  {
    _id: 'act_006',
    userId: 'user_001',
    action: 'Comentario recibido',
    description: 'Carlos Rodríguez comentó en tu solicitud de vacaciones',
    type: 'notification',
    createdAt: '2025-01-15T09:00:00Z'
  },
  {
    _id: 'act_007',
    userId: 'user_001',
    action: 'Nueva solicitud',
    description: 'Solicitaste un monitor de 27 pulgadas',
    type: 'notification',
    createdAt: '2025-01-10T16:30:00Z'
  },
  {
    _id: 'act_008',
    userId: 'user_001',
    action: 'Pedido rechazado',
    description: 'Laura Pérez rechazó tu pedido de teclado mecánico',
    type: 'notification',
    createdAt: '2024-12-05T13:20:00Z'
  }
];
