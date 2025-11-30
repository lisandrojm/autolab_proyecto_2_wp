import axios from './axiosConfig';

export type TipoAccionFutura = "documento" | "otra";

export type DeadlineMode = "none" | "plazoDias" | "fechaEspecifica";

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
  informacion?: string;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
  categoryType: CategoryType;
  dateMode?: DateMode;
  config: CategoryConfig;
  montoMaximo?: number;
  requiresAction?: boolean;
  actionText?: string;
  actionDescription?: string;
  tituloAccion?: string;
  futureActionType?: TipoAccionFutura;
  deadlineMode?: DeadlineMode;
  plazoDias?: number;
  fechaLimite?: string;
  documentoRequerido?: string;
  requiresSignature?: boolean;
  requiresUserConfirmation?: boolean;
  pdfTemplateId?: string;
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
    informacion?: string;
    isActive?: boolean;
    sortOrder?: number;
    categoryType?: CategoryType;
    dateMode?: DateMode;
    config?: CategoryConfig;
    montoMaximo?: number;
    requiresAction?: boolean;
    actionText?: string;
    actionDescription?: string;
    tituloAccion?: string;
    futureActionType?: TipoAccionFutura;
    deadlineMode?: DeadlineMode;
    plazoDias?: number;
    fechaLimite?: string;
    documentoRequerido?: string;
    requiresSignature?: boolean;
    pdfTemplateId?: string;
  }): Promise<OrderCategory> => {
    const { data } = await axios.post<OrderCategory>('/order-categories', categoryData);
    return data;
  },

  update: async (
    id: string,
    updates: {
      name?: string;
      informacion?: string;
      isActive?: boolean;
      sortOrder?: number;
      categoryType?: CategoryType;
      dateMode?: DateMode;
      config?: CategoryConfig;
      montoMaximo?: number;
      requiresAction?: boolean;
      actionText?: string;
      actionDescription?: string;
      tituloAccion?: string;
      futureActionType?: TipoAccionFutura;
      deadlineMode?: DeadlineMode;
      plazoDias?: number;
      fechaLimite?: string;
      documentoRequerido?: string;
      requiresSignature?: boolean;
      pdfTemplateId?: string;
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
