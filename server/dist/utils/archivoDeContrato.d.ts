/**
 * ¿ESTE ARCHIVO PUEDE SER EL DOCUMENTO DE ESTE CONTRATO?
 *
 * El cron de Dropbox (`estadoDropboxCronService`) avanza un contrato de estado cuando encuentra en una
 * carpeta un archivo "de esa persona". Identificar a la PERSONA no alcanza: una persona tiene muchos
 * contratos, y en las carpetas quedan para siempre archivos viejos —contratos firmados de meses
 * anteriores, recibos de sueldo— que la nombran.
 *
 * Lo que pasó: Leonel tenía 27 contratos ya en «Disponible» y se le aprobó una solicitud (contrato
 * nuevo, en «Pedido de AFIP»). En «Requested signatures» había un recibo de sueldo de julio con su
 * nombre, sin CUIT ni fechas. El cron lo atribuyó a él por el nombre, el único contrato suyo en un
 * estado anterior era el nuevo, y lo pasó a «Disponible» (firmado): desapareció de la bandeja de ARCA
 * sin que nadie hubiera hecho el alta. Le pasa a cualquiera con un archivo viejo que lo nombre, cada
 * vez que se le crea un contrato.
 *
 * Dos reglas, las dos de sentido común y sin adivinar nada:
 *
 *  1. UN ARCHIVO ANTERIOR AL CONTRATO NO PUEDE SER SU DOCUMENTO. El contrato firmado, el alta de ARCA
 *     o la constancia se generan DESPUÉS de que el contrato existe en el sistema. Si Dropbox dice que
 *     el archivo se modificó por última vez antes de la carga del contrato, es de otra cosa.
 *
 *  2. SI EL NOMBRE TRAE FECHAS, TIENEN QUE SER LAS DEL CONTRATO. La nomenclatura las hace obligatorias
 *     justamente para distinguir contratos de la misma persona. Antes sólo se miraban para desempatar
 *     entre varios candidatos; con un solo candidato se aplicaba el archivo aunque sus fechas fueran de
 *     otro contrato.
 *
 * Sin dato no se opina: un archivo sin fecha de modificación, o un contrato viejo sin `fecha_carga`,
 * no se descartan por la regla 1; un nombre sin fechas, o un contrato sin fechas, no se descartan por
 * la regla 2.
 */
export interface ArchivoParaCotejar {
    /** `serverModified` de Dropbox, ISO. */
    modificadoEl?: string | null;
}
export interface ContratoParaCotejar {
    /** `fecha_carga` del contrato en ms (ver `momentoDeCarga`); null si no la tiene. */
    creadoEl: number | null;
    /** YYYYMMDD, "" si no tiene (mismo formato que las fechas que trae el nombre del archivo). */
    fechaAlta: string;
    fechaBaja: string;
}
export type MotivoDescarte = "anterior_al_contrato" | "fechas_de_otro_contrato";
/**
 * ¿Ese archivo es el ALTA TEMPRANA que este contrato mandó a firmar?
 *
 * El alta viaja sola al Outbox, con el CUIL y las fechas del contrato en el nombre. El proceso que
 * mueve estados no distingue documentos: la tomaría por el contrato y lo pasaría a «Firma pendiente»
 * —y después a «Disponible»— sin que el contrato se haya generado. Se la reconoce por el nombre con
 * el que se la subió (`altaConstancia.enviadaComo`), que es exacto y no depende de cómo esté armada
 * la nomenclatura. Se compara sin extensión ni símbolos y por inclusión: Dropbox Sign devuelve el
 * firmado con el mismo nombre más algún agregado.
 */
export declare function esElAltaEnviada(nombreArchivo: string, enviadaComo: unknown): boolean;
export declare const TEXTO_DESCARTE: Record<MotivoDescarte, string>;
/** `fecha_carga` (ISO) → ms. null si falta o no se puede leer. */
export declare function momentoDeCarga(fechaCarga: unknown): number | null;
/**
 * El motivo para NO aplicarle este archivo a este contrato, o null si el archivo es plausible.
 * `fechasArchivo` son las YYYYMMDD que el nombre trae (`leerAnclas(...).fechas`).
 */
export declare function motivoParaDescartarArchivo(archivo: ArchivoParaCotejar, contrato: ContratoParaCotejar, fechasArchivo: string[]): MotivoDescarte | null;
