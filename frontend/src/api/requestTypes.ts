import axios from './axiosConfig';

export interface RequestTypeData {
  _id: string;
  tenantId: string;
  name: string;
  key: string;
  description?: string;
  isSystem: boolean;
  isDeletable: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRequestTypePayload {
  name: string;
  key: string;
  description?: string;
}

export interface UpdateRequestTypePayload {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export const requestTypesAPI = {
  getRequestTypes: async (includeInactive?: boolean): Promise<RequestTypeData[]> => {
    const response = await axios.get('/request-types', {
      params: { includeInactive: includeInactive ? 'true' : 'false' },
    });
    return response.data;
  },

  getRequestTypeById: async (id: string): Promise<RequestTypeData> => {
    const response = await axios.get(`/request-types/${id}`);
    return response.data;
  },

  createRequestType: async (data: CreateRequestTypePayload): Promise<RequestTypeData> => {
    const response = await axios.post('/request-types', data);
    return response.data;
  },

  updateRequestType: async (id: string, data: UpdateRequestTypePayload): Promise<RequestTypeData> => {
    const response = await axios.patch(`/request-types/${id}`, data);
    return response.data;
  },

  deleteRequestType: async (id: string): Promise<void> => {
    await axios.delete(`/request-types/${id}`);
  },
};
