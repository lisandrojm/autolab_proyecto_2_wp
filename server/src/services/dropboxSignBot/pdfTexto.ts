import type { PaginaPdf } from "../../compartido/reglasColocacionFirma.js";

/**
 * EL TEXTO DE UN PDF CON POSICIONES, página por página, para anclar la firma
 * (`compartido/reglasColocacionFirma.ts`). Los PDF los genera la propia app (texto real: no hace falta
 * OCR). Usa `pdfjs-dist` directo —`pdf-parse` devuelve el texto sin posiciones—, con `y` convertido a
 * «desde arriba», que es como lo esperan las reglas. Si el PDF no se puede leer, devuelve `null` y el
 * resolutor cae a la receta de pantalla.
 */
export async function textoDelPdf(buffer: Buffer): Promise<PaginaPdf[] | null> {
  try {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const paginas: PaginaPdf[] = [];
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        const items = (tc.items as any[])
          .filter((i) => typeof i?.str === "string" && i.str.trim())
          .map((i) => ({ str: String(i.str), x: Number(i.transform?.[4]) || 0, y: vp.height - (Number(i.transform?.[5]) || 0) - (Number(i.height) || 0), w: Number(i.width) || 0, h: Number(i.height) || 0 }));
        paginas.push({ numero: n, ancho: vp.width, alto: vp.height, items });
      }
    } finally {
      await doc.destroy().catch(() => {});
    }
    return paginas;
  } catch (e: any) {
    console.warn("[DROPBOX-SIGN-BOT] No se pudo leer el texto del PDF:", e?.message || e);
    return null;
  }
}
