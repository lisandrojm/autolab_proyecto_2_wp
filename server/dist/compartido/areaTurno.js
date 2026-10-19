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
 * EN QUÉ FILA (SEDE) DE ESTA ÁREA ESTÁ UNA PERSONA. Explícito, sin adivinar (pedido del 18/10/2026):
 * antes se deducía de la sede del contrato, y la gente terminaba en la principal sin que nadie lo
 * decidiera. Devuelve:
 *   · número  → la fila con esa sede;
 *   · null    → la fila sin sede (la de la sede principal, la de siempre);
 *   · undefined → NO ESTÁ EN NINGUNA: el área tiene varias sedes y la persona no tiene una que exista
 *                 ahí. Se muestra como «falta elegir sede» para ubicarla a mano.
 *
 *   1. El área no está en `areasConfig`: la sede de la asignación, o sin sede (como siempre).
 *   2. El área tiene UNA sola fila: esa, tenga o no sede la asignación. Un proyecto que no usa sedes
 *      por área no cambia nada.
 *   3. Varias filas: la de la sede de la asignación; la sede principal cae en la fila sin sede; sin
 *      sede, o con una sede que el área no tiene → undefined.
 */
export function sedeEnArea(areasConfig, areaId, sedeAsignada, sedePrincipal) {
    const propia = sedeDe(sedeAsignada);
    const filas = (areasConfig || []).filter((f) => idDe(f.areaId) === idDe(areaId));
    if (filas.length === 0)
        return propia;
    if (filas.length === 1)
        return sedeDe(filas[0].sedeId);
    if (propia && filas.some((f) => sedeDe(f.sedeId) === propia))
        return propia;
    if (propia && propia === sedeDe(sedePrincipal) && filas.some((f) => !sedeDe(f.sedeId)))
        return null;
    return undefined;
}
/**
 * Las claves de un miembro (una por combinación, sin repetir). Con `ctx` cada combinación lleva la
 * fila donde está (`sedeEnArea`); las que no están en ninguna (falta elegir sede) no dan clave: ver
 * `pendientesDeSede`. Sin `ctx`, la sede de la asignación tal cual.
 */
export function clavesDelMiembro(assignments, ctx) {
    const keys = new Set();
    for (const asa of assignments || []) {
        const areaId = idDe(asa?.areaId);
        if (!areaId)
            continue;
        const sede = ctx ? sedeEnArea(ctx.areasConfig, areaId, asa?.sedeId, ctx.sedePrincipal) : sedeDe(asa?.sedeId);
        if (sede === undefined)
            continue;
        for (const sid of asa?.shiftIds || []) {
            const shiftId = idDe(sid);
            if (shiftId)
                keys.add(claveAreaTurno({ areaId, shiftId, sedeId: sede }));
        }
    }
    return keys;
}
/** Las áreas (ids) donde el miembro tiene asignación pero FALTA ELEGIR SEDE (el área tiene varias y no está en ninguna). */
export function pendientesDeSede(assignments, ctx) {
    const res = new Set();
    for (const asa of assignments || []) {
        const areaId = idDe(asa?.areaId);
        if (areaId && (asa?.shiftIds || []).length > 0 && sedeEnArea(ctx.areasConfig, areaId, asa?.sedeId, ctx.sedePrincipal) === undefined)
            res.add(areaId);
    }
    return [...res];
}
/** La sede principal de un proyecto a partir de su `metadata` (la primera de `sedeIds`, o la única `sedeId`). */
export function sedePrincipalDe(metadata) {
    const varias = Array.isArray(metadata?.sedeIds) ? metadata.sedeIds.map(sedeDe).filter((x) => x != null) : [];
    return varias[0] ?? sedeDe(metadata?.sedeId);
}
/**
 * Las filas de un área: cuántas sedes tiene en el proyecto. Con más de una, quien elige la fila sin
 * sede tiene que guardar la principal explícita (si no, quedaría «falta elegir sede»).
 */
export const filasDelArea = (areasConfig, areaId) => (areasConfig || []).filter((f) => idDe(f.areaId) === idDe(areaId)).length;
/**
 * La `sedeId` que hay que GUARDAR en una asignación a la fila `sedeFila` de un área: la de la fila;
 * para la fila sin sede de un área con varias sedes, la principal; si el área tiene una sola fila, nada.
 */
export function sedeParaGuardar(areasConfig, areaId, sedeFila, sedePrincipal) {
    const sede = sedeDe(sedeFila);
    if (sede)
        return sede;
    if (filasDelArea(areasConfig, areaId) > 1)
        return sedeDe(sedePrincipal) ?? undefined;
    return undefined;
}
/** «Edición · Libertador» (o sólo «Edición» sin sede). */
export const etiquetaArea = (areaNombre, sedeNombre) => (sedeNombre ? `${areaNombre} · ${sedeNombre}` : areaNombre);
