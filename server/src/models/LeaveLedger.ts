import { Schema, model, Document, Types, Model } from "mongoose";

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

const leaveLedgerSchema = new Schema<ILeaveLedger>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "LeaveAccount", required: true },
    date: { type: Date, required: true },
    periodo: { type: String, required: true },
    direction: { type: String, enum: ["debit", "credit"], required: true },
    amount: { type: Number, required: true, min: 0 },
    source: {
      kind: {
        type: String,
        enum: ["novedad", "vacacion", "devengamiento", "ajuste", "vencimiento", "reversa", "saldo_inicial", "asignacion"],
        required: true,
      },
      refId: { type: Schema.Types.ObjectId },
      refVersion: { type: Number },
    },
    reversalOf: { type: Schema.Types.ObjectId, ref: "LeaveLedger" },
    rulesSnapshot: { type: Schema.Types.Mixed },
    motivo: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  // Sin `updatedAt`: un movimiento no se modifica, así que una fecha de modificación mentiría.
  { timestamps: { createdAt: true, updatedAt: false }, collection: "leave_ledger" },
);

// El saldo de una persona en una cuenta, que es la consulta de todas las pantallas.
leaveLedgerSchema.index({ tenantId: 1, userId: 1, accountId: 1, date: -1 });
// Los movimientos de un hecho, para revertirlos cuando se edita o se borra.
leaveLedgerSchema.index({ tenantId: 1, "source.kind": 1, "source.refId": 1 });

export const LeaveLedger: Model<ILeaveLedger> = model<ILeaveLedger>("LeaveLedger", leaveLedgerSchema);
