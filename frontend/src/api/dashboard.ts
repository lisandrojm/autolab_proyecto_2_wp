import axios from "./axiosConfig";

export interface DashboardStats {
  campaigns: {
    total: number;
    active: number;
    draft: number;
    completed: number;
    change: number;
  };
  clients: {
    total: number;
    active: number;
    onboarding: number;
    change: number;
  };
  posts: {
    total: number;
    published: number;
    scheduled: number;
    draft: number;
    change: number;
  };
  users: {
    total: number;
    active: number;
    change: number;
  };
  recentActivity: {
    type: "campaign" | "client" | "post" | "user";
    description: string;
    timestamp: string;
    user?: string;
  }[];
  topClients: {
    _id: string;
    name: string;
    campaignCount: number;
    postCount: number;
  }[];
  platformDistribution: {
    platform: string;
    count: number;
  }[];
}

class DashboardAPI {
  private getHeaders() {
    const token = localStorage.getItem("token");
    const tenantSlug = localStorage.getItem("tenantSlug");
    const tenantId = localStorage.getItem("tenantId");

    return {
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": tenantSlug || tenantId || "",
      "Content-Type": "application/json",
    };
  }

  async getStats(): Promise<DashboardStats> {
    const { data } = await axios.get("/dashboard/stats", {
      headers: this.getHeaders(),
    });
    return data;
  }
}

export const dashboardAPI = new DashboardAPI();
