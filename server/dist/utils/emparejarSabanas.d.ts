/**
 * SUBIDA MASIVA DE RECIBOS (pedido del 21/10/2026): se eligen de una vez todas las sábanas PDF del mes y
 * los TXT que MEMOSOFT exporta con ellas, y acá se decide qué TXT va con qué PDF.
 *
 *   1. Por nombre: «99_PRODUCTORA_REC_SUELDO_2026_PERIODO_09_MES.pdf» con el «.txt» del mismo nombre
 *      (sin importar mayúsculas, tildes, espacios ni el « (1)» que agrega el navegador al bajar dos veces).
 *   2. Por tamaño: el TXT trae una hoja por página del PDF, así que un TXT va con el ÚNICO PDF sin pareja
 *      que tiene tantas páginas como hojas trae él. Si hay varios, desempata el que más palabras del
 *      nombre comparte; si sigue empatado, queda sin pareja (no se adivina).
 *   3. Si se subieron un solo PDF y un solo TXT, van juntos aunque no coincidan: la subida después
 *      verifica hojas contra páginas y explica el problema, en vez de decir sólo «sin pareja».
 *
 * Puro: recibe nombres y tamaños, devuelve los pares. Se testea sin archivos.
 */
export interface SabanaPdf {
    nombre: string;
    paginas: number;
}
export interface SabanaTxt {
    nombre: string;
    hojas: number;
}
export interface Emparejamiento {
    pares: Array<{
        pdf: string;
        txt: string;
        por: "nombre" | "paginas" | "unicos";
    }>;
    pdfsSinTxt: string[];
    txtsSinPdf: Array<{
        nombre: string;
        motivo: string;
    }>;
}
/** El nombre comparable: sin extensión, sin « (1)», sin tildes, en minúsculas y con un solo separador. */
export declare function nombreBase(archivo: string): string;
export declare function emparejarSabanas(pdfs: SabanaPdf[], txts: SabanaTxt[]): Emparejamiento;
