/**
 * ¿El HTML del editor tiene texto real? El editor devuelve "<p></p>" cuando está vacío, que como
 * string es truthy → hay que mirar el texto sin etiquetas. Sirve para no generar/descargar PDFs vacíos.
 */
export declare function htmlHasText(html?: string | null): boolean;
/**
 * Reemplaza `{{variable}}` (y también `{variable}`) por su valor dentro del HTML.
 * Reemplaza todas las claves presentes en `data` (aunque estén vacías); el resto queda intacto.
 */
export declare function replaceDocVariables(html: string, data: Record<string, any>): string;
/**
 * Construye el PDF final: reemplaza las variables en el contenido y lo renderiza.
 * Devuelve el Buffer listo para enviar en la respuesta.
 */
export declare function buildDocPdf(content: string, data: Record<string, any>): Promise<Buffer>;
/**
 * Valores de ejemplo para la previsualización del documento desde el editor
 * (equivalente a getDummyVariables de las plantillas PDF).
 */
export declare function getDummyDocVariables(): Record<string, string>;
