import axios from "./axiosConfig";
import type { Aviso } from "@compartido/planVacaciones/validarPlan";
import type { EstadoItem, EstadoPlan } from "@compartido/planVacaciones/estado";

/**
 * PLAN DE VACACIONES POR PROYECTO: `/api/v1/planes-vacaciones` (ver `routes/planVacaciones.ts` en el server).
 * Cada acción devuelve el plan completo ya recalculado (grupos, avisos, cobertura, permisos): la
 * pantalla reemplaza su estado con la respuesta y no vuelve a pedir nada.
 */

export type { Aviso, EstadoItem, EstadoPlan };

export interface GrupoDelMiembro {
  areaId: string;
  shiftId: string;
  /** La sede de la fila área × turno × sede, o null/ausente = todas las sedes. */
  sedeId?: number | null;
  rolFrameId: string | null;
  nombreRol: string;
}

export interface MiembroDelPlan {
  userId: string;
  nombre: string;
  grupos: GrupoDelMiembro[];
  diasDisponibles: number;
  diasTotales: number;
  contratoVigenteHasta: string | null;
  empresaContratoId?: string | null;
  tipoContratoId?: number | null;
  horaInicio?: string;
  horaFin?: string;
}

export interface ItemDelPlan {
  _id: string;
  userId: string;
  areaId: string;
  shiftId: string;
  /** La sede de la fila área × turno × sede, o null/ausente = todas las sedes. */
  sedeId?: number | null;
  rolFrameId: string | null;
  nombreRol: string;
  mes: string;
  desde: string;
  hasta: string;
  dias: number;
  diasDisponiblesAlPlanificar: number;
  ajustadoAMano: boolean;
  estado: EstadoItem;
  motivoRechazo?: string;
  enviadoAt?: string;
  aprobadoAt?: string;
  rechazadoAt?: string;
  vacationId?: string;
  canceladoAt?: string;
}

export interface ReemplazoDelPlan {
  _id: string;
  areaId: string;
  shiftId: string;
  /** La sede de la fila área × turno × sede, o null/ausente = todas las sedes. */
  sedeId?: number | null;
  rolFrameId: string | null;
  nombreRol: string;
  mes: string;
  userId: string;
  contratoId: string;
  nombreContrato: string;
  desde: string;
  hasta: string;
  cubreA: Array<{ userId: string; desde: string; hasta: string }>;
  solicitudId?: string;
  estado: "propuesto" | "solicitado" | "cancelado";
  creadoAt: string;
}

export interface GrupoDelPlan {
  clave: string;
  areaId: string;
  areaNombre: string;
  shiftId: string;
  shiftNombre: string;
  sedeId?: number | null;
  /** «Libertador»; vacío sin sede. */
  sedeNombre?: string;
  rolFrameId: string | null;
  nombreRol: string;
  userIds: string[];
}

export interface CoberturaDeCelda {
  dias: number;
  diasConAlguienAfuera: number;
  diasSinNadie: number;
  ausentesPorDia: number[];
}

export interface PlanVacaciones {
  _id: string;
  projectId: string;
  proyecto: { _id: string; name: string };
  nombre: string;
  ventanaDesde: string;
  ventanaHasta: string;
  anioDeSaldo: number;
  topeDiasPorPersona: number;
  estado: EstadoPlan;
  equipo: MiembroDelPlan[];
  equipoActualizadoAt: string;
  items: ItemDelPlan[];
  reemplazos: ReemplazoDelPlan[];
  creadoPor: string;
  enviadoAt?: string;
  cerradoAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Lo que arma el server para dibujar. */
  meses: string[];
  grupos: GrupoDelPlan[];
  areas: Array<{ _id: string; name: string }>;
  shifts: Array<{ _id: string; name: string; startTime: string; endTime: string }>;
  avisos: Aviso[];
  cobertura: Record<string, Record<string, CoberturaDeCelda>>;
  permisos: { puedeEditar: boolean; puedeAprobar: boolean; esCoordinador: boolean };
  reemplazo?: { solicitudId: string; reemplazoId: string; avisos: string[] };
  /** Extras de la última acción. */
  reparto?: { bloques: number; salteados: Array<{ userId: string; nombre: string; motivo: string }> };
  resultado?: { aprobados: number; fallidos: Array<{ itemId: string; nombre: string; motivo: string }> };
  quitados?: number;
  enviados?: number;
  itemId?: string;
}

