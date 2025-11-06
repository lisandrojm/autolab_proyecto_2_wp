import api from "./axiosConfig";

export interface PlatformMetrics {
  tenants: {
    total: number;
    active: number;
    suspended: number;
    new: number;
  };
  resources: {
    totalUsers: number;
    totalClients: number;
    totalCampaigns: number;
    storageUsedMB: number;
    storageLimitMB: number;
    storagePercent: number;
  };
  plans: {
    distribution: Record<string, number>;
    free: number;
    basic: number;
    pro: number;
    enterprise: number;
  };
  topConsumers: Array<{
    _id: string;
    name: string;
    slug: string;
    storageUsedMB: number;
    storageLimitMB: number;
    users: number;
    clients: number;
    plan: string;
    isActive: boolean;
  }>;
  alerts: Array<{
    type: string;
    severity: string;
    tenant: string;
    tenantId: string;
    message: string;
  }>;
}

export interface PlatformActivity {
  tenants: Array<{ _id: string; count: number }>;
  users: Array<{ _id: string; count: number }>;
  clients: Array<{ _id: string; count: number }>;
  campaigns: Array<{ _id: string; count: number }>;
}

export const platformApi = {
  getMetrics: async (): Promise<PlatformMetrics> => {
    const response = await api.get("/platform/metrics");
    return response.data;
  },

  getActivity: async (days = 7): Promise<PlatformActivity> => {
    const response = await api.get(`/platform/activity?days=${days}`);
    return response.data;
  },
};
