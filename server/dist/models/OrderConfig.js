import mongoose, { Schema } from "mongoose";
const orderConfigSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    informacion: { type: String, trim: true },
    icon: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    categoryType: {
        type: String,
        enum: ["fecha", "dinero", "objeto", "otros", "datos_personales"],
        default: "otros",
        index: true,
    },
    dateMode: {
        type: String,
        enum: ["single", "range"],
        default: "single",
        trim: true,
    },
    maxDays: { type: Number, min: 1 },
    config: { type: Schema.Types.Mixed, default: {} },
    limitType: { type: String, enum: ["monto", "porcentaje"] },
    montoMaximo: { type: Number, min: 0 },
    porcentajeMaximo: { type: Number, min: 0, max: 100 },
    requiresAction: { type: Boolean, default: false },
    actionText: { type: String, trim: true },
    actionDescription: { type: String, trim: true },
    tituloAccion: { type: String, trim: true },
    futureActionType: {
        type: String,
        enum: ["documento", "otra"],
        trim: true,
    },
    deadlineMode: {
        type: String,
        enum: ["none", "plazoDias", "fechaEspecifica"],
        default: "none",
        trim: true,
    },
    plazoDias: { type: Number, min: 1, max: 365 },
    fechaLimite: { type: Date },
    documentoRequerido: { type: String, trim: true },
    requiresSignature: { type: Boolean, default: true },
    requiresUserConfirmation: { type: Boolean, default: false },
    pdfId: { type: Schema.Types.ObjectId, ref: "Pdf" },
    pdfText: { type: String, trim: true },
}, { timestamps: true, collection: "orders_configs" });
orderConfigSchema.index({ tenantId: 1, isActive: 1, sortOrder: 1 });
orderConfigSchema.index({ tenantId: 1, name: 1 }, { unique: true });
orderConfigSchema.index({ tenantId: 1, categoryType: 1 });
export const OrderConfig = mongoose.model("OrderConfig", orderConfigSchema);