export interface PlanResumen {
  _id: string;
  projectId: string;
  proyecto: string;
  nombre: string;
  ventanaDesde: string;
  ventanaHasta: string;
  anioDeSaldo: number;
  topeDiasPorPersona: number;
  estado: EstadoPlan;
  enviadoAt?: string;
  createdAt: string;
  updatedAt: string;
  contadores: { total: number; propuestos: number; enviados: number; aprobados: number; rechazados: number; cancelados: number; reemplazos: number };
}

export interface EquipoParaPlan {
  proyecto: { _id: string; name: string };
  equipo: MiembroDelPlan[];
  grupos: GrupoDelPlan[];
  areas: Array<{ _id: string; name: string }>;
  shifts: Array<{ _id: string; name: string; startTime: string; endTime: string }>;
  sinGrupo: Array<{ userId: string; nombre: string }>;
}

/** Lo que se manda para pedir (o previsualizar) el reemplazo mensual de un rol en un mes. */
export interface PedidoReemplazo extends ClaveDeGrupo {
  mes: string;
  userId: string;
  contratoId: string;
  nombreContrato?: string;
  tipoImpositivo?: string;
  categoriaSatId?: string;
  dailyRate?: number;
  motivoReemplazoId?: string;
  comentarios?: string;
}

export interface PreviewReemplazo {
  cubreA: Array<{ userId: string; nombre: string; desde: string; hasta: string }>;
  avisos: string[];
  resumen: { persona: string; nombreContrato: string; desde: string; hasta: string; jornadas: number; dailyRate: number; importes: { jornada: number | null; semana: number | null; mensual: number | null; total: number | null }; esServicios: boolean; motivo: string | null };
}

export interface ClaveDeGrupo {
  areaId: string;
  shiftId: string;
  /** La sede de la fila área × turno × sede, o null/ausente = todas las sedes. */
  sedeId?: number | null;
  rolFrameId: string | null;
  nombreRol?: string;
}

const BASE = "/planes-vacaciones";

