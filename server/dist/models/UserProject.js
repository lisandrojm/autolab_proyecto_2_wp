import { Schema, model } from "mongoose";
const contractSchema = new Schema({
    proyecto_id: { type: Number },
    empleado_id: { type: Number },
    estado_id: { type: Number },
    categoria_sat_id: { type: Number },
    fecha_alta_contrato: { type: String },
    fecha_baja_contrato: { type: String },
    tipo_contrato_id: { type: Number },
    contrato_id: { type: Schema.Types.ObjectId, ref: "Contrato" },
    cantidad_jornadas_laborales: { type: Number },
    dias_por_semana: { type: Number },
    dias_semana: { type: [Number], default: undefined },
    dias_rotativos: { type: Boolean, default: false },
    fechas_trabajadas: { type: [String], default: undefined },
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
    valoracion_id: { type: Schema.Types.ObjectId, ref: "Valoracion", default: null },
    valoracion_regla_id: { type: Schema.Types.ObjectId, ref: "Valoracion", default: null },
    nombre_valoracion: { type: String },
    valoracionOverride: {
        motivo: { type: String },
        por: { type: Schema.Types.ObjectId, ref: "User" },
        at: { type: Date },
    },
    nombre_contrato: { type: String },
    nombre_sede: { type: String },
    nombre_rol_frame: { type: String },
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    shiftId: { type: Schema.Types.ObjectId, ref: "Shift" },
    nombre_area: { type: String },
    nombre_turno: { type: String },
    empresaContratoId: { type: Schema.Types.ObjectId, ref: "Company" },
    empresaReleaseId: { type: Schema.Types.ObjectId, ref: "Company" },
    nombre_empresa_contrato: { type: String },
    nombre_empresa_release: { type: String },
    sucursalArcaId: { type: Schema.Types.ObjectId, ref: "ArcaSucursal" },
    actividadArca: { type: String },
    puestoDesempenado: { type: String },
    // Obra social del contrato: ver el comentario del campo en `IContract`.
    obraSocialId: { type: Number, default: null },
    obraSocialOrigen: { type: String, enum: ["constatada", "manual", "heredada-usuario"] },
    obraSocialConstatadaEn: { type: String, enum: ["sss", "arca"] },
    obraSocialConstatadaEl: { type: Date, default: null },
    obraSocialNoFigura: { type: Boolean, default: false },
    obraSocialBloqueada: { type: Boolean, default: false },
    obraSocialAplicadaOrigen: { type: String, enum: ["panel", "script"] },
    obraSocialAplicadaPor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    altaArcaPresentada: {
        type: new Schema({
            via: { type: String, enum: ["carga_masiva", "altas_masivas"] },
            fecha: { type: Date },
            resultado: { type: String, enum: ["presentada", "indeterminado", "fallida", "presentando"] },
            codigoNovedad: { type: String },
            nroTransaccion: { type: String },
            motivo: { type: String },
            logId: { type: Schema.Types.ObjectId, ref: "ArcaAltasLog" },
            tanda: { type: Number },
            cat: { type: String },
            porConsulta: { type: Boolean },
        }, { _id: false }),
        default: undefined,
    },
    altaDocumentoUrl: { type: String },
    altaDocumentoNombre: { type: String },
    constanciaVigenciaDesde: { type: String },
    constanciaVigenciaHasta: { type: String },
    constanciaVerificador: { type: String },
    constanciaCargadaAt: { type: Date },
    constanciaAfipEstado: { type: String, enum: ["activo", "inactivo", "desconocido"] },
    constanciaAfipConsultadaAt: { type: Date },
    constanciaAfipRaw: { type: Schema.Types.Mixed },
    constanciaAfipDropboxSubidaAt: { type: Date },
    constanciaAfipDropboxPath: { type: String },
    firmaContratoUrl: { type: String },
    firmaContratoNombre: { type: String },
    firmaReleases: [
        {
            _id: false,
            releaseId: { type: String },
            nombre: { type: String },
            url: { type: String },
        },
    ],
    firmaEmpresaContratoId: { type: Schema.Types.ObjectId, ref: "Company" },
    firmaEmpresaReleaseId: { type: Schema.Types.ObjectId, ref: "Company" },
    firmaGeneradoAt: { type: Date },
    firmaReleasesGeneradoAt: { type: Date },
    firmaEnviadaAt: { type: Date },
    solicitudId: { type: Schema.Types.ObjectId, ref: "User" },
    areaShiftAssignments: [
        {
            areaId: { type: Schema.Types.ObjectId, ref: "Area" },
            shiftIds: [{ type: Schema.Types.ObjectId, ref: "Shift" }],
        },
    ],
    sinCuitValidacion: {
        documentos: [
            {
                _id: false,
                tipo: { type: String, enum: ["pasaporte", "dni_precario", "residencia_tramite", "cuil_provisorio", "otro"] },
                numero: { type: String },
                archivoUrl: { type: String },
                archivoNombre: { type: String },
                observaciones: { type: String },
                cargadoPor: { type: Schema.Types.ObjectId, ref: "User" },
                cargadoPorNombre: { type: String },
                cargadoAt: { type: Date },
            },
        ],
        validado: { type: Boolean },
        validadoPor: { type: Schema.Types.ObjectId, ref: "User" },
        validadoPorNombre: { type: String },
        validadoAt: { type: Date },
        fechaSeguimiento: { type: String },
    },
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
}, {
    timestamps: true,
    collection: "users_&_projects",
});
// Index to ensure one document per project per employee (internal IDs)
userProjectSchema.index({ projectId: 1, userId: 1 }, { unique: true });
// Contratos por vencer: busca por fecha de baja en vez de leer todas las asignaciones de un proyecto.
userProjectSchema.index({ "contracts.fecha_baja_contrato": 1 });
/*
  EL PAR DE FRAME (proyecto, empleado) ES ÚNICO SÓLO CUANDO LOS DOS EXISTEN.

  Era `{ unique: true, sparse: true }`, y en un índice COMPUESTO `sparse` no hace lo que parece: el
  documento se indexa igual si tiene cualquiera de los dos campos. Una persona que entra por una
  solicitud no tiene legajo en FRAME (`externalEmployeeId` null) pero el proyecto sí (705): quedaba
  indexada como (705, null), y la segunda persona sin legajo en ese proyecto chocaba con la primera
  —E11000 al guardar el contrato—. Pasaba lo mismo con el (0, 0) que usa el alta por solicitud.

  Con el filtro parcial, sólo cuentan los pares reales (> 0). Otro NOMBRE a propósito: Mongoose crea
  éste solo al arrancar, pero no borra el viejo; hasta que lo borre `scripts/indiceUserProjectFrame.ts`
  el error sigue.
*/
export const INDICE_PAR_FRAME = "frame_proyecto_empleado_unico";
userProjectSchema.index({ externalProjectId: 1, externalEmployeeId: 1 }, { unique: true, name: INDICE_PAR_FRAME, partialFilterExpression: { externalProjectId: { $gt: 0 }, externalEmployeeId: { $gt: 0 } } });
const UserProject = model("UserProject", userProjectSchema);
export default UserProject;
