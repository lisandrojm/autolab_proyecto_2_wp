import axios from "./axiosConfig";

/** "ok" = autoconsulta contra Padrón A13 respondió bien; "no_autorizado" = el login WSAA funciona
 *  pero AFIP no devuelve datos para el propio CUIT representada (servicio no autorizado en el
 *  Administrador de Relaciones); "error" = falló la verificación en sí (transporte/WSAA);
 *  null = todavía no se corrió esta verificación (conexión anterior a esta feature). */
export type ServicioPadronEstado = "ok" | "no_autorizado" | "error";

export interface AfipStatus {
  connected: boolean;
  cuitRepresentada: string | null;
  ambiente: "homologacion" | "produccion";
  connectedAt: string | null;
  certificadoAlias: string | null;
  certificadoVencimiento: string | null;
  canManageConnection: boolean;
  servicioPadronOk: boolean | null;
  servicioPadronEstado: ServicioPadronEstado | null;
  servicioPadronDetalle: string | null;
  servicioPadronFaultCode: string | null;
  servicioPadronFaultString: string | null;
  servicioPadronVerificadoAt: string | null;
}

export interface ConnectResult {
  connected: boolean;
  cuitRepresentada: string;
  ambiente: "homologacion" | "produccion";
  connectedAt: string;
  servicioPadronOk: boolean;
  servicioPadronEstado: ServicioPadronEstado;
  servicioPadronDetalle: string;
}

export interface VerificacionServicioPadron {
  ok: boolean;
  estado: ServicioPadronEstado;
  detalle: string;
  faultCode?: string;
  faultString?: string;
  verificadoAt: string;
}

export interface ConsultaPadronTarget {
  projectId: string;
  userId: string;
  contractIndex: number;
}

export interface ResultadoConsultaPadron {
  cuit: string;
  estado?: "activo" | "inactivo" | "desconocido";
  encontrado?: boolean;
  denominacion?: string;
  error?: string;
  contratosActualizados: number;
  /** true si quedó archivada en Dropbox (carpeta "Constancia de cuit"); si es "activo" pero esto es false/undefined, falta ese paso — ver dropboxCfg/carpetaConstancia en el server. */
  dropboxSubido?: boolean;
  /** Por qué no se pudo archivar en Dropbox (Dropbox no conectado, carpeta no configurada, o el error real de la subida). */
  dropboxError?: string;
  /** Con qué CUIT/ambiente del tenant se hizo la consulta — para diagnosticar sin acceso al server. */
  cuitRepresentada?: string;
  ambiente?: string;
  /** faultcode/faultstring reales del SOAP Fault de AFIP, si la consulta terminó en uno. */
  faultCode?: string;
  faultString?: string;
  /** Respuesta cruda de AFIP (o el Fault, si lo hubo) tal cual la parseó el server. */
  raw?: any;
}

export interface ResultadoConsultaPadronBulk {
  resultados: ResultadoConsultaPadron[];
  consultados: number;
  sinCuit: number;
  contratosActualizados: number;
}

/** Un registro persistente de un llamado real a AFIP (guardado por el server en cada consulta). */
export interface AfipLogEntry {
  _id: string;
  tipo: "padron" | "servicio_test";
  cuitConsultado: string;
  cuitRepresentada: string;
  ambiente: "homologacion" | "produccion";
  encontrado?: boolean;
  estado?: "activo" | "inactivo" | "desconocido";
  faultCode?: string;
  faultString?: string;
  raw?: any;
  error?: string;
  createdAt: string;
}

export const afipAPI = {
  async status(): Promise<AfipStatus> {
    const { data } = await axios.get("/afip/status");
    return data;
  },

  async connect(payload: { cuitRepresentada: string; certificadoPem: string; clavePrivadaPem: string; ambiente: "homologacion" | "produccion" }): Promise<ConnectResult> {
    const { data } = await axios.post("/afip/connect", payload, { timeout: 30000 });
    return data;
  },

  async disconnect(): Promise<void> {
    await axios.post("/afip/disconnect");
  },

  /** Re-corre la autoconsulta de prueba contra Padrón A13 con las credenciales ya guardadas — para
   *  revalidar después de arreglar la autorización del servicio en AFIP, sin re-pegar el certificado. */
  async verificarServicio(): Promise<VerificacionServicioPadron> {
    const { data } = await axios.post("/afip/verificar-servicio", {}, { timeout: 30000 });
    return data;
  },

  /** Puede tardar (una consulta SOAP por CUIT, con concurrencia acotada) — timeout propio más largo. */
  async consultarPadronBulk(targets: ConsultaPadronTarget[]): Promise<ResultadoConsultaPadronBulk> {
    const { data } = await axios.post("/afip/consulta-padron/bulk", { targets }, { timeout: 180000 });
    return data;
  },

  /** Últimos llamados reales a AFIP (Consulta Padrón / autoconsulta de servicio) — para diagnosticar
   *  sin depender de haber visto el toast en el momento. */
  async logs(): Promise<AfipLogEntry[]> {
    const { data } = await axios.get("/afip/logs");
    return data?.logs || [];
  },
};
