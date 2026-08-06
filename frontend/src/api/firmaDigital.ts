import axios from "./axiosConfig";

export interface FirmaDigitalConfig {
  /** Nombre del estado ("ENVIO DE DOCUMENTACION") que alimenta la bandeja "Firma Digital", resuelto
   *  dinámicamente por las carpetas de Dropbox configuradas — null si no se encontró ninguna. */
  estadoEnvioDocNombre: string | null;
  /** Path de la carpeta "Outbox" de Dropbox Sign, resuelto de la misma forma — null si no está configurada. */
  outboxCarpeta: string | null;
}

export interface GenerarFirmaPayload {
  projectId: string;
  userId: string;
  contractIndex: number;
  contratoTemplateId: string;
  releaseIds: string[];
  empresaContratoId?: string;
  empresaReleaseId?: string;
}

export interface GenerarFirmaResult {
  firmaContratoUrl: string;
  firmaContratoNombre: string;
  firmaReleases: { releaseId: string; nombre: string; url: string }[];
  firmaGeneradoAt: string;
}

export interface EnviarFirmaTarget {
  projectId: string;
  userId: string;
  contractIndex: number;
  tipoImpositivo?: "alta_temprana_afip" | "constancia_cuit";
}

export interface EnviarFirmaResultado extends EnviarFirmaTarget {
  ok: boolean;
  error?: string;
  archivosSubidos?: number;
}

export interface EnviarFirmaResponse {
  resultados: EnviarFirmaResultado[];
  enviados: number;
}

export const firmaDigitalAPI = {
  async config(): Promise<FirmaDigitalConfig> {
    const { data } = await axios.get("/firma-digital/config");
    return data;
  },

  async generar(payload: GenerarFirmaPayload): Promise<GenerarFirmaResult> {
    const { data } = await axios.post("/firma-digital/generar", payload);
    return data;
  },

  /** Puede tardar (una subida a Dropbox por documento) — timeout propio más largo. */
  async enviar(targets: EnviarFirmaTarget[]): Promise<EnviarFirmaResponse> {
    const { data } = await axios.post("/firma-digital/enviar", { targets }, { timeout: 120000 });
    return data;
  },
};
