// Frontend API client for vacation system
import axios from "./axiosConfig";

// Vacation Rules interfaces
export interface VacationRule {
  _id: string;
  tenantId: string;
  active: boolean;
  name: string;
  description?: string;
  diasAnuales?: number;
  diasBeneficio?: number;
  requiereFirma: boolean;
  scope: "all" | "cargo" | "nivel" | "cargo_nivel";
  position?: string;
  level?: string;
  antiguedadTramos?: Array<{
    desde: number;
    hasta: number;
    dias: number;
  }>;
  maxDiasGozados?: number;
  permiteArrastre: boolean;
  maxDiasArrastre?: number;
  vencimientoArrastreDias?: number;
  minDiasPorSolicitud?: number;
  maxDiasCorridos?: number;
  maxDiasHabiles?: number;
  anticipacionMinimaDias?: number;
  permiteFraccionadas: boolean;
  pdfTemplateId?: string;
  createdAt: string;
  updatedAt: string;
}

// Vacation Request interfaces
export interface VacationRequest {
  _id: string;
  tenantId: string;
  userId: string;
  vacationNumber: string;
  userName: string;
  position: string;
  level: string;
  vacationRuleIds?: string[];
  startDate: string;
  endDate: string;
  daysRequested: number;
  status: "pending" | "pre_approved" | "approved" | "rejected" | "delivered" | "cancelled";
  reason?: string;
  managerComment?: string;
  diasDeVacacionesAnuales: number;
  balance: number;
  comments?: string;
  preApprovedBy?: string;
  preApprovedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  deliveredAt?: string;
  rejectedAt?: string;
  requiresSignature?: boolean;
  signatureStatus?: "not_required" | "pending" | "sent" | "signed";
  signatureSentAt?: string;
  signatureNotifiedAt?: string;
  signedAt?: string;
  signedBy?: string;
  pdfPreAprobacionUrl?: string;
  ruleIds?: string[];
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

  preApprove: async (id: string): Promise<VacationRequest> => {
    const response = await axios.put(`/hr-admin/vacations/${id}/pre-approve`);
    return response.data;
  },

  approve: async (id: string): Promise<VacationRequest> => {
    const response = await axios.put(`/hr-admin/vacations/${id}/approve`);
    return response.data;
  },

  reject: async (id: string, reason?: string): Promise<VacationRequest> => {
    const response = await axios.put(`/hr-admin/vacations/${id}/reject`, { reason });
    return response.data;
  },

  deliver: async (id: string): Promise<VacationRequest> => {
    const response = await axios.put(`/hr-admin/vacations/${id}/deliver`);
    return response.data;
  },

  sendSignature: async (id: string): Promise<VacationRequest> => {
    const response = await axios.put(`/hr-admin/vacations/${id}/send-signature`);
    return response.data;
  },

  markSigned: async (id: string): Promise<VacationRequest> => {
    const response = await axios.put(`/hr-admin/vacations/${id}/mark-signed`);
    return response.data;
  },
};
