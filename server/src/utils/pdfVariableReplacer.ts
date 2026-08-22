import { IOrder } from "../models/Order.js";
import { IOrderConfig } from "../models/OrderConfig.js";
import { IUser } from "../models/User.js";
import { IVacation } from "../models/Vacation.js";
import { buildDatosModificadosHtml } from "./personalDataFields.js";
import { marcaFirma } from "./employeeDocData.js";

interface PdfVariables {
  categoria: string;
  subcategoria: string;
  monto: string;
  fechaDesde: string;
  fechaHasta: string;
  fechaUnica: string;
  dias: string;
  nombreCompleto: string;
  nombreUsuario: string;
  numeroPedido: string;
  fechaSolicitud: string;
  fechaAprobacion: string;
  tenantName: string;
  descripcion: string;
  [key: string]: string;
}

export function sanitizeHtml(str: string): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatDate(date: Date | string | undefined): string {
  if (!date) return "-";

  try {
    // Si es un string YYYY-MM-DD, parsear manualmente para evitar problemas de timezone
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const parts = date.split("-");
      // Asumimos formato YYYY-MM-DD
      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        return `${day}/${month}/${year}`;
      }
    }

    // Fallback para otros formatos o Date objects
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

function formatDateOnly(date: Date | string | undefined): string {
  if (!date) return "-";

  try {
    // Si es un string YYYY-MM-DD, parsear manualmente
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const parts = date.split("-");
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "-";

    const day = d.getUTCDate().toString().padStart(2, "0");
    const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
    const year = d.getUTCFullYear();

    return `${day}/${month}/${year}`;
  } catch {
    return "-";
  }
}

function getDatesInRange(startDateStr: string | Date, endDateStr: string | Date): string {
  try {
    const start = typeof startDateStr === "string" ? new Date(startDateStr) : startDateStr;
    const end = typeof endDateStr === "string" ? new Date(endDateStr) : endDateStr;
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return "-";

    const s = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const e = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

    const dates: string[] = [];
    let current = new Date(s);
    let safetyCounter = 0;
    while (current <= e && safetyCounter < 100) {
      const day = current.getUTCDate().toString().padStart(2, "0");
      const month = (current.getUTCMonth() + 1).toString().padStart(2, "0");
      const year = current.getUTCFullYear();
      dates.push(`${day}/${month}/${year}`);

      current.setUTCDate(current.getUTCDate() + 1);
      safetyCounter++;
    }

    return dates.join(", ");
  } catch {
    return "-";
  }
}

