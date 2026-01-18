import axios from "./axiosConfig";

export type TipoAccionFutura = "documento" | "otra";

export type DeadlineMode = "none" | "plazoDias" | "fechaEspecifica";

export type DateMode = "single" | "range";

export interface Subtype {
  id: string;
  label: string;
  requiere_certificado?: boolean;
  [key: string]: any;
}

export interface TypeConfig {
  subtipos?: Subtype[];
  [key: string]: any;
}

export type CategoryType = "fecha" | "dinero" | "objeto" | "otros";

export interface OrderType {
  _id: string;
  tenantId: string;
  name: string;
  informacion?: string;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
  categoryType: CategoryType;
  dateMode?: DateMode;
  config: TypeConfig;
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
  pdfId?: string;
  createdAt: string;
  updatedAt: string;
}

export const orderTypesAPI = {
  getAll: async (isActive?: boolean): Promise<OrderType[]> => {
    const params = isActive !== undefined ? { isActive } : {};
    const { data } = await axios.get<OrderType[]>("/order-types", { params });
    return data;
  },

  getById: async (id: string): Promise<OrderType> => {
    const { data } = await axios.get<OrderType>(`/order-types/${id}`);
    return data;
  },

  create: async (typeData: { name: string; informacion?: string; isActive?: boolean; sortOrder?: number; categoryType?: CategoryType; dateMode?: DateMode; config?: TypeConfig; montoMaximo?: number; requiresAction?: boolean; actionText?: string; actionDescription?: string; tituloAccion?: string; futureActionType?: TipoAccionFutura; deadlineMode?: DeadlineMode; plazoDias?: number; fechaLimite?: string; documentoRequerido?: string; requiresSignature?: boolean; pdfId?: string }): Promise<OrderType> => {
    const { data } = await axios.post<OrderType>("/order-types", typeData);
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
      config?: TypeConfig;
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
      pdfId?: string;
    },
  ): Promise<OrderType> => {
    const { data } = await axios.put<OrderType>(`/order-types/${id}`, updates);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/order-types/${id}`);
  },

  reorder: async (categories: Array<{ id: string; sortOrder: number }>): Promise<void> => {
    await axios.put("/order-types/reorder", { categories });
  },
};
