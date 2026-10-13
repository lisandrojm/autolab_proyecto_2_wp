import axios from "./axiosConfig";
import { relanzarErrorDeBlob } from "../utils/errorDeBlob";

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
  /** «Se envía a firmar el release» del Tipo de Contrato — default true. */
  incluirReleases?: boolean;
  /** «Se envía a firmar el alta de ARCA» del Tipo de Contrato — default true. */
  incluirAlta?: boolean;
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

/** El trámite (persona × proyecto × contrato) al que pertenece el texto custom. */
export interface TramiteFirma {
  projectId: string;
  userId: string;
  contractIndex: number;
}

/** Un PDF pedido como blob, con el mensaje de error del server a la vista (ver `relanzarErrorDeBlob`). */
async function pedirPdf(url: string, body: unknown): Promise<Blob> {
  try {
    const { data } = await axios.post(url, body, { responseType: "blob", timeout: 120000 });
    return data;
  } catch (error) {
    return relanzarErrorDeBlob(error);
  }
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

  /** Contrato custom: guarda el texto escrito para este trámite (borrador; no genera el PDF). */
  async guardarContenidoCustomContrato(payload: TramiteFirma & { content: string }): Promise<{ contenidoCustomContrato: string; contenidoCustomEditadoEl: string }> {
    const { data } = await axios.post("/firma-digital/contenido-custom-contrato", payload);
    return data;
  },

  /** Release custom: ídem, por release. Guardar vacío (o el placeholder) lo quita del trámite. */
  async guardarContenidoCustomRelease(payload: TramiteFirma & { releaseId: string; content: string }): Promise<{ contenidoCustomReleases: { releaseId: string; content: string }[]; contenidoCustomEditadoEl: string }> {
    const { data } = await axios.post("/firma-digital/contenido-custom-release", payload);
    return data;
  },

  /** Vista previa del Contrato custom con los datos reales del trámite y el texto del editor (sin guardarlo). */
  previewContratoCustom(payload: TramiteFirma & { content: string; contratoTemplateId: string; empresaId?: string }): Promise<Blob> {
    return pedirPdf("/firma-digital/preview-contrato-custom", payload);
  },

  /** Ídem, para un Release custom. */
  previewReleaseCustom(payload: TramiteFirma & { content: string; releaseId: string; empresaId?: string }): Promise<Blob> {
    return pedirPdf("/firma-digital/preview-release-custom", payload);
  },

  /** Puede tardar (una subida a Dropbox por documento) — timeout propio más largo. */
  async enviar(targets: EnviarFirmaTarget[]): Promise<EnviarFirmaResponse> {
    const { data } = await axios.post("/firma-digital/enviar", { targets }, { timeout: 120000 });
    return data;
  },
};
