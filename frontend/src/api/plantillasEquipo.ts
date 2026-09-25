import axios from "./axiosConfig";

/**
 * PLANTILLAS DE EQUIPO: un grupo fijo de personas con sus valores, que se contrata de una vez (una
 * solicitud por persona, idénticas a las del alta individual). Reglas en el server:
 * `models/PlantillaEquipo.ts` y `utils/planDeLote.ts`.
 */

/**
 * Un PUESTO de la plantilla: su rol, su área y turno, su horario y sus días (todo por puesto: una
 * plantilla cubre varias áreas y turnos), su categoría y, si se fijó, su importe. Quién lo ocupa lo dice
 * cada EQUIPO.
 */
export interface Puesto {
  _id: string;
  rolesFrame: string[];
  orden: number;
  areaId: string | null;
  shiftId: string | null;
  inTime: string | null;
  outTime: string | null;
  diasSemana: number[];
  diasPorSemana: number | null;
  diasRotativos: boolean;
  categoriaSatId: string | null;
  dailyRateManual: number | null;
  escalaAlFijar: number | null;
  comentarios: string | null;
  /** El tipo de contrato de quien lo ocupe (en las plantillas viejas, el que era de toda la plantilla). */
  contratoId: string | null;
  nombreContrato: string;
  tipoImpositivo: string;
}

/** Lo que un equipo pisa de un puesto (sólo lo que difiere; lo demás sale del puesto). */
export type Condiciones = Partial<Pick<Puesto, "areaId" | "shiftId" | "inTime" | "outTime" | "diasSemana" | "diasPorSemana" | "diasRotativos" | "categoriaSatId" | "dailyRateManual" | "escalaAlFijar" | "comentarios" | "contratoId" | "nombreContrato" | "tipoImpositivo">>;

/** Quién ocupa un puesto en un equipo y con qué condiciones propias. */
export interface Asignacion {
  puestoId: string;
  /** `null` = sin persona, pero con condiciones propias en este equipo. */
  userId: string | null;
  nombre: string;
  condiciones: Condiciones | null;
  /** El equipo no usa este puesto (sigue en la plantilla para los demás equipos). */
  excluido: boolean;
  activo: boolean;
  reemplazadoDePersonaId: string | null;
  reemplazadoDeNombre: string;
  reemplazadoEl: string | null;
}

/** Un equipo guardado dentro de la plantilla («Semana A»): quién ocupa cada puesto y con qué condiciones. */
export interface Equipo {
  _id: string;
  nombre: string;
  ultimaContratacionEl: string | null;
  asignaciones: Asignacion[];
  /** Por puesto: la misma persona en dos puestos que se pisan. Avisos, no bloquean. */
  avisos: Record<string, string[]>;
}

/** El puesto tal como lo ocupa ese equipo: lo del puesto, pisado por las condiciones del equipo. */
export const puestoEnEquipo = (puesto: Puesto, equipo?: Equipo | null): Puesto => {
  const c = equipo?.asignaciones.find((a) => a.puestoId === puesto._id)?.condiciones;
  return c ? { ...puesto, ...c } : puesto;
};

/** ¿El equipo usa ese puesto? */
export const usaElPuesto = (equipo: Equipo | null | undefined, puestoId: string) => !equipo?.asignaciones.some((a) => a.puestoId === puestoId && a.excluido);

/** Los puestos que usa ese equipo, como los ocupa (sin los que sacó). */
export const puestosDelEquipo = (plantilla: Plantilla, equipo?: Equipo | null): Puesto[] => plantilla.integrantes.filter((p) => usaElPuesto(equipo, p._id)).map((p) => puestoEnEquipo(p, equipo));

