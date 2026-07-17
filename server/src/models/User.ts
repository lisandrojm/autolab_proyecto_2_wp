import { Schema, model, type Document, type HydratedDocument, Types, Model } from "mongoose";
import bcrypt from "bcryptjs";
import { differenceInYears, differenceInMonths, differenceInDays, endOfYear } from "date-fns";
import UserProject from "./UserProject.js";

export interface IExternalProject {
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

export interface IUserMetadata {
  id?: number;
  nombre?: string;
  apellido?: string;
  generoId?: number | null;
  tipoDocumentoId?: number;
  documento?: string;
  cuit?: string;
  estadoCivil?: string | null;
  calle?: string;
  altura?: string;
  pisoDepto?: string | null;
  codigoPostal?: string | null;
  localidad?: string | null;
  paisId?: number;
  nacionalidadId?: number;
  nivelEstudioId?: number;
  osId?: number | null;
  osPrepaga?: boolean | null;
  fechaNac?: string;
  fechaAlta?: string;
  telefono?: string;
  telefono2?: string | null;
  visa?: boolean | null;
  activo?: boolean;
  /** Tipo de entidad financiera: "banco" | "billetera_virtual" | "compania_financiera" | "caja_credito" | "sin_banco". */
  tipoEntidadFinanciera?: string | null;
  /** Si eligió "No tengo Banco" y pidió que le creen una cuenta. */
  solicitaCreacionCuenta?: boolean | null;
  /** Confirmación de que la cuenta fue creada y los datos cargados (plataforma + banco). */
  cuentaBancariaConfirmada?: boolean | null;
  cuentaBancariaConfirmadaAt?: Date | null;
  /** El usuario solicitó (vía pedido aprobado) un cambio de datos bancarios, pendiente de aplicar en FRAME. */
  solicitaCambioCuenta?: boolean | null;
  /** Confirmación de que el cambio de datos bancarios fue aplicado en el banco/FRAME. */
  cambioCuentaConfirmada?: boolean | null;
  cambioCuentaConfirmadaAt?: Date | null;
  bancoId?: number | null;
  cbu?: string | null;
  tipoDeCuentaBancaria?: string | null;
  nroDeCuentaBancaria?: string | null;
  aliasBancario?: string | null;
  email?: string;
  estadoId?: number | null;
  inHouse?: boolean | null;
  numeroLegajoTango?: string | null;
  afiliadoAlSindicato?: boolean | null;
  rutaImagen?: string | null;
  bancoReceptor?: string | null;
  swift?: string | null;
  informacionBancariaAdicional?: string | null;
  projects?: Types.ObjectId[] | IExternalProject[] | any[];

