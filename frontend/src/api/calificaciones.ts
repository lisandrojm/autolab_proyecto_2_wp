import axios from "./axiosConfig";

/**
 * Calificaciones de las personas: de 1 a 5 estrellas, sin el 3 (no se quieren intermedias), con
 * comentario opcional. La de una persona es el promedio de todas las suyas (0 = sin calificar).
 * Reglas en el server: `models/Calificacion.ts`.
 */
export const ESTRELLAS_ELEGIBLES = [1, 2, 4, 5];

export type OrigenCalificacion = "fin_contrato" | "equipos" | "usuarios" | "solicitud_renovacion";

export const TEXTO_ORIGEN: Record<OrigenCalificacion, string> = {
  fin_contrato: "Fin de contrato",
  equipos: "Equipos",
  usuarios: "Usuarios",
  solicitud_renovacion: "Solicitud de renovación",
};

export interface ResumenCalificacion {
  /** 0 a 5 con un decimal; 0 = sin calificaciones. */
  promedio: number;
  cantidad: number;
}

export interface Calificacion {
  _id: string;
  estrellas: number;
  comentario: string;
  origen: OrigenCalificacion;
  /** Sólo en las de fin de contrato. */
  decision?: "renovar" | "dejar_vencer";
  proyectoNombre: string;
  fechaBajaContrato?: string;
  calificadoPorNombre: string;
  createdAt: string;
}

export interface HistorialCalificaciones extends ResumenCalificacion {
  calificaciones: Calificacion[];
}

export interface NuevaCalificacion {
  estrellas: number;
  comentario?: string;
}

export const calificacionesAPI = {
  // ── Escritorio (Usuarios, Solicitudes) ──
  async resumen(userIds: string[]): Promise<Record<string, ResumenCalificacion>> {
    if (userIds.length === 0) return {};
    const { data } = await axios.post(`/calificaciones/resumen`, { userIds });
    return data?.resumen || {};
  },
  async historial(userId: string): Promise<HistorialCalificaciones> {
    const { data } = await axios.get(`/calificaciones/usuario/${userId}`);
    return data;
  },
  async calificar(userId: string, c: NuevaCalificacion, origen: "usuarios" | "solicitud_renovacion" = "usuarios", solicitudId?: string): Promise<void> {
    await axios.post(`/calificaciones`, { userId, ...c, origen, solicitudId });
  },

  // ── Equipos (móvil): sólo la gente de un proyecto a cargo ──
  async resumenEquipo(projectId: string): Promise<Record<string, ResumenCalificacion>> {
    const { data } = await axios.get(`/calificaciones/equipo/${projectId}/resumen`);
    return data?.resumen || {};
  },
  async historialEquipo(projectId: string, userId: string): Promise<HistorialCalificaciones> {
    const { data } = await axios.get(`/calificaciones/equipo/${projectId}/usuario/${userId}`);
    return data;
  },
  async calificarEquipo(projectId: string, userId: string, c: NuevaCalificacion): Promise<void> {
    await axios.post(`/calificaciones/equipo/${projectId}`, { userId, ...c });
  },
};
