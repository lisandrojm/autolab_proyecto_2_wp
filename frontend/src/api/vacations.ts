// Frontend API client for vacation system
import axios from "./axiosConfig";

// Vacation Rules interfaces
export interface VacationRule {
  _id: string;
  tenantId: string;
  active: boolean;
  name: string;
  diasAnuales: number;
  diasBeneficio: number;
  requiereFirma: boolean;
  scope: "all" | "cargo" | "nivel" | "cargo_nivel";
  position?: string;
  level?: string;
  createdAt: string;
  updatedAt: string;
}

// Vacation Request interfaces
export interface VacationRequest {
  _id: string;
  tenantId: string;
  userId: string;
  userName: string;
  position: string;
  level: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  diasDeVacacionesAnuales: number;
  balance: number;
  comments?: string;
  createdAt: string;
  updatedAt: string;
}

// VACATION RULES API
export const vacationRulesAPI = {
  getAll: async (): Promise<VacationRule[]> => {
    const response = await axios.get("/vacationsrules");
    return response.data;
  },

  getById: async (id: string): Promise<VacationRule> => {
    const response = await axios.get(`/vacationsrules/${id}`);
    return response.data;
  },

  create: async (data: Partial<VacationRule>): Promise<VacationRule> => {
    const response = await axios.post("/vacationsrules", data);
    return response.data;
  },

  update: async (id: string, data: Partial<VacationRule>): Promise<VacationRule> => {
    const response = await axios.patch(`/vacationsrules/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/vacationsrules/${id}`);
  },
};

// VACATION REQUESTS API
export const vacationsAPI = {
  getAll: async (): Promise<VacationRequest[]> => {
    const response = await axios.get("/vacations");
    return response.data;
  },

  getById: async (id: string): Promise<VacationRequest> => {
    const response = await axios.get(`/vacations/${id}`);
    return response.data;
  },

  create: async (data: Partial<VacationRequest>): Promise<VacationRequest> => {
    const response = await axios.post("/vacations", data);
    return response.data;
  },

  update: async (id: string, data: Partial<VacationRequest>): Promise<VacationRequest> => {
    const response = await axios.patch(`/vacations/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/vacations/${id}`);
  },
};
