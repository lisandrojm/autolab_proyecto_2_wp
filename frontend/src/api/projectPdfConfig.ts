import axios from "./axiosConfig";

export interface ProjectPdfConfig {
  _id: string;
  tenantId: string;
  name: string;
  razonSocial?: string;
  cuit?: string;
  ciudad?: string;
  direccion?: string;
  logoUrl?: string;
  signatureUrl?: string;
  signerName?: string;
  signerRole?: string;
  projects: string[];
  createdAt: string;
  updatedAt: string;
}

export const projectPdfConfigAPI = {
  getAll: async (): Promise<ProjectPdfConfig[]> => {
    const response = await axios.get("/project-pdf-configs");
    return response.data;
  },

  create: async (data: Partial<ProjectPdfConfig>): Promise<ProjectPdfConfig> => {
    const response = await axios.post("/project-pdf-configs", data);
    return response.data;
  },

  update: async (id: string, data: Partial<ProjectPdfConfig>): Promise<ProjectPdfConfig> => {
    const response = await axios.put(`/project-pdf-configs/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/project-pdf-configs/${id}`);
  },
};
