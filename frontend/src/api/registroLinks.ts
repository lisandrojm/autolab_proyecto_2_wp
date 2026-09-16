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
  /** «mobile» si lo generó un supervisor o coordinador desde la sección Registro del móvil. */
  origen?: "web" | "mobile";
  projectName?: string | null;
  areaName?: string | null;
  shiftName?: string | null;
}

/** Mi link vigente del móvil para una combinación proyecto/área/turno. */
export interface MiRegistroLink {
  _id: string;
  token: string;
  expiresAt: string;
  diasRestantes: number;
  usageCount: number;
}

/** Una persona que se registró con alguno de mis links. */
export interface Registrado {
  _id: string;
  nombre: string;
  email: string;
  registradoAt: string;
  activo: boolean;
  validadoEnArca: boolean;
  proyecto: string | null;
  area: string | null;
  turno: string | null;
  /** Se registró con MI link. Si no, con el de uno de los coordinadores que superviso. */
  esMio: boolean;
  compartidoPor: string | null;
}

/** Panel: alguien que se registró con un link, con qué link y quién se lo compartió. */
export interface RegistradoAdmin {
  _id: string;
  nombre: string;
  email: string;
  cuit: string | null;
  registradoAt: string;
  activo: boolean;
  validadoEnArca: boolean;
  linkId: string;
  origen: "web" | "mobile";
  /** El link ya no existe: se sabe quién lo compartió, pero no se puede filtrar por él en la lista de links. */
  linkBorrado: boolean;
  compartidoPorId: string | null;
  compartidoPor: string | null;
  clientName: string | null;
}

/** Cómo se registró: sólo lectura. Los datos bancarios vienen resumidos. */
export interface DetalleRegistrado {
  _id: string;
  registradoAt: string;
  proyecto: string | null;
  area: string | null;
  turno: string | null;
  personales: Record<string, any>;
  domicilio: Record<string, any>;
  bancarios: Record<string, any>;
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

  /** Genera un nuevo link persistente con una duración (en días) inmutable. Devuelve el token. */
  async generate(clientId?: string, durationDays?: number): Promise<string> {
    const { data } = await axios.post(`/auth/registro-link`, { clientId, durationDays });
    return data.token;
  }

  /** Móvil: mi link de registro vigente (sólo registra al usuario); si no hay o venció, el server genera uno de 7 días. */
  async miLink(): Promise<MiRegistroLink> {
    const { data } = await axios.post(`/registro-links/mio`, {});
    return data.link;
  }

  /** Móvil: quiénes se registraron con mis links. */
  async misRegistrados(): Promise<Registrado[]> {
    const { data } = await axios.get(`/registro-links/mis-registrados`);
    return data.registrados || [];
  }

  /** Móvil: cómo se registró una persona que invité (sólo lectura). */
  async detalleRegistrado(userId: string): Promise<DetalleRegistrado> {
    const { data } = await axios.get(`/registro-links/mis-registrados/${userId}`);
    return data;
  }

  /**
   * Móvil: borra de la lista un registro propio (o de un supervisor que coordino).
   *
   * El server sólo lo permite mientras sea NADA MÁS que un registro: con contrato, con proyecto o con
   * una solicitud en curso responde 409 y explica qué hacer, porque ahí borrarlo se llevaría eso.
   */
  async borrarRegistrado(userId: string): Promise<void> {
    await axios.delete(`/registro-links/mis-registrados/${userId}`);
  }

  /** Panel: todos los que se registraron con un link. */
  async registrados(): Promise<RegistradoAdmin[]> {
    const { data } = await axios.get(`/registro-links/registrados`);
    return data.registrados || [];
  }

  /** Panel: cuántos días duran los links que se generan desde el móvil. */
  async config(): Promise<{ diasLinkMovil: number }> {
    const { data } = await axios.get(`/registro-links/config`);
    return data;
  }

  /** Panel: cambia la duración de los links del móvil. Aplica a los que se generen desde ahora. */
  async guardarConfig(diasLinkMovil: number): Promise<{ diasLinkMovil: number }> {
    const { data } = await axios.put(`/registro-links/config`, { diasLinkMovil });
    return data;
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
