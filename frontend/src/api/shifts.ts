import axios from "./axiosConfig";

export interface Shift {
  _id: string;
  tenantId: string;
  name: string;

  days: number[];
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  order: number;
  description?: string;
  isSystem?: boolean;
  createdAt: string;

  updatedAt: string;
}

export interface ShiftFormData {
  name: string;

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
    const shifts = response.data.shifts || [];
    // Ensure shifts are sorted by the order field defined in Admin Usuarios / Turnos
    return shifts.sort((a: Shift, b: Shift) => (a.order ?? 0) - (b.order ?? 0));
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
  reorder: async (items: { id: string; order: number }[]): Promise<void> => {
    await axios.patch("/shifts/reorder", { items });
  },
};
