import axios from "./axiosConfig";

/**
 * Términos y condiciones del registro con link. A lo sumo uno está `vigente`: es el que se muestra y
 * se acepta al registrarse. Editar el texto sube la `version` y guarda la anterior en el server.
 */
export interface TerminosItem {
  _id: string;
  titulo: string;
  /** HTML del editor. */
  contenido: string;
  vigente: boolean;
  version: number;
  /** Cuántas personas aceptaron alguna versión al registrarse. */
  aceptaciones: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TerminosInput {
  titulo: string;
  contenido: string;
  vigente: boolean;
}

class TerminosCondicionesAPI {
  async list(): Promise<TerminosItem[]> {
    const { data } = await axios.get("/terminos-condiciones");
    return data;
  }

  async create(payload: TerminosInput): Promise<TerminosItem> {
    const { data } = await axios.post("/terminos-condiciones", payload);
    return data;
  }

  async update(id: string, payload: TerminosInput): Promise<TerminosItem> {
    const { data } = await axios.put(`/terminos-condiciones/${id}`, payload);
    return data;
  }

  async remove(id: string): Promise<void> {
    await axios.delete(`/terminos-condiciones/${id}`);
  }

  /** El texto exacto de una versión: lo que aceptó una persona, aunque después se haya editado. */
  async version(id: string, version: number): Promise<{ titulo: string; contenido: string; version: number; esLaActual: boolean }> {
    const { data } = await axios.get(`/terminos-condiciones/${id}/version/${version}`);
    return data;
  }
}

export const terminosCondicionesAPI = new TerminosCondicionesAPI();
