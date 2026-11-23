import api from "./axiosConfig";

export interface VacationOverlap {
  _id: string;
  areaId?: string | { _id: string; name: string };
  projectId?: string | { _id: string; name: string };
  clientId?: string | { _id: string; name: string };
  roleFrameId?: string | { _id: string; name: string };
  maxSimultaneousUsers: number;
  description?: string;
  isActive: boolean;
  useActiveContractSchedule?: boolean;
  /** Quién elige primero en la campaña de goce: «antiguedad» = por turnos, la más antigua primero. */
  prioridad?: "ninguna" | "antiguedad";
  /** Días de turno de cada persona cuando eligen por antigüedad. */
  diasPorTurno?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface VacationOverlapInput {
  areaId?: string;
  projectId?: string;
  clientId?: string;
  roleFrameId?: string;
  maxSimultaneousUsers: number;
  description?: string;
  isActive?: boolean;
  useActiveContractSchedule?: boolean;
  prioridad?: "ninguna" | "antiguedad";
  diasPorTurno?: number;
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
