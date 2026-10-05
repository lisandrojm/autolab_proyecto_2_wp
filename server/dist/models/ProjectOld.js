import mongoose, { Schema } from "mongoose";
const projectSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: {
        type: String,
        enum: ["active", "completed", "on_hold", "archived"],
        default: "active",
        index: true,
    },
    startDate: { type: Date },
    endDate: { type: Date },
    objectives: { type: [String], required: true, default: [] },
    targetAudience: { type: String, trim: true },
    createdBy: { type: String, required: true },
    assignedUsers: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    // Configuración específica de miembros para Novedades
    teamConfig: [
        {
            userId: { type: Schema.Types.ObjectId, ref: "User" },
            isNotifier: { type: Boolean, default: false }, // Recibe notificaciones
            canRegister: { type: Boolean, default: true }, // Puede registrar novedades
            // Individual work schedule
            useProjectSchedule: { type: Boolean, default: true }, // Use project's schedule by default
            startTime: { type: String }, // "HH:mm" format
            endTime: { type: String }, // "HH:mm" format
        },
    ],
    favorite: { type: Boolean, default: false, index: true },
    vacationConfig: {
        useGlobalConfig: { type: Boolean, default: true },
        permiteFraccionadas: { type: Boolean, default: true },
        minDiasFraccion: { type: Number },
        diasCorridos: { type: Boolean },
    },
    activityLogConfig: {
        useGlobalConfig: { type: Boolean, default: true },
        enableFastEntry: { type: Boolean, default: true },
        allowsAdditionalStaff: { type: Boolean, default: false },
    },
    workSchedule: {
        mode: { type: String, enum: ["weekdays", "all_week", "per_day"], default: "weekdays" },
        weekdays: {
            startTime: { type: String },
            endTime: { type: String },
            isWorkDay: { type: Boolean, default: true },
        },
        weekend: {
            startTime: { type: String },
            endTime: { type: String },
            isWorkDay: { type: Boolean, default: false },
        },
        days: {
            monday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: true } },
            tuesday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: true } },
            wednesday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: true } },
            thursday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: true } },
            friday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: true } },
            saturday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: false } },
            sunday: { startTime: String, endTime: String, isWorkDay: { type: Boolean, default: false } },
        },
    },
}, { timestamps: true });
projectSchema.index({ tenantId: 1, clientId: 1, name: 1 }, { unique: true });
projectSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });
export const Project = mongoose.model("Project", projectSchema);
