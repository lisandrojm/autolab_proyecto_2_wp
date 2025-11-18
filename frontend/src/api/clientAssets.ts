import axios from './axiosConfig';

export interface ClientAsset {
  _id: string;
  tenantId: string;
  clientId: string;
  campaignId?: string;
  projectId?: string;
  nombre: string;
  tipo: 'imagen' | 'video' | 'audio' | 'documento' | 'otro';
  url: string;
  scope?: 'brandkit' | 'campaigns' | 'assets' | 'posts';
  creadoPor: string;
  tags: string[];
  permisos: {
    editores: string[];
    visores: string[];
  };
  metadata?: {
    name?: string;
    title?: string;
    description?: string;
    category?: string;
    notes?: string;
  };
  usedInPosts?: string[];
  lastUsedAt?: string;
  isAiGenerated?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UploadResponse {
  assetId: string;
  filename: string;
  path: string;
  url: string;
}

type Scope = 'brandkit' | 'campaigns' | 'assets' | 'posts';

export interface AssetFilters {
  clientId?: string;
  includeUserAssets?: boolean;
  userId?: string;
  search?: string;
  sortBy?: 'createdAt' | 'nombre';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface AssetQueryResponse {
  assets: ClientAsset[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface AssetStats {
  byScope: { _id: string; count: number }[];
  byType: { _id: string; count: number }[];
  totalUsed: { count: number }[];
  totalUnused: { count: number }[];
  recentlyAdded: { count: number }[];
}

class ClientAssetsAPI {
  private getHeaders(includeContentType: boolean = true) {
    const token = localStorage.getItem('token');
    const tenantSlug = localStorage.getItem('tenantSlug');
    const tenantId = localStorage.getItem('tenantId');

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'X-Tenant-Id': tenantSlug || tenantId || '',
    };

    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  async list(scope: Scope): Promise<ClientAsset[]> {
    const response = await axios.get(
      `/client-assets/${scope}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async get(scope: Scope, id: string): Promise<ClientAsset> {
    const response = await axios.get(
      `/client-assets/${scope}/${id}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async upload(scope: Scope, file: File, clientId: string, isPersonalAsset: boolean = false): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('clientId', clientId);

    console.log('Uploading file:', { scope, clientId, fileName: file.name, fileSize: file.size, isPersonalAsset });

    try {
      // No need to manually set headers - axios interceptor handles it
      // FormData will automatically get correct Content-Type with boundary
      const response = await axios.post(
        `/client-assets/${scope}/upload?clientId=${encodeURIComponent(clientId)}&isPersonalAsset=${isPersonalAsset}`,
        formData
      );
      return response.data;
    } catch (error: any) {
      console.error('Upload error:', error?.response?.data || error.message);
      throw error;
    }
  }

  async uploadDocument(file: File, clientId: string, isPersonalAsset: boolean = false): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('clientId', clientId);

    console.log('Uploading document:', { clientId, fileName: file.name, fileSize: file.size, isPersonalAsset });

    try {
      const response = await axios.post(
        `/client-assets/brandkit-documents/upload?clientId=${encodeURIComponent(clientId)}&isPersonalAsset=${isPersonalAsset}`,
        formData
      );
      return response.data;
    } catch (error: any) {
      console.error('Upload document error:', error?.response?.data || error.message);
      throw error;
    }
  }

  async update(scope: Scope, id: string, data: Partial<ClientAsset>): Promise<ClientAsset> {
    const response = await axios.patch(
      `/client-assets/${scope}/${id}`,
      data,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async delete(scope: Scope, id: string): Promise<void> {
    await axios.delete(
      `/client-assets/${scope}/${id}`,
      { headers: this.getHeaders() }
    );
  }

  async queryAssets(filters: AssetFilters): Promise<AssetQueryResponse> {
    const params = new URLSearchParams();

    if (filters.clientId) params.append('clientId', filters.clientId);
    if (filters.includeUserAssets !== undefined) params.append('includeUserAssets', String(filters.includeUserAssets));
    if (filters.userId) params.append('userId', filters.userId);
    if (filters.search) params.append('search', filters.search);
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
    if (filters.limit) params.append('limit', String(filters.limit));
    if (filters.offset) params.append('offset', String(filters.offset));

    const response = await axios.get(
      `/client-assets/query?${params.toString()}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getAssetStats(clientId: string): Promise<AssetStats> {
    const response = await axios.get(
      `/client-assets/stats?clientId=${encodeURIComponent(clientId)}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }
}

export const clientAssetsAPI = new ClientAssetsAPI();
