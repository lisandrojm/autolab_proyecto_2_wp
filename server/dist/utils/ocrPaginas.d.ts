import { PDFParse } from "pdf-parse";
import { type Worker } from "tesseract.js";
export declare function abrirOcr(): Promise<Worker>;
/** El PNG de una página (base 1), renderizada al doble de tamaño. */
export declare function renderizarPagina(parser: PDFParse, pagina: number): Promise<Buffer>;
export declare function ocrDeImagen(worker: Worker, png: Buffer): Promise<{
    texto: string;
    confianza: number;
}>;
