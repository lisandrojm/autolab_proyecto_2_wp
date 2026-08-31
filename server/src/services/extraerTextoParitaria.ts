import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";

const ejecutar = promisify(execFile);

/**
 * EL TEXTO PLANO DE UN PDF. No lee importes: devuelve el documento entero como string.
 *
 * QUÉ EXTRACTOR SE USA, Y POR QUÉ HAY DOS
 * ───────────────────────────────────────
 * `pdftotext -layout` (poppler) es lo que se usa a mano y respeta las columnas, que es lo que va a
 * necesitar la capa 3 para leer una tabla de escala. Pero es un binario del sistema: si no está en el
 * server, no hay forma de instalarlo desde acá y la entrega se cae entera por una dependencia que ni
 * siquiera es de Node.
 *
 * `pdf-parse` YA ES DEPENDENCIA declarada del proyecto y no necesita nada del sistema. Verificado
 * contra los 33 PDF guardados: extrae los 33 y conserva las columnas separadas por tabulaciones —el
 * acuerdo de abril 2026 sale con «1.187.208,59 $ 118.720,86 $ 1.305.929,45 $» en una línea—, que es
 * exactamente el formato que la capa 3 va a tener que parsear.
 *
 * Se prefiere `pdftotext` cuando está y se cae a `pdf-parse` cuando no, y QUÉ EXTRACTOR CORRIÓ QUEDA
 * GUARDADO en la publicación. No es un detalle de auditoría: los dos producen layouts distintos, y
 * un parser de tablas afinado contra uno se rompe con el otro sin avisar. Cuando la capa 3 falle
 * sobre un documento, lo primero que hay que poder contestar es con cuál se extrajo.
 */

export type Extractor = "pdftotext" | "pdf-parse";
export type EstadoExtraccion = "ok" | "vacio" | "error";

export interface TextoExtraido {
  texto: string;
  paginas: number;
  estado: EstadoExtraccion;
  motivo: string;
  extractor: Extractor | null;
}

/**
 * Mínimo de caracteres para que un documento cuente como extraído.
 *
 * DOS UMBRALES, PORQUE UNO SOLO NO ALCANZA. El total atrapa el PDF que no devolvió nada; la densidad
 * atrapa el escaneado, que es el caso que de verdad aparece.
 *
 * En los 33 guardados hay uno de 17 páginas con 1479 caracteres: pasa cualquier mínimo total, pero
 * son 87 por página y lo único que tiene capa de texto es el sello de expediente y el «Página N de
 * 17» al pie. El cuerpo del acuerdo es imagen. El resto del corpus arranca en 561 caracteres por
 * página, así que 150 separa los dos mundos con margen y sin tocar ningún documento legítimo.
 */
const MINIMO_TOTAL = 200;
const MINIMO_POR_PAGINA = 150;
/** Con una o dos páginas la densidad no dice nada: una carátula legítima puede tener cuatro líneas. */
const PAGINAS_PARA_MEDIR_DENSIDAD = 3;

let hayPdftotext: boolean | null = null;

/** Si `pdftotext` está instalado. Se averigua UNA vez por proceso: la respuesta no cambia sola. */
export const detectarPdftotext = async (): Promise<boolean> => {
  if (hayPdftotext !== null) return hayPdftotext;
  try {
    await ejecutar("pdftotext", ["-v"]);
    hayPdftotext = true;
  } catch {
    hayPdftotext = false;
  }
  return hayPdftotext;
};

const conPdftotext = async (rutaAbsoluta: string): Promise<{ texto: string; paginas: number }> => {
  // `-layout` conserva las columnas; sin él, una tabla de escala sale como una lista de números
  // sueltos y se pierde qué importe corresponde a qué grupo.
  const { stdout } = await ejecutar("pdftotext", ["-layout", "-enc", "UTF-8", rutaAbsoluta, "-"], { maxBuffer: 64 * 1024 * 1024 });
  let paginas = 0;
  try {
    const { stdout: info } = await ejecutar("pdfinfo", [rutaAbsoluta]);
    paginas = Number(/Pages:\s*(\d+)/.exec(info)?.[1] || 0);
  } catch {
    // `pdfinfo` puede no estar aunque `pdftotext` sí. El salto de página del propio texto alcanza.
    paginas = (stdout.match(/\f/g) || []).length || 1;
  }
  return { texto: stdout, paginas };
};

const conPdfParse = async (bytes: Buffer): Promise<{ texto: string; paginas: number }> => {
  // Import perezoso: si nadie extrae texto, no se carga la librería ni su worker de pdf.js.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const r = await parser.getText();
    return { texto: r.text || "", paginas: Number((r as any).total ?? (r as any).pages?.length ?? 0) };
  } finally {
    await parser.destroy();
  }
};

/**
 * Extrae el texto de un PDF del disco.
 *
 * NUNCA DEVUELVE UN STRING VACÍO COMO ÉXITO. Un PDF escaneado extrae cero caracteres, y guardar eso
 * como `ok` es la forma de que más adelante alguien concluya «este acuerdo no menciona ningún
 * convenio» cuando lo que pasa es que nunca se leyó. Ya pasó dos veces en este proyecto que un cero
 * se leyera como «no hay problema»; acá el cero tiene su propio estado y se ve en pantalla.
 */
export const extraerTexto = async (rutaAbsoluta: string): Promise<TextoExtraido> => {
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(rutaAbsoluta);
  } catch (e: any) {
    return { texto: "", paginas: 0, estado: "error", motivo: `No se pudo leer el archivo: ${e?.message || e}`, extractor: null };
  }

  const extractor: Extractor = (await detectarPdftotext()) ? "pdftotext" : "pdf-parse";
  let texto = "";
  let paginas = 0;
  try {
    const r = extractor === "pdftotext" ? await conPdftotext(rutaAbsoluta) : await conPdfParse(bytes);
    texto = r.texto;
    paginas = r.paginas;
  } catch (e: any) {
    return { texto: "", paginas: 0, estado: "error", motivo: `${extractor} falló: ${e?.message || e}`, extractor };
  }

  const limpio = texto.trim();
  if (limpio.length < MINIMO_TOTAL) {
    return { texto: limpio, paginas, estado: "vacio", motivo: `Solo ${limpio.length} caracteres: el PDF no tiene capa de texto (está escaneado).`, extractor };
  }
  if (paginas >= PAGINAS_PARA_MEDIR_DENSIDAD && limpio.length / paginas < MINIMO_POR_PAGINA) {
    return {
      texto: limpio,
      paginas,
      estado: "vacio",
      motivo: `${limpio.length} caracteres en ${paginas} páginas (${Math.round(limpio.length / paginas)} por página): el cuerpo del documento es imagen, solo tiene texto el sello y el pie.`,
      extractor,
    };
  }
  return { texto: limpio, paginas, estado: "ok", motivo: "", extractor };
};
