import { ActivityRecordAPI } from '../mocks/types';

let activities: ActivityRecordAPI[] = [
  {
    _id: 'act_001',
    userId: 'user_current',
    action: 'vacation_request',
    description: 'Solicitó vacaciones del 25 al 27 de noviembre',
    type: 'vacation',
    createdAt: '2025-11-07T09:15:00.000Z'
  },
  {
    _id: 'act_002',
    userId: 'user_current',
    action: 'document_viewed',
    description: 'Visualizó el recibo de sueldo de octubre',
    type: 'document',
    createdAt: '2025-11-06T14:20:00.000Z'
  },
  {
    _id: 'act_003',
    userId: 'user_current',
    action: 'profile_updated',
    description: 'Actualizó su información de contacto',
    type: 'profile',
    createdAt: '2025-11-05T11:45:00.000Z'
  },
  {
    _id: 'act_004',
    userId: 'user_current',
    action: 'vacation_approved',
    description: 'Su solicitud de vacaciones fue aprobada',
    type: 'vacation',
    createdAt: '2025-11-02T14:30:00.000Z'
  },
  {
    _id: 'act_005',
    userId: 'user_current',
    action: 'task_completed',
    description: 'Completó la tarea: Reunión mensual del equipo',
    type: 'task',
    createdAt: '2025-11-05T16:00:00.000Z'
  },
  {
    _id: 'act_006',
    userId: 'user_current',
    action: 'document_uploaded',
    description: 'Subió un certificado médico',
    type: 'document',
    createdAt: '2025-10-28T10:30:00.000Z'
  },
  {
    _id: 'act_007',
    userId: 'user_current',
    action: 'calendar_event_created',
    description: 'Creó un evento: Reunión de equipo',
    type: 'calendar',
    createdAt: '2025-11-01T09:00:00.000Z'
  },
  {
    _id: 'act_008',
    userId: 'user_current',
    action: 'other_request',
    description: 'Solicitó un día compensatorio',
    type: 'request',
    createdAt: '2025-11-08T10:30:00.000Z'
  }
];

export const mockActivityService = {
  getRecentActivity: async (): Promise<ActivityRecordAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return activities
      .filter(a => a.userId === 'user_current')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  },

  getAllActivity: async (): Promise<ActivityRecordAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    return activities
      .filter(a => a.userId === 'user_current')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
};
