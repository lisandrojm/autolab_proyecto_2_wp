export interface OtherRequest {
  id: string;
  type: 'compensatorio' | 'licencia_especial' | 'cambio_turno' | 'extraordinario';
  startDate: string;
  endDate?: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export const mockOtherRequests: OtherRequest[] = [
  {
    id: 'req_001',
    type: 'compensatorio',
    startDate: '2025-11-15T00:00:00.000Z',
    endDate: '2025-11-15T00:00:00.000Z',
    description: 'Compensatorio por trabajo realizado el fin de semana del 8-9 de noviembre durante el despliegue del sistema',
    status: 'approved',
    createdAt: '2025-11-08T10:30:00.000Z'
  },
  {
    id: 'req_002',
    type: 'licencia_especial',
    startDate: '2025-11-20T00:00:00.000Z',
    endDate: '2025-11-22T00:00:00.000Z',
    description: 'Licencia especial por mudanza de vivienda',
    status: 'pending',
    createdAt: '2025-11-06T14:20:00.000Z'
  },
  {
    id: 'req_003',
    type: 'cambio_turno',
    startDate: '2025-11-12T00:00:00.000Z',
    description: 'Solicito cambio de turno de mañana a tarde por consulta médica',
    status: 'approved',
    createdAt: '2025-11-05T09:15:00.000Z'
  },
  {
    id: 'req_004',
    type: 'extraordinario',
    startDate: '2025-11-25T00:00:00.000Z',
    endDate: '2025-11-27T00:00:00.000Z',
    description: 'Solicitud de permiso extraordinario por trámites legales urgentes',
    status: 'pending',
    createdAt: '2025-11-07T11:45:00.000Z'
  },
  {
    id: 'req_005',
    type: 'compensatorio',
    startDate: '2025-11-18T00:00:00.000Z',
    description: 'Día compensatorio por horas extras acumuladas en el sprint anterior',
    status: 'rejected',
    createdAt: '2025-10-28T16:30:00.000Z'
  }
];
