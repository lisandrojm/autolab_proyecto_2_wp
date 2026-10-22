import { type Worker } from "tesseract.js";
import { type ItemTexto, type PaginaPdf, type Rect, type ReglaColocacion } from "../../compartido/reglasColocacionFirma.js";
/** El PNG de una página (base 1) a `escala` veces su tamaño, con sus medidas en píxeles. */
export declare function renderizarPaginaPng(buffer: Buffer, pagina: number, escala: number): Promise<{
    png: Buffer;
    ancho: number;
    alto: number;
}>;
/**
 * Las líneas horizontales de una imagen: por fila, la corrida más larga de píxeles oscuros; las filas
 * contiguas con el mismo tramo son una línea gruesa. Devuelve puntos PDF (`k` = pt por píxel,
 * `offsetY` = dónde empieza el recorte, en px de la página entera).
 */
export declare function lineasHorizontales(img: {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}, offsetY: number, k: number, minPt?: number): Rect[];
export interface FranjaLeida {
    palabras: ItemTexto[];
    lineas: Rect[];
    ms: number;
}
/** Lee por OCR la franja [desde, hasta) de una página: palabras con caja y líneas horizontales, en puntos PDF. */
export declare function leerFranja(buffer: Buffer, pagina: PaginaPdf, franja: {
    desde: number;
    hasta: number;
}, worker: Worker, escala?: number): Promise<FranjaLeida>;
/**
 * Las páginas de un PDF listas para resolver la colocación: la capa de texto siempre y, si la regla
 * declara una franja de OCR y NINGÚN rótulo de la regla aparece en el texto de las páginas candidatas,
 * las palabras y líneas leídas de la imagen. Sin worker propio abre y cierra uno.
 */
export declare function paginasParaColocacion(buffer: Buffer, regla: ReglaColocacion | null, worker?: Worker): Promise<{
    paginas: PaginaPdf[] | null;
    ocrMs: number;
}>;
