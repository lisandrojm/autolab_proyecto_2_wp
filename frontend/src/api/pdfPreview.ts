import axios from "./axiosConfig";

export const pdfPreviewAPI = {
  preview: async (content: string, code: string, title?: string, pdfText?: string, usaMembrete?: boolean): Promise<Blob> => {
    const response = await axios.post("/pdf-preview/preview", { content, code, title, pdfText, usaMembrete }, { responseType: "blob" });
    return response.data;
  },
};
