import { Document, Types, Model } from "mongoose";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS MOVIMIENTOS DE LAS CUENTAS DE DÍAS. SE AGREGA, NUNCA SE EDITA NI SE BORRA.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * EL SALDO NO SE GUARDA EN NINGÚN LADO. Se calcula sumando estos movimientos.
 *
 * Podría parecer más simple llevar un contador por persona y sumarle o restarle. No lo es: las
 * novedades SE EDITAN —el listado marca «EDITADO» comparando fechas— y cada edición tendría que
 * acordarse de deshacer lo que hizo la versión anterior. El primer mes que alguien corrija una
 * carga vieja, el contador queda mal, y a partir de ahí nadie puede explicar por qué una persona
 * tiene 7 días. Con movimientos, corregir una novedad emite su contramovimiento y el saldo sigue
 * siendo la suma de cosas que pasaron.
 *
 * Por eso tampoco se edita ni se borra un movimiento: para deshacer se emite otro en sentido
 * contrario, apuntando al original con `reversalOf`. El historial queda entero.
 *
 * `rulesSnapshot` guarda la regla EXACTA que se aplicó, aunque hoy haya una sola por tenant. Las
 * reglas cambian —van a editar los días anuales— y sin el snapshot no hay forma de explicar una
 * liquidación del año pasado: se vería con la regla de hoy, que no es la que se usó.
 */
export type LedgerKind = "novedad" | "vacacion" | "devengamiento" | "ajuste" | "vencimiento" | "reversa" | "saldo_inicial" | "asignacion";
export interface ILeaveLedger extends Document {
    tenantId: Types.ObjectId;
    userId: Types.ObjectId;
    accountId: Types.ObjectId;
    /** La fecha DEL HECHO, no la de la carga: un feriado trabajado en marzo cuenta en marzo. */
    date: Date;
    /** A qué período imputa: `'2026'` o `'2026-2027'` para las cuentas por aniversario de ingreso. */
    periodo: string;
    direction: "debit" | "credit";
    /** Siempre positivo. El signo lo pone `direction`, para que no haya dos formas de escribir lo mismo. */
    amount: number;
    source: {
        kind: LedgerKind;
        refId?: Types.ObjectId;
        /**
         * Qué versión del hecho generó este movimiento.
         *
         * Es lo que hace que reprocesar no duplique: si ya hay movimientos de ESTA versión, no se
         * vuelven a emitir. `Request.version` sube con cada edición (ver `models/Request.ts`).
         */
        refVersion?: number;
    };
    /** Si este movimiento deshace a otro, cuál. Los dos quedan a la vista. */
    reversalOf?: Types.ObjectId;
    rulesSnapshot?: Record<string, unknown>;
    /** Obligatorio cuando `source.kind` es `'ajuste'`: un ajuste sin motivo no se puede auditar. */
    motivo?: string;
    createdBy?: Types.ObjectId;
    createdAt: Date;
}
export declare const LeaveLedger: Model<ILeaveLedger>;
