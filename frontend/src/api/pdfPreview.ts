import axios from "./axiosConfig";

export const pdfPreviewAPI = {
  preview: async (content: string, code: string): Promise<Blob> => {
    const response = await axios.post("/pdf-preview/preview", { content, code }, { responseType: "blob" });
    return response.data;
  },

  previewGlobal: async (): Promise<Blob> => {
    const response = await axios.post("/pdf-preview/preview", { isGlobalPreview: true }, { responseType: "blob" });
    return response.data;
  },
};
