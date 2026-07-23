/**
 * Reemplaza `{{variable}}` (y también `{variable}`) por su valor dentro del HTML.
 * Solo reemplaza las claves presentes en `data` con valor no vacío; el resto queda intacto.
 */
export declare function replaceReleaseVariables(html: string, data: Record<string, any>): string;
/**
 * Construye el .docx final: reemplaza las variables en el contenido y lo convierte a Word.
 * Devuelve el Buffer listo para enviar en la respuesta.
 */
export declare function buildReleaseDocx(content: string, data: Record<string, any>): Promise<Buffer>;
/**
 * Valores de ejemplo para la previsualización del release desde el editor
 * (equivalente a getDummyVariables de las plantillas PDF).
 */
export declare function getReleaseDummyVariables(): Record<string, string>;
