import { Types } from "mongoose";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL MOTOR DE EFECTOS: qué le hace cada novedad al banco de días
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un parte de novedades es un hecho: «el 14 de marzo, Pérez se tomó un compensatorio». Este servicio
 * lo traduce a movimientos de cuenta según cómo esté configurado ese tipo (`RequestConfig.effects`).
 *
 * SE LLAMA EN LOS TRES MOMENTOS DEL PARTE —crear, editar, borrar— y nunca borra un movimiento:
 * para deshacer emite el contrario. Ver `models/LeaveLedger.ts`.
 *
 * ES IDEMPOTENTE. Reprocesar el mismo parte no vuelve a mover nada: los movimientos guardan con qué
 * versión del parte se generaron, y si ya existen los de esta versión, no se hace nada. Importa
 * porque esto se va a llamar desde varios lados —el alta, la edición, algún reproceso a mano— y
 * duplicar días es un error que después nadie encuentra.
 */
/** A qué período imputa una fecha. Hoy sólo calendario; el aniversario llega con el devengamiento. */
export declare const periodoDe: (fecha: Date, modo?: "calendario" | "aniversario_ingreso") => string;
export type AccionSobreElParte = "create" | "update" | "delete";
export interface ResultadoDeEfectos {
    movimientosCreados: number;
    reversasCreadas: number;
    /** `true` cuando no había nada que hacer porque esta versión ya estaba procesada. */
    yaEstaba: boolean;
}
/**
 * Traduce un parte a movimientos del banco de días.
 *
 * @param parte      el documento de `Request` (el parte de novedades)
 * @param accion     qué le pasó al parte
 * @param opciones   quién lo hizo, para dejarlo asentado en los movimientos
 */
export declare function applyEffects(parte: any, accion: AccionSobreElParte, opciones?: {
    tenantId: Types.ObjectId;
    createdBy?: Types.ObjectId | string;
}): Promise<ResultadoDeEfectos>;
/**
 * EL SALDO DE UNA PERSONA, SUMANDO SUS MOVIMIENTOS.
 *
 * No hay un campo que leer: esto ES el saldo. Una agregación por persona, que con los índices de
 * `LeaveLedger` va por (tenantId, userId, accountId).
 */
export declare function saldosDe(tenantId: Types.ObjectId, userIds: (string | Types.ObjectId)[], periodo?: string): Promise<Map<string, Map<string, {
    acreditado: number;
    consumido: number;
    saldo: number;
}>>>;
