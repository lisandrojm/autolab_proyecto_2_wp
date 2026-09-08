/**
 * ¿El HTML del editor tiene texto real? El editor devuelve "<p></p>" cuando está vacío, que como
 * string es truthy → hay que mirar el texto sin etiquetas. Sirve para no generar/descargar PDFs vacíos.
 */
export declare function htmlHasText(html?: string | null): boolean;
/** La clase que pinta los valores que salieron de una variable. Solo se usa en las previsualizaciones. */
export declare const CLASE_VARIABLE_SIMULADA = "wp-var-sim";
/**
 * Reemplaza `{{variable}}` (y también `{variable}`) por su valor dentro del HTML.
 * Reemplaza todas las claves presentes en `data` (aunque estén vacías); el resto queda intacto.
 *
 * `resaltar` envuelve cada valor reemplazado para poder pintarlo. Es SOLO para las previsualizaciones
 * con datos de ejemplo: sirve para ver de un vistazo qué parte del texto sale de una variable y qué
 * está escrito a mano, que es justo lo que un contrato ya armado no deja distinguir. En los
 * documentos reales va apagado — un contrato que se firma no puede salir con medias frases en color.
 */
export declare function replaceDocVariables(html: string, data: Record<string, any>, opciones?: {
    resaltar?: boolean;
}): string;
/**
 * Datos del membrete de la empresa para encabezar/firmar el documento (contratos/releases).
 * Se arma desde la Company elegida al descargar (logo/firma como paths en disco).
 */
export interface MembreteInput {
    logoUrl?: string;
    signatureUrl?: string;
    razonSocial?: string;
    cuit?: string;
    domicilio?: string;
    firmanteNombre?: string;
    firmanteCargo?: string;
}
/** Mapea una Company (empresa elegida) al membrete del documento. */
export declare function empresaToMembrete(empresa: any): MembreteInput;
/**
 * Construye el PDF final: reemplaza las variables en el contenido y lo renderiza.
 * Devuelve el Buffer listo para enviar en la respuesta.
 */
export declare function buildDocPdf(content: string, data: Record<string, any>, membrete?: MembreteInput, opciones?: {
    resaltarVariables?: boolean;
}): Promise<Buffer>;
/**
 * Valores de ejemplo para la previsualización del documento desde el editor
 * (equivalente a getDummyVariables de las plantillas PDF).
 */
export declare function getDummyDocVariables(): Record<string, string>;