function formatSingleOrMultipleDates(value: any): string {
  if (Array.isArray(value)) {
    return value.map(d => formatDate(d)).filter(d => d !== "-").join(", ");
  }
  return formatDate(value);
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

export async function prepareVariables(order: IOrder, category: IOrderConfig, user: IUser, tenantName: string): Promise<Record<string, string>> {
  const nombreCompleto = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Usuario";

  const categoryName = category.name || "-";
  const categoria = sanitizeHtml(categoryName);

  let subcategoria = "-";
  if (order.subcategories && order.subcategories.length > 0) {
    if (category.config?.subtipos) {
      const labels = order.subcategories.map((subId) => {
        const found = category.config.subtipos?.find((st: any) => st.id === subId);
        return found ? found.label : subId;
      });
      subcategoria = sanitizeHtml(labels.join(", "));
    } else {
      subcategoria = sanitizeHtml(order.subcategories.join(", "));
    }
  }

  const monto = order.amount !== undefined && order.amount !== null ? formatCurrency(order.amount) : "-";

  let fechaDesde = "-";
  let fechaHasta = "-";
  let fechaUnica = "-";
  let dias = "-";

  const dynamicVars: Record<string, string> = {};

  if (order.dynamicValue && Array.isArray(order.dynamicValue)) {
    fechaUnica = formatSingleOrMultipleDates(order.dynamicValue);
    dynamicVars["fecha"] = fechaUnica;
    dynamicVars["fechaUnica"] = fechaUnica;
    dynamicVars["fechas"] = fechaUnica;
    dynamicVars["fechasMultiples"] = fechaUnica;
    dynamicVars["value"] = fechaUnica;
  } else if (order.dynamicValue && typeof order.dynamicValue === "object") {
    const normalize = (str: string) =>
      str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");

    const findKey = (candidates: string[]) =>
      Object.keys(order.dynamicValue).find((k) => {
        const normalizedKey = normalize(k);
        return candidates.some((c) => normalize(c) === normalizedKey);
      });

    Object.entries(order.dynamicValue).forEach(([key, value]) => {
      if (value === null || value === undefined) return;

      if (value instanceof Date) {
        dynamicVars[key] = formatDate(value);
      } else if (typeof value === "string") {
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
          dynamicVars[key] = formatDate(value);
        } else {
          dynamicVars[key] = sanitizeHtml(value);
        }
      } else if (Array.isArray(value)) {
        dynamicVars[key] = formatSingleOrMultipleDates(value);
      } else if (typeof value === "number") {
        dynamicVars[key] = value.toString();
      } else if (typeof value === "boolean") {
        dynamicVars[key] = value ? "Sí" : "No";
      }
    });

    const fechaUnicaKey = findKey(["fechaunica", "fecha", "date", "unique_date", "fechasolicitada", "fechaparaelpedido"]);
    if (fechaUnicaKey && order.dynamicValue[fechaUnicaKey]) {
      fechaUnica = formatSingleOrMultipleDates(order.dynamicValue[fechaUnicaKey]);
    }

    const fechaDesdeKey = findKey(["fechadesde", "startdate", "start", "desde", "fechainicio"]);
    if (fechaDesdeKey && order.dynamicValue[fechaDesdeKey]) {
      fechaDesde = formatDate(order.dynamicValue[fechaDesdeKey]);
    }

    const fechaHastaKey = findKey(["fechahasta", "enddate", "end", "hasta", "fechafin"]);
    if (fechaHastaKey && order.dynamicValue[fechaHastaKey]) {
      fechaHasta = formatDate(order.dynamicValue[fechaHastaKey]);
    }

    const valDesde = fechaDesdeKey ? order.dynamicValue[fechaDesdeKey] : null;
    const valHasta = fechaHastaKey ? order.dynamicValue[fechaHastaKey] : null;

    if (fechaUnica === "-") {
      if (valDesde && valHasta) {
        fechaUnica = getDatesInRange(valDesde, valHasta);
      } else if (valDesde) {
        fechaUnica = formatDate(valDesde);
      }
    }

    dynamicVars["fechaUnica"] = fechaUnica;
    dynamicVars["fechas"] = fechaUnica;
    dynamicVars["fechasMultiples"] = fechaUnica;
    dynamicVars["fecha"] = fechaUnica;

    const diasKey = findKey(["dias", "days", "cantidad_dias", "cantidaddias"]);
    if (diasKey && order.dynamicValue[diasKey]) {
      dias = order.dynamicValue[diasKey].toString();
    }

    if (dias === "-") {
      if (valDesde && valHasta) {
        dias = calculateDays(valDesde, valHasta);
      }
    }
  } else if (order.dynamicValue && typeof order.dynamicValue === "string") {
    if (category.categoryType === "fecha" && category.dateMode === "single") {
      fechaUnica = formatSingleOrMultipleDates(order.dynamicValue);
      dynamicVars["fecha"] = fechaUnica;
      dynamicVars["fechaUnica"] = fechaUnica;
      dynamicVars["fechas"] = fechaUnica;
      dynamicVars["fechasMultiples"] = fechaUnica;
      dynamicVars["value"] = fechaUnica;
    } else if (category.categoryType === "objeto") {
      dynamicVars["objeto"] = sanitizeHtml(order.dynamicValue);
      dynamicVars["value"] = sanitizeHtml(order.dynamicValue);
    } else {
      dynamicVars["value"] = sanitizeHtml(order.dynamicValue);
    }
  }

  const numeroPedido = sanitizeHtml(order.orderNumber || "-");
  const fechaSolicitud = formatDate(order.requestedAt);
  const fechaAprobacion = formatDate(order.preApprovedAt);
  const descripcion = sanitizeHtml(order.description || "-");
  const textoAdicional = order.customTextBlock ? sanitizeHtml(order.customTextBlock) : "";

  // Datos personales: lista de campos modificados (solo los que cambió el usuario).
  let datosModificados = "-";
  if (category.categoryType === "datos_personales") {
    const proposed = (order.metadata as any)?.proposedUserData || (order.dynamicValue && typeof order.dynamicValue === "object" && !Array.isArray(order.dynamicValue) ? order.dynamicValue : null);
    datosModificados = await buildDatosModificadosHtml(proposed, (order as any).tenantId);
  }

  return {
    ...dynamicVars,
    datosModificados,
    numeroOrden: numeroPedido,
    categoria,
    subcategoria,
    monto,
    fechaDesde,
    fechaHasta,
    fechaUnica,
    fechas: fechaUnica,
    fechasMultiples: fechaUnica,
    dias,
    nombreCompleto: sanitizeHtml(nombreCompleto),
    nombreUsuario: sanitizeHtml(nombreCompleto),
    firma: marcaFirma(sanitizeHtml(nombreCompleto)),
    numeroPedido,
    fechaSolicitud,
    fechaAprobacion,
    tenantName: sanitizeHtml(tenantName),
    descripcion,
    textoAdicional,
  };
}

