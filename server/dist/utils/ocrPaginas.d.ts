import { PDFParse } from "pdf-parse";
import { PSM, type Worker } from "tesseract.js";
export declare function abrirOcr(): Promise<Worker>;
/** El PNG de una página (base 1), renderizada a `escala` veces su tamaño. */
export declare function renderizarPagina(parser: PDFParse, pagina: number, escala: number): Promise<Buffer>;
/** Un recorte de la imagen, por fracciones de ancho y alto. */
export declare function recortar(png: Buffer, caja: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}): Promise<Buffer>;
export declare function ocrDeImagen(worker: Worker, png: Buffer, psm?: PSM): Promise<{
    texto: string;
    confianza: number;
}>;
/**
 * El texto OCR de una página, en tres pasadas siempre: la caja de datos (nombre, legajo, CUIL,
 * período), la página entera a 2× (trae el «ORIGINAL»/«COPIA» de arriba, que a 3× a veces se pierde)
 * y la página entera a 3× (es la única que lee la fila de totales en gris: el neto a cobrar). Unos
 * 3 s por página. Si con eso `faltaAlgo` (no apareció el CUIL) o se pidió `minucioso` (botón «volver
 * a leer»), también el encabezado a 4×. Devuelve las pasadas hechas, para el texto crudo.
 */
export declare function ocrDePagina(worker: Worker, parser: PDFParse, pagina: number, faltaAlgo: (texto: string) => boolean, minucioso?: boolean): Promise<{
    texto: string;
    pasadas: string[];
}>;
