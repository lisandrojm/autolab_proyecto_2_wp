import axios from "./axiosConfig";

export interface Position {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
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

export const positionsAPI = {
  list: async (params?: { page?: number; limit?: number; name?: string }): Promise<PositionListResponse> => {
    const response = await axios.get("/positions", { params });
    return response.data;
  },

  listAll: async (): Promise<Position[]> => {
    const response = await axios.get("/positions", { params: { limit: 1000 } });
    return response.data.positions;
  },

  count: async (): Promise<{ count: number }> => {
    const response = await axios.get("/positions/count");
    return response.data;
  },

  getById: async (id: string): Promise<Position> => {
    const response = await axios.get(`/positions/${id}`);
    return response.data;
  },

  create: async (data: PositionFormData): Promise<Position> => {
    const response = await axios.post("/positions", data);
    return response.data;
  },

  update: async (id: string, data: Partial<PositionFormData>): Promise<Position> => {
    const response = await axios.patch(`/positions/${id}`, data);
    return response.data;
  },

  remove: async (id: string): Promise<void> => {
    await axios.delete(`/positions/${id}`);
  },
};
