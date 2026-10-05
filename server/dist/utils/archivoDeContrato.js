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
export function esElAltaEnviada(nombreArchivo, enviadaComo) {
    const limpio = (s) => s.replace(/\.[a-z0-9]{2,5}$/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const enviada = limpio(String(enviadaComo || ""));
    return enviada.length >= 12 && limpio(String(nombreArchivo || "")).includes(enviada);
}
export const TEXTO_DESCARTE = {
    anterior_al_contrato: "el archivo es anterior a la carga del contrato: no puede ser su documento",
    fechas_de_otro_contrato: "las fechas del nombre no son las de este contrato",
};
/** `fecha_carga` (ISO) → ms. null si falta o no se puede leer. */
export function momentoDeCarga(fechaCarga) {
    if (fechaCarga instanceof Date)
        return Number.isFinite(fechaCarga.getTime()) ? fechaCarga.getTime() : null;
    const ms = Date.parse(String(fechaCarga || ""));
    return Number.isFinite(ms) ? ms : null;
}
/**
 * El motivo para NO aplicarle este archivo a este contrato, o null si el archivo es plausible.
 * `fechasArchivo` son las YYYYMMDD que el nombre trae (`leerAnclas(...).fechas`).
 */
export function motivoParaDescartarArchivo(archivo, contrato, fechasArchivo) {
    const modificado = Date.parse(String(archivo.modificadoEl || ""));
    if (Number.isFinite(modificado) && contrato.creadoEl !== null && modificado < contrato.creadoEl)
        return "anterior_al_contrato";
    const fechasContrato = [contrato.fechaAlta, contrato.fechaBaja].filter(Boolean);
    if (fechasArchivo.length > 0 && fechasContrato.length > 0 && !fechasArchivo.some((f) => fechasContrato.includes(f)))
        return "fechas_de_otro_contrato";
    return null;
}
