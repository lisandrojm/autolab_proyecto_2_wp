import { Schema, model } from "mongoose";
const tramoSchema = new Schema({
    desdeAnios: { type: Number, required: true },
    // `null` a propósito: el último tramo no tiene techo.
    hastaAnios: { type: Number, default: null },
    dias: { type: Number, required: true },
}, { _id: false });
const leaveAccountSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    unit: { type: String, enum: ["dias", "horas"], default: "dias" },
    accrual: {
        mode: { type: String, enum: ["anual_fijo", "por_antiguedad", "por_evento", "manual"], required: true },
        diasAnuales: { type: Number },
        antiguedadTramos: { type: [tramoSchema], default: undefined },
        periodo: { type: String, enum: ["calendario", "aniversario_ingreso"], default: "calendario" },
    },
    carryover: {
        permite: { type: Boolean, default: false },
        maxDias: { type: Number },
        venceEnMeses: { type: Number },
    },
    allowNegative: { type: Boolean, default: true },
}, { timestamps: true, collection: "leave_accounts" });
// Un código por tenant: es la clave con la que la referencian el código y los scripts.
leaveAccountSchema.index({ tenantId: 1, code: 1 }, { unique: true });
export const LeaveAccount = model("LeaveAccount", leaveAccountSchema);
