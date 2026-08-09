import axios from "./axiosConfig";

/**
 * Configuración de la casilla que recibe las copias de "documento enviado" de Dropbox Sign.
 * La contraseña nunca viaja de vuelta: el server solo informa si hay una guardada.
 */
export interface DropboxSignConfig {
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  tienePassword: boolean;
  enabled: boolean;
  configuredAt: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckDetalle: string;
}

export interface DropboxSignConfigPayload {
  email: string;
  imapHost: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUser?: string;
  /** Solo se manda cuando se quiere cambiar; vacío conserva la guardada. */
  imapPassword?: string;
  enabled?: boolean;
}

class DropboxSignAPI {
  async config(): Promise<DropboxSignConfig> {
    const { data } = await axios.get("/dropbox-sign/config");
    return data;
  }

  async save(payload: DropboxSignConfigPayload): Promise<{ ok: boolean; tienePassword: boolean; enabled: boolean }> {
    const { data } = await axios.put("/dropbox-sign/config", payload);
    return data;
  }
}

export const dropboxSignAPI = new DropboxSignAPI();
