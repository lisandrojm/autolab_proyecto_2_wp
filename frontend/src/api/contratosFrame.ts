import axios from "./axiosConfig";

export interface ContratoFrameItem {
  _id: string;
  externalId: string;
  name: string;
  empresaId?: string | { _id: string; razonSocial: string; cuit?: string };
  data: {
    id?: number;
    nombre: string;
    rutaArchivo: string;
    cantidadJornadas: number;
    multiplicadorDiario: number;
    fileUrl?: string;
    fileName?: string;
    esTiempoIndeterminado?: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

class ContratoFrameAPI {
  async list(): Promise<ContratoFrameItem[]> {
    const { data } = await axios.get("/contratos-frame");
    return data;
  }

  async downloadTemplate(): Promise<Blob> {
    const { data } = await axios.get("/contratos-frame/template", { responseType: "blob" });
    return data;
  }

  async importExcel(file: File): Promise<{ message: string; count: number }> {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await axios.post("/contratos-frame/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  }

  async create(payload: FormData): Promise<ContratoFrameItem> {
    const { data } = await axios.post("/contratos-frame", payload, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  }

  async update(id: string, payload: FormData): Promise<ContratoFrameItem> {
    const { data } = await axios.put(`/contratos-frame/${id}`, payload, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  }

  async remove(id: string): Promise<{ message: string }> {
    const { data } = await axios.delete(`/contratos-frame/${id}`);
    return data;
  }

  // Trae el archivo como Blob (autenticado) para previsualizarlo en la app.
  async getFileBlob(item: ContratoFrameItem): Promise<Blob> {
    const { data } = await axios.get(`/contratos-frame/${item._id}/download`, { responseType: "blob" });
    return data as Blob;
  }

  async download(item: ContratoFrameItem): Promise<void> {
    const { data } = await axios.get(`/contratos-frame/${item._id}/download`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", item.data?.fileName || item.name || "contrato");
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  // Descarga la plantilla del contrato (.docx) con las variables reemplazadas por los datos del empleado/contrato.
  async downloadFilled(item: ContratoFrameItem, ctx: { userId: string; projectId: string; contractIndex: number }, fileNameOverride?: string): Promise<void> {
    const response = await axios.get(`/contratos-frame/${item._id}/download-filled`, { params: ctx, responseType: "blob" });
    const disposition = (response.headers?.["content-disposition"] as string) || "";
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const fileName = fileNameOverride || match?.[1] || item.data?.fileName || `${item.name || "contrato"}.docx`;
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }
}

export const contratoFrameAPI = new ContratoFrameAPI();
