import type { PaginaPdf } from "../../compartido/reglasColocacionFirma.js";
/**
 * EL TEXTO DE UN PDF CON POSICIONES, página por página, para anclar la firma
 * (`compartido/reglasColocacionFirma.ts`). Los PDF los genera la propia app (texto real: no hace falta
 * OCR). Usa `pdfjs-dist` directo —`pdf-parse` devuelve el texto sin posiciones—, con `y` convertido a
 * «desde arriba», que es como lo esperan las reglas. Si el PDF no se puede leer, devuelve `null` y el
 * resolutor cae a la receta de pantalla.
 */
export declare function textoDelPdf(buffer: Buffer): Promise<PaginaPdf[] | null>;
