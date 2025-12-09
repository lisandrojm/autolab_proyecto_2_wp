import { IOrder } from "../models/Order.js";
import { IOrderCategory } from "../models/OrderCategory.js";
import { IUser } from "../models/User.js";
import { IVacationRequest } from "../models/VacationRequest.js";

interface PdfVariables {
  categoria: string;
  subcategoria: string;
  monto: string;
  fechaDesde: string;
  fechaHasta: string;
  fechaUnica: string;
  dias: string;
  nombreCompleto: string;
  numeroPedido: string;
  fechaSolicitud: string;
  fechaAprobacion: string;
  tenantName: string;
  descripcion: string;
}

function sanitizeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(date: Date | string | undefined): string {
  if (!date) return "-";

  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "-";

    return d.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null) return "-";

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(amount);
}

function calculateDays(fechaDesde: Date | string | undefined, fechaHasta: Date | string | undefined): string {
  if (!fechaDesde || !fechaHasta) return "-";

  try {
    const desde = typeof fechaDesde === "string" ? new Date(fechaDesde) : fechaDesde;
    const hasta = typeof fechaHasta === "string" ? new Date(fechaHasta) : fechaHasta;

    if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) return "-";

    const diffTime = Math.abs(hasta.getTime() - desde.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays.toString();
  } catch {
    return "-";
  }
}

export function prepareVariables(
  order: IOrder,
  category: IOrderCategory,
  user: IUser,
  tenantName: string
): PdfVariables {
  const nombreCompleto = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Usuario";

  const categoria = sanitizeHtml(category.name || "-");

  const subcategoria = order.subcategories && order.subcategories.length > 0
    ? sanitizeHtml(order.subcategories.join(", "))
    : "-";

  const monto = category.categoryType === "dinero"
    ? formatCurrency(order.amount)
    : "-";

  let fechaDesde = "-";
  let fechaHasta = "-";
  let fechaUnica = "-";
  let dias = "-";

  if (category.categoryType === "fecha") {
    if (category.dateMode === "range" && order.dynamicValue) {
      fechaDesde = formatDate(order.dynamicValue.fechaDesde);
      fechaHasta = formatDate(order.dynamicValue.fechaHasta);
      dias = calculateDays(order.dynamicValue.fechaDesde, order.dynamicValue.fechaHasta);
    } else if (category.dateMode === "single" && order.dynamicValue) {
      fechaUnica = formatDate(order.dynamicValue.fechaUnica);
    }
  }

  const numeroPedido = sanitizeHtml(order.orderNumber || "-");
  const fechaSolicitud = formatDate(order.requestedAt);
  const fechaAprobacion = formatDate(order.preApprovedAt);
  const descripcion = sanitizeHtml(order.description || "-");

  return {
    categoria,
    subcategoria,
    monto,
    fechaDesde,
    fechaHasta,
    fechaUnica,
    dias,
    nombreCompleto: sanitizeHtml(nombreCompleto),
    numeroPedido,
    fechaSolicitud,
    fechaAprobacion,
    tenantName: sanitizeHtml(tenantName),
    descripcion,
  };
}

export function prepareVacationVariables(
  vacation: IVacationRequest,
  user: IUser,
  tenantName: string,
  vacationNumber: string
): PdfVariables {
  const nombreCompleto = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Usuario";

  const fechaDesde = formatDate(vacation.startDate);
  const fechaHasta = formatDate(vacation.endDate);
  const dias = vacation.daysRequested.toString();

  const numeroPedido = sanitizeHtml(vacationNumber || "-");
  const fechaSolicitud = formatDate(vacation.createdAt);
  const fechaAprobacion = formatDate(vacation.preApprovedAt);
  const descripcion = sanitizeHtml(vacation.reason || "-");

  return {
    categoria: "Vacaciones",
    subcategoria: "-",
    monto: "-",
    fechaDesde,
    fechaHasta,
    fechaUnica: "-",
    dias,
    nombreCompleto: sanitizeHtml(nombreCompleto),
    numeroPedido,
    fechaSolicitud,
    fechaAprobacion,
    tenantName: sanitizeHtml(tenantName),
    descripcion,
  };
}

export function replacePdfVariables(htmlTemplate: string, variables: PdfVariables): string {
  let result = htmlTemplate;

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value);
  });

  return result;
}
