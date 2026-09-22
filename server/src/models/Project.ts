import mongoose, { Schema, Document, Types, Model } from "mongoose";

export interface IProjectMetadata {
  id: number;
  nombre: string;
  descripcion: string;
  responsableId: number;
  clienteId: number;
  fechaInicio: string;
  fechaFin: string;
  fechaAlta: string;
  sedeId: number;
  activo: boolean;
  centroCostoId: number;
  /**
   * DE QUÉ EMPRESA DE TANGO es ese centro de costo.
   *
   * SIN ESTO EL `centroCostoId` ES AMBIGUO, y no en teoría: el catálogo son cuatro empresas de Tango
   * con numeraciones propias, así que el id 656 es el código «720» en FZERO CORP y el «662» en otra.
   * Un proyecto que había elegido 720 mostraba 662, porque la resolución tomaba la primera fila con
   * ese id. Guardando la empresa, el par (empresa, id) identifica un solo centro.
   *
   * Es el id de TANGO y no el `_id` de la empresa de la plataforma: FZERO CORP —la entidad de EE.UU.—
   * tiene catálogo en Tango y no tiene ficha acá (ver `CentroCosto.empresaTangoId`).
   */
  centroCostoEmpresaTangoId?: number;
  /**
   * DE DÓNDE SALIÓ ese `centroCostoId`: "tango" = lo puso la migración del catálogo.
   *
   * Es el resguardo que hace idempotente el remapeo (ver `services/centrosCostoImport.ts`): los ids
   * viejos del catálogo (1–46) también son ids válidos del catálogo de Tango, así que sin esta marca
   * una segunda corrida volvería a mover proyectos que ya estaban bien.
   *
   * TIENE QUE ESTAR DECLARADO ACÁ. Mongoose es `strict`: un campo que no está en el schema se
   * DESCARTA EN SILENCIO y el update contesta OK. La primera corrida de la migración guardó los
   * `centroCostoId` nuevos y perdió las 38 marcas por exactamente esto.
   */
  centroCostoOrigen?: string;
}

export interface IWorkScheduleDay {
  startTime: string; // "HH:mm" format
  endTime: string; // "HH:mm" format
  isWorkDay: boolean;
}

export interface IWorkSchedule {
  mode: "weekdays" | "all_week" | "per_day"; // weekdays = L-V only, all_week = L-D same hours, per_day = individual
  weekdays?: IWorkScheduleDay; // Lunes a Viernes (when mode is weekdays_weekend)
  weekend?: IWorkScheduleDay; // Sábado y Domingo (when mode is weekdays_weekend)
  days?: {
    // Individual days (when mode is per_day)
    monday?: IWorkScheduleDay;
    tuesday?: IWorkScheduleDay;
    wednesday?: IWorkScheduleDay;
    thursday?: IWorkScheduleDay;
    friday?: IWorkScheduleDay;
    saturday?: IWorkScheduleDay;
    sunday?: IWorkScheduleDay;
  };
}

export interface IProject extends Document {
  tenantId: Types.ObjectId;
  clientId?: Types.ObjectId;
  contratoEmpresas?: Types.ObjectId[];
  /**
   * LOS CONVENIOS BAJO LOS QUE ESTE PROYECTO CONTRATA.
   *
   * Cuelgan de `contratoEmpresas`: solo pueden ser convenios que alguna de esas empleadoras tenga
   * registrados ante ARCA, porque el organismo únicamente acepta categorías de los CCT que ese CUIT
   * registró. Sacarle una empresa al proyecto se lleva sus convenios.
   *
   * Sirven para acotar el alta: una productora puede tener seis CCT registrados y este proyecto
   * contratar bajo uno. Con la lista cargada, el alta ofrece esa; vacía, ofrece todas las de la
   * empresa — vacío es «todavía no se acotó», no «ninguno».
   */
  convenioIds?: Types.ObjectId[];
  releaseEmpresas?: Types.ObjectId[];
  name: string;
  description?: string;
  status: "active" | "completed" | "on_hold" | "archived";
  startDate?: Date;
  endDate?: Date;
  objectives: string[];
  targetAudience?: string;
  /**
   * EL PRESUPUESTO DEL PROYECTO. Contexto, no criterio.
   *
   * Es un campo NUEVO: hasta acá el repo no guardaba presupuesto en ningún lado. NO decide la
   * valoración — eso lo hace el margen — pero se guarda porque es el número con el que se habla del
   * proyecto y el que da sentido al porcentaje.
   */
  presupuesto?: number | null;
  /** En qué moneda está ese número. Sin esto, comparar presupuestos entre proyectos es adivinar. */
  presupuestoMoneda?: string;
  /**
   * EL MARGEN, EN PORCENTAJE. Es lo que decide la valoración.
   *
   * Un proyecto grande con margen flaco no puede pagar las categorías caras, y uno chico con buen
   * margen sí: el volumen no dice nada sobre lo que se puede pagar.
   *
   * HOY SE CARGA A MANO en la ficha del proyecto. Está previsto que en algún momento lo provea el
   * presupuestador/planificador; cuando eso pase, lo que cambia es quién escribe este campo, no la
   * regla que lo consume (`resolverValoracion`) ni nada de lo que cuelga de ella.
   *
   * Opcional: sin margen cargado el proyecto cae en la valoración por defecto y se contrata como
   * antes.
   */
  margen?: number | null;
  /**
   * La valoración que rige. La calcula `resolverValoracion` a partir del margen, salvo que alguien
   * la haya fijado a mano (ver `valoracionManual`).
   */
  valoracionId?: Types.ObjectId | null;
  /**
   * La valoración la puso una persona, no el cálculo.
   *
   * Existe porque el recálculo automático tiene que poder correr sin pisar una decisión: un proyecto
   * puede ser Oro por acuerdo comercial aunque su margen diga Plata, y que eso se revierta solo
   * al editar cualquier otro campo sería peor que no tener cálculo automático.
   */
  valoracionManual?: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  assignedUsers: Types.ObjectId[];
  teamConfig?: {
    userId: Types.ObjectId;
    canRegister: boolean;
    useProjectSchedule?: boolean;
    startTime?: string;
    endTime?: string;
    areaId?: Types.ObjectId;
    shiftId?: Types.ObjectId;
    areaShiftAssignments?: {
      areaId: Types.ObjectId;
      shiftIds: Types.ObjectId[];
    }[];
  }[];
  favorite?: boolean;
  vacationConfig?: {
    useGlobalConfig: boolean;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos?: boolean;
  };
  activityLogConfig?: {
    useGlobalConfig: boolean;
    enableFastEntry?: boolean;
    allowsAdditionalStaff?: boolean;
    allowedPastDays?: number;
    schedule?: {
      type: "daily" | "workdays" | "custom";
      days: number[];
    };
  };
  externalId?: number;
  metadata?: IProjectMetadata;
  workSchedule?: IWorkSchedule;
  turnos: Types.ObjectId[];
  areasConfig?: {
    areaId: Types.ObjectId;
    shiftIds: Types.ObjectId[];
  }[];
  coordinatorAssignments?: {
    areaId: Types.ObjectId;
    shiftId: Types.ObjectId;
    userId: Types.ObjectId;
  }[];
}

