import axios from "./axiosConfig";

export interface Level {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  type: "general" | "position-specific";
  positionId?: {
    _id: string;
    name: string;
  } | string;
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

export const levelsAPI = {
  list: async (params?: { page?: number; limit?: number; name?: string; positionId?: string }): Promise<LevelListResponse> => {
    const response = await axios.get("/levels", { params });
    return response.data;
  },

  listForPosition: async (positionId: string): Promise<Level[]> => {
    const response = await axios.get("/levels", { params: { positionId, limit: 1000 } });
    return response.data.levels;
  },

  listAll: async (): Promise<Level[]> => {
    const response = await axios.get("/levels", { params: { limit: 1000 } });
    return response.data.levels;
  },

  count: async (): Promise<{ count: number }> => {
    const response = await axios.get("/levels/count");
    return response.data;
  },

  getById: async (id: string): Promise<Level> => {
    const response = await axios.get(`/levels/${id}`);
    return response.data;
  },

  create: async (data: LevelFormData): Promise<Level> => {
    const response = await axios.post("/levels", data);
    return response.data;
  },

  update: async (id: string, data: Partial<LevelFormData>): Promise<Level> => {
    const response = await axios.patch(`/levels/${id}`, data);
    return response.data;
  },

  remove: async (id: string): Promise<void> => {
    await axios.delete(`/levels/${id}`);
  },
};
