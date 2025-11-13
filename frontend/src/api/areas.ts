import axios from "./axiosConfig";

export interface Area {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  supervisorId?: {
    _id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
  employeeIds: Array<{
    _id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  }>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateArea {
  name: string;
  description?: string;
  supervisorId?: string;
  employeeIds?: string[];
}

export interface UpdateArea {
  name?: string;
  description?: string;
  supervisorId?: string | null;
  employeeIds?: string[];
  isActive?: boolean;
}

export const areasAPI = {
  getAreas: (includeInactive?: boolean) =>
    axios.get<Area[]>("/areas", { params: { includeInactive } }),

  getAreaById: (id: string) => axios.get<Area>(`/areas/${id}`),

  createArea: (data: CreateArea) => axios.post<Area>("/areas", data),

  updateArea: (id: string, data: UpdateArea) => axios.put<Area>(`/areas/${id}`, data),

  deleteArea: (id: string) => axios.delete<{ message: string }>(`/areas/${id}`),
};
