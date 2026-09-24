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

/** Un PUESTO del equipo: su rol empresa y, si ya se sabe, la persona (`userId: null` = sin asignar). */
export interface Integrante {
  _id: string;
  userId: string | null;
  /** Vacío si el puesto está sin asignar. */
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
  /** `personal`: de un supervisor, en un proyecto (móvil). `general`: del escritorio, sin proyecto. */
  alcance?: "personal" | "general";
  /** `null` en las generales. */
  projectId: string | null;
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
  projectId: string | null;
  alcance: "personal" | "general";
  nombreContrato: string;
  areaShiftAssignments: AreaTurno[];
  inTime: string;
  outTime: string;
  integrantes: number;
  /** Puestos sin persona: se completan al contratar o se excluyen. */
  sinAsignar: number;
  ultimaContratacionEl: string | null;
}

/** Los valores comunes (sin integrantes) que se pueden mandar al crear o editar. */
export type ComunesPlantilla = Partial<Omit<Plantilla, "_id" | "integrantes" | "ultimaContratacionEl">>;

/** Un puesto nuevo: con persona, o sólo con su rol (y `cantidad` para repetirlo: «2 cámaras»). */
export interface NuevoIntegrante {
  userId?: string | null;
  cantidad?: number;
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
  /** Para un puesto sin asignar: quién lo ocupa en esta contratación. */
  userId?: string;
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

/** El CRUD de plantillas y de sus puestos, contra una base (`/plantillas-equipo` o `/plantillas-equipo-generales`). */
const crudDe = (base: string) => ({
  async listar(projectId: string): Promise<PlantillaResumen[]> {
    const { data } = await axios.get(`${base}`, { params: { projectId } });
    return Array.isArray(data) ? data : [];
  },
  async obtener(id: string): Promise<Plantilla> {
    return (await axios.get(`${base}/${id}`)).data;
  },
  async crear(datos: ComunesPlantilla & { projectId?: string; nombre: string; integrantes?: NuevoIntegrante[] }): Promise<Plantilla> {
    return (await axios.post(`${base}`, datos)).data;
  },
  async actualizar(id: string, datos: ComunesPlantilla): Promise<Plantilla> {
    return (await axios.put(`${base}/${id}`, datos)).data;
  },
  async borrar(id: string): Promise<void> {
    await axios.delete(`${base}/${id}`);
  },
  async duplicar(id: string, nombre?: string): Promise<Plantilla> {
    return (await axios.post(`${base}/${id}/duplicar`, { nombre })).data;
  },
  async agregarIntegrantes(id: string, integrantes: NuevoIntegrante[]): Promise<Plantilla> {
    return (await axios.post(`${base}/${id}/integrantes`, { integrantes })).data;
  },
  /** `null` o "" en un campo = volver al valor del equipo. */
  async actualizarIntegrante(id: string, integranteId: string, datos: Partial<NuevoIntegrante> & { orden?: number }): Promise<Plantilla> {
    return (await axios.put(`${base}/${id}/integrantes/${integranteId}`, datos)).data;
  },
  async quitarIntegrante(id: string, integranteId: string): Promise<Plantilla> {
    return (await axios.delete(`${base}/${id}/integrantes/${integranteId}`)).data;
  },
  /** Cambia a una persona por otra PARA SIEMPRE (no es el «¿Reemplazo?» de una solicitud). */
  async reemplazarIntegrante(id: string, integranteId: string, userId: string): Promise<Plantilla> {
    return (await axios.post(`${base}/${id}/integrantes/${integranteId}/reemplazar`, { userId })).data;
  },
});

/** MÓVIL: las plantillas PERSONALES de quien usa la app, y las generales para copiarlas. */
export const plantillasEquipoAPI = {
  ...crudDe("/plantillas-equipo"),
  async preview(id: string, pedido: PedidoDeContratacion): Promise<Preview> {
    return (await axios.post(`/plantillas-equipo/${id}/preview`, pedido)).data;
  },
  /** Las generales del escritorio (sin proyecto ni personas), para elegir una y «Usarla». */
  async listarGenerales(): Promise<PlantillaResumen[]> {
    const { data } = await axios.get(`/plantillas-equipo/generales`);
    return Array.isArray(data) ? data : [];
  },
  async obtenerGeneral(id: string): Promise<Plantilla> {
    return (await axios.get(`/plantillas-equipo/generales/${id}`)).data;
  },
  /** Copia una general como plantilla PERSONAL en ese proyecto. Devuelve la copia. */
  async usarGeneral(id: string, projectId: string, nombre?: string): Promise<Plantilla> {
    return (await axios.post(`/plantillas-equipo/generales/${id}/usar`, { projectId, nombre })).data;
  },
  /** Todo o nada. La misma `idempotencyKey` en un reintento devuelve el lote ya creado. */
  async contratar(id: string, pedido: PedidoDeContratacion, idempotencyKey: string): Promise<ResultadoContratacion> {
    return (await axios.post(`/plantillas-equipo/${id}/contratar`, { ...pedido, idempotencyKey })).data;
  },
};

/** ESCRITORIO: las plantillas GENERALES (Contratación → Plantillas). */
export const plantillasGeneralesAPI = crudDe("/plantillas-equipo-generales");
