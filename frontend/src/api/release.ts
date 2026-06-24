import axios from "./axiosConfig";

export interface Release {
  _id: string;
  tenantId: string;
  name: string;
  version: string;
  description?: string;
  fileUrl?: string;
  fileName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const releasesAPI = {
  getAll: async (): Promise<Release[]> => {
    const response = await axios.get("/releases");
    return response.data;
  },

  getById: async (id: string): Promise<Release> => {
    const response = await axios.get(`/releases/${id}`);
    return response.data;
  },

  create: async (data: FormData): Promise<Release> => {
    const response = await axios.post("/releases", data, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  update: async (id: string, data: FormData): Promise<Release> => {
    const response = await axios.put(`/releases/${id}`, data, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/releases/${id}`);
  },

  download: async (release: Release): Promise<void> => {
    const response = await axios.get(`/releases/${release._id}/download`, {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", release.fileName || `${release.name}-${release.version}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
