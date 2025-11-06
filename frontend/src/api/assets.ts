export interface Asset {
  _id: string;
  filename: string;
  path: string;
  bytes: number;
  mimeType: string;
  kind: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  variants?: any[];
  metadata?: {
    name?: string;
    title?: string;
    description?: string;
    category?: string;
    notes?: string;
  };
}

export const assetsAPI = {
  listAssets: async (_filters: any) => {
    return {
      assets: [] as Asset[],
      pagination: { pages: 1 },
    };
  },

  generateUploadUrl: async (_data: any) => {
    return {
      uploadUrl: '',
      assetId: '',
    };
  },

  uploadFile: async (_url: string, _file: File) => {
    return;
  },

  completeUpload: async (_assetId: string) => {
    return;
  },

  getAssetUrl: async (_assetId: string) => {
    return {
      url: '',
    };
  },

  deleteAsset: async (_assetId: string) => {
    return;
  },
};
