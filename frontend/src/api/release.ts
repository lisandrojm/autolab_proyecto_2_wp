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

  // Trae el archivo como Blob (autenticado) para previsualizarlo en la app.
  getFileBlob: async (release: Release): Promise<Blob> => {
    const response = await axios.get(`/releases/${release._id}/download`, {
      responseType: "blob",
    });
    return response.data as Blob;
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

  // Descarga el release (.docx) con las variables reemplazadas por los datos del empleado/contrato.
  downloadFilled: async (release: Release, ctx: { userId: string; projectId: string; contractIndex: number }): Promise<void> => {
    const response = await axios.get(`/releases/${release._id}/download-filled`, {
      params: ctx,
      responseType: "blob",
    });
    // Intenta usar el filename del header; si no, arma uno.
    const disposition = response.headers?.["content-disposition"] || "";
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const fileName = match?.[1] || release.fileName || `${release.name}.docx`;
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
