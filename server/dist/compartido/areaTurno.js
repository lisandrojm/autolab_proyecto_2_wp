/**
 * ÁREA × TURNO × SEDE, en un solo lugar (pedido del 18/10/2026).
 *
 * Un proyecto puede tener la misma área en más de una sede, con un supervisor por sede:
 *
 *     Edición | Huidobro   | Mañana → Supervisor A
 *     Edición | Libertador | Mañana → Supervisor B
 *
 * Cada fila de `areasConfig` (y cada `coordinatorAssignments`, cada asignación de un miembro) puede
 * llevar un `sedeId` OPCIONAL: el `data.id` numérico de la sede, el mismo que usan
 * `Project.metadata.sedeIds`, `contracts[].sede_id` y la solicitud (`metadata.sedeId`). Sin `sedeId`
 * la fila vale para todas las sedes, que es exactamente lo que había antes.
 *
 * La CLAVE de una combinación era "areaId::shiftId", escrita a mano en muchos lados. Sigue siendo esa
 * cuando no hay sede (no cambia nada de lo existente) y suma "::s<sedeId>" cuando la hay; la «s» la
 * distingue del rol que el plan de vacaciones agrega como tercera parte.
 *
 * Puro, sin imports: lo usan el server y el front (vía `@compartido`).
 */
/** El id como texto, venga poblado (`{_id}`), como ObjectId o como string. */
export const idDe = (x) => {
    if (x == null)
        return "";
    if (typeof x === "object" && x._id != null)
        return String(x._id);
    return String(x);
};
/** El `sedeId` como número positivo, o null («todas las sedes»). */
export const sedeDe = (x) => {
    const n = Number(x);
    return Number.isInteger(n) && n > 0 ? n : null;
};
/** "areaId::shiftId" sin sede (idéntico a lo de siempre), "areaId::shiftId::s12" con sede. */
export function claveAreaTurno(c) {
    const base = `${idDe(c.areaId)}::${idDe(c.shiftId)}`;
    const sede = sedeDe(c.sedeId);
    return sede ? `${base}::s${sede}` : base;
}
/** Separa una clave de `claveAreaTurno`. Tolera claves viejas de dos partes. */
export function partirClaveAreaTurno(clave) {
    const [areaId = "", shiftId = "", sede = ""] = String(clave || "").split("::");
    return { areaId, shiftId, sedeId: sede.startsWith("s") ? sedeDe(sede.slice(1)) : null };
}
/** La clave de una FILA de área (área + sede, sin turno): para agrupar, dar `key` en React o indexar. */
export const claveFilaArea = (c) => {
    const sede = sedeDe(c.sedeId);
    return sede ? `${idDe(c.areaId)}::s${sede}` : idDe(c.areaId);
};
/**
 * EN QUÉ SEDE DE ESTA ÁREA CAE UNA PERSONA. La asignación misma manda si trae `sedeId`. Si no, la sede
 * de su contrato, siempre que el proyecto tenga esa área en esa sede. Si no la tiene: la fila sin sede
 * si existe; si el área está en una sola fila, esa; si no, null (sin sede).
 */
export function sedeEnArea(areasConfig, areaId, sedeAsignada, sedeContrato) {
    const propia = sedeDe(sedeAsignada);
    if (propia)
        return propia;
    const filas = (areasConfig || []).filter((f) => idDe(f.areaId) === idDe(areaId));
    if (filas.length === 0)
        return null;
    const contrato = sedeDe(sedeContrato);
    if (contrato && filas.some((f) => sedeDe(f.sedeId) === contrato))
        return contrato;
    if (filas.some((f) => !sedeDe(f.sedeId)))
        return null;
    if (filas.length === 1)
        return sedeDe(filas[0].sedeId);
    return null;
}
/**
 * Las claves de un miembro (una por combinación, sin repetir). Con `ctx` (el `areasConfig` del proyecto
 * y la sede de su contrato) las combinaciones llevan la sede que les toca; sin `ctx`, como siempre.
 */
export function clavesDelMiembro(assignments, ctx) {
    const keys = new Set();
    for (const asa of assignments || []) {
        const areaId = idDe(asa?.areaId);
        if (!areaId)
            continue;
        const sede = ctx ? sedeEnArea(ctx.areasConfig, areaId, asa?.sedeId, ctx.sedeContrato) : sedeDe(asa?.sedeId);
        for (const sid of asa?.shiftIds || []) {
            const shiftId = idDe(sid);
            if (shiftId)
                keys.add(claveAreaTurno({ areaId, shiftId, sedeId: sede }));
        }
    }
    return keys;
}
/** «Edición · Libertador» (o sólo «Edición» sin sede). */
export const etiquetaArea = (areaNombre, sedeNombre) => (sedeNombre ? `${areaNombre} · ${sedeNombre}` : areaNombre);
