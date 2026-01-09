import axiosClient from "./axiosConfig";

export interface ActivityLogType {
  _id: string; // Mongoose ID
  tenantId: string;
  name: string;
  order: number;
  requiresReplacement: boolean;
  isActive: boolean;
  visibility: "all" | "specific";
  allowedProjectIds: string[];
}

export const activityLogTypesAPI = {
  getAll: async () => {
    const response = await axiosClient.get<ActivityLogType[]>("/activity-log-types");
    return response.data;
  },

  create: async (data: Partial<ActivityLogType>) => {
    const response = await axiosClient.post<ActivityLogType>("/activity-log-types", data);
    return response.data;
  },

  update: async (id: string, data: Partial<ActivityLogType>) => {
    const response = await axiosClient.put<ActivityLogType>(`/activity-log-types/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await axiosClient.delete(`/activity-log-types/${id}`);
  },

  reorder: async (items: { id: string; order: number }[]) => {
    await axiosClient.patch("/activity-log-types/reorder", { items });
  },
};
