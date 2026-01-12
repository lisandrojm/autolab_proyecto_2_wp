import axios from "./axiosConfig";

export interface TenantRef {
  _id: string;
  name?: string;
  slug?: string;
}

export interface Position {
  _id: string;
  tenantId?: string;
  tenant?: TenantRef;
  name: string;
  description?: string;
  vacationConfig?: {
    useGlobalConfig: boolean;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos?: boolean;
  };
  levelCount?: number;
  specificLevelCount?: number;
  levels?: Array<{
    _id: string;
    name: string;
    description?: string;
    type: "general" | "position-specific";
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface PositionFormData {
  name: string;
  description?: string;
  vacationConfig?: {
    useGlobalConfig: boolean;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos?: boolean;
  };
}

export interface PositionListResponse {
  positions: Position[];
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

function normalizePosition(raw: any): Position {
  return {
    _id: raw._id,
    tenantId: typeof raw.tenantId === "string" ? raw.tenantId : raw.tenantId?._id,
    tenant: normalizeTenant(raw),
    name: raw.name,
    description: raw.description,
    vacationConfig: raw.vacationConfig,
    levelCount: raw.levelCount,
    specificLevelCount: raw.specificLevelCount,
    levels: raw.levels,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export const positionsAPI = {
  list: async (params?: { page?: number; limit?: number; name?: string }): Promise<PositionListResponse> => {
    const response = await axios.get("/positions", { params });
    const data = response.data;
    return {
      positions: (data.positions || []).map(normalizePosition),
      pagination: data.pagination,
    };
  },

  listAll: async (): Promise<Position[]> => {
    const response = await axios.get("/positions", { params: { limit: 1000 } });
    return (response.data.positions || []).map(normalizePosition);
  },

  count: async (): Promise<{ count: number }> => {
    const response = await axios.get("/positions/count");
    return response.data;
  },

  getById: async (id: string): Promise<Position> => {
    const response = await axios.get(`/positions/${id}`);
    return normalizePosition(response.data);
  },

  create: async (data: PositionFormData): Promise<Position> => {
    const response = await axios.post("/positions", data);
    return normalizePosition(response.data);
  },

  update: async (id: string, data: Partial<PositionFormData>): Promise<Position> => {
    const response = await axios.patch(`/positions/${id}`, data);
    return normalizePosition(response.data);
  },

  remove: async (id: string): Promise<void> => {
    await axios.delete(`/positions/${id}`);
  },
};
