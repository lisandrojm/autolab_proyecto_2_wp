import axios from "./axiosConfig";
import type { Alerta, EstadoInvitacion, EstadoVisible, PoblacionPorTipo, Tramo } from "@compartido/vacaciones/campania";

/**
 * CAMPAÑA DE GOCE DE VACACIONES: `/api/v1/campanias-vacaciones` (ver `routes/campaniasVacaciones.ts` en el
 * server). Las reglas (validar una propuesta, alertas de plazo) son las de `@compartido/vacaciones/campania`.
 */

export type { Alerta, EstadoInvitacion, EstadoVisible, Tramo };

export interface Campania {
  _id: string;
  anio: number;
  nombre: string;
  ventanaDesde: string;
  ventanaHasta: string;
  plazoParaDefinirDias: number;
  avisoMinimoDias: number;
  minDiasPorTramo: number;
  fechaLimite?: string | null;
  /** Los tipos del catálogo que invita (vacío = todos los habilitados). Se elige en borrador. */
  tiposContratoInvitar?: string[];
  /** Lo que se usó al lanzar: los tipos que entraron y cuántas personas con días quedaron afuera. */
  /** `id`: el tipo del catálogo (en las lanzadas antes del 23/11/2026, el número de FRAME). */
  lanzamiento?: { todosLosTipos: boolean; tipos: { id: string | number; nombre: string; invitadas: number }[]; excluidas: Excluidas } | null;
  estado: "borrador" | "lanzada" | "cerrada";
  lanzadaAt?: string;
  cerradaAt?: string;
  createdAt: string;
  invitaciones?: { total: number; resueltas: number };
}

export interface Excluidas {
  tipoDeshabilitado: number;
  tipoNoIncluido: number;
  sinContrato: number;
}

/** La vista previa del borrador: la gente con días por tipo de contrato, los tipos sin vacaciones y la selección guardada. */
export interface VistaPreviaDeInvitacion extends PoblacionPorTipo {
  deshabilitados: string[];
  tiposContratoInvitar: string[];
}

export interface VacacionDeTramo {
  _id: string;
  status: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  pdfPreAprobacionUrl?: string;
  signatureStatus?: string;
}

export interface Invitacion {
  _id: string;
  campaniaId: string;
  userId: string;
  nombre: string;
  diasDisponibles: number;
  diasCorridos: boolean;
  fechaLimite: string;
  estado: EstadoInvitacion;
  estadoVisible: EstadoVisible;
  etiquetaEstado: string;
  invitadoAt?: string;
  acuseInvitacionAt?: string | null;
  propuestaAt?: string | null;
  tramos: (Tramo & { dias: number; vacationId?: string; vacacion?: VacacionDeTramo | null })[];
  rechazo?: { motivo?: string; at: string } | null;
  asignacion?: { desde: string; hasta: string; dias: number; sugeridaAt?: string; confirmadaAt?: string; vacationId?: string; problema?: string | null } | null;
  vacacionAsignada?: VacacionDeTramo | null;
  notificacion?: { enviadaAt: string; texto: string; pdfUrls: string[] } | null;
  acuseOtorgamientoAt?: string | null;
  historial: { accion: string; porUserId?: string | null; at: string; detalle?: string }[];
  recordatorios: { at: string; automatico: boolean }[];
  alertas: Alerta[];
}

export interface Tablero {
  campania: Campania;
  invitaciones: Invitacion[];
  conteos: Partial<Record<EstadoVisible, number>>;
  alertas: Alerta[];
  hoy: string;
}

/** Lo que ve la persona en «Elegí tus vacaciones». */
export interface MiInvitacion {
  invitacion: Omit<Invitacion, "estadoVisible" | "etiquetaEstado" | "alertas" | "historial">;
  campania: { _id: string; nombre: string; anio: number; ventanaDesde: string; ventanaHasta: string; avisoMinimoDias: number; minDiasPorTramo: number; fechaLimite: string };
  estadoVisible: EstadoVisible;
  diasDisponibles: number;
  diasParaLaFechaLimite: number;
  puedeProponer: boolean;
  primerInicioPosible: string;
  vacaciones: VacacionDeTramo[];
  pendienteDeAccion: boolean;
  hoy: string;
}

