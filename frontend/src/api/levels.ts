import axios from "./axiosConfig";

export interface TenantRef {
  _id: string;
  name?: string;
  slug?: string;
}

export interface Level {
  _id: string;
  tenantId?: string;
  tenant?: TenantRef;
  name: string;
  description?: string;
  type: "general" | "position-specific";
  positionId?:
    | {
        _id: string;
        name: string;
      }
    | string;
  createdAt: string;
  updatedAt: string;
}

export interface LevelFormData {
  name: string;
  description?: string;
  type: "general" | "position-specific";
  positionId?: string;
}

export interface LevelListResponse {
  levels: Level[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

function normalizeTenant(raw: any): TenantRef | undefined {
  const obj = raw?.tenant || (typeof raw?.tenantId === "object" ? raw.tenantId : undefined) || {};
  const idLike = obj._id || obj.id || (typeof raw?.tenantId === "string" ? raw.tenantId : undefined);

  if (!idLike || typeof idLike !== "string" || !/^[a-f\d]{24}$/i.test(idLike)) {
    return undefined;
  }

  return { _id: idLike, slug: obj.slug || raw?.tenantSlug, name: obj.name || raw?.tenantName };
}

function normalizeLevel(raw: any): Level {
  return {
    _id: raw._id,
    tenantId: typeof raw.tenantId === "string" ? raw.tenantId : raw.tenantId?._id,
    tenant: normalizeTenant(raw),
    name: raw.name,
    description: raw.description,
    type: raw.type,
    positionId: raw.positionId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export const levelsAPI = {
  list: async (params?: { page?: number; limit?: number; name?: string; positionId?: string }): Promise<LevelListResponse> => {
    const response = await axios.get("/levels", { params });
    const data = response.data;
    return {
      levels: (data.levels || []).map(normalizeLevel),
      pagination: data.pagination,
    };
  },

  listForPosition: async (positionId: string): Promise<Level[]> => {
    const response = await axios.get("/levels", { params: { positionId, limit: 1000 } });
    return (response.data.levels || []).map(normalizeLevel);
  },

  listAll: async (): Promise<Level[]> => {
    const response = await axios.get("/levels", { params: { limit: 1000 } });
    return (response.data.levels || []).map(normalizeLevel);
  },

  count: async (): Promise<{ count: number }> => {
    const response = await axios.get("/levels/count");
    return response.data;
  },

  getById: async (id: string): Promise<Level> => {
    const response = await axios.get(`/levels/${id}`);
    return normalizeLevel(response.data);
  },

  create: async (data: LevelFormData): Promise<Level> => {
    const response = await axios.post("/levels", data);
    return normalizeLevel(response.data);
  },

  update: async (id: string, data: Partial<LevelFormData>): Promise<Level> => {
    const response = await axios.patch(`/levels/${id}`, data);
    return normalizeLevel(response.data);
  },

  remove: async (id: string): Promise<void> => {
    await axios.delete(`/levels/${id}`);
  },
};
