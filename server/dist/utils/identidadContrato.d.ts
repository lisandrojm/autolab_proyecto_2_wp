import { Types } from "mongoose";
export type ClaveAPoner = {
    tipo: "heredada" | "nueva";
    clave: string;
} | null;
/**
 * Qué clave le corresponde a cada contrato antes de guardar. Puro.
 *
 * `originales`: la clave que tenía cada posición al cargar el documento (`undefined` = documento nuevo).
 * `actuales`: lo que hay ahora en cada posición: su clave y si es un subdocumento nuevo (reemplazo o push).
 *
 * Reglas:
 *  1. Un contrato con clave la conserva, salvo que sea NUEVO y repita una clave que ya está en otra
 *     posición (una copia del contrato dentro del mismo vínculo): ése recibe una nueva.
 *  2. Uno sin clave en la posición `i` HEREDA la que había en `i` al cargar, si el array no se achicó
 *     (`push` sólo agrega al final, así que las posiciones de antes siguen siendo las mismas) y esa clave
 *     no quedó en otra posición. Con el array más corto (se borró un contrato) no se hereda: no se puede
 *     saber qué se corrió adónde.
 *  3. Uno sin clave y nuevo recibe una nueva.
 *  4. Uno sin clave, viejo y sin tocar, queda como está: es trabajo del backfill, que escribe con huella.
 */
export declare function clavesAPoner(originales: (string | null)[] | undefined, actuales: {
    clave: string | null;
    nuevo: boolean;
}[], nuevaClave?: () => string): ClaveAPoner[];
/** Contratos que entran por `updateOne` + `$push` (no pasan por los hooks del modelo): cada uno con su clave. */
export declare function conClaveNueva<T extends Record<string, any>>(contratos: T[]): (T & {
    contratoKey: Types.ObjectId;
})[];
/**
 * La posición de un contrato a partir de lo que mandó el cliente: su `contratoKey` (o el `_id` de
 * subdocumento, que ningún contrato tiene: el subschema es `_id: false`), o la posición misma. -1 si no
 * está. Durante la transición los endpoints aceptan las dos cosas.
 *
 * Por qué importa: la posición cambia sola. Alguien abre el contrato en la posición 2, se va a constatar
 * la obra social en la SSS (captcha, tarda) y mientras tanto se elimina el de la posición 0. Al volver,
 * el 2 ya es otro contrato y el dato se escribe en el alta equivocada, sin error. Con la clave, no.
 *
 * Devuelve la posición, porque el resto del código escribe con `up.contracts[idx] = ...`.
 */
export declare function resolverIndiceContrato(up: {
    contracts?: any[];
}, param: string): number;
/** La clave del contrato en esa posición (también si es una lápida: la referencia apuntaba ahí). */
export declare function claveEnPosicion(contratos: any[] | undefined, idx: number | null | undefined): Types.ObjectId | null;
/** La posición a la que apunta una referencia: por clave si la tiene, por posición si no. -1 si está rota. */
export declare function indiceDeReferencia(contratos: any[] | undefined, ref: {
    contratoKey?: unknown;
    indice?: number | null;
}): number;
/**
 * Filtro de Mongo para «lo que cuelga de este contrato» en una colección que guarda `{campoIndice, contratoKey}`:
 * lo que tiene la clave, y lo viejo sin clave que está en esa posición. Lo que tiene OTRA clave no entra
 * aunque comparta la posición.
 */
export declare function filtroDeContrato(idx: number, clave: Types.ObjectId | null, campoIndice?: string, prefijo?: string): Record<string, unknown>;
/**
 * LA HUELLA DE UNA REFERENCIA (backfill de la etapa 2c). Antes de la 2b las posiciones se corrían con
 * cada borrado físico: una referencia vieja puede estar apuntando a OTRO contrato que el que nombró. Lo
 * que la referencia guardó del contrato (alta, baja, empleadora) tiene que coincidir con el que hoy está
 * en esa posición; si no, la clave no se pone y la referencia queda para revisar a mano.
 * `null` = coincide (o la referencia no guardó nada que comparar); si no, el motivo.
 */
export declare function huellaNoCoincide(c: any, h: {
    alta?: string | null;
    baja?: string | null;
    empresaId?: unknown;
}): string | null;
