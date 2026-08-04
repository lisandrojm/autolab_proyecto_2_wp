import axios from "./axiosConfig";

export interface AfipStatus {
  connected: boolean;
  cuitRepresentada: string | null;
  ambiente: "homologacion" | "produccion";
  connectedAt: string | null;
  canManageConnection: boolean;
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
}

export interface ResultadoConsultaPadronBulk {
  resultados: ResultadoConsultaPadron[];
  consultados: number;
  sinCuit: number;
  contratosActualizados: number;
}

export const afipAPI = {
  async status(): Promise<AfipStatus> {
    const { data } = await axios.get("/afip/status");
    return data;
  },

  async connect(payload: { cuitRepresentada: string; certificadoPem: string; clavePrivadaPem: string; ambiente: "homologacion" | "produccion" }): Promise<AfipStatus> {
    const { data } = await axios.post("/afip/connect", payload, { timeout: 30000 });
    return data;
  },

  async disconnect(): Promise<void> {
    await axios.post("/afip/disconnect");
  },

  /** Puede tardar (una consulta SOAP por CUIT, con concurrencia acotada) — timeout propio más largo. */
  async consultarPadronBulk(targets: ConsultaPadronTarget[]): Promise<ResultadoConsultaPadronBulk> {
    const { data } = await axios.post("/afip/consulta-padron/bulk", { targets }, { timeout: 180000 });
    return data;
  },
};
