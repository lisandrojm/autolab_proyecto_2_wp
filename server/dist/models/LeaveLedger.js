import { Schema, model } from "mongoose";
const leaveLedgerSchema = new Schema({
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
{ timestamps: { createdAt: true, updatedAt: false }, collection: "leave_ledger" });
// El saldo de una persona en una cuenta, que es la consulta de todas las pantallas.
leaveLedgerSchema.index({ tenantId: 1, userId: 1, accountId: 1, date: -1 });
// Los movimientos de un hecho, para revertirlos cuando se edita o se borra.
leaveLedgerSchema.index({ tenantId: 1, "source.kind": 1, "source.refId": 1 });
export const LeaveLedger = model("LeaveLedger", leaveLedgerSchema);
