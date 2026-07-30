import axios from "./axiosConfig";

/**
 * ReleaseTipo: el tipo de release (análogo a `ContratoItem` para `ContratoFrame`). Es lo que se
 * elige al crear/editar una Plantilla de "Plantillas | Release" (ver `api/release.ts`).
 */
export interface ReleaseTipoItem {
  _id: string;
  name: string;
  isActive?: boolean;
  requiereFirma?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReleaseTipoInput {
  name: string;
  isActive?: boolean;
  requiereFirma?: boolean;
}

class ReleaseTiposAPI {
  async list(): Promise<ReleaseTipoItem[]> {
    const { data } = await axios.get("/release-tipos");
    return data;
  }

  async create(payload: ReleaseTipoInput): Promise<ReleaseTipoItem> {
    const { data } = await axios.post("/release-tipos", payload);
    return data;
  }

  async update(id: string, payload: ReleaseTipoInput): Promise<ReleaseTipoItem> {
    const { data } = await axios.put(`/release-tipos/${id}`, payload);
    return data;
  }

  async remove(id: string): Promise<{ message: string }> {
    const { data } = await axios.delete(`/release-tipos/${id}`);
    return data;
  }
}

export const releaseTiposAPI = new ReleaseTiposAPI();
