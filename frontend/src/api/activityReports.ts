import axiosClient from "./axiosConfig";

export interface AttendanceRecordInput {
  employeeId: string;
  status?: string;
  absenceReason?: string;
  replacementId?: string;
  overtimeHours?: number;
  notes?: string;
}

export interface AttendanceRecord extends AttendanceRecordInput {
  // Populated fields if any
  employeeId: any; // string or object depending on populate
  replacementId?: any;
}

export interface ActivityReport {
  _id: string;
  date: string;
  hasActivity: boolean;
  comments?: string;
  attendance: AttendanceRecord[];
  projectId?: any;
  areaId?: any;
  submittedAt: string;
  userId?: any;
  tenantId: string;
}

export const activityReportsAPI = {
  getAll: async () => {
    const response = await axiosClient.get<ActivityReport[]>("/activity-reports");
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
