import axios from "./axiosConfig";

export interface Area {
  _id: string;
  tenantId?: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AreaFormData {
  name: string;
  description?: string;
}

export interface AreaListResponse {
  areas: Area[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const areasAPI = {
  list: async (params?: { page?: number; limit?: number; name?: string }): Promise<AreaListResponse> => {
    const response = await axios.get("/areas", { params });
    return response.data;
  },

  listAll: async (): Promise<Area[]> => {
    const response = await axios.get("/areas", { params: { limit: 1000 } });
    return response.data.areas;
  },

  count: async (): Promise<{ count: number }> => {
    const response = await axios.get("/areas/count");
    return response.data;
  },

  getById: async (id: string): Promise<Area> => {
    const response = await axios.get(`/areas/${id}`);
    return response.data;
  },

  create: async (data: AreaFormData): Promise<Area> => {
    const response = await axios.post("/areas", data);
    return response.data;
  },

  update: async (id: string, data: Partial<AreaFormData>): Promise<Area> => {
    const response = await axios.patch(`/areas/${id}`, data);
    return response.data;
  },

  remove: async (id: string): Promise<void> => {
    await axios.delete(`/areas/${id}`);
  },
};
