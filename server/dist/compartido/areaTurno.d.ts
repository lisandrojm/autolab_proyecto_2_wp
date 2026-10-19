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
export declare function sedeEnArea(areasConfig: FilaAreaConfig[] | undefined, areaId: unknown, sedeAsignada: unknown, sedePrincipal?: unknown): number | null | undefined;
export interface ContextoDeSede {
    areasConfig?: FilaAreaConfig[];
    /** La sede principal del proyecto (`metadata.sedeIds[0]` o `metadata.sedeId`): la de la fila sin sede. */
    sedePrincipal?: unknown;
}
/**
 * Las claves de un miembro (una por combinación, sin repetir). Con `ctx` cada combinación lleva la
 * fila donde está (`sedeEnArea`); las que no están en ninguna (falta elegir sede) no dan clave: ver
 * `pendientesDeSede`. Sin `ctx`, la sede de la asignación tal cual.
 */
export declare function clavesDelMiembro(assignments: any[] | undefined, ctx?: ContextoDeSede): Set<string>;
/** Las áreas (ids) donde el miembro tiene asignación pero FALTA ELEGIR SEDE (el área tiene varias y no está en ninguna). */
export declare function pendientesDeSede(assignments: any[] | undefined, ctx: ContextoDeSede): string[];
/** La sede principal de un proyecto a partir de su `metadata` (la primera de `sedeIds`, o la única `sedeId`). */
export declare function sedePrincipalDe(metadata: any): number | null;
/**
 * Las filas de un área: cuántas sedes tiene en el proyecto. Con más de una, quien elige la fila sin
 * sede tiene que guardar la principal explícita (si no, quedaría «falta elegir sede»).
 */
export declare const filasDelArea: (areasConfig: FilaAreaConfig[] | undefined, areaId: unknown) => number;
/**
 * La `sedeId` que hay que GUARDAR en una asignación a la fila `sedeFila` de un área: la de la fila;
 * para la fila sin sede de un área con varias sedes, la principal; si el área tiene una sola fila, nada.
 */
export declare function sedeParaGuardar(areasConfig: FilaAreaConfig[] | undefined, areaId: unknown, sedeFila: unknown, sedePrincipal: unknown): number | undefined;
/** «Edición · Libertador» (o sólo «Edición» sin sede). */
export declare const etiquetaArea: (areaNombre: string, sedeNombre?: string | null) => string;
