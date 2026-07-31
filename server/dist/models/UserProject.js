import { Schema, model } from "mongoose";
const contractSchema = new Schema({
    proyecto_id: { type: Number },
    empleado_id: { type: Number },
    estado_id: { type: Number },
    categoria_sat_id: { type: Number },
    fecha_alta_contrato: { type: String },
    fecha_baja_contrato: { type: String },
    tipo_contrato_id: { type: Number },
    cantidad_jornadas_laborales: { type: Number },
    sueldo_jornada: { type: Number },
    sueldo_mano: { type: Number },
    sueldo_mano_texto: { type: String },
    sueldo_diario_neto: { type: Number },
    diferencia_diaria_neto: { type: Number },
    sueldo_neto: { type: Number },
    sueldo_bruto: { type: Number },
    reemplazo: { type: Boolean },
    empleado_id_reemplezado: { type: Number },
    observaciones: { type: String },
    sede_id: { type: Number },
    rol_frame_id: { type: Number },
    fecha_inicio_participacion: { type: String },
    fecha_fin_participacion: { type: String },
    hora_inicio: { type: String },
    hora_fin: { type: String },
    calificacion: { type: Number },
    fecha_carga: { type: String },
    puede_renovar_contrato: { type: Boolean },
    nombre_proyecto: { type: String },
    nombre_estado_empleado: { type: String },
    nombre_categoria_sat: { type: String },
    nombre_contrato: { type: String },
    nombre_sede: { type: String },
    nombre_rol_frame: { type: String },
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    positionId: { type: Schema.Types.ObjectId, ref: "Position" },
    levelId: { type: Schema.Types.ObjectId, ref: "Level" },
    shiftId: { type: Schema.Types.ObjectId, ref: "Shift" },
    nombre_area: { type: String },
    nombre_cargo: { type: String },
    nombre_nivel: { type: String },
    nombre_turno: { type: String },
    empresaContratoId: { type: Schema.Types.ObjectId, ref: "Company" },
    empresaReleaseId: { type: Schema.Types.ObjectId, ref: "Company" },
    nombre_empresa_contrato: { type: String },
    nombre_empresa_release: { type: String },
    altaDocumentoUrl: { type: String },
    altaDocumentoNombre: { type: String },
    areaShiftAssignments: [
        {
            areaId: { type: Schema.Types.ObjectId, ref: "Area" },
            shiftIds: [{ type: Schema.Types.ObjectId, ref: "Shift" }],
        },
    ],
}, { _id: false }); // subdocument, no need for _id usually unless we want addressable contracts
const userProjectSchema = new Schema({
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    externalProjectId: { type: Number, required: false },
    externalEmployeeId: { type: Number, required: false },
    nombre_proyecto: { type: String }, // User requested convenience field
    nombre_rol_frame: { type: String }, // User requested convenience field
    contracts: [contractSchema],
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    positionId: { type: Schema.Types.ObjectId, ref: "Position" },
    levelId: { type: Schema.Types.ObjectId, ref: "Level" },
}, {
    timestamps: true,
    collection: "users_&_projects",
});
// Index to ensure one document per project per employee (internal IDs)
userProjectSchema.index({ projectId: 1, userId: 1 }, { unique: true });
// Optional index for legacy IDs if they exist
userProjectSchema.index({ externalProjectId: 1, externalEmployeeId: 1 }, { unique: true, sparse: true });
const UserProject = model("UserProject", userProjectSchema);
export default UserProject;
