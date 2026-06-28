import axios from "./axiosConfig";

export interface RegistroLink {
  _id: string;
  token: string;
  clientId: string | null;
  clientName: string | null;
  label: string | null;
  active: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  createdByName: string | null;
}

/** Construye la URL pública de registro a partir de un token. */
export const buildRegistroUrl = (token: string): string => `${window.location.origin}/registro?token=${token}`;

class RegistroLinksAPI {
  /** Lista los links de registro del tenant (activos y revocados). */
  async list(): Promise<RegistroLink[]> {
    const { data } = await axios.get(`/registro-links`);
    return data.links || [];
  }

  /** Genera un nuevo link persistente. Devuelve el token. */
  async generate(clientId?: string): Promise<string> {
    const { data } = await axios.post(`/auth/registro-link`, { clientId });
    return data.token;
  }

  /** Revoca (desactiva) un link. */
  async revoke(id: string): Promise<void> {
    await axios.patch(`/registro-links/${id}/revoke`);
  }

  /** Elimina un link definitivamente. */
  async remove(id: string): Promise<void> {
    await axios.delete(`/registro-links/${id}`);
  }
}

export const registroLinksAPI = new RegistroLinksAPI();
