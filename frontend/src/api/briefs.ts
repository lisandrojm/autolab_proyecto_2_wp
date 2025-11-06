import axios from "./axiosConfig";

/* ---------- Tipos ---------- */
type ObjectIdString = string & { readonly __objectIdBrand: unique symbol };

export interface TenantRef {
  _id: ObjectIdString;
  slug?: string;
  name?: string;
}

export interface Brief {
  _id: string;
  tenant: TenantRef; // ← objeto, no string
  clientId: string;
  campaignId?: string;
  title: string;
  description?: string;
  objectives: string[];
  targetAudience: {
    demographics: {
      ageRange: string;
      gender: string;
      location: string;
      income: string;
    };
    psychographics: {
      interests: string[];
      behaviors: string[];
      values: string[];
    };
    painPoints: string[];
  };
  brandGuidelines: {
    toneOfVoice: string;
    keyMessages: string[];
    dosDonts: {
      dos: string[];
      donts: string[];
    };
    visualStyle: string;
  };
  deliverables: {
    type: "post" | "campaign" | "strategy" | "content-calendar" | "other";
    quantity: number;
    format: string[];
    platforms: string[];
    deadline: string;
  }[];
  budget: {
    total: number;
    breakdown: {
      category: string;
      amount: number;
      description?: string;
    }[];
  };
  timeline: {
    startDate: string;
    endDate: string;
    milestones: {
      name: string;
      date: string;
      description?: string;
    }[];
  };
  requirements: {
    mandatory: string[];
    preferred: string[];
    restrictions: string[];
  };
  success_metrics: {
    primary: string[];
    secondary: string[];
    kpis: {
      name: string;
      target: number;
      unit: string;
    }[];
  };
  status: "draft" | "pending_review" | "approved" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  assignedTo: string[];
  createdBy: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BriefsListResponse {
  briefs: Brief[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/* ---------- API ---------- */
class BriefsAPI {
  private getHeaders() {
    const token = localStorage.getItem("token");
    // preferimos el slug si está cacheado; si no, el _id
    const tenantSlug = localStorage.getItem("tenantSlug");
    const tenantId = localStorage.getItem("tenantId");

    return {
      Authorization: `Bearer ${token}`,
      // muchos backends aceptan cualquiera; dejamos el slug primero por coherencia con registro
      "X-Tenant-Id": tenantSlug || tenantId || "",
      "Content-Type": "application/json",
    };
  }

  async list(
    params: {
      page?: number;
      limit?: number;
      clientId?: string;
      campaignId?: string;
      status?: string;
      priority?: string;
    } = {}
  ): Promise<BriefsListResponse> {
    const searchParams = new URLSearchParams();

    if (params.page) searchParams.append("page", params.page.toString());
    if (params.limit) searchParams.append("limit", params.limit.toString());
    if (params.clientId) searchParams.append("clientId", params.clientId);
    if (params.campaignId) searchParams.append("campaignId", params.campaignId);
    if (params.status) searchParams.append("status", params.status);
    if (params.priority) searchParams.append("priority", params.priority);

    const response = await axios.get(`/briefs?${searchParams.toString()}`, { headers: this.getHeaders() });
    return response.data as BriefsListResponse;
  }

  async get(id: string): Promise<Brief> {
    const response = await axios.get(`/briefs/${id}`, { headers: this.getHeaders() });
    return response.data as Brief;
  }

  async create(data: {
    clientId?: string;
    campaignId?: string;
    title: string;
    description?: string;
    objectives: string[];
    targetAudience?: string; // si tu backend espera el objeto, cambiá el tipo
    budget?: {
      total: number;
      breakdown?: {
        category: string;
        amount: number;
        description?: string;
      }[];
    };
    timeline?: {
      startDate: string;
      endDate: string;
    };
    deliverables?: {
      type: "post" | "campaign" | "strategy" | "content-calendar" | "other";
      quantity: number;
      format: string[];
      platforms: string[];
      deadline: string;
    }[];
    priority?: "low" | "medium" | "high" | "urgent";
  }): Promise<Brief> {
    const response = await axios.post(`/briefs`, data, { headers: this.getHeaders() });
    return response.data as Brief;
  }

  async update(id: string, data: Partial<Brief>): Promise<Brief> {
    const response = await axios.patch(`/briefs/${id}`, data, { headers: this.getHeaders() });
    return response.data as Brief;
  }

  async remove(id: string): Promise<void> {
    await axios.delete(`/briefs/${id}`, { headers: this.getHeaders() });
  }

  async toggleFavorite(id: string, favorite: boolean): Promise<Brief> {
    const response = await axios.patch(`/briefs/${id}/favorite`, { favorite }, { headers: this.getHeaders() });
    return response.data as Brief;
  }
}

export const briefsAPI = new BriefsAPI();
