export type TipoAccionFutura = "documento" | "otra";

export type DeadlineMode = "none" | "plazoDias" | "fechaEspecifica";

export type EstadoAccion = "pendiente" | "cumplida" | "vencida" | "pendiente_documento" | "documento_presentado" | "en_revision";

export type ResponsableAccion = "usuario" | "cliente" | "area_interna";

export type QuienDefineVencimiento = "cliente" | "sistema" | "area_interna";

export interface OrderFutureAction {
  _id: string;
  tenantId: string;
  orderId: string;
  requiereAccionFutura: boolean;
  tipoAccionFutura: TipoAccionFutura;
  deadlineMode?: DeadlineMode;
  descripcionAccion: string;
  responsableAccion: ResponsableAccion;
  documentoRequerido?: string;
  plazoDias?: number;
  fechaLimite?: string;
  fechaCreacionAccion: string;
  fechaCumplimiento?: string;
  estadoAccion: EstadoAccion;
  quienDefineVencimiento?: QuienDefineVencimiento;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderFutureActionPayload {
  orderId: string;
  tipoAccionFutura: TipoAccionFutura;
  descripcionAccion: string;
  responsableAccion: ResponsableAccion;
  documentoRequerido?: string;
  plazoDias?: number;
  fechaLimite?: string;
  quienDefineVencimiento?: QuienDefineVencimiento;
  metadata?: Record<string, any>;
}

export interface UpdateOrderFutureActionPayload {
  estadoAccion?: EstadoAccion;
  fechaCumplimiento?: string;
  fechaLimite?: string;
  descripcionAccion?: string;
  metadata?: Record<string, any>;
}

export interface OrderFutureActionStats {
  pendiente: number;
  cumplida: number;
  vencida: number;
  en_revision: number;
  overdue: number;
}

export interface OrderFutureActionQueryParams {
  estadoAccion?: EstadoAccion;
  tipoAccionFutura?: TipoAccionFutura;
  responsableAccion?: ResponsableAccion;
  orderId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  page?: number;
  limit?: number;
}

export interface OrderFutureActionResponse {
  data: OrderFutureAction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const tipoAccionFuturaLabels: Record<TipoAccionFutura, string> = {
  documento: "Presentación de Documento",
  otra: "Otra Acción Futura",
};

export const deadlineModeLabels: Record<DeadlineMode, string> = {
  none: "Sin vencimiento",
  plazoDias: "Plazo en días",
  fechaEspecifica: "Fecha específica",
};

export const estadoAccionLabels: Record<EstadoAccion, string> = {
  pendiente: "Pendiente",
  cumplida: "Cumplida",
  vencida: "Vencida",
  pendiente_documento: "Pendiente de Documento",
  documento_presentado: "Documento Presentado",
  en_revision: "En Revisión",
};

export const responsableAccionLabels: Record<ResponsableAccion, string> = {
  usuario: "Usuario",
  cliente: "Cliente",
  area_interna: "Área Interna",
};