const projectSchema = new Schema<IProject>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", index: true },
    contratoEmpresas: [{ type: Schema.Types.ObjectId, ref: "Company" }],
    convenioIds: [{ type: Schema.Types.ObjectId, ref: "Convenio" }],
    releaseEmpresas: [{ type: Schema.Types.ObjectId, ref: "Company" }],

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

    presupuesto: { type: Number, default: null },
    presupuestoMoneda: { type: String, default: "ARS" },
    margen: { type: Number, default: null },
    valoracionId: { type: Schema.Types.ObjectId, ref: "Valoracion", default: null },
    valoracionManual: { type: Boolean, default: false },
    createdBy: { type: String, required: true },

    assignedUsers: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],

    // Configuración específica de miembros para Novedades
    teamConfig: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        canRegister: { type: Boolean, default: true }, // Puede registrar novedades
        // Individual work schedule
        useProjectSchedule: { type: Boolean, default: true }, // Use project's schedule by default
        startTime: { type: String }, // "HH:mm" format
        endTime: { type: String }, // "HH:mm" format
        areaId: { type: Schema.Types.ObjectId, ref: "Area" },
        shiftId: { type: Schema.Types.ObjectId, ref: "Shift" },
        areaShiftAssignments: [
          {
            areaId: { type: Schema.Types.ObjectId, ref: "Area" },
            shiftIds: [{ type: Schema.Types.ObjectId, ref: "Shift" }],
          },
        ],
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
      enableFastEntry: { type: Boolean },
      allowsAdditionalStaff: { type: Boolean },
      allowedPastDays: { type: Number },
      schedule: {
        type: { type: String, enum: ["daily", "workdays", "custom"] },
        days: [{ type: Number }],
      },
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

    externalId: { type: Number, index: true },
    metadata: {
      id: { type: Number },
      nombre: { type: String },
      descripcion: { type: String },
      responsableId: { type: Number, required: true },
      clienteId: { type: Number },
      fechaInicio: { type: String },
      fechaFin: { type: String },
      fechaAlta: { type: String },
      sedeId: { type: Number },
      activo: { type: Boolean },
      centroCostoId: { type: Number },
      centroCostoEmpresaTangoId: { type: Number },
      centroCostoOrigen: { type: String },
    },
    turnos: [{ type: Schema.Types.ObjectId, ref: "Shift", index: true }],
    areasConfig: [
      {
        areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
        shiftIds: [{ type: Schema.Types.ObjectId, ref: "Shift", required: true }],
      },
    ],
    coordinatorAssignments: [
      {
        areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
        shiftId: { type: Schema.Types.ObjectId, ref: "Shift", required: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      },
    ],
  },
  { timestamps: true },
);

projectSchema.index({ tenantId: 1, clientId: 1, name: 1 }, { unique: true });
projectSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });
// `alcanceDeResponsable` corre en CADA request de alguien que no es admin (proyectos y clientes)
// y busca por este campo; sin el índice, cada una escanea todos los proyectos del tenant.
projectSchema.index({ tenantId: 1, "metadata.responsableId": 1 });
// Los proyectos que alguien COORDINA (Contratos por vencer, alcance del coordinador en Usuarios). Sin
// esto la consulta recorre la colección entera, y los proyectos son documentos pesados.
projectSchema.index({ tenantId: 1, "coordinatorAssignments.userId": 1 });

export const Project: Model<IProject> = mongoose.model<IProject>("Project", projectSchema);
