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
  /** Historial de lecturas, de la más reciente a la más vieja. Lo muestra el modal de Logs. */
  lastCheckHistorial: CorridaLog[];
}

/** Una corrida de la lectura, con todo lo que decidió. */
export interface CorridaLog {
  at: string;
  ok: boolean;
  detalle?: string;
  logs?: LineaLog[];
}

/** Una línea del log: qué se decidió para un aviso y por qué. */
export interface LineaLog {
  resultado: "archivado" | "duplicado" | "sin-archivo" | "ignorado" | "error";
  asunto?: string;
  archivo?: string;
  cuit?: string;
  documento?: string;
  detalle?: string;
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

  /**
   * Corre la lectura de la casilla ahora mismo. `prueba` solo verifica la conexión y cuenta los
   * avisos sin escribir nada en Dropbox. Puede tardar (conecta por IMAP y sube a Dropbox).
   */
  async leer(prueba = false): Promise<ResultadoLectura> {
    const { data } = await axios.post("/dropbox-sign/leer", { prueba }, { timeout: 120000 });
    return data;
  }
}

/** Resultado de leer la casilla (ver dropboxSignMailService en el server). */
export interface ResultadoLectura {
  ok: boolean;
  detalle: string;
  avisos: number;
  movidos: number;
  /** Salteados porque el documento ya estaba en Pendbox. */
  duplicados: number;
  /** Salteados porque el PDF no aparece en Outbox. */
  sinArchivoEnOutbox: number;
  logs: LineaLog[];
}

export const dropboxSignAPI = new DropboxSignAPI();
