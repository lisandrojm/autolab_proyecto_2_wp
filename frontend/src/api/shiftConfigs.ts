import axios from "./axiosConfig";

export interface ShiftConfig {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  sortOrder?: number;
  isSystem?: boolean;
  createdAt?: string;
  updatedAt?: string;

}

export interface ShiftConfigFormData {
  name: string;
  description?: string;
  sortOrder?: number;
}

export const shiftConfigsAPI = {
  getAll: (params?: { name?: string }) => axios.get<ShiftConfig[]>("/shift-configs", { params }),
  getById: (id: string) => axios.get<ShiftConfig>(`/shift-configs/${id}`),
  create: (data: ShiftConfigFormData) => axios.post<ShiftConfig>("/shift-configs", data),
  update: (id: string, data: Partial<ShiftConfigFormData>) => axios.patch<ShiftConfig>(`/shift-configs/${id}`, data),
  delete: (id: string) => axios.delete(`/shift-configs/${id}`),
  getCount: () => axios.get<{ count: number }>("/shift-configs/count"),
  reorder: (data: { id: string; sortOrder: number }[]) => axios.post<{ message: string }>("/shift-configs/reorder", data),
};
