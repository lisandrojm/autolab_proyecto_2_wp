import axios from "axios";
import { useAuthStore } from "../stores/authStore";

const getHeaders = () => {
  const token = useAuthStore.getState().token;
  const tenantId = useAuthStore.getState().tenantId;
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": tenantId || "demo-tenant",
    },
  };
};

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface ActivityLogConfig {
  _id: string;
  tenantId: string;
  enableFastEntry: boolean; // "Shortener" toggle
  createdAt: string;
  updatedAt: string;
}

export const activityLogConfigAPI = {
  get: async (): Promise<ActivityLogConfig> => {
    const response = await axios.get(`${BASE_URL}/api/v1/activity-log-config`, getHeaders());
    return response.data;
  },

  update: async (data: Partial<ActivityLogConfig>): Promise<ActivityLogConfig> => {
    const response = await axios.put(`${BASE_URL}/api/v1/activity-log-config`, data, getHeaders());
    return response.data;
  },
};
