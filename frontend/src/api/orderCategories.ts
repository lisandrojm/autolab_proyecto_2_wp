import axios from './axiosConfig';

export type TipoAccionFutura =
  | "plazoDias"
  | "fechaEspecifica"
  | "presentacionDocumento"
  | "vencimientoSistema"
  | "vencimientoInterno"
  | "sinVencimiento";

export type DateMode = "single" | "range";

export interface Subtype {
  id: string;
  label: string;
  requiere_certificado?: boolean;
  [key: string]: any;
}

export interface CategoryConfig {
  subtipos?: Subtype[];
  [key: string]: any;
}

export type CategoryType = "fecha" | "dinero" | "objeto" | "otros";

export interface OrderCategory {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
  categoryType: CategoryType;
  dateMode?: DateMode;
  config?: CategoryConfig;
  requiresAction?: boolean;
  actionText?: string;
  futureActionType?: TipoAccionFutura;
  plazoDias?: number;
  fechaLimite?: string;
  documentoRequerido?: string;
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
    categoryType?: CategoryType;
    dateMode?: DateMode;
    config?: CategoryConfig;
    requiresAction?: boolean;
    actionText?: string;
    futureActionType?: TipoAccionFutura;
    plazoDias?: number;
    fechaLimite?: string;
    documentoRequerido?: string;
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
      categoryType?: CategoryType;
      dateMode?: DateMode;
      config?: CategoryConfig;
      requiresAction?: boolean;
      actionText?: string;
      futureActionType?: TipoAccionFutura;
      plazoDias?: number;
      fechaLimite?: string;
      documentoRequerido?: string;
    }
  ): Promise<OrderCategory> => {
    const { data } = await axios.put<OrderCategory>(`/order-categories/${id}`, updates);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/order-categories/${id}`);
  },

  reorder: async (categories: Array<{ id: string; sortOrder: number }>): Promise<void> => {
    await axios.put('/order-categories/reorder', { categories });
  },
};
