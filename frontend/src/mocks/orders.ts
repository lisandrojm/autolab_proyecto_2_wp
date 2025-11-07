import { Order } from './types';

export const mockOrders: Order[] = [
  {
    id: '1',
    tipo: 'equipo',
    articulo: 'Monitor 27 pulgadas',
    descripcion: 'Monitor adicional para mejorar productividad',
    cantidad: 1,
    urgencia: 'media',
    estado: 'aprobado',
    fechaSolicitud: '2025-01-10',
    fechaEntregaEstimada: '2025-01-25'
  },
  {
    id: '2',
    tipo: 'software',
    articulo: 'Licencia JetBrains',
    descripcion: 'Licencia anual de IntelliJ IDEA',
    cantidad: 1,
    urgencia: 'alta',
    estado: 'pendiente',
    fechaSolicitud: '2025-01-18'
  },
  {
    id: '3',
    tipo: 'utiles',
    articulo: 'Cuaderno y bolígrafos',
    descripcion: 'Material de oficina básico',
    cantidad: 1,
    urgencia: 'baja',
    estado: 'entregado',
    fechaSolicitud: '2024-12-15',
    fechaEntregaEstimada: '2024-12-20'
  },
  {
    id: '4',
    tipo: 'equipo',
    articulo: 'Teclado mecánico',
    descripcion: 'Teclado ergonómico para desarrollo',
    cantidad: 1,
    urgencia: 'media',
    estado: 'rechazado',
    fechaSolicitud: '2024-12-01'
  }
];
