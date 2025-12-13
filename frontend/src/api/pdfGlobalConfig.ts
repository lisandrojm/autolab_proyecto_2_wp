import axios from "./axiosConfig";

export interface PdfGlobalConfig {
  _id: string;
  tenantId: string;
  razonSocial?: string;
  cuit?: string;
  ciudad?: string;
  logoUrl?: string;
  signatureUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export const pdfGlobalConfigAPI = {
  get: async (): Promise<PdfGlobalConfig> => {
    const response = await axios.get("/pdf-global-config");
    return response.data;
  },

  update: async (data: FormData): Promise<PdfGlobalConfig> => {
    const response = await axios.put("/pdf-global-config", data, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },
};
