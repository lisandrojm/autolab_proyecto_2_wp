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

/* ═══════════════ El bot de envío automático a la firma (ver server/src/services/dropboxSignBot) ═══════════════ */

export interface BotEnvioConfig {
  activo: boolean;
  tamanoTanda: number;
  intervaloHoras: number;
  topeDiario: number;
  enfriamientoHoras: number;
  horaDesde: number;
  horaHasta: number;
}

export interface BotConfig {
  loginEmail: string;
  tienePassword: boolean;
  tieneSesion: boolean;
  sesionGuardadaAt: string | null;
  ultimoLoginAt: string | null;
  /** La casilla de CC (el correo configurado arriba). */
  cc: string;
  envio: BotEnvioConfig;
  enviadosHoy: number;
  cupoHoy: number;
  enfriadoHasta: string | null;
  ultimaCorridaAt: string | null;
  ultimaCorrida: { arrancadaEl: string; fin: string; resultado: string; enviados: number; errores: number; limite: boolean; enSeco: boolean; total: number; automatica: boolean } | null;
  ultimoError: string | null;
  proximaCorrida: string;
  corriendo: boolean;
  enSecoForzado: boolean;
}

export interface BotConfigPayload {
  loginEmail?: string;
  /** Sólo cuando se quiere cambiar. */
  loginPassword?: string;
  envio?: Partial<BotEnvioConfig>;
}

export interface BotEvento {
  tipo: string;
  at: string;
  texto: string;
  archivo?: string;
  codigo?: string;
  estado?: string;
}

export interface BotLinea {
  archivo: string;
  codigo: string;
  email: string;
  estado: "enviado" | "error" | "limite" | "requiere_revision" | "seco" | "salteado";
  detalle?: string;
}

export interface BotCorrida {
  hay: boolean;
  corriendo: boolean;
  enSeco?: boolean;
  automatica?: boolean;
  arrancadaEl?: string;
  total?: number;
  enviados?: number;
  errores?: number;
  limite?: boolean;
  irreversible?: boolean;
  detenerPedido?: boolean;
  eventos: BotEvento[];
  lineas?: BotLinea[];
  enSecoForzado: boolean;
}

export interface BotCola {
  tanda: Array<{ archivo: string; codigo: string; tipo: string; email: string; firmante: string }>;
  requiereRevision: Array<{ archivo: string; codigo: string; motivo: string }>;
  yaEnviados: string[];
  pendientesDespues: number;
  cupoHoy: number;
  outbox: string | null;
  archivosEnOutbox: number;
  avisos: string[];
  motivoNoCorre: string | null;
}

export interface BotLog {
  _id: string;
  inicio: string;
  fin: string | null;
  resultado: string;
  enviados: number;
  errores: number;
  limite: boolean;
  enSeco: boolean;
  automatica: boolean;
  lineas: BotLinea[];
  error?: string;
}

export interface BotEnvioRegistro {
  _id: string;
  codigo: string;
  archivo: string;
  email: string;
  firmante: string;
  tipo: string;
  estado: string;
  detalle: string;
  updatedAt: string;
}

class DropboxSignBotAPI {
  async config(): Promise<BotConfig> {
    const { data } = await axios.get("/dropbox-sign/bot/config");
    return data;
  }
  async save(payload: BotConfigPayload): Promise<BotConfig> {
    const { data } = await axios.put("/dropbox-sign/bot/config", payload);
    return data;
  }
  /** Lee el Outbox y dice qué enviaría la próxima tanda. Tarda (lista Dropbox y resuelve firmantes). */
  async cola(): Promise<BotCola> {
    const { data } = await axios.get("/dropbox-sign/bot/cola", { timeout: 120000 });
    return data;
  }
  async arrancar(enSeco = false): Promise<{ arrancada: boolean; enSeco: boolean }> {
    const { data } = await axios.post("/dropbox-sign/bot/corrida", { enSeco });
    return data;
  }
  async detener(): Promise<{ ok: boolean; motivo?: string }> {
    const { data } = await axios.post("/dropbox-sign/bot/corrida/detener");
    return data;
  }
  async corrida(): Promise<BotCorrida> {
    const { data } = await axios.get("/dropbox-sign/bot/corrida");
    return data;
  }
  async logs(): Promise<{ logs: BotLog[]; requierenRevision: BotEnvioRegistro[] }> {
    const { data } = await axios.get("/dropbox-sign/bot/logs");
    return data;
  }
}

export const dropboxSignBotAPI = new DropboxSignBotAPI();

export const dropboxSignAPI = new DropboxSignAPI();
