import os from "os";
import path from "path";
import { createWorker, PSM } from "tesseract.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
/**
 * OCR DE LAS PÁGINAS DE UN PDF (módulo Recibos de sueldo, 20/10/2026).
 *
 * Los recibos de MEMOSOFT (el sistema de sueldos del cliente) traen como texto sólo los rótulos de la
 * plantilla: los datos de la persona —nombre, CUIL, período, importes— están dibujados como trazos,
 * así que el extractor de texto no los ve. Se renderiza cada página a imagen y se le pasa tesseract
 * (idioma español, modelo «fast»). El modelo vive en `server/tessdata`, en el repo, para no depender
 * de bajarlo de internet en el servidor.
 *
 * LO QUE SE APRENDIÓ PROBANDO CON LA SÁBANA REAL (54 páginas):
 *  · La página entera a 2× lee bien casi todo (1,2 s). A 3× algunas páginas pierden la caja de datos
 *    completa (tesseract la toma como figura), así que NO sirve subir la escala a ciegas.
 *  · La CAJA DE DATOS (arriba a la derecha: apellido y nombre, legajo, CUIL, ingreso, período
 *    liquidado) recortada a 3× y leída como UNA COLUMNA (PSM 4) sale entera en las tres páginas que la
 *    página completa fallaba, en 0,35 s. Es la primera pasada: de ahí salen el nombre y el CUIL.
 *  · La página entera sigue haciendo falta: trae el «ORIGINAL»/«COPIA» de arriba (parte la sábana), la
 *    empleadora y los conceptos.
 *  · Binarizar la imagen antes del OCR empeora la lectura.
 * Las coordenadas de la caja son las del recibo de MEMOSOFT; en otro formato esa pasada devuelve
 * poco y nada, y la página entera hace el trabajo.
 *
 * Un solo worker por lote, páginas en serie: el OCR es CPU y correr varias a la vez no las apura.
 */
const TESSDATA = path.resolve(process.cwd(), "tessdata");
// Donde tesseract descomprime el modelo: fuera de `storage` (que está en git).
const CACHE = path.join(os.tmpdir(), "weprodu-tessdata");
/** La caja de datos del recibo, como fracción de la página: de 44 % a 100 % de ancho, de 2 % a 21 % de alto. */
const CAJA_DATOS = { x0: 0.44, y0: 0.02, x1: 1, y1: 0.21 };
const ENCABEZADO = { x0: 0, y0: 0, x1: 1, y1: 0.3 };
export async function abrirOcr() {
    return createWorker("spa", 1, { langPath: TESSDATA, gzip: true, cachePath: CACHE });
}
/** El PNG de una página (base 1), renderizada a `escala` veces su tamaño. */
export async function renderizarPagina(parser, pagina, escala) {
    const shot = await parser.getScreenshot({ partial: [pagina], scale: escala });
    const p = shot?.pages?.[0];
    if (!p?.data)
        throw new Error(`No se pudo renderizar la página ${pagina}.`);
    return Buffer.from(p.data);
}
/** Un recorte de la imagen, por fracciones de ancho y alto. */
export async function recortar(png, caja) {
    const img = await loadImage(png);
    const x = Math.round(img.width * caja.x0);
    const y = Math.round(img.height * caja.y0);
    const w = Math.max(1, Math.round(img.width * (caja.x1 - caja.x0)));
    const h = Math.max(1, Math.round(img.height * (caja.y1 - caja.y0)));
    const c = createCanvas(w, h);
    c.getContext("2d").drawImage(img, x, y, w, h, 0, 0, w, h);
    return c.toBuffer("image/png");
}
export async function ocrDeImagen(worker, png, psm = PSM.AUTO) {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const r = await worker.recognize(png);
    return { texto: r.data.text || "", confianza: Math.round(r.data.confidence || 0) };
}
/**
 * El texto OCR de una página: la caja de datos y la página entera siempre; si con eso `faltaAlgo`
 * (no apareció el CUIL) o se pidió `minucioso` (botón «volver a leer»), también la página entera a 3×
 * y el encabezado a 4×. Devuelve las pasadas hechas, para el texto crudo.
 */
export async function ocrDePagina(worker, parser, pagina, faltaAlgo, minucioso = false) {
    const partes = [];
    const pasadas = [];
    const pasar = async (nombre, png, psm) => {
        const r = await ocrDeImagen(worker, png, psm);
        partes.push(r.texto);
        pasadas.push(`${nombre} (confianza ${r.confianza}%)`);
    };
    const a3 = await renderizarPagina(parser, pagina, 3);
    await pasar("caja de datos 3×", await recortar(a3, CAJA_DATOS), PSM.SINGLE_COLUMN);
    await pasar("página entera 2×", await renderizarPagina(parser, pagina, 2), PSM.AUTO);
    if (minucioso || faltaAlgo(partes.join("\n"))) {
        await pasar("página entera 3×", a3, PSM.AUTO);
        await pasar("encabezado 4×", await recortar(await renderizarPagina(parser, pagina, 4), ENCABEZADO), PSM.AUTO);
    }
    return { texto: partes.join("\n"), pasadas };
}
