import axios from "./axiosConfig";

export interface AbsenceRequest {
  _id: string;
  tenantId: string;
  employeeId: {
    _id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
  areaId?: {
    _id: string;
    name: string;
  };
  type: "vacation" | "compensatory" | "special_leave" | "extra";
  startDate: string;
  endDate: string;
  daysCount: number;
  reason?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  supervisorId?: {
    _id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
  approverId?: {
    _id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  postponeCount: number;
  lastPostponedAt?: string;
  replacementEmployeeId?: {
    _id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
  notes?: string;
  source: "mobile" | "admin";
  createdAt: string;
  updatedAt: string;
}

export interface CreateAbsenceRequest {
  type: "vacation" | "compensatory" | "special_leave" | "extra";
  startDate: string;
  endDate: string;
  reason?: string;
  source?: "mobile" | "admin";
}

export interface UpdateAbsenceRequest {
  type?: "vacation" | "compensatory" | "special_leave" | "extra";
  startDate?: string;
  endDate?: string;
  reason?: string;
}

export interface ApproveAbsenceRequest {
  replacementEmployeeId?: string;
  notes?: string;
}

export interface RejectAbsenceRequest {
  rejectionReason: string;
}

export const absenceRequestsAPI = {
  getMyRequests: () => axios.get<AbsenceRequest[]>("/absence-requests/my"),

  getPendingRequests: (params?: {
    areaId?: string;
    type?: string;
    from?: string;
    to?: string;
  }) => axios.get<AbsenceRequest[]>("/absence-requests/pending", { params }),

  getAllRequests: (params?: {
    employeeId?: string;
    status?: string;
    type?: string;
    from?: string;
    to?: string;
    areaId?: string;
  }) => axios.get<AbsenceRequest[]>("/absence-requests", { params }),

  getRequestById: (id: string) => axios.get<AbsenceRequest>(`/absence-requests/${id}`),

  createRequest: (data: CreateAbsenceRequest) =>
    axios.post<AbsenceRequest>("/absence-requests", data),

  updateRequest: (id: string, data: UpdateAbsenceRequest) =>
    axios.put<AbsenceRequest>(`/absence-requests/${id}`, data),

  approveRequest: (id: string, data: ApproveAbsenceRequest) =>
    axios.patch<AbsenceRequest>(`/absence-requests/${id}/approve`, data),

  rejectRequest: (id: string, data: RejectAbsenceRequest) =>
    axios.patch<AbsenceRequest>(`/absence-requests/${id}/reject`, data),

  postponeRequest: (id: string) =>
    axios.patch<AbsenceRequest>(`/absence-requests/${id}/postpone`),

  cancelRequest: (id: string) =>
    axios.patch<AbsenceRequest>(`/absence-requests/${id}/cancel`),
};
