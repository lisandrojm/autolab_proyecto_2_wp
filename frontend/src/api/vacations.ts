// Frontend API client for vacation system
import axios from "./axiosConfig";
import type { AprobacionDeNivel, CadenaDeAprobacion } from "@compartido/vacaciones/etapaDeAprobacion";

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
  /** `plan` = la creó el plan de vacaciones por proyecto (ver `planVacacionesId`/`projectId`); si no, la pidió la persona. */
  origen?: "solicitud" | "plan";
  planVacacionesId?: string;
  projectId?: string;
  /** De qué año descuenta (el plan lo fija al año de saldo de la temporada); sin él, el año en que empieza. */
  periodoSaldo?: number;
  /** Quién aprueba cada nivel y quién aprobó (15/11/2026). Ver `@compartido/vacaciones/etapaDeAprobacion`. */
  cadena?: CadenaDeAprobacion | null;
  aprobaciones?: { supervisor?: AprobacionDeNivel | null; coordinador?: AprobacionDeNivel | null } | null;
  rechazo?: { userId?: string; nivel: "supervisor" | "coordinador" | "admin"; motivo?: string; at: string } | null;
  /** id → nombre de los que aparecen en la cadena, las aprobaciones y el rechazo (lo manda `GET /vacations`). */
  nombresAprobadores?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/** Una solicitud en la bandeja «Aprobaciones» de la app (ver `aprobacionPorEtapas.ts` del server). */
export interface ItemDeAprobacion {
  _id: string;
  vacationNumber: string;
  persona: { _id: string; nombre: string };
  proyectos: string[];
  startDate: string;
  endDate: string;
  daysRequested: number;
  reason?: string;
  createdAt: string;
  etapa: "supervisor" | "coordinador";
  aprobadoPorSupervisor?: string | null;
  recordadaHoy: boolean;
}

// VACATION REQUESTS API
export const vacationsAPI = {
  getAll: async (params?: { mine?: boolean }): Promise<VacationRequest[]> => {
    const response = await axios.get("/vacations", { params });
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

  cancel: async (id: string): Promise<VacationRequest> => {
    const response = await axios.put(`/vacations/${id}/cancel`);
    return response.data;
  },

  /*
    APROBACIÓN POR JERARQUÍA (15/11/2026): el supervisor y el coordinador aprueban su paso desde la app;
    el admin ya no pre-aprueba (sólo `approve` cuando la jerarquía terminó).
  */
  aprobaciones: async (): Promise<{ paraAprobar: ItemDeAprobacion[]; esperandoSupervisor: ItemDeAprobacion[] }> => {
    const response = await axios.get("/vacations/aprobaciones");
    return response.data;
  },

  contarParaAprobar: async (): Promise<number> => {
    const response = await axios.get("/vacations/aprobaciones/contar");
    return Number(response.data?.total || 0);
  },

  aprobarEtapa: async (id: string): Promise<VacationRequest> => {
    const response = await axios.put(`/vacations/${id}/aprobar-etapa`);
    return response.data;
  },

  rechazarEtapa: async (id: string, reason?: string): Promise<VacationRequest> => {
    const response = await axios.put(`/vacations/${id}/rechazar-etapa`, { reason });
    return response.data;
  },

  recordarSupervisor: async (id: string): Promise<void> => {
    await axios.post(`/vacations/${id}/recordar-supervisor`);
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

  notifySignature: async (id: string): Promise<VacationRequest> => {
    const response = await axios.put(`/vacations/${id}/notify-signature`);
    return response.data;
  },

  getAvailability: async (): Promise<{ date: string; status: "pending" | "approved" }[]> => {
    const response = await axios.get("/vacations/availability");
    return response.data;
  },

  regeneratePDF: async (id: string, empresaId?: string): Promise<VacationRequest> => {
    const response = await axios.post(`/vacations/${id}/regenerate-pdf`, { empresaId });
    return response.data;
  },

  /** Info de empresa para descargar el PDF: si el contrato tiene empresa fija o hay que elegir. */
  getEmpresaInfo: async (id: string): Promise<{ hasContractEmpresa: boolean; contractEmpresa: { id: string; label: string } | null; projectEmpresas: { id: string; label: string }[] }> => {
    const response = await axios.get(`/vacations/${id}/empresa-info`);
    return response.data;
  },

  getUsersBalance: async (year: number): Promise<any[]> => {
    const response = await axios.get("/vacations/users-balance", { params: { year } });
    return response.data;
  },

  saveUsersBalance: async (updates: any[]): Promise<void> => {
    await axios.post("/vacations/users-balance", { updates });
  },
};