const BASE = "/campanias-vacaciones";

class CampaniasVacacionesAPI {
  async listar(): Promise<Campania[]> {
    const { data } = await axios.get(BASE);
    return data;
  }
  async crear(nombre?: string): Promise<{ campania: Campania; alertas: Alerta[] }> {
    const { data } = await axios.post(BASE, { nombre });
    return data;
  }
  async tablero(id: string): Promise<Tablero> {
    const { data } = await axios.get(`${BASE}/${id}`);
    return data;
  }
  async lanzar(id: string, tiposContratoInvitar?: string[]): Promise<{ invitadas: number; excluidas?: Excluidas; alertas: Alerta[] }> {
    const { data } = await axios.post(`${BASE}/${id}/lanzar`, tiposContratoInvitar ? { tiposContratoInvitar } : {});
    return data;
  }
  async vistaPrevia(id: string): Promise<VistaPreviaDeInvitacion> {
    const { data } = await axios.get(`${BASE}/${id}/vista-previa`);
    return data;
  }
  async guardarTiposContrato(id: string, tiposContratoInvitar: string[]): Promise<{ tiposContratoInvitar: string[] }> {
    const { data } = await axios.put(`${BASE}/${id}/tipos-contrato`, { tiposContratoInvitar });
    return data;
  }
  async recordatorio(id: string): Promise<{ recordadas: number }> {
    const { data } = await axios.post(`${BASE}/${id}/recordatorio`);
    return data;
  }
  async sugerirAsignaciones(id: string): Promise<{ sugeridas: number }> {
    const { data } = await axios.post(`${BASE}/${id}/sugerir-asignaciones`);
    return data;
  }
  async editarAsignacion(id: string, invId: string, tramo: Tramo): Promise<void> {
    await axios.put(`${BASE}/${id}/invitaciones/${invId}/asignacion`, tramo);
  }
  async confirmarAsignaciones(id: string, invitacionIds?: string[]): Promise<{ confirmadas: number; fallas: { invitacionId: string; nombre: string; error: string }[] }> {
    const { data } = await axios.post(`${BASE}/${id}/confirmar-asignaciones`, invitacionIds ? { invitacionIds } : {});
    return data;
  }
  async cerrar(id: string): Promise<Campania> {
    const { data } = await axios.post(`${BASE}/${id}/cerrar`);
    return data;
  }
  async reporte(id: string): Promise<Blob> {
    const { data } = await axios.get(`${BASE}/${id}/reporte.csv`, { responseType: "blob" });
    return data;
  }

  /* ── La persona ── */
  async mia(): Promise<MiInvitacion | null> {
    const { data } = await axios.get(`${BASE}/mia`);
    return data?.invitacion ?? null;
  }
  async acusar(): Promise<MiInvitacion | null> {
    const { data } = await axios.post(`${BASE}/mia/acuse`);
    return data;
  }
  async proponer(tramos: Tramo[]): Promise<MiInvitacion | null> {
    const { data } = await axios.post(`${BASE}/mia/proponer`, { tramos });
    return data;
  }
  /** Cancela la propuesta entera mientras no esté aprobada; después se puede volver a elegir. */
  async cancelarPropuesta(): Promise<MiInvitacion | null> {
    const { data } = await axios.post(`${BASE}/mia/cancelar-propuesta`);
    return data;
  }
  async acusarOtorgamiento(): Promise<MiInvitacion | null> {
    const { data } = await axios.post(`${BASE}/mia/acuse-otorgamiento`);
    return data;
  }
}

export const campaniasVacacionesAPI = new CampaniasVacacionesAPI();

export const errorDeCampania = (err: any): string => err?.response?.data?.error || err?.message || "Error";
