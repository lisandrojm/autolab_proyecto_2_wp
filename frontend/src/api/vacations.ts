// Frontend API client for vacation system
import axios from "./axiosConfig";

interface AntiguedadTramo {
  desde: number;
  hasta: number;
  dias: number;
}

interface VacationRules {
  diasAnuales: number;
  diasBeneficio?: number;
  antiguedadTramos?: AntiguedadTramo[];
  maxDiasGozados?: number;
  permiteArrastre: boolean;
  maxDiasArrastre?: number;
  vencimientoArrastreDias?: number;
  minDiasPorSolicitud?: number;
  maxDiasCorridos?: number;
  maxDiasHabiles?: number;
  anticipacionMinimaDias?: number;
  permiteFraccionadas: boolean;
  requiereFirma: boolean;
  pdfTemplateId?: string;
}

export interface VacationRequest {
  _id: string;
  tenantId: string;
  userId: string;
  vacationNumber: string;
  userName: string;
  position: string;
  level: string;
  rules?: VacationRules;
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
  createdAt: string;
  updatedAt: string;
}


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
    const response = await axios.put(`/vacations/${id}/pre-approve`);
    return response.data;
  },

  approve: async (id: string): Promise<VacationRequest> => {
    const response = await axios.put(`/vacations/${id}/approve`);
    return response.data;
  },

  reject: async (id: string, reason?: string): Promise<VacationRequest> => {
    const response = await axios.put(`/vacations/${id}/reject`, { reason });
    return response.data;
  },

  deliver: async (id: string): Promise<VacationRequest> => {
    const response = await axios.put(`/vacations/${id}/deliver`);
    return response.data;
  },

  sendSignature: async (id: string): Promise<VacationRequest> => {
    const response = await axios.put(`/vacations/${id}/send-signature`);
    return response.data;
  },

  markSigned: async (id: string): Promise<VacationRequest> => {
    const response = await axios.put(`/vacations/${id}/mark-signed`);
    return response.data;
  },
};
