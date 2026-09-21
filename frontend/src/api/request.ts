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
  submittedAt: string;
  userId?: any;
  tenantId: string;
  createdAt?: string;
  updatedAt?: string;
}

export const activityReportsAPI = {
  /** `mine`: fuerza que devuelva SOLO los reportes propios, aunque quien pide sea Admin (ver mobile
   *  "Mis Novedades" — sin esto, un admin dispara un fetch de todo el historial del tenant). */
  getAll: async (params?: { mine?: boolean }) => {
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
};

/** Un parte del período con su asistencia, tal como la cuenta el reporte de Novedades. */
export interface ParteConAsistencia {
  date: string;
  projectIdRaw: string;
  projectName: string;
  attendance: {
    employeeId: string;
    status: string;
    absenceReason: string;
    overtimeHours: number;
    overtimeHours50: number;
    overtimeHours100: number;
    overtimeEntryTime?: string;
    overtimeExitTime?: string;
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