  // Solicitud de alta fields
  fullName?: string;
  categoriaSatId?: string;
  startDate?: string;
  dueDate?: string;
  workdaysCount?: number;
  schedule?: string;
  dailyRate?: number;
  isReplacement?: boolean;
  /** true mientras el registro NO es un usuario real (pendiente/rechazada/cancelada). */
  isSolicitud?: boolean;
  /** Ciclo de vida de la solicitud de alta (espeja los estados de un Pedido). */
  solicitudStatus?: "pendiente" | "aprobada" | "rechazada" | "cancelada";
  projectIds?: Types.ObjectId[];
  rolesFrameIds?: string[] | Types.ObjectId[];
}

export interface IUser extends Document {
  email: string;
  password: string;
  roles: Types.ObjectId[];
  clientIds: Types.ObjectId[];
  projectIds: Types.ObjectId[];
  tenantId: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  lastLoginAt?: Date;
  hireDate: Date;
  extraVacationDays: number;
  carryOverVacationDays: number; // Días de arrastre de periodos anteriores
  createdAt: Date;
  updatedAt: Date;
  vacationDays: { lawDays: number; extraDays: number; carryOverDays: number; totalDays: number };
  seniorityAtEndOfYear: number;
  isSystem: boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
  closeYear(maxDiasArrastre?: number): Promise<void>;
  name: string; // Keep name for backward compat if needed, or derived
  metadata?: IUserMetadata;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: false, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    roles: { type: [Schema.Types.ObjectId], ref: "Role", default: [] },
    clientIds: { type: [Schema.Types.ObjectId], ref: "Client", default: [] },
    projectIds: { type: [Schema.Types.ObjectId], ref: "Project", default: [] },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    firstName: {
      type: String,
      trim: true,
      set: (v: string) => (v && v.trim() !== "" ? v.trim() : undefined),
    },
    lastName: {
      type: String,
      trim: true,
      set: (v: string) => (v && v.trim() !== "" ? v.trim() : undefined),
    },
    hireDate: { type: Date, required: true },
    extraVacationDays: { type: Number, default: 0 },
    carryOverVacationDays: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
    isSystem: { type: Boolean, default: false },
    name: { type: String }, // Optional compatibility field
    metadata: {
      id: Number,
      nombre: String,
      apellido: String,
      generoId: Number,
      tipoDocumentoId: Number,
      documento: String,
      cuit: String,
      estadoCivil: String,
      calle: String,
      altura: String,
      pisoDepto: String,
      codigoPostal: String,
      localidad: String,
      paisId: Number,
      nacionalidadId: Number,
      nivelEstudioId: Number,
      osId: Number,
      osPrepaga: Boolean,
      fechaNac: String,
      fechaAlta: String,
      telefono: String,
      telefono2: String,
      visa: Boolean,
      activo: { type: Boolean, default: true },
      tipoEntidadFinanciera: String,
      solicitaCreacionCuenta: Boolean,
      cuentaBancariaConfirmada: Boolean,
      cuentaBancariaConfirmadaAt: Date,
      solicitaCambioCuenta: Boolean,
      cambioCuentaConfirmada: Boolean,
      cambioCuentaConfirmadaAt: Date,
      bancoId: Number,
      cbu: String,
      tipoDeCuentaBancaria: String,
      nroDeCuentaBancaria: String,
      aliasBancario: String,
      email: String,
      estadoId: Number,
      inHouse: Boolean,
      numeroLegajoTango: String,
      afiliadoAlSindicato: Boolean,
      rutaImagen: String,
      bancoReceptor: String,
      swift: String,
      informacionBancariaAdicional: String,
      projects: [{ type: Schema.Types.ObjectId, ref: "UserProject" }],

      // Solicitud de alta fields
      fullName: String,
      categoriaSatId: String,
      startDate: String,
      dueDate: String,
      workdaysCount: Number,
      schedule: String,
      dailyRate: Number,
      isReplacement: Boolean,
      isSolicitud: { type: Boolean, default: false },
      solicitudStatus: { type: String, enum: ["pendiente", "aprobada", "rechazada", "cancelada"] },
      projectIds: [{ type: Schema.Types.ObjectId, ref: "Project" }],
      roles_frame: {
        type: [{ type: Schema.Types.ObjectId, ref: "RoleFrame" }],
        alias: "rolesFrameIds",
      },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

// Virtual: Antigüedad proyectada al 31 de diciembre del año actual
userSchema.virtual("seniorityAtEndOfYear").get(function (this: IUser) {
  if (!this.hireDate) return 0;
  const now = new Date();
  const endOfCurrentYear = endOfYear(now);
  return differenceInYears(endOfCurrentYear, this.hireDate);
});

// Virtual: Cálculo de días de vacaciones según LCT
userSchema.virtual("vacationDays").get(function (this: IUser) {
  if (!this.hireDate) {
    return { lawDays: 0, extraDays: 0, carryOverDays: 0, totalDays: 0 };
  }

  const now = new Date();
  const endOfCurrentYear = endOfYear(now);
  const hireDate = new Date(this.hireDate);

  // Calcular antigüedad en años y meses al 31 de diciembre
  const yearsOfService = differenceInYears(endOfCurrentYear, hireDate);
  const monthsOfService = differenceInMonths(endOfCurrentYear, hireDate);

  let lawDays = 0;

  // Reglas de la LCT N° 20.744
  if (monthsOfService < 6) {
    // Menos de 6 meses: 1 día por cada 20 trabajados
    const daysWorked = differenceInDays(endOfCurrentYear, hireDate);
    lawDays = Math.floor(daysWorked / 20);
  } else if (yearsOfService < 5) {
    lawDays = 14;
  } else if (yearsOfService < 10) {
    lawDays = 21;
  } else if (yearsOfService < 20) {
    lawDays = 28;
  } else {
    lawDays = 35;
  }

  const extraDays = this.extraVacationDays || 0;
  const carryOverDays = this.carryOverVacationDays || 0;

  return {
    lawDays,
    extraDays,
    carryOverDays,
    totalDays: lawDays + extraDays + carryOverDays,
  };
});

userSchema.index({ email: 1, tenantId: 1 }, { unique: true });
userSchema.index({ tenantId: 1, createdAt: -1 });
userSchema.index({ tenantId: 1, isActive: 1, createdAt: -1 });
userSchema.index({ tenantId: 1, clientIds: 1 });
userSchema.index({ tenantId: 1, projectIds: 1 });
// Soporta el filtro por proyecto en GET /users ($or sobre metadata.projects.projectId)
userSchema.index({ tenantId: 1, "metadata.projects.projectId": 1 });

userSchema.pre("save", async function (this: IUser, next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as any);
  }
});

userSchema.methods.comparePassword = async function (this: IUser, candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Contemplación del Cierre de Año
userSchema.methods.closeYear = async function (this: IUser, remainingDays: number, maxDiasArrastre = 0) {
  let newCarryOver = remainingDays;

  // Aplicar límite si existe
  if (maxDiasArrastre > 0 && newCarryOver > maxDiasArrastre) {
    newCarryOver = maxDiasArrastre;
  }

  this.carryOverVacationDays = newCarryOver;
  await this.save();
};

export const User: Model<IUser> = model<IUser>("User", userSchema);
