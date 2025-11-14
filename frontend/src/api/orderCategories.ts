import axios from './axiosConfig';

export interface OrderCategory {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const orderCategoriesAPI = {
  getAll: async (isActive?: boolean): Promise<OrderCategory[]> => {
    const params = isActive !== undefined ? { isActive } : {};
    const { data } = await axios.get<OrderCategory[]>('/order-categories', { params });
    return data;
  },

  getById: async (id: string): Promise<OrderCategory> => {
    const { data } = await axios.get<OrderCategory>(`/order-categories/${id}`);
    return data;
  },

  create: async (categoryData: {
    name: string;
    description?: string;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<OrderCategory> => {
    const { data } = await axios.post<OrderCategory>('/order-categories', categoryData);
    return data;
  },

  update: async (
    id: string,
    updates: {
      name?: string;
      description?: string;
      isActive?: boolean;
      sortOrder?: number;
    }
  ): Promise<OrderCategory> => {
    const { data } = await axios.put<OrderCategory>(`/order-categories/${id}`, updates);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/order-categories/${id}`);
  },
};
