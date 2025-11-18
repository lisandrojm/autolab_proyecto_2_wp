import axios from "./axiosConfig";
import { emitCampaignsChanged } from "../utils/navbarEvents";

/* ---------- Tipos ---------- */
type ObjectIdString = string & { readonly __objectIdBrand: unique symbol };

export interface TenantRef {
  _id: ObjectIdString;
  slug?: string;
  name?: string;
}

export interface Campaign {
  _id: string;
  tenant: TenantRef; // ← objeto, no tenantId string
  clientId: string;
  name: string;
  description?: string;
  objectives: string[];
  targetAudience: string;
  budget: {
    total: number;
    allocated: number;
    spent: number;
  };
  timeline: {
    startDate: string;
    endDate: string;
  };
  status: "draft" | "active" | "paused" | "completed" | "cancelled";
  platforms: string[];
  kpis: {
    name: string;
    target: number;
    current: number;
    unit: string;
  }[];
  assignedUsers: string[];
  createdBy: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

class CampaignsAPI {
  private getHeaders() {
    const token = localStorage.getItem("token");
    // preferimos el slug si está cacheado; si no, el _id
    const tenantSlug = localStorage.getItem("tenantSlug");
    const tenantId = localStorage.getItem("tenantId");

    return {
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": tenantSlug || tenantId || "",
      "Content-Type": "application/json",
    };
  }

  async updateCampaign(
    campaignId: string,
    data: {
      name?: string;
      description?: string;
      objectives?: string[];
      targetAudience?: string;
      status?: string;
      timeline?: {
        startDate: string;
        endDate: string;
      };
      budget?: {
        total: number;
        allocated: number;
        spent: number;
      };
      platforms?: string[];
    }
  ): Promise<Campaign> {
    const response = await axios.patch(`/campaigns/${campaignId}`, data, { headers: this.getHeaders() });
    const campaign = response.data as Campaign;
    emitCampaignsChanged("update", campaign._id, campaign.clientId);
    return campaign;
  }
}

export const campaignsAPI = new CampaignsAPI();
