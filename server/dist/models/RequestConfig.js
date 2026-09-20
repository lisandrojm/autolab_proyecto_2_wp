import { Schema, model } from "mongoose";
const requestConfigSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    requiresReplacement: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    visibility: {
        type: String,
        enum: ["all", "specific"],
        default: "all",
    },
    allowedProjectIds: [{ type: Schema.Types.ObjectId, ref: "Project", default: [] }],
    effects: {
        type: [
            {
                _id: false,
                accountId: { type: Schema.Types.ObjectId, ref: "LeaveAccount", required: true },
                direction: { type: String, enum: ["debit", "credit"], required: true },
                basis: { type: String, enum: ["dia", "hora", "fijo"], default: "dia" },
                factor: { type: Number, default: 1 },
                cantidadFija: { type: Number },
                rounding: { type: String, enum: ["none", "up", "down", "half"], default: "none" },
                condition: {
                    esFeriado: { type: Boolean },
                    esDiaNoLaborable: { type: Boolean },
                },
            },
        ],
        default: [],
    },
    limit: {
        enabled: { type: Boolean, default: false },
        maxPorPeriodo: { type: Number },
        periodo: { type: String, enum: ["calendario", "aniversario_ingreso"], default: "calendario" },
        accion: { type: String, enum: ["avisar", "bloquear"], default: "avisar" },
    },
}, { timestamps: true, collection: "requests_configs" });
// Compound index to ensure uniqueness of name per tenant
requestConfigSchema.index({ tenantId: 1, name: 1 }, { unique: true });
export const RequestConfig = model("RequestConfig", requestConfigSchema);
