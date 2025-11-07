import { OrderRequestAPI } from '../mocks/types';

let orders: OrderRequestAPI[] = [
  {
    _id: 'order_001',
    employeeId: 'user_current',
    type: 'equipment',
    description: 'Monitor adicional 27 pulgadas',
    quantity: 1,
    urgency: 'medium',
    status: 'approved',
    createdAt: '2025-10-15T10:00:00.000Z',
    requestedBy: 'Juan Pérez'
  },
  {
    _id: 'order_002',
    employeeId: 'user_current',
    type: 'software',
    description: 'Licencia de JetBrains IntelliJ IDEA',
    quantity: 1,
    urgency: 'high',
    status: 'pending',
    createdAt: '2025-11-06T14:30:00.000Z',
    requestedBy: 'Juan Pérez'
  },
  {
    _id: 'order_003',
    employeeId: 'user_003',
    type: 'software',
    description: 'Licencia Adobe Creative Cloud',
    quantity: 1,
    urgency: 'high',
    status: 'pending',
    createdAt: '2025-11-07T09:00:00.000Z',
    requestedBy: 'Ana Martínez'
  },
  {
    _id: 'order_004',
    employeeId: 'user_004',
    type: 'equipment',
    description: 'Silla ergonómica',
    quantity: 1,
    urgency: 'medium',
    status: 'pending',
    createdAt: '2025-11-05T11:20:00.000Z',
    requestedBy: 'Luis Fernández'
  }
];

export const mockOrdersService = {
  getOrders: async (): Promise<OrderRequestAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return orders.filter(o => o.employeeId === 'user_current');
  },

  getAllOrders: async (): Promise<OrderRequestAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [...orders];
  },

  getOrder: async (id: string): Promise<OrderRequestAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return orders.find(o => o._id === id) || null;
  },

  createOrder: async (data: Partial<OrderRequestAPI>): Promise<OrderRequestAPI> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const newOrder: OrderRequestAPI = {
      _id: `order_${Date.now()}`,
      employeeId: 'user_current',
      type: data.type || 'other',
      description: data.description || '',
      quantity: data.quantity || 1,
      urgency: data.urgency || 'medium',
      status: 'pending',
      createdAt: new Date().toISOString(),
      requestedBy: 'Juan Pérez'
    };
    orders.push(newOrder);
    return newOrder;
  },

  updateOrder: async (id: string, data: Partial<OrderRequestAPI>): Promise<OrderRequestAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = orders.findIndex(o => o._id === id);
    if (index === -1) return null;
    orders[index] = { ...orders[index], ...data };
    return orders[index];
  },

  deleteOrder: async (id: string): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    orders = orders.filter(o => o._id !== id);
  },

  getOrdersStats: async (): Promise<{ total: number; pending: number; approved: number; delivered: number }> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    const userOrders = orders.filter(o => o.employeeId === 'user_current');
    return {
      total: userOrders.length,
      pending: userOrders.filter(o => o.status === 'pending').length,
      approved: userOrders.filter(o => o.status === 'approved').length,
      delivered: userOrders.filter(o => o.status === 'delivered').length
    };
  },

  getPendingOrders: async (): Promise<OrderRequestAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return orders.filter(o => o.status === 'pending');
  },

  approveOrder: async (id: string): Promise<OrderRequestAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = orders.findIndex(o => o._id === id);
    if (index === -1) return null;
    orders[index] = { ...orders[index], status: 'approved' };
    return orders[index];
  },

  rejectOrder: async (id: string): Promise<OrderRequestAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = orders.findIndex(o => o._id === id);
    if (index === -1) return null;
    orders[index] = { ...orders[index], status: 'rejected' };
    return orders[index];
  },

  deliverOrder: async (id: string): Promise<OrderRequestAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = orders.findIndex(o => o._id === id);
    if (index === -1) return null;
    orders[index] = {
      ...orders[index],
      status: 'delivered',
      deliveredAt: new Date().toISOString()
    };
    return orders[index];
  }
};
