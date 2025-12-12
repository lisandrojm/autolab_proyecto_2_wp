import api from "./axiosConfig";

export interface VacationOverlap {
  _id: string;
  tenantId: string;
  areaId:
    | {
        _id: string;
        name: string;
      }
    | string; // Populate via backend
  maxSimultaneousUsers: number;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateVacationOverlapData = {
  areaId: string;
  maxSimultaneousUsers: number;
  description?: string;
  isActive?: boolean;
};

export type UpdateVacationOverlapData = Partial<CreateVacationOverlapData>;

export const vacationOverlapsAPI = {
  list: async () => {
    const { data } = await api.get<VacationOverlap[]>("/vacation-overlaps");
    return data;
  },

  create: async (payload: CreateVacationOverlapData) => {
    const { data } = await api.post<VacationOverlap>("/vacation-overlaps", payload);
    return data;
  },

  update: async (id: string, payload: UpdateVacationOverlapData) => {
    const { data } = await api.put<VacationOverlap>(`/vacation-overlaps/${id}`, payload);
    return data;
  },

  remove: async (id: string) => {
    const { data } = await api.delete<{ message: string }>(`/vacation-overlaps/${id}`);
    return data;
  },
};
