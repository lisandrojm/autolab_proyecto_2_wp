export interface FutureAction {
  _id: string;
  tenantId: string;
  orderId: string;
  requiereAccionFutura: boolean;
  tipoAccionFutura: "documento" | "condicion" | "accion" | "presentacionDocumento" | "vencimientoSistema" | "vencimientoInterno" | "sinVencimiento";
  deadlineMode?: "plazoDias" | "fechaEspecifica" | "none";
  plazoDias?: number;
  fechaLimite?: string;
  descripcionAccion: string;
  responsableAccion: "usuario" | "area_interna";
  documentoRequerido?: string;
  documentoUrl?: string;
  quienDefineVencimiento?: "sistema" | "area_interna";
  estadoAccion: "pendiente" | "cumplida" | "vencida" | "pendiente_documento" | "documento_presentado" | "en_revision";
  fechaCreacionAccion: string;
  fechaCumplimiento?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentBadgeStyle {
  bgClass: string;
  textClass: string;
  borderClass: string;
  label: string;
  shouldAnimate: boolean;
}

export const DOCUMENT_BADGE_CONFIG = {
  urgentDaysThreshold: 3,
  vencidoDaysThreshold: 0,
};

export function setUrgentDaysThreshold(days: number) {
  DOCUMENT_BADGE_CONFIG.urgentDaysThreshold = days;
}

export function getDocumentBadgeStyle(futureAction: FutureAction | null): DocumentBadgeStyle | null {
  if (!futureAction || futureAction.tipoAccionFutura !== "documento") {
    return null;
  }

  if (futureAction.estadoAccion !== "pendiente_documento") {
    return null;
  }

  const daysRemaining = futureAction.fechaLimite ? Math.ceil((new Date(futureAction.fechaLimite).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;

  if (daysRemaining !== null && daysRemaining < DOCUMENT_BADGE_CONFIG.vencidoDaysThreshold) {
    return {
      bgClass: "bg-red-500/20 dark:bg-red-500/20",
      textClass: "text-red-600 dark:text-red-400",
      borderClass: "border border-red-500 dark:border-red-400",
      label: "Doc. Vencido",
      shouldAnimate: true,
    };
  }

  if (daysRemaining !== null && daysRemaining <= DOCUMENT_BADGE_CONFIG.urgentDaysThreshold) {
    return {
      bgClass: "bg-orange-100 dark:bg-orange-900/30",
      textClass: "text-orange-800 dark:text-orange-400",
      borderClass: "border border-orange-400 dark:border-orange-400",
      label: "Doc. por Vencer",
      shouldAnimate: false,
    };
  }

  return {
    bgClass: "bg-orange-100 dark:bg-orange-900/30",
    textClass: "text-orange-800 dark:text-orange-400",
    borderClass: "",
    label: "Doc. Pendiente",
    shouldAnimate: false,
  };
}
