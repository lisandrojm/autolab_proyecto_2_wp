import { VacationRequest } from './types';

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
