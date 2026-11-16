import mongoose, { Schema } from "mongoose";
const campaniaSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    anio: { type: Number, required: true },
    nombre: { type: String, required: true },
    ventanaDesde: { type: String, required: true },
    ventanaHasta: { type: String, required: true },
    plazoParaDefinirDias: { type: Number, required: true },
    avisoMinimoDias: { type: Number, required: true },
    minDiasPorTramo: { type: Number, required: true },
    fechaLimite: { type: String, default: null },
    tiposContratoInvitar: { type: [Number], default: [] },
    lanzamiento: {
        type: new Schema({
            todosLosTipos: Boolean,
            tipos: [{ _id: false, id: Number, nombre: String, invitadas: Number }],
            excluidas: { tipoDeshabilitado: Number, tipoNoIncluido: Number, sinContrato: Number },
        }, { _id: false }),
        default: null,
    },
    estado: { type: String, enum: ["borrador", "lanzada", "cerrada"], default: "borrador" },
    creadaPor: { type: Schema.Types.ObjectId, ref: "User" },
    lanzadaPor: { type: Schema.Types.ObjectId, ref: "User" },
    lanzadaAt: { type: Date },
    cerradaPor: { type: Schema.Types.ObjectId, ref: "User" },
    cerradaAt: { type: Date },
}, { timestamps: true, collection: "campanias_vacaciones" });
export const CampaniaVacaciones = mongoose.model("CampaniaVacaciones", campaniaSchema);
const tramoSchema = new Schema({ desde: String, hasta: String, dias: Number, vacationId: { type: Schema.Types.ObjectId, ref: "Vacation" } }, { _id: false });
const invitacionSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    campaniaId: { type: Schema.Types.ObjectId, ref: "CampaniaVacaciones", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    nombre: { type: String, default: "" },
    diasDisponibles: { type: Number, default: 0 },
    diasCorridos: { type: Boolean, default: true },
    ventanaPersona: { enabled: Boolean, tramos: [{ _id: false, inicio: String, fin: String }] },
    fechaLimite: { type: String, required: true },
    estado: {
        type: String,
        enum: ["pendiente_de_invitar", "invitado", "acuso_recibo", "propuso_fechas", "rechazada", "aprobado_notificado", "vencido_sin_definir", "asignado_por_empresa_notificado", "sin_dias_pendientes"],
        default: "pendiente_de_invitar",
    },
    invitadoAt: { type: Date },
    acuseInvitacionAt: { type: Date, default: null },
    propuestaAt: { type: Date, default: null },
    tramos: { type: [tramoSchema], default: [] },
    rechazo: { type: new Schema({ motivo: String, at: Date }, { _id: false }), default: null },
    asignacion: {
        type: new Schema({
            desde: String,
            hasta: String,
            dias: Number,
            sugeridaAt: Date,
            editadaPor: { type: Schema.Types.ObjectId, ref: "User" },
            confirmadaPor: { type: Schema.Types.ObjectId, ref: "User" },
            confirmadaAt: Date,
            vacationId: { type: Schema.Types.ObjectId, ref: "Vacation" },
            problema: { type: String, default: null },
        }, { _id: false }),
        default: null,
    },
    notificacion: { type: new Schema({ enviadaAt: Date, texto: String, pdfUrls: [String] }, { _id: false }), default: null },
    acuseOtorgamientoAt: { type: Date, default: null },
    historial: [{ _id: false, accion: String, porUserId: { type: Schema.Types.ObjectId, ref: "User" }, at: Date, detalle: String }],
    recordatorios: [{ _id: false, at: Date, porUserId: { type: Schema.Types.ObjectId, ref: "User" }, automatico: Boolean }],
}, { timestamps: true, collection: "invitaciones_vacaciones" });
export const InvitacionVacaciones = mongoose.model("InvitacionVacaciones", invitacionSchema);
