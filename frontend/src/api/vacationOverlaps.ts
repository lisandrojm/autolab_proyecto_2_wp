import api from "./axiosConfig";

export interface VacationOverlap {
  _id: string;
  areaId?: string | { _id: string; name: string };
  positionId?: string | { _id: string; name: string };
  levelId?: string | { _id: string; name: string };
  projectId?: string | { _id: string; name: string };
  clientId?: string | { _id: string; name: string };
  roleFrameId?: string | { _id: string; name: string };
  maxSimultaneousUsers: number;
  description?: string;
  isActive: boolean;
  useActiveContractSchedule?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface VacationOverlapInput {
  areaId?: string;
  positionId?: string;
  levelId?: string;
  projectId?: string;
  clientId?: string;
  roleFrameId?: string;
  maxSimultaneousUsers: number;
  description?: string;
  isActive?: boolean;
  useActiveContractSchedule?: boolean;
}

export const vacationOverlapsAPI = {
  list: async (): Promise<VacationOverlap[]> => {
    const response = await api.get("/vacation-overlaps");
    return response.data;
  },

  create: async (data: VacationOverlapInput): Promise<VacationOverlap> => {
    const response = await api.post("/vacation-overlaps", data);
    return response.data;
  },

  update: async (id: string, data: Partial<VacationOverlapInput>): Promise<VacationOverlap> => {
    const response = await api.put(`/vacation-overlaps/${id}`, data);
    return response.data;
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/vacation-overlaps/${id}`);
  },
};
