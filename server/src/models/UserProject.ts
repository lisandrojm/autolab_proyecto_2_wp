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
}

export interface IUserProject extends Document {
  projectId: Types.ObjectId; // Reference to the internal Project document
  externalProjectId: number;
  externalEmployeeId: number;
  nombre_proyecto: string;
  nombre_rol_frame: string;
  contracts: IContract[];
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
  },
  { _id: false },
); // subdocument, no need for _id usually unless we want addressable contracts

const userProjectSchema = new Schema<IUserProject>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: false }, // Optional for now in case link fails
    externalProjectId: { type: Number, required: true },
    externalEmployeeId: { type: Number, required: true },
    nombre_proyecto: { type: String }, // User requested convenience field
    nombre_rol_frame: { type: String }, // User requested convenience field
    contracts: [contractSchema],
  },
  {
    timestamps: true,
    collection: "users_&_projects",
  },
);

// Index to ensure one document per project per employee
userProjectSchema.index({ externalProjectId: 1, externalEmployeeId: 1 }, { unique: true });

const UserProject = model<IUserProject>("UserProject", userProjectSchema);

export default UserProject;
