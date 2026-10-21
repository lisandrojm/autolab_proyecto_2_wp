import os from "os";
import path from "path";
import { PDFParse } from "pdf-parse";
import { createWorker, type Worker } from "tesseract.js";

/**
 * OCR DE LAS PÁGINAS DE UN PDF (módulo Recibos de sueldo, 20/10/2026).
 *
 * Los recibos de MEMOSOFT (el sistema de sueldos del cliente) traen como texto sólo los rótulos de la
 * plantilla: los datos de la persona —nombre, CUIL, período, importes— están dibujados como trazos,
 * así que el extractor de texto no los ve. Se renderiza cada página a imagen y se le pasa tesseract
 * (idioma español, modelo «fast»: ~1 s por página). El modelo vive en `server/tessdata`, en el repo,
 * para no depender de bajarlo de internet en el servidor.
 *
 * Un solo worker por lote, páginas en serie: el OCR es CPU y correr varias a la vez no las apura.
 */

const TESSDATA = path.resolve(process.cwd(), "tessdata");
// Donde tesseract descomprime el modelo: fuera de `storage` (que está en git).
const CACHE = path.join(os.tmpdir(), "weprodu-tessdata");
const ESCALA = 2;

export async function abrirOcr(): Promise<Worker> {
  return createWorker("spa", 1, { langPath: TESSDATA, gzip: true, cachePath: CACHE });
}

/** El PNG de una página (base 1), renderizada al doble de tamaño. */
export async function renderizarPagina(parser: PDFParse, pagina: number): Promise<Buffer> {
  const shot: any = await parser.getScreenshot({ partial: [pagina], scale: ESCALA } as any);
  const p = shot?.pages?.[0];
  if (!p?.data) throw new Error(`No se pudo renderizar la página ${pagina}.`);
  return Buffer.from(p.data);
}

export async function ocrDeImagen(worker: Worker, png: Buffer): Promise<{ texto: string; confianza: number }> {
  const r = await worker.recognize(png);
  return { texto: r.data.text || "", confianza: Math.round(r.data.confidence || 0) };
}
