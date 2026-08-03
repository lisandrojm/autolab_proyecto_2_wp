/**
 * Lectura del PDF de constancia que emite ARCA (padron-puc-constancia-internet). Sirve tanto para la
 * "Constancia de Inscripción" como para la "Constancia de Opción" del Monotributo: las dos traen el
 * CUIT del contribuyente y el pie con la vigencia y el número de verificador.
 *
 * El PDF es texto (no es un escaneo), así que alcanza con extraerlo y buscar los tres datos.
 */
export interface ConstanciaData {
    /** CUIT normalizado a 11 dígitos, sin guiones. Vacío si no se pudo leer. */
    cuit: string;
    /** "YYYY-MM-DD" (el PDF los trae como DD-MM-YYYY). */
    vigenciaDesde?: string;
    vigenciaHasta?: string;
    verificador?: string;
}
/** Deja solo los dígitos; devuelve "" si no llega a los 11 de un CUIT/CUIL. */
export declare const normalizarCuit: (raw?: string | null) => string;
/** Extrae el texto del PDF. Lanza si el archivo no es un PDF legible. */
export declare const extraerTextoPdf: (buffer: Buffer) => Promise<string>;
/**
 * Busca CUIT, vigencia y verificador en el texto de la constancia. Es tolerante a los saltos de
 * línea y a los espacios múltiples que mete la extracción de texto.
 */
export declare const parseConstanciaTexto: (textoCrudo: string) => ConstanciaData;
/** Atajo: extrae el texto del PDF y lo parsea. */
export declare const parseConstanciaPdf: (buffer: Buffer) => Promise<ConstanciaData>;
