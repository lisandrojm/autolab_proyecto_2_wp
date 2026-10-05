/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ SE LE CAMBIÓ A UNA SOLICITUD AL APROBARLA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quien aprueba abre el alta con lo que se pidió desde la app y, muchas veces, arregla algo antes de
 * guardar: la fecha de baja, el turno, el tipo de contrato. Hasta ahora esa corrección no se veía en
 * ningún lado —la solicitud quedaba «APROBADA» a secas—, así que quien la cargó seguía creyendo que
 * se contrató lo que había pedido y la próxima la cargaba igual.
 *
 * Esto compara lo PEDIDO (el `metadata` de la solicitud) contra lo APROBADO (el contrato que se
 * guardó) y devuelve una lista de diferencias en texto llano, lista para mostrar.
 *
 * DOS REGLAS QUE VALE LA PENA TENER PRESENTES:
 *
 *   · Sólo se comparan los campos que la app DEJA CARGAR. Un campo que quien pide no elige no es una
 *     corrección suya que aprender: es trabajo de quien aprueba, y listarlo sería ruido.
 *
 *   · Un campo que la solicitud dejó VACÍO no cuenta como cambio. No se le corrigió nada: no lo
 *     cargó. Si apareciera, media lista serían «(sin cargar) → algo» en cada aprobación.
 */
export interface CambioDeRevision {
    campo: string;
    pedido: string;
    aprobado: string;
}
/**
 * Compara la solicitud con el contrato que se guardó al aprobarla.
 *
 * `meta` es el `metadata` de la solicitud tal como lo cargó la app; `contrato` es el contrato ya
 * enriquecido (con los `nombre_*` resueltos) que se acaba de guardar.
 */
export declare function cambiosAlAprobar(meta: any, contrato: any, proyecto: {
    _id: any;
    name?: string;
}): Promise<CambioDeRevision[]>;
