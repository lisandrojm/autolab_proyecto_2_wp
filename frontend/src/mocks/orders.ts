import { Order, OrderRequestAPI } from './types';

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

export const mockOrderRequestsAPI: OrderRequestAPI[] = [
  {
    _id: 'order_001',
    employeeId: 'user_001',
    type: 'equipment',
    description: 'Monitor 27 pulgadas - Monitor adicional para mejorar productividad',
    quantity: 1,
    urgency: 'medium',
    status: 'approved',
    createdAt: '2025-01-10T09:00:00Z',
    requestedBy: 'María González'
  },
  {
    _id: 'order_002',
    employeeId: 'user_001',
    type: 'software',
    description: 'Licencia JetBrains - Licencia anual de IntelliJ IDEA',
    quantity: 1,
    urgency: 'high',
    status: 'pending',
    createdAt: '2025-01-18T10:15:00Z',
    requestedBy: 'María González'
  },
  {
    _id: 'order_003',
    employeeId: 'user_001',
    type: 'supplies',
    description: 'Cuaderno y bolígrafos - Material de oficina básico',
    quantity: 1,
    urgency: 'low',
    status: 'delivered',
    createdAt: '2024-12-15T08:00:00Z',
    deliveredAt: '2024-12-20T10:00:00Z',
    requestedBy: 'María González'
  },
  {
    _id: 'order_004',
    employeeId: 'user_001',
    type: 'equipment',
    description: 'Teclado mecánico - Teclado ergonómico para desarrollo',
    quantity: 1,
    urgency: 'medium',
    status: 'rejected',
    createdAt: '2024-12-01T11:00:00Z',
    requestedBy: 'María González'
  },
  {
    _id: 'order_005',
    employeeId: 'user_002',
    type: 'equipment',
    description: 'Silla ergonómica - Silla para mejorar postura',
    quantity: 1,
    urgency: 'high',
    status: 'pending',
    createdAt: '2025-01-22T14:30:00Z',
    requestedBy: 'Carlos Rodríguez'
  },
  {
    _id: 'order_006',
    employeeId: 'user_003',
    type: 'software',
    description: 'Licencia Adobe Creative Cloud',
    quantity: 1,
    urgency: 'medium',
    status: 'pending',
    createdAt: '2025-01-24T09:45:00Z',
    requestedBy: 'Ana Martínez'
  }
];
