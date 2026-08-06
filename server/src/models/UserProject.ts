import { Schema, model, Document, Types } from "mongoose";

// Define interface for a single contract within the project history
interface IContract {
  proyecto_id: number;
  empleado_id: number;
  estado_id: number;
  categoria_sat_id: number;
  fecha_alta_contrato: string;
  fecha_baja_contrato: string;
  tipo_contrato_id: number;
  cantidad_jornadas_laborales: number;
  sueldo_jornada: number;
  sueldo_mano: number;
  sueldo_mano_texto: string;
  sueldo_diario_neto: number;
  diferencia_diaria_neto: number;
  sueldo_neto: number;
  sueldo_bruto: number;
  reemplazo: boolean | null;
  empleado_id_reemplezado: number | null;
  observaciones: string;
  sede_id: number;
  rol_frame_id: number;
  fecha_inicio_participacion: string | null;
  fecha_fin_participacion: string | null;
  hora_inicio: string;
  hora_fin: string;
  calificacion: number | null;
  fecha_carga: string;
  puede_renovar_contrato: boolean;
  nombre_proyecto: string;
  nombre_estado_empleado: string;
  nombre_categoria_sat: string;
  nombre_contrato: string;
  nombre_sede: string;
  nombre_rol_frame: string;
  areaId: Types.ObjectId | string | null;
  positionId: Types.ObjectId | string | null;
  levelId: Types.ObjectId | string | null;
  shiftId: Types.ObjectId | string | null;
  nombre_area: string;
  nombre_cargo: string;
  nombre_nivel: string;
  nombre_turno: string;
  // Empresa (razón social) elegida para el contrato / release de ESTE miembro.
  // Debe ser una de las empresas activadas en el proyecto (project.contratoEmpresas / releaseEmpresas).
  empresaContratoId?: Types.ObjectId | string | null;
  empresaReleaseId?: Types.ObjectId | string | null;
  nombre_empresa_contrato?: string;
  nombre_empresa_release?: string;
  // Documento de "Alta" (AFIP o Servicios, según el Estado impositivo vinculado a la Plantilla).
  altaDocumentoUrl?: string;
  altaDocumentoNombre?: string;
  // Datos leídos del PDF de la Constancia de CUIT de ARCA al subirlo (el PDF en sí va en
  // altaDocumentoUrl). La constancia vale un mes, así que la vigencia es la que marca cuándo
  // hay que volver a pedirla.
  constanciaVigenciaDesde?: string; // "YYYY-MM-DD"
  constanciaVigenciaHasta?: string; // "YYYY-MM-DD"
  constanciaVerificador?: string;
  constanciaCargadaAt?: Date;
  // Resultado de consultar el CUIT directo contra el Padrón de AFIP (Consulta Padrón A13) — reemplaza
  // a la constancia en PDF como fuente de verdad de "Constancia de CUIT": si figura activo, alcanza.
  constanciaAfipEstado?: "activo" | "inactivo" | "desconocido";
  constanciaAfipConsultadaAt?: Date;
  constanciaAfipRaw?: any;
  // Recién cuando el resultado de la consulta queda archivado en Dropbox (carpeta "Constancia de
  // cuit") se considera terminado el trámite: es lo que dispara la transición automática de estado
  // (estadoDropboxCronService.ts). constanciaAfipEstado "activo" sin esto todavía no alcanza.
  constanciaAfipDropboxSubidaAt?: Date;
  areaShiftAssignments?: {
    areaId: Types.ObjectId | string;
    shiftIds: (Types.ObjectId | string)[];
  }[];
}

export interface IUserProject extends Document {
  projectId: Types.ObjectId; // Reference to the internal Project document
  userId: Types.ObjectId; // Reference to the internal User document
  externalProjectId: number;
  externalEmployeeId: number;
  nombre_proyecto: string;
  nombre_rol_frame: string;
  contracts: IContract[];
  areaId?: Types.ObjectId;
  positionId?: Types.ObjectId;
  levelId?: Types.ObjectId;
}

const contractSchema = new Schema<IContract>(
  {
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
    constanciaVigenciaDesde: { type: String },
    constanciaVigenciaHasta: { type: String },
    constanciaVerificador: { type: String },
    constanciaCargadaAt: { type: Date },
    constanciaAfipEstado: { type: String, enum: ["activo", "inactivo", "desconocido"] },
    constanciaAfipConsultadaAt: { type: Date },
    constanciaAfipRaw: { type: Schema.Types.Mixed },
    constanciaAfipDropboxSubidaAt: { type: Date },
    areaShiftAssignments: [
      {
        areaId: { type: Schema.Types.ObjectId, ref: "Area" },
        shiftIds: [{ type: Schema.Types.ObjectId, ref: "Shift" }],
      },
    ],
  },
  { _id: false },
); // subdocument, no need for _id usually unless we want addressable contracts

const userProjectSchema = new Schema<IUserProject>(
  {
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
  },
  {
    timestamps: true,
    collection: "users_&_projects",
  },
);

// Index to ensure one document per project per employee (internal IDs)
userProjectSchema.index({ projectId: 1, userId: 1 }, { unique: true });

// Optional index for legacy IDs if they exist
userProjectSchema.index(
  { externalProjectId: 1, externalEmployeeId: 1 },
  { unique: true, sparse: true }
);

const UserProject = model<IUserProject>("UserProject", userProjectSchema);

export default UserProject;
