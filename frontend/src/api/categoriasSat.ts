import axios from "./axiosConfig";

export interface CategoriaSatItem {
  _id: string;
  externalId: string;
  name: string;
  data: {
    id: number;
    numeroCategoria: number;
    sueldoBruto: number;
    sueldoBrutoLetras: string;
    neto: number;
    sueldoNetoLetras: string;
    fechaActualizacion: string;
    codigoAfip: number;
    presentismo: number;
    sueldoBasico: number;
    sueldoAdicional: number;
    nombre: string;
  };
  createdAt: string;
  updatedAt: string;
}

class CategoriaSatAPI {
  async list(): Promise<CategoriaSatItem[]> {
    const { data } = await axios.get("/categorias-sat");
    return data;
  }

  async downloadTemplate(): Promise<Blob> {
    const { data } = await axios.get("/categorias-sat/template", {
      responseType: "blob",
    });
    return data;
  }

  async importExcel(file: File): Promise<{ message: string; count: number }> {
    const formData = new FormData();
    formData.append("file", file);

    const { data } = await axios.post("/categorias-sat/import", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return data;
  }

  async create(data: any): Promise<CategoriaSatItem> {
    const response = await axios.post("/categorias-sat", data);
    return response.data;
  }

  async update(id: string, data: any): Promise<CategoriaSatItem> {
    const response = await axios.put(`/categorias-sat/${id}`, data);
    return response.data;
  }

  async updateGlobal(numeroCategoria: number, data: any): Promise<{ message: string; modifiedCount: number }> {
    const response = await axios.put(`/categorias-sat/global/${numeroCategoria}`, data);
    return response.data;
  }

  async remove(id: string): Promise<{ message: string }> {
    const response = await axios.delete(`/categorias-sat/${id}`);
    return response.data;
  }
}

export const categoriaSatAPI = new CategoriaSatAPI();
