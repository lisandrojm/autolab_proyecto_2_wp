import { StatusType } from "../config/statusConfig";

export interface FutureAction {
  _id: string;
  tipoAccionFutura: "documento" | "condicion" | "accion" | "presentacionDocumento" | "vencimientoSistema" | "vencimientoInterno" | "sinVencimiento";
  estadoAccion: "pendiente" | "cumplida" | "vencida" | "pendiente_documento" | "documento_presentado" | "en_revision";
  fechaLimite?: string;
  [key: string]: any;
}

export interface OrderWithCategory {
  status: string;
  categoryId?: string | { requiresSignature?: boolean; [key: string]: any };
  signatureStatus?: string;
  [key: string]: any;
}

export function mapOrderStatusToStatusType(status: string): StatusType {
  const statusMap: Record<string, StatusType> = {
    pending: "pendiente",
    pre_approved: "preaprobado",
    approved: "aprobado",
    rejected: "rechazado",
    delivered: "entregado",
    cancelled: "cancelado",
  };

  return statusMap[status] || "pendiente";
}

export function mapOrderStatusToStatusTypeForMobile(status: string): StatusType {
  const statusMap: Record<string, StatusType> = {
    pending: "pendiente",
    pre_approved: "pendiente",
    approved: "aprobado",
    rejected: "rechazado",
    delivered: "entregado",
    cancelled: "cancelado",
  };

  return statusMap[status] || "pendiente";
}

export function mapDocumentStateToStatusType(
  futureAction: FutureAction | null | undefined
): StatusType | null {
  if (!futureAction || futureAction.tipoAccionFutura !== "documento") {
    return null;
  }

  if (futureAction.estadoAccion === "documento_presentado") {
    return "doc_subido";
  }

  if (futureAction.estadoAccion === "pendiente_documento") {
    const daysRemaining = futureAction.fechaLimite
      ? Math.ceil(
          (new Date(futureAction.fechaLimite).getTime() - Date.now()) /
            (24 * 60 * 60 * 1000)
        )
      : null;

    if (daysRemaining !== null && daysRemaining < 0) {
      return "doc_vencido";
    }

    return "doc_pendiente";
  }

  return null;
}

export function mapSignatureStateToStatusType(
  order: OrderWithCategory | null | undefined
): StatusType | null {
  if (!order) return null;

  const categoryData =
    typeof order.categoryId === "object" ? order.categoryId : null;
  const requiresSignature = categoryData?.requiresSignature ?? false;

  if (!requiresSignature) {
    return null;
  }

  if (order.signatureStatus === "signed" || order.signatureStatus === "firmado") {
    return "firma_firmado";
  }

  return "firma_pendiente";
}
