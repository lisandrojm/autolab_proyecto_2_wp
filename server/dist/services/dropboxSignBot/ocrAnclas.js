import { PDFParse } from "pdf-parse";
import { PSM } from "tesseract.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { coincidencias, patronDeRotulo } from "../../compartido/reglasColocacionFirma.js";
import { abrirOcr } from "../../utils/ocrPaginas.js";
import { textoDelPdf } from "./pdfTexto.js";
/**
 * EL ANCLA CUANDO EL RÓTULO ESTÁ DIBUJADO Y NO ESCRITO (recibos de MEMOSOFT, 22/10/2026).
 *
 * El PDF del recibo trae como texto sólo algunos rótulos de la plantilla; «Firma Empleado» y la línea de
 * arriba son trazos. Para esos tipos la regla declara una FRANJA (`ocr: {desde, hasta}`, fracciones del
 * alto) que se renderiza a imagen y se lee con tesseract pidiendo las PALABRAS con su caja: cada una
 * vuelve como un `ItemTexto` en puntos PDF (fuente «ocr»), y las reglas las tratan igual que el texto.
 * De la misma imagen salen las LÍNEAS HORIZONTALES (corridas de píxeles oscuros), que dan el ancho
 * de la línea de firma.
 *
 * Medido sobre tres recibos reales: a 3× la franja del pie se lee en ~0,6 s y distingue «Firma
 * Empleado» (ORIGINAL) de «Firma Empleador» (COPIA) con 96 % de confianza por símbolo. Reusa el worker
 * de `utils/ocrPaginas.ts` (modelo español en `server/tessdata`).
 */
const ESCALA_OCR = 3;
/** El PNG de una página (base 1) a `escala` veces su tamaño, con sus medidas en píxeles. */
export async function renderizarPaginaPng(buffer, pagina, escala) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
        const shot = await parser.getScreenshot({ partial: [pagina], scale: escala });
        const p = shot?.pages?.[0];
        if (!p?.data)
            throw new Error(`No se pudo renderizar la página ${pagina}.`);
        const png = Buffer.from(p.data);
        const img = await loadImage(png);
        return { png, ancho: img.width, alto: img.height };
    }
    finally {
        await parser.destroy().catch(() => { });
    }
}
/**
 * Las líneas horizontales de una imagen: por fila, la corrida más larga de píxeles oscuros; las filas
 * contiguas con el mismo tramo son una línea gruesa. Devuelve puntos PDF (`k` = pt por píxel,
 * `offsetY` = dónde empieza el recorte, en px de la página entera).
 */
export function lineasHorizontales(img, offsetY, k, minPt = 40) {
    const { data, width, height } = img;
    const minPx = minPt / k;
    const filas = [];
    for (let y = 0; y < height; y++) {
        let mejor = 0;
        let actual = 0;
        let inicio = 0;
        let mejorInicio = 0;
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const oscuro = data[i + 3] > 0 && data[i] < 140 && data[i + 1] < 140 && data[i + 2] < 140;
            if (oscuro) {
                if (actual === 0)
                    inicio = x;
                actual++;
                if (actual > mejor) {
                    mejor = actual;
                    mejorInicio = inicio;
                }
            }
            else
                actual = 0;
        }
        if (mejor >= minPx)
            filas.push({ y, x: mejorInicio, w: mejor });
    }
    const lineas = [];
    for (const f of filas) {
        const u = lineas[lineas.length - 1];
        if (u && f.y - (u.y + u.h) <= 1 && Math.abs(f.x - u.x) <= 3 && Math.abs(f.w - u.w) <= 6)
            u.h = f.y - u.y + 1;
        else
            lineas.push({ x: f.x, y: f.y, w: f.w, h: 1 });
    }
    return lineas.map((l) => ({ x: l.x * k, y: (offsetY + l.y) * k, w: l.w * k, h: Math.max(0.5, l.h * k) }));
}
/** Lee por OCR la franja [desde, hasta) de una página: palabras con caja y líneas horizontales, en puntos PDF. */
export async function leerFranja(buffer, pagina, franja, worker, escala = ESCALA_OCR) {
    const t0 = Date.now();
    const { png, ancho, alto } = await renderizarPaginaPng(buffer, pagina.numero, escala);
    const img = await loadImage(png);
    const y0 = Math.max(0, Math.floor(alto * franja.desde));
    const y1 = Math.min(alto, Math.ceil(alto * franja.hasta));
    const c = createCanvas(ancho, Math.max(1, y1 - y0));
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, y0, ancho, y1 - y0, 0, 0, ancho, y1 - y0);
    // Puntos por píxel: la página mide `pagina.ancho` pt y la imagen `ancho` px.
    const k = pagina.ancho / ancho;
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const r = await worker.recognize(c.toBuffer("image/png"), {}, { blocks: true, text: false });
    const palabras = [];
    for (const b of r.data.blocks || []) {
        for (const p of b.paragraphs || []) {
            for (const l of p.lines || []) {
                for (const w of l.words || []) {
                    const str = String(w.text || "").trim();
                    if (!str)
                        continue;
                    palabras.push({ str, x: w.bbox.x0 * k, y: (y0 + w.bbox.y0) * k, w: (w.bbox.x1 - w.bbox.x0) * k, h: (w.bbox.y1 - w.bbox.y0) * k, fuente: "ocr" });
                }
            }
        }
    }
    const lineas = lineasHorizontales(ctx.getImageData(0, 0, c.width, c.height), y0, k);
    return { palabras, lineas, ms: Date.now() - t0 };
}
/**
 * Las páginas de un PDF listas para resolver la colocación: la capa de texto siempre y, si la regla
 * declara una franja de OCR y NINGÚN rótulo de la regla aparece en el texto de las páginas candidatas,
 * las palabras y líneas leídas de la imagen. Sin worker propio abre y cierra uno.
 */
export async function paginasParaColocacion(buffer, regla, worker) {
    const paginas = await textoDelPdf(buffer);
    if (!paginas || paginas.length === 0 || !regla?.ocr)
        return { paginas, ocrMs: 0 };
    const total = paginas.length;
    const candidatas = regla.pagina === "primera" ? [paginas[0]] : regla.pagina === "ultima" ? [paginas[total - 1]] : paginas;
    const patrones = regla.anclas.map((a) => patronDeRotulo(a.rotulo)).filter((p) => !!p);
    if (candidatas.some((p) => patrones.some((re) => coincidencias(p, re).length > 0)))
        return { paginas, ocrMs: 0 };
    const propio = worker ?? (await abrirOcr());
    let ocrMs = 0;
    try {
        for (const p of candidatas) {
            const r = await leerFranja(buffer, p, regla.ocr, propio);
            p.ocr = r.palabras;
            p.lineas = r.lineas;
            ocrMs += r.ms;
        }
    }
    finally {
        if (!worker)
            await propio.terminate().catch(() => { });
    }
    return { paginas, ocrMs };
}
