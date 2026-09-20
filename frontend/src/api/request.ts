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
};