export function prepareVacationVariables(vacation: IVacation, user: IUser, tenantName: string, vacationNumber: string): PdfVariables {
  const nombreCompleto = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Usuario";

  const fechaDesde = formatDateOnly(vacation.startDate);
  const fechaHasta = formatDateOnly(vacation.endDate);
  const dias = vacation.daysRequested.toString();

  // Additional vacation specific variables
  const anio = vacation.startDate ? new Date(vacation.startDate).getFullYear().toString() : new Date().getFullYear().toString();
  const fechaInicio = fechaDesde;
  const fechaFin = fechaHasta;
  
  // Reintegro is usually the day after endDate
  let fechaReintegro = "-";
  if (vacation.endDate) {
    const nextDay = new Date(vacation.endDate);
    nextDay.setDate(nextDay.getDate() + 1);
    fechaReintegro = formatDateOnly(nextDay);
  }

  const numeroPedido = sanitizeHtml(vacationNumber || "-");
  const fechaSolicitud = formatDate(vacation.createdAt);
  const fechaAprobacion = formatDate(vacation.preApprovedAt);
  const descripcion = sanitizeHtml(vacation.reason || (vacation as any).comments || "-");

  return {
    categoria: "Vacaciones",
    subcategoria: "-",
    monto: "-",
    fechaDesde,
    fechaHasta,
    fechaUnica: "-",
    dias,
    anio,
    fechaInicio,
    fechaFin,
    fechaReintegro,
    nombreCompleto: sanitizeHtml(nombreCompleto),
    nombreUsuario: sanitizeHtml(nombreCompleto),
    firma: marcaFirma(sanitizeHtml(nombreCompleto)),
    numeroPedido,
    numeroOrden: numeroPedido,
    fechaSolicitud,
    fechaAprobacion,
    tenantName: sanitizeHtml(tenantName),
    descripcion,
  };
}

// ... keep existing imports or remove if unused for this file, but to be safe I'll replace the functionality.

export function replacePdfVariables(htmlTemplate: string, variables: Record<string, string>): string {
  let result = htmlTemplate;

  Object.entries(variables).forEach(([key, value]) => {
    // Escape special regex chars in key just in case, though variable names are usually simple
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value || "");
  });

  return result;
}

export function getSystemVariables(config: any): Record<string, string> {
  const now = new Date();
  const fecha = now.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const day = now.getDate();
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  const fechaLarga = `${day} de ${month} de ${year}`;

  const ciudad = config?.ciudad || "";
  const fechaCompleta = ciudad ? `${ciudad}, ${fechaLarga}` : fechaLarga;

  return {
    razonSocial: config?.razonSocial || "Razón Social Default",
    cuit: config?.cuit || "00-00000000-0",
    ciudad: config?.ciudad || "Ciudad Default",
    direccion: config?.direccion || "",
    signerName: config?.signerName || "",
    signerRole: config?.signerRole || "",
    fecha: fecha,
    fechaCompleta: fechaCompleta,
  };
}

