import { PDFParse } from "pdf-parse";

/**
 * Lectura del PDF de constancia que emite ARCA (padron-puc-constancia-internet). Sirve tanto para la
 * "Constancia de Inscripción" como para la "Constancia de Opción" del Monotributo: las dos traen el
 * CUIT del contribuyente y el pie con la vigencia y el número de verificador.
 *
 * El PDF es texto (no es un escaneo), así que alcanza con extraerlo y buscar los tres datos.
 */
export interface ConstanciaData {
  /** CUIT normalizado a 11 dígitos, sin guiones. Vacío si no se pudo leer. */
  cuit: string;
  /** "YYYY-MM-DD" (el PDF los trae como DD-MM-YYYY). */
  vigenciaDesde?: string;
  vigenciaHasta?: string;
  verificador?: string;
}

/** Deja solo los dígitos; devuelve "" si no llega a los 11 de un CUIT/CUIL. */
export const normalizarCuit = (raw?: string | null): string => {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length === 11 ? d : "";
};

/** "02-08-2026" → "2026-08-02". Devuelve undefined si no matchea el formato. */
const fechaArcaAIso = (s?: string): string | undefined => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
};

/** Extrae el texto del PDF. Lanza si el archivo no es un PDF legible. */
export const extraerTextoPdf = async (buffer: Buffer): Promise<string> => {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const res = await parser.getText();
    return res.text || "";
  } finally {
    await parser.destroy().catch(() => {});
  }
};

/**
 * Busca CUIT, vigencia y verificador en el texto de la constancia. Es tolerante a los saltos de
 * línea y a los espacios múltiples que mete la extracción de texto.
 */
export const parseConstanciaTexto = (textoCrudo: string): ConstanciaData => {
  const texto = String(textoCrudo || "").replace(/\s+/g, " ");

  // "CUIT: 23-27602575-9" (con o sin guiones, con o sin dos puntos).
  const mCuit = /CUIT\s*:?\s*(\d{2})\s*-?\s*(\d{8})\s*-?\s*(\d)/i.exec(texto);
  const cuit = mCuit ? `${mCuit[1]}${mCuit[2]}${mCuit[3]}` : "";

  // "Vigencia de la presente constancia: 02-08-2026 a 01-09-2026"
  const mVig = /Vigencia\s+de\s+la\s+presente\s+constancia\s*:?\s*(\d{2}-\d{2}-\d{4})\s*a\s*(\d{2}-\d{2}-\d{4})/i.exec(texto);

  // "Verificador 204297607130"
  const mVer = /Verificador\s*:?\s*(\d{6,})/i.exec(texto);

  return {
    cuit,
    vigenciaDesde: fechaArcaAIso(mVig?.[1]),
    vigenciaHasta: fechaArcaAIso(mVig?.[2]),
    verificador: mVer?.[1],
  };
};

/** Atajo: extrae el texto del PDF y lo parsea. */
export const parseConstanciaPdf = async (buffer: Buffer): Promise<ConstanciaData> => parseConstanciaTexto(await extraerTextoPdf(buffer));
