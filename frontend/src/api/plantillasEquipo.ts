import axios from "./axiosConfig";

/**
 * PLANTILLAS DE EQUIPO: un grupo fijo de personas con sus valores, que se contrata de una vez (una
 * solicitud por persona, idénticas a las del alta individual). Reglas en el server:
 * `models/PlantillaEquipo.ts` y `utils/planDeLote.ts`.
 */

export interface AreaTurno {
  areaId: string;
  shiftIds: string[];
}

export interface Integrante {
  _id: string;
  userId: string;
  nombre: string;
  activo: boolean;
  rolesFrame: string[];
  orden: number;
  /** Lo propio de esta persona. `null` = usa el valor del equipo. */
  categoriaSatId: string | null;
  inTime: string | null;
  outTime: string | null;
  dailyRateManual: number | null;
  escalaAlFijar: number | null;
  comentarios: string | null;
  reemplazadoDePersonaId: string | null;
  reemplazadoDeNombre: string;
  reemplazadoEl: string | null;
}

export interface Plantilla {
  _id: string;
  projectId: string;
  nombre: string;
  empresaContratoId: string | null;
  convenioId: string | null;
  contratoId: string | null;
  nombreContrato: string;
  tipoImpositivo: string;
  areaShiftAssignments: AreaTurno[];
  inTime: string;
  outTime: string;
  diasSemana: number[];
  diasPorSemana: number | null;
  diasRotativos: boolean;
  comentarios: string;
  integrantes: Integrante[];
  ultimaContratacionEl: string | null;
}

export interface PlantillaResumen {
  _id: string;
  nombre: string;
  projectId: string;
  nombreContrato: string;
  areaShiftAssignments: AreaTurno[];
  inTime: string;
  outTime: string;
  integrantes: number;
  ultimaContratacionEl: string | null;
}

/** Los valores comunes (sin integrantes) que se pueden mandar al crear o editar. */
export type ComunesPlantilla = Partial<Omit<Plantilla, "_id" | "integrantes" | "ultimaContratacionEl">>;

export interface NuevoIntegrante {
  userId: string;
  rolesFrame?: string[];
  categoriaSatId?: string | null;
  inTime?: string | null;
  outTime?: string | null;
  dailyRateManual?: number | null;
  comentarios?: string | null;
}

/** Lo que se pisa SÓLO en esta contratación, por integrante (`_id` del integrante). */
export interface Puntual {
  excluido?: boolean;
  categoriaSatId?: string;
  inTime?: string;
  outTime?: string;
  dailyRate?: number;
  fechas?: string[];
  isReplacement?: boolean;
  motivoReemplazoId?: string;
  replacedUserId?: string;
  empleado_id_reemplezado?: string | number;
}

export interface PedidoDeContratacion {
  fechas?: string[];
  desde?: string;
  hasta?: string;
  jornadasRotativos?: number;
  puntuales: Record<string, Puntual>;
}

export interface FilaPreview {
  integranteId: string;
  userId: string;
  nombre: string;
  excluido: boolean;
  categoriaSatId: string;
  categoriaNombre: string;
  inTime: string;
  outTime: string;
  jornadas: number;
  importes: { jornada: number | null; semana: number | null; mensual: number | null; total: number | null };
  origenImporte: "puntual" | "plantilla" | "escala" | "servicios";
  errores: string[];
  advertencias: string[];
  superposicionHorario: boolean;
  fechasTrabajadas: string[];
  desde: string;
  hasta: string;
  comentarios: string;
}

export interface Preview {
  filas: FilaPreview[];
  totales: { personas: number; jornadas: number; importe: number; conErrores: number; conAdvertencias: number };
  /** Lo que impide contratar el lote entero. */
  errores: string[];
}

export interface ResultadoContratacion {
  repetido: boolean;
  loteId: string;
  solicitudIds: string[];
  totales: { personas: number; jornadas: number; importe: number };
  nombrePlantilla: string;
}

export const plantillasEquipoAPI = {
  async listar(projectId: string): Promise<PlantillaResumen[]> {
    const { data } = await axios.get(`/plantillas-equipo`, { params: { projectId } });
    return Array.isArray(data) ? data : [];
  },
  async obtener(id: string): Promise<Plantilla> {
    return (await axios.get(`/plantillas-equipo/${id}`)).data;
  },
  async crear(datos: ComunesPlantilla & { projectId: string; nombre: string; integrantes?: NuevoIntegrante[] }): Promise<Plantilla> {
    return (await axios.post(`/plantillas-equipo`, datos)).data;
  },
  async actualizar(id: string, datos: ComunesPlantilla): Promise<Plantilla> {
    return (await axios.put(`/plantillas-equipo/${id}`, datos)).data;
  },
  async borrar(id: string): Promise<void> {
    await axios.delete(`/plantillas-equipo/${id}`);
  },
  async duplicar(id: string, nombre?: string): Promise<Plantilla> {
    return (await axios.post(`/plantillas-equipo/${id}/duplicar`, { nombre })).data;
  },
  async agregarIntegrantes(id: string, integrantes: NuevoIntegrante[]): Promise<Plantilla> {
    return (await axios.post(`/plantillas-equipo/${id}/integrantes`, { integrantes })).data;
  },
  /** `null` o "" en un campo = volver al valor del equipo. */
  async actualizarIntegrante(id: string, integranteId: string, datos: Partial<NuevoIntegrante> & { orden?: number }): Promise<Plantilla> {
    return (await axios.put(`/plantillas-equipo/${id}/integrantes/${integranteId}`, datos)).data;
  },
  async quitarIntegrante(id: string, integranteId: string): Promise<Plantilla> {
    return (await axios.delete(`/plantillas-equipo/${id}/integrantes/${integranteId}`)).data;
  },
  /** Cambia a una persona por otra PARA SIEMPRE (no es el «¿Reemplazo?» de una solicitud). */
  async reemplazarIntegrante(id: string, integranteId: string, userId: string): Promise<Plantilla> {
    return (await axios.post(`/plantillas-equipo/${id}/integrantes/${integranteId}/reemplazar`, { userId })).data;
  },
  async preview(id: string, pedido: PedidoDeContratacion): Promise<Preview> {
    return (await axios.post(`/plantillas-equipo/${id}/preview`, pedido)).data;
  },
  /** Todo o nada. La misma `idempotencyKey` en un reintento devuelve el lote ya creado. */
  async contratar(id: string, pedido: PedidoDeContratacion, idempotencyKey: string): Promise<ResultadoContratacion> {
    return (await axios.post(`/plantillas-equipo/${id}/contratar`, { ...pedido, idempotencyKey })).data;
  },
};
