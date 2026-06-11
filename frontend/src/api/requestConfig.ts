import axiosClient from "./axiosConfig";

export interface RequestConfig {
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
    const response = await axiosClient.get<RequestConfig[]>("/request-config");
    return response.data;
  },

  create: async (data: Partial<RequestConfig>) => {
    const response = await axiosClient.post<RequestConfig>("/request-config", data);
    return response.data;
  },

  update: async (id: string, data: Partial<RequestConfig>) => {
    const response = await axiosClient.put<RequestConfig>(`/request-config/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await axiosClient.delete(`/request-config/${id}`);
  },

  reorder: async (items: { id: string; order: number }[]) => {
    await axiosClient.patch("/request-config/reorder", { items });
  },

  getGeneralSettings: async () => {
    const response = await axiosClient.get<{ allowedPastDays: number }>("/request-config/settings");
    return response.data;
  },

  updateGeneralSettings: async (data: { allowedPastDays: number }) => {
    const response = await axiosClient.put<{ allowedPastDays: number }>("/request-config/settings", data);
    return response.data;
  },
};
