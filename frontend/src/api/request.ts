import axiosClient from "./axiosConfig";

export interface AttendanceRecordInput {
  employeeId: string;
  status?: string;
  absenceReason?: string;
  replacementId?: string;
  overtimeHours?: number;
  replacementOvertimeHours?: number;
  replacementInTime?: string;
  replacementOutTime?: string;
  notes?: string;
  scheduleInTime?: string;
  scheduleOutTime?: string;
  /** De qué área y turno es la fila: sólo cuando la persona va más de una vez en el parte (dos contratos vigentes en turnos distintos). */
  areaId?: any;
  shiftId?: any;
}

export interface AttendanceRecord extends AttendanceRecordInput {
  // Populated fields if any
  employeeId: any; // string or object depending on populate
  replacementId?: any;
}

export interface ActivityReport {
  _id: string;
  reportNumber?: string;
  date: string;
  hasActivity: boolean;
  comments?: string;
  attendance: AttendanceRecord[];
  projectId?: any;
  areaId?: any;
  shiftId?: any;
  /** La sede de la fila (área + sede) del parte; null/ausente = la fila sin sede (principal). */
  sedeId?: number | null;
  submittedAt: string;
  userId?: any;
  tenantId: string;
  createdAt?: string;
  updatedAt?: string;
  /**
   * LOS NÚMEROS YA CONTADOS POR EL SERVER.
   *
   * El listado NO manda `attendance` —lo saca con un `$project` porque eran 4,5 MB— y en su lugar
   * manda estos contadores. `attendance` sigue declarado arriba porque el detalle de UN parte sí lo
   * trae; en la lista viene `undefined`, así que quien la recorra tiene que contemplarlo.
   */
  registros?: number;
  ausentes?: number;
  reemplazos?: number;
  conHorasExtra?: number;
  sumaHorasExtra?: number;
}

export const activityReportsAPI = {
  /** `mine`: fuerza que devuelva SOLO los reportes propios, aunque quien pide sea Admin (ver mobile
   *  "Mis Novedades" — sin esto, un admin dispara un fetch de todo el historial del tenant). */
  /**
   * `mine` son las que cargó la persona; `alcance: "supervisadas"`, las de los proyectos que tiene a
   * cargo (las haya cargado quien las haya cargado). Son excluyentes: el conmutador «Mías / Las que
   * superviso» manda una o la otra.
   */
  getAll: async (params?: { mine?: boolean; alcance?: "supervisadas" }) => {
    const response = await axiosClient.get<ActivityReport[]>("/activity-reports", { params });
    return response.data;
  },

  /**
   * UNA PÁGINA DE NOVEDADES, ya filtrada y con los números de cada fila contados por el server.
   *
   * El listado entero eran 4,5 MB y 27 segundos —720 partes con su detalle de asistencia, que la
   * pantalla bajaba sólo para contar cinco números por fila y filtrar en memoria—. Pidiendo la página
   * que se está mirando son 21 KB y 264 ms, medidos sobre los mismos datos.
   *
   * `totales` son los de la cabecera y van sobre TODO lo filtrado, no sobre la página: si contaran
   * sólo lo que se ve, cambiarían al pasar de página.
   */
  list: async (params: { page?: number; limit?: number; search?: string; projectId?: string; areaId?: string; shiftId?: string } = {}) => {
    const { data } = await axiosClient.get<{
      rows: ActivityReport[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
      totales: { partes: number; ausentes: number; horasExtra: number };
    }>("/activity-reports", { params: { page: params.page ?? 1, limit: params.limit ?? 25, search: params.search || undefined, projectId: params.projectId || undefined, areaId: params.areaId || undefined, shiftId: params.shiftId || undefined } });
    return {
      rows: data?.rows || [],
      pagination: data?.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 },
      totales: data?.totales || { partes: 0, ausentes: 0, horasExtra: 0 },
    };
  },

  create: async (data: any) => {
    const response = await axiosClient.post<ActivityReport>("/activity-reports", data);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await axiosClient.get<ActivityReport>(`/activity-reports/${id}`);
    return response.data;
  },

  delete: async (id: string) => {
    await axiosClient.delete(`/activity-reports/${id}`);
  },

  update: async (id: string, data: any) => {
    const response = await axiosClient.put<ActivityReport>(`/activity-reports/${id}`, data);
    return response.data;
  },

  /**
   * LOS MISMOS FILTROS DE GESTIONAR EQUIPO, RESUELTOS EN EL SERVER.
   *
   * Devuelve QUIÉNES pasan y QUÉ va en cada desplegable, y nada más: 3 KB contra los 2,7 MB del
   * directorio. Vigencia, tipo, estado impositivo y reemplazo dependen del contrato que rige, así
   * que calcularlos acá obligaba a bajarse los contratos de las 1.577 personas del tenant.
   */
  filtrosDePersonas: async (desde: string, hasta: string, filtros: Record<string, string | undefined> = {}) => {
    const params = new URLSearchParams({ desde, hasta });
    Object.entries(filtros).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const response = await axiosClient.get<FiltrosDePersonas>(`/activity-reports/filtros-de-personas?${params.toString()}`);
    return response.data;
  },

  /**
   * La asistencia de TODOS los partes del período, para el reporte de Novedades.
   *
   * El listado (`list`) manda una PÁGINA y sin `attendance` —lo saca a propósito, son 4,5 MB—, así
   * que el reporte no puede contar presentes, ausentes ni horas extra con eso: le daba 0 a todo el
   * mundo. Esto trae sólo los ocho campos que el reporte cuenta, de todo el período.
   */
  asistenciasDelPeriodo: async (desde: string, hasta: string) => {
    const response = await axiosClient.get<ParteConAsistencia[]>(`/activity-reports/asistencias-del-periodo?desde=${desde}&hasta=${hasta}`);
    return Array.isArray(response.data) ? response.data : [];
  },

  /**
   * Los feriados de Configuración › Feriados entre dos fechas, como «AAAA-MM-DD»: en un feriado todas
   * las horas extra van al 100%, como un domingo. No pide el permiso de configurar feriados.
   */
  feriadosDelPeriodo: async (desde: string, hasta: string): Promise<{ fecha: string; nombre: string }[]> => {
    const response = await axiosClient.get<{ feriados: { fecha: string; nombre: string }[] }>(`/activity-reports/feriados-del-periodo?desde=${desde}&hasta=${hasta}`);
    return Array.isArray(response.data?.feriados) ? response.data.feriados : [];
  },

  /**
   * EL CONSOLIDADO DE NOVEDADES (20/11/2026): los datos de las cinco hojas para liquidar, por proyecto.
   * Las extras vienen CRUDAS: el reparto 50/100 y los importes los hace el navegador con su glosario
   * (`utils/consolidadoNovedadesXlsx.ts`), y después pide el archivo a `consolidadoXlsx`.
   */
  consolidado: async (desde: string, hasta: string, proyectoIds: string[]): Promise<ConsolidadoNovedades> => {
    const response = await axiosClient.get<ConsolidadoNovedades>("/activity-reports/consolidado", { params: { desde, hasta, proyectos: proyectoIds.join(",") }, timeout: 120000 });
    return response.data;
  },

  /** Las hojas ya armadas → .xlsx escrito por el server (fila 1 de encabezados, autofiltro, fila congelada). */
  consolidadoXlsx: async (hojas: HojaXlsx[], nombreArchivo: string): Promise<Blob> => {
    const response = await axiosClient.post("/activity-reports/consolidado/xlsx", { hojas, nombreArchivo }, { responseType: "blob", timeout: 120000 });
    return response.data as Blob;
  },
};

