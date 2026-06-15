import axios from "./axiosConfig";

export interface ContratoFrameItem {
  _id: string;
  externalId: string;
  name: string;
  data: {
    id?: number;
    nombre: string;
    rutaArchivo: string;
    cantidadJornadas: number;
    multiplicadorDiario: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ContratoFramePayload {
  nombre: string;
  externalId?: string;
  cantidadJornadas?: number | string;
  multiplicadorDiario?: number | string;
  rutaArchivo?: string;
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

  async create(payload: ContratoFramePayload): Promise<ContratoFrameItem> {
    const { data } = await axios.post("/contratos-frame", payload);
    return data;
  }

  async update(id: string, payload: ContratoFramePayload): Promise<ContratoFrameItem> {
    const { data } = await axios.put(`/contratos-frame/${id}`, payload);
    return data;
  }

  async remove(id: string): Promise<{ message: string }> {
    const { data } = await axios.delete(`/contratos-frame/${id}`);
    return data;
  }
}

export const contratoFrameAPI = new ContratoFrameAPI();