class PlanVacacionesAPI {
  async listar(params: { projectId?: string; estado?: string; pendientesDeMi?: boolean } = {}): Promise<PlanResumen[]> {
    const { data } = await axios.get(BASE, { params: { ...params, pendientesDeMi: params.pendientesDeMi ? "true" : undefined } });
    return data;
  }
  async equipoParaPlan(projectId: string, anioDeSaldo: number): Promise<EquipoParaPlan> {
    const { data } = await axios.get(`${BASE}/proyectos/${projectId}/equipo-para-plan`, { params: { anioDeSaldo } });
    return data;
  }
  async crear(body: { projectId: string; nombre?: string; ventanaDesde: string; ventanaHasta: string; anioDeSaldo?: number; topeDiasPorPersona?: number }): Promise<PlanVacaciones> {
    const { data } = await axios.post(BASE, body);
    return data;
  }
  async obtener(planId: string): Promise<PlanVacaciones> {
    const { data } = await axios.get(`${BASE}/${planId}`);
    return data;
  }
  async actualizar(planId: string, body: { nombre?: string; ventanaDesde?: string; ventanaHasta?: string; anioDeSaldo?: number; topeDiasPorPersona?: number }): Promise<PlanVacaciones> {
    const { data } = await axios.patch(`${BASE}/${planId}`, body);
    return data;
  }
  async eliminar(planId: string): Promise<void> {
    await axios.delete(`${BASE}/${planId}`);
  }
  async cancelar(planId: string): Promise<PlanVacaciones> {
    const { data } = await axios.post(`${BASE}/${planId}/cancelar`, {});
    return data;
  }
  async refrescarEquipo(planId: string): Promise<PlanVacaciones> {
    const { data } = await axios.post(`${BASE}/${planId}/refrescar-equipo`, {});
    return data;
  }
  async asignarMes(planId: string, body: ClaveDeGrupo & { mes: string; orden?: string[] }): Promise<PlanVacaciones> {
    const { data } = await axios.post(`${BASE}/${planId}/asignar-mes`, body);
    return data;
  }
  async quitarAsignacion(planId: string, body: ClaveDeGrupo & { mes: string }): Promise<PlanVacaciones> {
    const { data } = await axios.delete(`${BASE}/${planId}/asignaciones`, { data: body });
    return data;
  }
  async crearItem(planId: string, body: ClaveDeGrupo & { userId: string; desde: string; hasta: string }): Promise<PlanVacaciones> {
    const { data } = await axios.post(`${BASE}/${planId}/items`, body);
    return data;
  }
  async actualizarItem(planId: string, itemId: string, body: { desde?: string; hasta?: string }): Promise<PlanVacaciones> {
    const { data } = await axios.patch(`${BASE}/${planId}/items/${itemId}`, body);
    return data;
  }
  async eliminarItem(planId: string, itemId: string): Promise<PlanVacaciones> {
    const { data } = await axios.delete(`${BASE}/${planId}/items/${itemId}`);
    return data;
  }
  async enviar(planId: string, itemIds?: string[]): Promise<PlanVacaciones> {
    const { data } = await axios.post(`${BASE}/${planId}/enviar`, { itemIds });
    return data;
  }
  async aprobarItem(planId: string, itemId: string): Promise<PlanVacaciones> {
    const { data } = await axios.post(`${BASE}/${planId}/items/${itemId}/aprobar`, {});
    return data;
  }
  async rechazarItem(planId: string, itemId: string, motivo: string): Promise<PlanVacaciones> {
    const { data } = await axios.post(`${BASE}/${planId}/items/${itemId}/rechazar`, { motivo });
    return data;
  }
  async aprobarTodo(planId: string): Promise<PlanVacaciones> {
    const { data } = await axios.post(`${BASE}/${planId}/aprobar-todo`, {});
    return data;
  }
  async previewReemplazo(planId: string, body: PedidoReemplazo): Promise<PreviewReemplazo> {
    const { data } = await axios.post(`${BASE}/${planId}/reemplazos/preview`, body);
    return data;
  }
  async crearReemplazo(planId: string, body: PedidoReemplazo): Promise<PlanVacaciones> {
    const { data } = await axios.post(`${BASE}/${planId}/reemplazos`, body);
    return data;
  }
  async cancelarReemplazo(planId: string, reemplazoId: string, motivo?: string): Promise<PlanVacaciones> {
    const { data } = await axios.delete(`${BASE}/${planId}/reemplazos/${reemplazoId}`, { data: { motivo } });
    return data;
  }
  async cancelarItem(planId: string, itemId: string, body: { motivo?: string; reabrir?: boolean } = {}): Promise<PlanVacaciones> {
    const { data } = await axios.post(`${BASE}/${planId}/items/${itemId}/cancelar`, body);
    return data;
  }
}

export const planVacacionesAPI = new PlanVacacionesAPI();

/** El mensaje de error de una respuesta del server (con sus avisos, si los trae). */
export const errorDe = (err: any): string => {
  const d = err?.response?.data;
  const avisos: Aviso[] = Array.isArray(d?.avisos) ? d.avisos : [];
  const extra = avisos.length > 0 ? ` ${avisos.slice(0, 3).map((a) => a.mensaje).join(" · ")}${avisos.length > 3 ? ` (+${avisos.length - 3})` : ""}` : "";
  return `${d?.error || err?.message || "Error"}${extra}`;
};
