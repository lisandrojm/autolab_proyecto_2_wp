/**
 * Agrupa los contratos por el DOCUMENTO en el que viven, que es `UserProject`.
 *
 * NO ES UNA OPTIMIZACIÓN: es lo que evita que una operación masiva se pierda cambios en silencio.
 *
 * Varios contratos de la misma persona en el mismo proyecto están en el MISMO documento de Mongo,
 * dentro del array `contracts`. Si se procesara contrato por contrato —leer el documento, tocar un
 * contrato, guardar— cada `save()` escribiría el documento ENTERO tal como se lo leyó, y el último
 * pisaría a los anteriores. De tres contratos de una persona se borraría uno solo, y los otros dos
 * volverían intactos sin ningún error: la pantalla diría «3 quitados» y la base tendría 1.
 *
 * Agrupando, el documento se lee una vez, se tocan todos sus contratos y se guarda una vez.
 */
export function agruparContratosPorDocumento(pedidos) {
    const porDocumento = new Map();
    const invalidos = [];
    for (const p of Array.isArray(pedidos) ? pedidos : []) {
        const item = {
            projectId: String(p?.projectId || ""),
            userId: String(p?.userId || ""),
            contratoId: String(p?.contratoId ?? ""),
        };
        if (!item.projectId || !item.userId || !item.contratoId) {
            invalidos.push(item);
            continue;
        }
        const clave = `${item.projectId}|${item.userId}`;
        if (!porDocumento.has(clave))
            porDocumento.set(clave, []);
        porDocumento.get(clave).push(item);
    }
    return { porDocumento, invalidos };
}
/** Vuelve de la clave a sus dos partes. Se separa para que el formato viva en un solo lugar. */
export function partirClaveDocumento(clave) {
    const [projectId, userId] = clave.split("|");
    return { projectId, userId };
}