/* ── Consolidado de Novedades: espejo de `server/src/utils/consolidadoNovedades.ts` y `xlsxDesdeHojas.ts` ── */

export type TipoColumna = "texto" | "fecha" | "hora" | "numero" | "entero";
export interface ColumnaHoja { titulo: string; tipo?: TipoColumna; ancho?: number }
export interface HojaXlsx {
  nombre: string;
  columnas: ColumnaHoja[];
  /** Fechas «AAAA-MM-DD», horas «HH:mm»; `null` o «» = celda vacía. */
  filas: (string | number | null)[][];
  /** Hoja de datos: encabezados en la fila 1, autofiltro, primera fila congelada. */
  tabla?: boolean;
  vacioDice?: string;
  /** Índices (base 0) de las filas que van resaltadas enteras: «a esta persona le faltan datos». */
  filasResaltadas?: number[];
}

export interface FilaResumenConsolidado {
  clave: string; legajo: string; colaborador: string; cuil: string; empresa: string; tipo: string; categoria: string; centroCosto: string; proyecto: string; area: string; turno: string; desde: string; hasta: string;
  contratos: number; jornadasTrabajadas: number; jornadasPrevistas: number | null; ausencias: number; porMotivo: Record<string, number>; diasSinParte: number;
  valorJornada: number | null;
  /** El navegador lo divide por el divisor del glosario; null = no hay o no aplica. */
  sueldoMano: number | null;
  valorHoraNoAplica: boolean;
  extrasCrudas: number;
  // Para la hoja por empresa (planilla de liquidación).
  proyectoId: string; apellido: string; nombrePila: string; grupo: number | null; obraSocialCodigo: string; obraSocialOrigen: string; esJornada: boolean; sinContrato: boolean;
  /** Tiempo indeterminado o plazo fijo: lo único que va a la hoja por empresa. */
  mensualizado: boolean;
  /** La persona figura en algún parte del período. Si no, sus novedades vacías son «sin datos», no «sin novedades». */
  conAlgunParte: boolean;
  /** Horas trabajadas en feriados del período (concepto 0017). */
  horasFeriado: number;
  /** Vacaciones en días corridos por tramo. */
  vacacionesCorridas: number;
  reemplazos: number;
}
export interface ExtrasCrudas { total: number; h50: number; h100: number; horarioEntrada: string; horarioSalida: string; feriado: boolean }
export interface FilaDetalleConsolidado {
  claveResumen: string; fecha: string; dia: string; feriado: string; colaborador: string; cuil: string; proyecto: string; empresa: string; area: string; turno: string; estado: string; motivo: string;
  entradaPrevista: string; salidaPrevista: string; entradaReal: string; salidaReal: string; extras: ExtrasCrudas | null; reemplazo: string; parte: string;
}
export interface FilaParteConsolidado { parte: string; fecha: string; proyecto: string; area: string; turno: string; responsable: string; presentes: number; ausentes: number; comentario: string }
export interface FilaRevisarConsolidado { tipo: string; colaborador: string; cuil: string; fecha: string; detalle: string }
export interface ConsolidadoNovedades {
  desde: string;
  hasta: string;
  proyectos: { id: string; nombre: string; cliente: string; centroCosto: string; centroCostoCodigo: string; centroCostoDescripcion: string }[];
  feriados: { fecha: string; nombre: string }[];
  /** Los motivos de ausencia del catálogo, en su orden: una columna cada uno en el resumen. */
  motivos: string[];
  resumen: FilaResumenConsolidado[];
  detalle: FilaDetalleConsolidado[];
  partes: FilaParteConsolidado[];
  revisar: FilaRevisarConsolidado[];
  totales: { resumen: number; detalle: number; partes: number; revisar: number };
  /** Quién pidió el export (lo pone el server). */
  exportadoPor?: string;
}

