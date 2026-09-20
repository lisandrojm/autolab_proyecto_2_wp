import axiosClient from "./axiosConfig";

export interface ProjectCompliance {
  projectId: string;
  projectName: string;
  areas: string[];
  turnos: string[];
  /** Opcional: puede no venir si el backend todavía no está actualizado. */
  turnosInfo?: { name: string; days: number[] }[];
  expectedDates: string[];
  submittedDates: string[];
  missingDates: string[];
  /** Opcional: faltantes que todavía se pueden cargar (dentro de "Días Permitidos"). */
  pendingDates?: string[];
  /** Opcional: Nº de novedad por fecha enviada (ej. { "2026-07-01": "DEM-REG-000353" }). */
  reportsByDate?: Record<string, string>;
}

export interface CoordinatorCompliance {
  userId: string;
  name: string;
  expectedCount: number;
  submittedCount: number;
  /** Todas las faltantes (pendientes + vencidas). */
  missingCount: number;
  /** Faltantes que todavía puede cargar (a tiempo). Opcional: backend viejo no lo manda. */
  pendingCount?: number;
  /** Faltantes con plazo vencido → marca al coordinador como atrasado (rojo). */
  expiredCount?: number;
  missingDates: string[];
  projects: ProjectCompliance[];
}

export interface MissingCell {
  userId: string;
  name: string;
  projectId: string;
  projectName: string;
  label: string;
}

export interface CalendarDayCompliance {
  date: string;
  /** "pending" = falta pero todavía se puede cargar (azul); "missing" = vencida (rojo). */
  status: "complete" | "partial" | "pending" | "missing" | "none";
  expected: number;
  submitted: number;
  missing: number;
  pending?: number;
  missingCells: MissingCell[];
}

export interface ComplianceResponse {
  from: string;
  to: string;
  generatedAt: string;
  totals: {
    expected: number;
    submitted: number;
    missing: number;
    compliancePct: number;
    coordinatorsBehind: number;
  };
  coordinators: CoordinatorCompliance[];
  calendar: CalendarDayCompliance[];
}

export interface ComplianceQuery {
  from: string;
  to: string;
  projectId?: string;
  coordinatorId?: string;
  areaId?: string;
  shiftId?: string;
  /** Acota a los proyectos a los que pertenece quien pregunta, incluso siendo admin. */
  soloMisProyectos?: boolean;
}

export interface RemindPayload {
  from: string;
  to: string;
  projectId?: string;
  coordinatorIds?: string[];
  message?: string;
  /** Mismo recorte que en la consulta: el recordatorio no puede alcanzar a gente que no se ve. */
  soloMisProyectos?: boolean;
}

export interface RemindResponse {
  notified: { userId: string; name: string; missingCount: number }[];
  count: number;
}

export const complianceAPI = {
  get: async (params: ComplianceQuery): Promise<ComplianceResponse> => {
    const sp = new URLSearchParams();
    sp.set("from", params.from);
    sp.set("to", params.to);
    if (params.projectId) sp.set("projectId", params.projectId);
    if (params.coordinatorId) sp.set("coordinatorId", params.coordinatorId);
    if (params.areaId) sp.set("areaId", params.areaId);
    if (params.shiftId) sp.set("shiftId", params.shiftId);
    /*
      ACOTAR A MIS PROYECTOS, aunque quien pregunte sea admin.

      Lo manda el móvil y no la web: en el teléfono la pantalla es la del coordinador y la lista
      tiene que ser la de su equipo. En el panel web un admin sí está auditando toda la empresa.
    */
    if (params.soloMisProyectos) sp.set("soloMisProyectos", "1");
    const { data } = await axiosClient.get<ComplianceResponse>(`/activity-reports/compliance?${sp.toString()}`);
    return data;
  },
  remind: async (payload: RemindPayload): Promise<RemindResponse> => {
    const { data } = await axiosClient.post<RemindResponse>(`/activity-reports/compliance/remind`, payload);
    return data;
  },
};
