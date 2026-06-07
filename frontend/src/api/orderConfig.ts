import axios from "./axiosConfig";

export type TipoAccionFutura = "documento" | "otra";

export type DeadlineMode = "none" | "plazoDias" | "fechaEspecifica";

export type DateMode = "single" | "range";

export interface Subtype {
  id: string;
  label: string;
  requiere_certificado?: boolean;
  maxDays?: number; // Added
  resetDate?: string;
  repayment?: RepaymentConfig;
  [key: string]: any;
}

export interface TypeConfig {
  subtipos?: Subtype[];
  resetDate?: string;
  repayment?: RepaymentConfig;
  [key: string]: any;
}

export interface RepaymentConfig {
  method?: "sueldo" | "otro";
  installments?: number; // número de cuotas/meses
  startOnApproval?: boolean; // si la devolución comienza en la fecha de aprobación
  resetOnPaid?: boolean; // si al completarse se resetea el monto a cero
}

export type CategoryType = "fecha" | "dinero" | "objeto" | "otros";

export interface OrderConfig {
  _id: string;
  tenantId: string;
  name: string;
  informacion?: string;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
  categoryType: CategoryType;
  dateMode?: DateMode;
  maxDays?: number; // Added
  config: TypeConfig;
  limitType?: "monto" | "porcentaje";
  montoMaximo?: number;
  porcentajeMaximo?: number;
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
  pdfText?: string;
  createdAt: string;
  updatedAt: string;
}

export const orderConfigAPI = {
  getAll: async (isActive?: boolean): Promise<OrderConfig[]> => {
    const params = isActive !== undefined ? { isActive } : {};
    const { data } = await axios.get<OrderConfig[]>("/order-config", { params });
    return data;
  },

  getById: async (id: string): Promise<OrderConfig> => {
    const { data } = await axios.get<OrderConfig>(`/order-config/${id}`);
    return data;
  },

  create: async (typeData: { name: string; informacion?: string; isActive?: boolean; sortOrder?: number; categoryType?: CategoryType; dateMode?: DateMode; maxDays?: number; config?: TypeConfig; limitType?: "monto" | "porcentaje"; montoMaximo?: number; porcentajeMaximo?: number; requiresAction?: boolean; actionText?: string; actionDescription?: string; tituloAccion?: string; futureActionType?: TipoAccionFutura; deadlineMode?: DeadlineMode; plazoDias?: number; fechaLimite?: string; documentoRequerido?: string; requiresSignature?: boolean; pdfId?: string; pdfText?: string }): Promise<OrderConfig> => {
    const { data } = await axios.post<OrderConfig>("/order-config", typeData);
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
      maxDays?: number;
      config?: TypeConfig;
      limitType?: "monto" | "porcentaje";
      montoMaximo?: number;
      porcentajeMaximo?: number;
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
      pdfText?: string;
    },
  ): Promise<OrderConfig> => {
    const { data } = await axios.put<OrderConfig>(`/order-config/${id}`, updates);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/order-config/${id}`);
  },

  reorder: async (categories: Array<{ id: string; sortOrder: number }>): Promise<void> => {
    await axios.put("/order-config/reorder", { categories });
  },

  getSettings: async (): Promise<any> => {
    const { data } = await axios.get("/order-config/settings");
    return data;
  },

  updateSettings: async (settings: { contractRules: any[]; orderingEnabled?: boolean }): Promise<any> => {
    const { data } = await axios.put("/order-config/settings", settings);
    return data;
  },

  getUsersBalance: async (year: number, categoryId: string, subtypeId?: string): Promise<any[]> => {
    const { data } = await axios.get<any[]>("/orders/users-balance", {
      params: { year, categoryId, subtypeId },
    });
    return data;
  },

  saveUsersBalance: async (updates: any[]): Promise<void> => {
    await axios.post("/orders/users-balance", { updates });
  },
};