export interface Plantilla {
  _id: string;
  /** `personal`: de un supervisor, en un proyecto (móvil). `general`: del escritorio, sin proyecto. */
  alcance?: "personal" | "general";
  /** `null` en las generales. */
  projectId: string | null;
  nombre: string;
  empresaContratoId: string | null;
  convenioId: string | null;
  /** VIEJO: el tipo de contrato ahora va por puesto (`Puesto.contratoId`). */
  contratoId: string | null;
  nombreContrato: string;
  tipoImpositivo: string;
  comentarios: string;
  /** Los puestos (el nombre del campo es histórico). */
  integrantes: Puesto[];
  equipos: Equipo[];
  ultimaContratacionEl: string | null;
}

export interface PlantillaResumen {
  _id: string;
  nombre: string;
  projectId: string | null;
  alcance: "personal" | "general";
  /** Los tipos de contrato de sus puestos, juntos («Jornada · Plazo fijo»). */
  nombreContrato: string;
  puestos: number;
  /** `propias` = puestos con condiciones propias en ese equipo; `avisos` = puestos que se pisan. */
  /** `puestos` = los que usa ese equipo (la plantilla menos los que sacó). */
  equipos: { _id: string; nombre: string; asignados: number; puestos: number; propias: number; avisos: number; ultimaContratacionEl: string | null }[];
  ultimaContratacionEl: string | null;
}

/** Lo de la hoja general que se puede mandar al crear o editar. */
/** `projectId` en una personal = pasarla a otro proyecto (los puestos pierden área y turno). */
export type ComunesPlantilla = Partial<Pick<Plantilla, "projectId" | "nombre" | "empresaContratoId" | "convenioId" | "contratoId" | "nombreContrato" | "tipoImpositivo" | "comentarios">>;

/** Un puesto nuevo (o los cambios de uno). `cantidad` lo repite («2 cámaras»); `userId` lo asigna en el equipo. */
export interface NuevoPuesto {
  rolesFrame?: string[];
  cantidad?: number;
  userId?: string;
  areaId?: string | null;
  shiftId?: string | null;
  inTime?: string | null;
  outTime?: string | null;
  diasSemana?: number[];
  diasPorSemana?: number | null;
  diasRotativos?: boolean;
  categoriaSatId?: string | null;
  dailyRateManual?: number | null;
  comentarios?: string | null;
  contratoId?: string | null;
  nombreContrato?: string | null;
  tipoImpositivo?: string | null;
  orden?: number;
}

/** Lo que se pisa SÓLO en esta contratación, por integrante (`_id` del integrante). */
export interface Puntual {
  excluido?: boolean;
  /** Quién ocupa el puesto ESTA vez, en lugar de la persona del equipo (o si está sin asignar). */
  userId?: string;
  /** Días rotativos: las jornadas de este puesto. */
  jornadas?: number;
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
  /** El equipo elegido: de ahí sale quién ocupa cada puesto. */
  equipoId?: string;
  /** Lo cambiado esta vez (personas, horario, categoría, importe) queda también en el equipo. */
  guardarEnEquipo?: boolean;
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
  /** El tipo de contrato de ese puesto. */
  nombreContrato: string;
  porDiasSueltos: boolean;
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
  async actualizar(id: string, datos: ComunesPlantilla): Promise<Plantilla> {
    return (await axios.put(`${base}/${id}`, datos)).data;
  },
  async borrar(id: string): Promise<void> {
    await axios.delete(`${base}/${id}`);
  },
  async duplicar(id: string, nombre?: string): Promise<Plantilla> {
    return (await axios.post(`${base}/${id}/duplicar`, { nombre })).data;
  },
  async crear(datos: ComunesPlantilla & { projectId?: string; nombre: string; puestos?: NuevoPuesto[] }): Promise<Plantilla> {
    return (await axios.post(`${base}`, datos)).data;
  },
  async agregarPuestos(id: string, puestos: NuevoPuesto[], equipoId?: string): Promise<Plantilla> {
    return (await axios.post(`${base}/${id}/puestos`, { puestos, equipoId })).data;
  },
  /** `null` o "" en un campo = sin ese dato. */
  async actualizarPuesto(id: string, puestoId: string, datos: NuevoPuesto): Promise<Plantilla> {
    return (await axios.put(`${base}/${id}/puestos/${puestoId}`, datos)).data;
  },
  async quitarPuesto(id: string, puestoId: string): Promise<Plantilla> {
    return (await axios.delete(`${base}/${id}/puestos/${puestoId}`)).data;
  },
});

