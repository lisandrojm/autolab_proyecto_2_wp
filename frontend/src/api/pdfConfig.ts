import axios from "./axiosConfig";

export interface PdfConfig {
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

export const pdfConfigAPI = {
  get: async (): Promise<PdfConfig> => {
    const response = await axios.get("/pdf-config");
    return response.data;
  },

  update: async (data: FormData): Promise<PdfConfig> => {
    const response = await axios.put("/pdf-config", data, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },
};