/** Un parte del período con su asistencia, tal como la cuenta el reporte de Novedades. */
export interface ParteConAsistencia {
  date: string;
  projectIdRaw: string;
  projectName: string;
  /**
   * El área y el turno DEL PARTE: dónde y en qué turno se trabajó ese día, no lo que dice la ficha.
   *
   * Es el mismo criterio del filtro «Área / Turno», y por eso la columna del reporte y el filtro no
   * pueden contradecirse. Vacío cuando el parte no los tiene cargados.
   */
  areaName?: string;
  shiftName?: string;
  /** Aparte del nombre, para armar «Noche (18:00 - 00:00)» igual que el listado de Novedades. */
  shiftStartTime?: string;
  shiftEndTime?: string;
  /** Quién cargó el parte (el coordinador de esa área y turno). */
  coordinador?: string;
  /** El comentario del supervisor sobre la novedad entera: uno por (coordinador, proyecto, día). */
  comments?: string;
  attendance: {
    employeeId: string;
    status: string;
    absenceReason: string;
    /** La observación sobre ESA persona ese día. Distinta de `comments`, que es del parte entero. */
    notes?: string;
    overtimeHours: number;
    overtimeHours50: number;
    overtimeHours100: number;
    overtimeEntryTime?: string;
    overtimeExitTime?: string;
    /** El horario de ese día según el parte (contra él se reparten las extras entre 50% y 100%). */
    scheduleInTime?: string;
    scheduleOutTime?: string;
    /**
     * Si el parte no tiene turno (un coordinador con varios turnos en el área carga uno solo por día),
     * el turno de ESTA persona deducido por su horario. Si el horario no es el de ningún turno, viaja
     * el horario solo (`horario`, «11:00 - 17:00»).
     */
    turnoPorHorario?: { name: string; startTime: string; endTime: string };
    horario?: string;
  }[];
}

export interface FiltrosDePersonas {
  /**
   * Las FILAS que pasan los filtros, como `userId::PROYECTONORMALIZADO`.
   *
   * Son filas y no personas porque la tabla dibuja una fila por persona y proyecto, y el contrato
   * —con su vigencia, su tipo y su estado— es el de ESE proyecto: la misma persona puede estar
   * vigente en uno y no en el otro. Contestando personas, un contrato vigente en cualquier lado
   * dejaba pasar todas sus filas, incluidas las que dicen NO VIGENTE.
   */
  claves: string[];
  /** Cuántas filas puede llegar a dibujar la tabla, antes de filtrar. */
  total: number;
  /**
   * La plata de cada fila, por su clave. Sale del MISMO contrato que la fila muestra.
   *
   * De acá salen S. Jornada, S. Mano, P. Hora, P. Hora Extra y el monto. El padrón
   * (`/users/directory`) no manda los sueldos —serían dos números por cada uno de los 7.462
   * contratos del tenant, sobre un endpoint que ya cuesta 27 s—, así que sin esto las seis columnas
   * mostraban "-" y los totales del pie daban $0.
   */
  economia: Record<string, { sueldoJornada: number; sueldoMano: number }>;
  opciones: {
    roles: string[];
    tipos: string[];
    estados: string[];
    areasTurnos: { value: string; label: string }[];
  };
}
