export type TipoAccionFutura = "accion" | "documento" | "condicion" | "sinVencimiento";

export type DeadlineMode = "none" | "plazoDias" | "fechaEspecifica";

export type EstadoAccion = "pendiente" | "cumplida" | "vencida" | "en_revision";

export type ResponsableAccion = "usuario" | "cliente" | "area_interna";

export type QuienDefineVencimiento = "cliente" | "sistema" | "area_interna";

export interface FutureAction {
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

export interface CreateFutureActionPayload {
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

export interface UpdateFutureActionPayload {
  estadoAccion?: EstadoAccion;
  fechaCumplimiento?: string;
  fechaLimite?: string;
  descripcionAccion?: string;
  metadata?: Record<string, any>;
}

export interface FutureActionStats {
  pendiente: number;
  cumplida: number;
  vencida: number;
  en_revision: number;
  overdue: number;
}

export interface FutureActionQueryParams {
  estadoAccion?: EstadoAccion;
  tipoAccionFutura?: TipoAccionFutura;
  responsableAccion?: ResponsableAccion;
  orderId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  page?: number;
  limit?: number;
}

export interface FutureActionResponse {
  data: FutureAction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const tipoAccionFuturaLabels: Record<TipoAccionFutura, string> = {
  accion: "Acción Requerida",
  documento: "Presentación de Documento",
  condicion: "Aceptación de Condición",
  sinVencimiento: "Sin vencimiento ni acción",
};

export const deadlineModeLabels: Record<DeadlineMode, string> = {
  none: "Sin vencimiento ni acción",
  plazoDias: "Plazo en días",
  fechaEspecifica: "Fecha específica",
};

export const estadoAccionLabels: Record<EstadoAccion, string> = {
  pendiente: "Pendiente",
  cumplida: "Cumplida",
  vencida: "Vencida",
  en_revision: "En Revisión",
};

export const responsableAccionLabels: Record<ResponsableAccion, string> = {
  usuario: "Usuario",
  cliente: "Cliente",
  area_interna: "Área Interna",
};
