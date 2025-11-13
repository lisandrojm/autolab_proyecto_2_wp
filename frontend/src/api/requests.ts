import axios from './axiosConfig';

export interface RequestData {
  _id: string;
  tenantId: string;
  employeeId: string | {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  type: 'vacation' | 'compensatory' | 'special_leave' | 'extra';
  startDate: string;
  endDate: string;
  daysCount?: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approverId?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  postponeCount: number;
  lastPostponedAt?: string;
  replacementEmployeeId?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  notes?: string;
  source: 'mobile' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface CreateRequestPayload {
  type: 'vacation' | 'compensatory' | 'special_leave' | 'extra';
  startDate: string;
  endDate: string;
  reason?: string;
  source?: 'mobile' | 'admin';
}

export interface ApproveRequestPayload {
  replacementEmployeeId?: string;
  notes?: string;
}

export interface RejectRequestPayload {
  rejectionReason: string;
}

export interface PostponeRequestPayload {
  notes?: string;
}

export const requestsAPI = {
  getRequests: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    employeeId?: string;
    search?: string;
  }) => {
    const response = await axios.get('/requests', { params });
    return response.data;
  },

  getMyRequests: async (): Promise<RequestData[]> => {
    const response = await axios.get('/requests/my');
    return response.data;
  },

  getPendingRequests: async (): Promise<RequestData[]> => {
    const response = await axios.get('/requests/pending');
    return response.data;
  },

  getRequestById: async (id: string): Promise<RequestData> => {
    const response = await axios.get(`/requests/${id}`);
    return response.data;
  },

  createRequest: async (data: CreateRequestPayload): Promise<RequestData> => {
    const response = await axios.post('/requests', data);
    return response.data;
  },

  approveRequest: async (id: string, data: ApproveRequestPayload): Promise<RequestData> => {
    const response = await axios.patch(`/requests/${id}/approve`, data);
    return response.data;
  },

  rejectRequest: async (id: string, data: RejectRequestPayload): Promise<RequestData> => {
    const response = await axios.patch(`/requests/${id}/reject`, data);
    return response.data;
  },

  postponeRequest: async (id: string, data: PostponeRequestPayload): Promise<RequestData> => {
    const response = await axios.patch(`/requests/${id}/postpone`, data);
    return response.data;
  },

  cancelRequest: async (id: string): Promise<RequestData> => {
    const response = await axios.patch(`/requests/${id}/cancel`);
    return response.data;
  },
};
