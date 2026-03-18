import axios from "./axiosConfig";

export interface Shift {
  _id: string;
  tenantId: string;
  name: string;
  type: string;
  days: number[];
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftFormData {
  name: string;
  type: string;
  days: number[];
  startTime: string;
  endTime: string;
  description?: string;
}

export interface ShiftListResponse {
  shifts: Shift[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const shiftsAPI = {
  list: async (params?: { page?: number; limit?: number; name?: string }): Promise<ShiftListResponse> => {
    const response = await axios.get("/shifts", { params });
    return response.data;
  },

  getAll: async (): Promise<Shift[]> => {
    const response = await axios.get("/shifts", { params: { limit: 1000 } });
    return response.data.shifts || [];
  },

  getById: async (id: string): Promise<Shift> => {
    const response = await axios.get(`/shifts/${id}`);
    return response.data;
  },

  create: async (data: ShiftFormData): Promise<Shift> => {
    const response = await axios.post("/shifts", data);
    return response.data;
  },

  update: async (id: string, data: Partial<ShiftFormData>): Promise<Shift> => {
    const response = await axios.patch(`/shifts/${id}`, data);
    return response.data;
  },

  remove: async (id: string): Promise<void> => {
    await axios.delete(`/shifts/${id}`);
  },
};