/** MÓVIL: las plantillas PERSONALES de quien usa la app, y las generales para copiarlas. */
export const plantillasEquipoAPI = {
  ...crudDe("/plantillas-equipo"),
  async preview(id: string, pedido: PedidoDeContratacion): Promise<Preview> {
    return (await axios.post(`/plantillas-equipo/${id}/preview`, pedido)).data;
  },
  // ── Los equipos (quién ocupa cada puesto) ──
  async crearEquipo(id: string, nombre: string, copiarDe?: string): Promise<Plantilla> {
    return (await axios.post(`/plantillas-equipo/${id}/equipos`, { nombre, copiarDe })).data;
  },
  async renombrarEquipo(id: string, equipoId: string, nombre: string): Promise<Plantilla> {
    return (await axios.put(`/plantillas-equipo/${id}/equipos/${equipoId}`, { nombre })).data;
  },
  async borrarEquipo(id: string, equipoId: string): Promise<Plantilla> {
    return (await axios.delete(`/plantillas-equipo/${id}/equipos/${equipoId}`)).data;
  },
  /** `null` deja el puesto sin asignar en ese equipo. */
  async asignar(id: string, equipoId: string, puestoId: string, userId: string | null): Promise<Plantilla> {
    return (await axios.put(`/plantillas-equipo/${id}/equipos/${equipoId}/puestos/${puestoId}`, { userId })).data;
  },
  /**
   * Las condiciones propias de un puesto en un equipo: se manda cómo debería quedar el puesto en ESE
   * equipo y el server guarda sólo lo que difiere. `{ restablecer: true }` vuelve a las del puesto.
   */
  async condiciones(id: string, equipoId: string, puestoId: string, datos: NuevoPuesto | { restablecer: true }): Promise<Plantilla> {
    return (await axios.put(`/plantillas-equipo/${id}/equipos/${equipoId}/puestos/${puestoId}/condiciones`, datos)).data;
  },
  /** `excluido: true` saca el puesto de ESE equipo (sigue en la plantilla); `false` lo vuelve a usar. */
  async usoDelPuesto(id: string, equipoId: string, puestoId: string, excluido: boolean): Promise<Plantilla> {
    return (await axios.put(`/plantillas-equipo/${id}/equipos/${equipoId}/puestos/${puestoId}/uso`, { excluido })).data;
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
  /** «Contratar todos»: el preview de varios equipos, cada uno con sus fechas. */
  async previewVarios(id: string, equipos: PedidoDeContratacion[]): Promise<{ equipos: (Preview & { equipoId: string })[] }> {
    return (await axios.post(`/plantillas-equipo/${id}/preview-varios`, { equipos })).data;
  },
  /** «Contratar todos»: todo o nada, un lote por equipo. */
  async contratarVarios(id: string, equipos: PedidoDeContratacion[], idempotencyKey: string): Promise<{ repetido: boolean; lotes: Omit<ResultadoContratacion, "repetido">[] }> {
    return (await axios.post(`/plantillas-equipo/${id}/contratar-varios`, { equipos, idempotencyKey })).data;
  },
  /** Todo o nada. La misma `idempotencyKey` en un reintento devuelve el lote ya creado. */
  async contratar(id: string, pedido: PedidoDeContratacion, idempotencyKey: string): Promise<ResultadoContratacion> {
    return (await axios.post(`/plantillas-equipo/${id}/contratar`, { ...pedido, idempotencyKey })).data;
  },
};

/** ESCRITORIO: las plantillas GENERALES (Contratación → Plantillas). */
export const plantillasGeneralesAPI = crudDe("/plantillas-equipo-generales");
