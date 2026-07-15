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
}

export interface CoordinatorCompliance {
  userId: string;
  name: string;
  expectedCount: number;
  submittedCount: number;
  missingCount: number;
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
  status: "complete" | "partial" | "missing" | "none";
  expected: number;
  submitted: number;
  missing: number;
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
}

export interface RemindPayload {
  from: string;
  to: string;
  projectId?: string;
  coordinatorIds?: string[];
  message?: string;
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
    const { data } = await axiosClient.get<ComplianceResponse>(`/activity-reports/compliance?${sp.toString()}`);
    return data;
  },
  remind: async (payload: RemindPayload): Promise<RemindResponse> => {
    const { data } = await axiosClient.post<RemindResponse>(`/activity-reports/compliance/remind`, payload);
    return data;
  },
};
