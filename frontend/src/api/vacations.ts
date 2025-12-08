// Frontend API client for vacation system
import axios from "./axiosConfig";

export interface VacationRule {
  _id: string;
  type: "rule";
  tenantId: string;
  active: boolean;
  data: any;
  createdAt: string;
  updatedAt: string;
}

export interface VacationRecord {
  _id: string;
  type: "record";
  tenantId: string;
  active: boolean;
  data: any;
  createdAt: string;
  updatedAt: string;
}

export interface VacationHistory {
  _id: string;
  type: "history";
  tenantId: string;
  active: boolean;
  data: any;
  createdAt: string;
  updatedAt: string;
}

// RULES API
export const vacationRulesAPI = {
  getAll: async (): Promise<VacationRule[]> => {
    const response = await axios.get("/vacations/rules");
    return response.data;
  },

  create: async (data: any): Promise<VacationRule> => {
    const response = await axios.post("/vacations/rules", { data });
    return response.data;
  },

  update: async (id: string, data: any, active?: boolean): Promise<VacationRule> => {
    const payload: any = {};
    if (data !== undefined) payload.data = data;
    if (active !== undefined) payload.active = active;
    const response = await axios.patch(`/vacations/rules/${id}`, payload);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/vacations/rules/${id}`);
  },
};

// RECORDS API
export const vacationRecordsAPI = {
  getAll: async (): Promise<VacationRecord[]> => {
    const response = await axios.get("/vacations/records");
    return response.data;
  },

  getById: async (id: string): Promise<VacationRecord> => {
    const response = await axios.get(`/vacations/records/${id}`);
    return response.data;
  },

  create: async (data: any): Promise<VacationRecord> => {
    const response = await axios.post("/vacations/records", { data });
    return response.data;
  },

  update: async (id: string, data: any, active?: boolean): Promise<VacationRecord> => {
    const payload: any = {};
    if (data !== undefined) payload.data = data;
    if (active !== undefined) payload.active = active;
    const response = await axios.patch(`/vacations/records/${id}`, payload);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/vacations/records/${id}`);
  },
};

// HISTORY API
export const vacationHistoryAPI = {
  getAll: async (): Promise<VacationHistory[]> => {
    const response = await axios.get("/vacations/history");
    return response.data;
  },

  create: async (data: any): Promise<VacationHistory> => {
    const response = await axios.post("/vacations/history", { data });
    return response.data;
  },
};
