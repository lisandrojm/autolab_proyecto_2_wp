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
  expiresAt: string | null;
  createdByName: string | null;
}

/** Construye la URL pública de registro a partir de un token. */
export const buildRegistroUrl = (token: string): string => `${window.location.origin}/registro?token=${token}`;

/** Tiempo de vida de un link: 30 días desde su creación (debe coincidir con el backend). */
export const REGISTRO_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type LinkDates = Pick<RegistroLink, "expiresAt" | "createdAt">;

/**
 * Timestamp (ms) en que vence el link. Usa `expiresAt` del backend; si no llegó
 * (backend viejo / links previos), cae a `createdAt + 30 días`. null si no hay datos.
 */
export const registroLinkExpiry = (link: LinkDates): number | null => {
  if (link.expiresAt) return new Date(link.expiresAt).getTime();
  if (link.createdAt) return new Date(link.createdAt).getTime() + REGISTRO_LINK_TTL_MS;
  return null;
};

/** Días restantes hasta el vencimiento (0 si ya venció, null si no hay fecha). */
export const registroLinkDaysLeft = (link: LinkDates): number | null => {
  const expiry = registroLinkExpiry(link);
  if (expiry === null) return null;
  return Math.max(0, Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000)));
};

/** True si el link ya venció por fecha. */
export const isRegistroLinkExpired = (link: LinkDates): boolean => {
  const expiry = registroLinkExpiry(link);
  return expiry !== null && expiry <= Date.now();
};

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
