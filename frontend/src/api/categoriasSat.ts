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
}

export const categoriaSatAPI = new CategoriaSatAPI();
