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
