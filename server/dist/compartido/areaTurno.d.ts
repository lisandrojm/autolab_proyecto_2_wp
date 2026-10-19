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
export type IdLike = string | number | {
    _id?: unknown;
    toString(): string;
} | null | undefined;
/** El id como texto, venga poblado (`{_id}`), como ObjectId o como string. */
export declare const idDe: (x: unknown) => string;
/** El `sedeId` como número positivo, o null («todas las sedes»). */
export declare const sedeDe: (x: unknown) => number | null;
/** "areaId::shiftId" sin sede (idéntico a lo de siempre), "areaId::shiftId::s12" con sede. */
export declare function claveAreaTurno(c: {
    areaId: unknown;
    shiftId: unknown;
    sedeId?: unknown;
}): string;
/** Separa una clave de `claveAreaTurno`. Tolera claves viejas de dos partes. */
export declare function partirClaveAreaTurno(clave: string): {
    areaId: string;
    shiftId: string;
    sedeId: number | null;
};
/** La clave de una FILA de área (área + sede, sin turno): para agrupar, dar `key` en React o indexar. */
export declare const claveFilaArea: (c: {
    areaId: unknown;
    sedeId?: unknown;
}) => string;
export interface FilaAreaConfig {
    areaId: unknown;
    shiftIds?: unknown[];
    sedeId?: unknown;
}
/**
 * EN QUÉ SEDE DE ESTA ÁREA CAE UNA PERSONA. La asignación misma manda si trae `sedeId`. Si no, la sede
 * de su contrato, siempre que el proyecto tenga esa área en esa sede. Si no la tiene: la fila sin sede
 * si existe; si el área está en una sola fila, esa; si no, null (sin sede).
 */
export declare function sedeEnArea(areasConfig: FilaAreaConfig[] | undefined, areaId: unknown, sedeAsignada: unknown, sedeContrato: unknown): number | null;
/**
 * Las claves de un miembro (una por combinación, sin repetir). Con `ctx` (el `areasConfig` del proyecto
 * y la sede de su contrato) las combinaciones llevan la sede que les toca; sin `ctx`, como siempre.
 */
export declare function clavesDelMiembro(assignments: any[] | undefined, ctx?: {
    areasConfig?: FilaAreaConfig[];
    sedeContrato?: unknown;
}): Set<string>;
/** «Edición · Libertador» (o sólo «Edición» sin sede). */
export declare const etiquetaArea: (areaNombre: string, sedeNombre?: string | null) => string;