export function getDummyVariables(code: string): Record<string, string> {
  const defaults: Record<string, string> = {
    nombreUsuario: "Juan Pérez",
    nombreCompleto: "Juan Pérez",
    firma: marcaFirma("Juan Pérez"),
    numeroOrden: "ORD-12345",
    tenantName: "Empresa Demo",
    fechaUnica: "10/03/2024, 11/03/2024",
    fechas: "10/03/2024, 11/03/2024",
    fechasMultiples: "10/03/2024, 11/03/2024",
    textoAdicional: "[Aquí aparecerá el texto personalizado redactado al aprobar el pedido]",
  };

  const normalizedCode = code.toLowerCase();

  switch (normalizedCode) {
    case "dinero":
      return {
        ...defaults,
        categoria: "Viáticos",
        subcategoria: "Almuerzo",
        monto: "$ 15.000,00",
        motivo: "Reintegro de gastos de almuerzo corporativo",
        descripcion: "Reintegro de gastos de almuerzo corporativo",
      };
    case "fecharango":
      return {
        ...defaults,
        categoria: "Licencia",
        subcategoria: "Estudio",
        fechaDesde: "01/03/2024",
        fechaHasta: "05/03/2024",
        fechaUnica: "01/03/2024, 02/03/2024, 03/03/2024, 04/03/2024, 05/03/2024",
        fechas: "01/03/2024, 02/03/2024, 03/03/2024, 04/03/2024, 05/03/2024",
        fechasMultiples: "01/03/2024, 02/03/2024, 03/03/2024, 04/03/2024, 05/03/2024",
        dias: "5",
        descripcion: "Licencia por examen universitario",
      };
    case "fechasmultiples":
    case "fechaunica":
      return {
        ...defaults,
        categoria: "Compensatorio",
        subcategoria: "",
        fechaUnica: "10/03/2024, 11/03/2024",
        descripcion: "Días compensatorios por guardia fin de semana",
      };
    case "vacaciones":
      return {
        ...defaults,
        dias: "14",
        anio: "2024",
        fechaInicio: "01/01/2024",
        fechaFin: "14/01/2024",
        fechaReintegro: "15/01/2024",
        fechaDesde: "01/01/2024",
        fechaHasta: "14/01/2024",
        descripcion: "Vacaciones anuales correspondientes al periodo 2023",
      };
    case "objeto":
      return {
        ...defaults,
        categoria: "Electrónica",
        subcategoria: "Computadoras",
        objeto: "Notebook Dell Latitude",
        descripcion: "Solicitud de equipo para nuevo ingreso",
      };
    case "otros":
      return {
        ...defaults,
        categoria: "General",
        subcategoria: "Varios",
        detalle: "Solicitud de prueba genérica",
        descripcion: "Solicitud de prueba genérica para validación de flujo",
      };
    case "datospersonales":
      return {
        ...defaults,
        categoria: "Datos personales",
        datosModificados: '<ul style="margin:0;padding-left:18px;"><li><strong>Teléfono:</strong> 11 2233-4455</li><li><strong>Calle:</strong> Av. Siempre Viva</li><li><strong>Banco:</strong> BANCO DE LA NACION ARGENTINA</li></ul>',
        descripcion: "Solicitud de modificación de datos personales",
      };
    default:
      return defaults;
  }
}

// ... existing prepareVariables functions should be updated to return Record<string, string>
// I will keep them but cast the return or update interface logic if needed outside.
// To avoid breaking existing code in pdfGenerator which imports them with specific interface,
// I will leave the interface definition but changing replacePdfVariables signature might break it if it expects strictly PdfVariables.
// Actually, PdfVariables IS a Record<string, string> compatible shape if keys are string.
// But earlier it was: function replacePdfVariables(htmlTemplate: string, variables: PdfVariables)
// So I will make generic: (htmlTemplate: string, variables: PdfVariables | Record<string, string>)
