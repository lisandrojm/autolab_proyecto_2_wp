import { VacationRequest, VacationRequestAPI } from './types';

export const mockVacationRequests: VacationRequest[] = [
  {
    id: '1',
    tipo: 'vacaciones',
    fechaInicio: '2025-02-10',
    fechaFin: '2025-02-21',
    dias: 10,
    motivo: 'Vacaciones de verano',
    estado: 'aprobada',
    fechaSolicitud: '2025-01-15',
    aprobadoPor: 'Carlos Rodríguez',
    comentarios: 'Aprobado. Que disfrutes!'
  },
  {
    id: '2',
    tipo: 'compensatorio',
    fechaInicio: '2025-01-22',
    fechaFin: '2025-01-22',
    dias: 1,
    motivo: 'Compensatorio por trabajo en fin de semana',
    estado: 'pendiente',
    fechaSolicitud: '2025-01-20'
  },
  {
    id: '3',
    tipo: 'personal',
    fechaInicio: '2024-12-20',
    fechaFin: '2024-12-20',
    dias: 1,
    motivo: 'Trámite personal',
    estado: 'rechazada',
    fechaSolicitud: '2024-12-18',
    aprobadoPor: 'Carlos Rodríguez',
    comentarios: 'No es posible por cierre de año. Consultar otras fechas.'
  }
];

export const mockVacationRequestsAPI: VacationRequestAPI[] = [
  {
    _id: 'vac_001',
    employeeId: 'user_001',
    startDate: '2025-02-10',
    endDate: '2025-02-21',
    days: 10,
    reason: 'Vacaciones de verano',
    status: 'approved',
    createdAt: '2025-01-15T10:00:00Z',
    approvedBy: 'Carlos Rodríguez',
    approvedAt: '2025-01-16T14:30:00Z'
  },
  {
    _id: 'vac_002',
    employeeId: 'user_001',
    startDate: '2025-01-22',
    endDate: '2025-01-22',
    days: 1,
    reason: 'Compensatorio por trabajo en fin de semana',
    status: 'pending',
    createdAt: '2025-01-20T14:20:00Z'
  },
  {
    _id: 'vac_003',
    employeeId: 'user_001',
    startDate: '2024-12-20',
    endDate: '2024-12-20',
    days: 1,
    reason: 'Trámite personal',
    status: 'rejected',
    createdAt: '2024-12-18T09:00:00Z',
    approvedBy: 'Carlos Rodríguez'
  },
  {
    _id: 'vac_004',
    employeeId: 'user_002',
    startDate: '2025-03-10',
    endDate: '2025-03-15',
    days: 5,
    reason: 'Vacaciones familiares',
    status: 'pending',
    createdAt: '2025-01-25T11:00:00Z'
  },
  {
    _id: 'vac_005',
    employeeId: 'user_003',
    startDate: '2025-02-01',
    endDate: '2025-02-07',
    days: 7,
    reason: 'Viaje al exterior',
    status: 'pending',
    createdAt: '2025-01-20T08:30:00Z'
  }
];
