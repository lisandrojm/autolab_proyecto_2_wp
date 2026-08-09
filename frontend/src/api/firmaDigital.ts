import axios from "./axiosConfig";

export interface FirmaDigitalConfig {
  /** Nombre del estado ("ENVIO DE DOCUMENTACION") que alimenta la bandeja "Firma Digital", resuelto
   *  dinámicamente por las carpetas de Dropbox configuradas — null si no se encontró ninguna. */
  estadoEnvioDocNombre: string | null;
  /** Path de la carpeta "Outbox" de Dropbox Sign, resuelto de la misma forma — null si no está configurada. */
  outboxCarpeta: string | null;
  /** Path de la carpeta intermedia: ya enviado a firmar, esperando la firma del destinatario. */
  pendienteFirmaCarpeta: string | null;
  /** Path de "Requested signatures": donde Dropbox Sign deja los contratos ya firmados. */
  firmadosCarpeta: string | null;
}

export interface GenerarContratoPayload {
  projectId: string;
  userId: string;
  contractIndex: number;
  contratoTemplateId: string;
  empresaContratoId?: string;
  /** Trámite de origen del contrato — si es "constancia_cuit" se etiqueta el nombre del archivo. */
  tramite?: "alta_temprana_afip" | "constancia_cuit";
}

export interface GenerarContratoResult {
  firmaContratoUrl: string;
  firmaContratoNombre: string;
  firmaGeneradoAt: string;
}

export interface GenerarReleasePayload {
  projectId: string;
  userId: string;
  contractIndex: number;
  releaseIds: string[];
  empresaReleaseId?: string;
  tramite?: "alta_temprana_afip" | "constancia_cuit";
}

export interface GenerarReleaseResult {
  firmaReleases: { releaseId: string; nombre: string; url: string }[];
  firmaReleasesGeneradoAt: string;
}

export interface EliminarFirmaTarget {
  projectId: string;
  userId: string;
  contractIndex: number;
}

export interface EnviarFirmaTarget {
  projectId: string;
  userId: string;
  contractIndex: number;
  tipoImpositivo?: "alta_temprana_afip" | "constancia_cuit";
  /** Si el Contrato de este trámite tiene tildado "Se envía a firmar" — default true. Cuando es
   *  false, el server no exige que el Contrato esté generado y no lo incluye en la subida. */
  incluirContrato?: boolean;
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

  /** Botón "Generar" de la columna Contrato — independiente del de Release. */
  async generarContrato(payload: GenerarContratoPayload): Promise<GenerarContratoResult> {
    const { data } = await axios.post("/firma-digital/generar-contrato", payload);
    return data;
  },

  /** Botón "Generar" de la columna Release — independiente del de Contrato. */
  async generarRelease(payload: GenerarReleasePayload): Promise<GenerarReleaseResult> {
    const { data } = await axios.post("/firma-digital/generar-release", payload);
    return data;
  },

  /** Ícono de tacho junto al Contrato ya generado — borra el PDF y limpia los campos para poder volver a "Generar". */
  async eliminarContrato(target: EliminarFirmaTarget): Promise<void> {
    await axios.post("/firma-digital/eliminar-contrato", target);
  },

  /** Ícono de tacho junto al/los Release(s) ya generados — borra los PDFs y limpia los campos. */
  async eliminarRelease(target: EliminarFirmaTarget): Promise<void> {
    await axios.post("/firma-digital/eliminar-release", target);
  },

  /** Puede tardar (una subida a Dropbox por documento) — timeout propio más largo. */
  async enviar(targets: EnviarFirmaTarget[]): Promise<EnviarFirmaResponse> {
    const { data } = await axios.post("/firma-digital/enviar", { targets }, { timeout: 120000 });
    return data;
  },
};
