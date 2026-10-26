/**
 * DÓNDE VA A QUEDAR LA FIRMA DE UNA PLANTILLA (25/10/2026): el server genera la plantilla con datos de
 * ejemplo, ubica {{firma}} en el PDF como al generar un documento real y devuelve la página. Ver
 * `server/src/services/colocacionDePlantilla.ts` (`probarFirmaDePlantilla`).
 */
export interface PruebaFirmaPlantilla {
  /** La plantilla tiene {{firma}}. Sin eso, el bot ubica la firma por las reglas por rótulo. */
  declara: boolean;
  ok: boolean;
  motivo?: string;
  pagina?: number;
  totalPaginas?: number;
  campo?: { x: number; y: number; w: number; h: number };
  paginaSize?: { w: number; h: number };
  avisos: string[];
  /** El bot coloca en la primera o la última página; en otra, el documento queda en revisión. */
  enviable: boolean;
  imagen?: { base64: string; ancho: number; alto: number };
}

/** ¿El contenido declara dónde firmar? (mismo criterio que el server). */
export const declaraFirma = (contenido: string): boolean => /\{\{\s*firma\s*\}\}/i.test(String(contenido || ""));
