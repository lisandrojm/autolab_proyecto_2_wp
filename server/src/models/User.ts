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
  /**
   * Los días de la semana del contrato (0 = domingo … 6 = sábado).
   *
   * Qué significan depende de `dias_rotativos`: con esquema FIJO son los días que trabaja; con
   * esquema ROTATIVO son los días ENTRE los que rota, y pueden ser más que las jornadas. Sin el
   * flag, «trabaja 3 días rotando entre 6» se leería como «trabaja 6 días».
   */
  /**
   * Cuántos días de la SEMANA trabaja (1 a 7).
   *
   * NO confundir con `cantidad_jornadas_laborales`, que son las jornadas TOTALES del contrato (22,
   * 30…) y es lo que multiplica al sueldo por jornada. Son dos números distintos y por un rato
   * compartieron campo: la pantalla llegó a mostrar «días por semana: 22».
   */
  dias_por_semana?: number;
  dias_semana?: number[];
  dias_rotativos?: boolean;
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
  /**
   * Cuándo se tomó el nombre del Padrón de ARCA como el bueno.
   *
   * Es lo que habilita el tilde verde al lado del nombre: no dice «alguien lo revisó», dice «esto
   * es literalmente lo que ARCA tiene registrado para este CUIT». Por eso se sella aunque el nombre
   * ya coincidiera — el valor del sello es la confirmación contra el organismo, no el cambio.
   *
   * NO está en `USER_FRAME_WHITELIST` a propósito: FRAME no tiene nada que decir sobre esto.
   */
  nombreValidadoArcaAt?: Date;
  /** La persona NO tiene CUIT/CUIL argentino (típicamente extranjeros). Se declara explícitamente
   *  al darla de alta: es distinto de "todavía no se cargó", y es lo que habilita el circuito de
   *  documentos sin pasar por AFIP (ver routes/afip.ts → habilitar-firma). */
  sinCuit?: boolean;
  estadoCivil?: string | null;
  calle?: string;
  altura?: string;
  pisoDepto?: string | null;
  codigoPostal?: string | null;
  localidad?: string | null;
  paisId?: number;
  nacionalidadId?: number;
  /**
   * Argentino/a por naturalización, no nativo/a. Solo tiene sentido cuando `nacionalidadId` es
   * Argentina: es lo que distingue a un argentino de toda la vida (CUIL automático desde el DNI) de
   * alguien que se naturalizó (puede estar en trámite y no tenerlo todavía). Ver `esCuilObligatorio`
   * en el frontend (`utils/nacionalidadDocumento.ts`), que es la única lógica que lee este campo.
   */
  nacionalizado?: boolean;
  /** País de nacimiento, solo para quien se declaró `nacionalizado`: alguien nativo nació acá y no
   *  hace falta preguntarlo; un extranjero no nacionalizado ya lo dice con la nacionalidad. */
  paisNacimientoId?: number;
  nivelEstudioId?: number;
  osId?: number | null;
  osPrepaga?: boolean | null;
  fechaNac?: string;
  fechaAlta?: string;
  telefono?: string;
  activo?: boolean;
  /** Tipo de entidad financiera: "banco" | "billetera_virtual" | "compania_financiera" | "caja_credito" | "sin_banco". */
  tipoEntidadFinanciera?: string | null;
  /** Si eligió "No tengo Banco" y pidió que le creen una cuenta. */
  solicitaCreacionCuenta?: boolean | null;
  /**
   * Con "No tengo Banco", cuál de las situaciones es: le abren una cuenta (`crear_cuenta`, que además
   * prende `solicitaCreacionCuenta`), trae la suya y manda los datos (`proveera_cuenta`) u otra (`otro`,
   * con `sinBancoDetalle`). Ausente en los registros anteriores a esto.
   */
  sinBancoMotivo?: "crear_cuenta" | "proveera_cuenta" | "otro" | null;
  sinBancoDetalle?: string | null;
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
  /**
   * A qué sindicato/s está afiliado/a. Guarda los `_id` del catálogo `Sindicato`.
   *
   * Es una LISTA y no uno solo: quien trabaja en más de una actividad puede estar afiliado a más de
   * un gremio a la vez (el caso típico es técnica y actuación), y forzar uno obligaría a elegir cuál
   * declarar. Vacío = no se eligió ninguno todavía.
   *
   * Solo tiene sentido con `afiliadoAlSindicato` en true, y se vacía cuando se apaga: gremios
   * colgados de alguien que declaró no estar afiliado no significan nada y se leen como una
   * contradicción. La afiliación es voluntaria y NO se deduce del convenio (ver `models/Sindicato.ts`).
   */
  sindicatoIds?: string[] | null;
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
  /**
   * Auditoría de las jornadas de la solicitud. `workdaysCount` es lo que se liquida; esto dice de dónde
   * salió. `workdaysCalculated` es lo que dio el calendario (fechas × días fijos) y se guarda SIEMPRE,
   * haya o no ajuste, para poder auditar sin recalcular con reglas que quizás cambiaron. Con días
   * rotativos no hay calendario del cual derivarlo y queda en null.
   */
  workdaysCalculated?: number | null;
  /** true si `workdaysCount` se cargó a mano distinto del calculado. */
  workdaysOverridden?: boolean;
  /** Por qué se apartó del calendario. Obligatorio cuando `workdaysOverridden`. */
  workdaysOverrideReason?: "extension_rodaje" | "jornada_caida" | "feriado_trabajado" | "franco_trabajado" | "alta_baja_parcial" | "reemplazo_parcial" | "otro" | null;
  /** Aclaración del motivo. Obligatoria (mín. 10 caracteres) cuando el motivo es «otro». */
  workdaysOverrideNote?: string | null;
  /**
   * De qué link de registro vino la persona, y con eso quién la invitó y para qué proyecto, área y turno.
   * Lo escribe `POST /auth/registro`. Es lo que arma la lista «Registrados» del móvil de quien invitó.
   */
  /**
   * Los términos y condiciones que aceptó al registrarse con un link: cuáles, qué versión y cuándo.
   * La versión permite leer el texto exacto aunque después se haya editado (ver `TerminosCondiciones`).
   */
  terminosAceptados?: {
    terminosId: Types.ObjectId;
    version: number;
    titulo: string;
    aceptadoEl: Date;
    ip?: string;
  };
  registro?: {
    linkId?: Types.ObjectId;
    invitadoPor?: Types.ObjectId;
    projectId?: Types.ObjectId;
    areaId?: Types.ObjectId;
    shiftId?: Types.ObjectId;
    registradoAt?: Date;
  };
  /** Días de la semana de la solicitud (0=domingo…6=sábado). Ver `dias_semana` del contrato. */
  diasPorSemana?: number;
  diasSemana?: number[];
  /**
   * LOS DÍAS EXACTOS que se trabajan, cuando el tipo de contrato se pide por días sueltos
   * (`Contrato.data.modoFechas === "dias"`).
   *
   * `diasSemana` dice los días de la semana y `startDate`/`dueDate` el período que abarcan, pero
   * ninguno de los dos distingue «los martes de septiembre» de «el 2, el 9 y el 23»: eso está acá,
   * en "YYYY-MM-DD". Es de lo que sale la cantidad de jornadas, y lo que hay que poder mirar cuando
   * alguien pregunta qué días se contrataron.
   */
  fechasTrabajadas?: string[];
  diasRotativos?: boolean;
  schedule?: string;
  dailyRate?: number;
  /*
    LO QUE DECLARA LA SOLICITUD DE CONTRATACIÓN ADEMÁS DE LO DE ARRIBA.

    Mongoose descarta lo que el esquema no declara: sin estas líneas, todo esto viajaba desde la app y
    NO se guardaba, así que la aprobación en el panel abría el alta sin tipo de contrato, sin área y
    turno, sin empresa y sin el comentario de quien la pidió.
  */
  tipoImpositivo?: "alta_temprana_afip" | "constancia_cuit";
  contratoId?: Types.ObjectId;
  nombre_contrato?: string;
  areaShiftAssignments?: { areaId?: Types.ObjectId; shiftIds?: Types.ObjectId[] }[];
  empresaContratoId?: Types.ObjectId;
  convenioId?: Types.ObjectId;
  empleado_id_reemplezado?: string | number;
  replacedUserId?: Types.ObjectId;
  motivoReemplazoId?: Types.ObjectId;
  comentarios?: string;
  isReplacement?: boolean;
  /** true mientras el registro NO es un usuario real (pendiente/rechazada/cancelada). */
  isSolicitud?: boolean;
  /** Ciclo de vida de la solicitud de alta (espeja los estados de un Pedido). */
  solicitudStatus?: "pendiente" | "aprobada" | "rechazada" | "cancelada";
  /**
   * Usuario REAL al que corresponde esta solicitud, cuando se pidió el alta de alguien que ya existe
   * en el sistema. Con esto la solicitud se muestra dentro de la ficha de esa persona en vez de
   * generar una tarjeta duplicada. Vacío = alta de alguien que todavía no es usuario.
   */
  solicitudUserId?: Types.ObjectId;
  /**
   * QUIÉN PIDIÓ EL ALTA. Es a quien hay que avisarle cuando se aprueba o se rechaza: sin esto, quien
   * cargó la solicitud desde la app no se enteraba nunca de en qué terminó.
   */
  solicitudCreadaPor?: Types.ObjectId;
  /**
   * POR QUÉ SE RECHAZÓ, quién lo decidió y cuándo.
   *
   * Un rechazo sin motivo obliga a quien pidió el alta a preguntar por afuera qué faltaba, y a volver
   * a cargar la solicitud a ciegas. Queda guardado en la solicitud —que no se borra— para que se lea
   * en la pantalla y para poder reabrirla sabiendo qué se había objetado.
   */
  solicitudMotivoRechazo?: string;
  solicitudRechazadaPor?: Types.ObjectId;
  solicitudRechazadaEl?: Date;
  /**
   * QUÉ SE LE CORRIGIÓ AL APROBARLA, y qué le quiere decir quien aprobó a quien la pidió.
   *
   * Aprobar no es sólo decir que sí: quien aprueba abre el alta y, muchas veces, arregla algo —la
   * fecha de baja, el turno, el tipo de contrato— antes de guardar. Esa corrección no se veía en
   * ningún lado: la solicitud quedaba «APROBADA» y quien la cargó seguía creyendo que se contrató
   * lo que había pedido, así que la próxima lo volvía a cargar igual.
   *
   * Los cambios se guardan YA RESUELTOS A TEXTO, no como ids: es el registro de lo que se decidió
   * ese día. Si mañana renombran el área o la empresa, lo que se le mostró a esa persona no cambia.
   */
  solicitudRevision?: {
    cambios?: { campo: string; pedido: string; aprobado: string }[];
    comentario?: string;
    porNombre?: string;
    el?: Date;
  };
  /** La solicitud RENUEVA un contrato por vencer (etiqueta «Renovación»). Ver `models/RenovacionContrato.ts`. */
  esRenovacion?: boolean;
  /** Qué contrato renueva: (UserProject, fecha de baja), que es como se identifica un contrato. */
  renovacionDe?: { userProjectId?: Types.ObjectId; fechaBajaContrato?: string };
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
  /**
   * Puede quedar A CARGO de un proyecto (es lo que llena el selector de responsable en Proyectos y
   * Clientes). Es un atributo de la persona, no una pantalla que se destapa: por eso vive acá y no
   * como permiso de un rol, que era donde estaba antes (`project_responsible:eligible`).
   */
  isProjectResponsible: boolean;
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
    isProjectResponsible: { type: Boolean, default: false },
    name: { type: String }, // Optional compatibility field
    metadata: {
      id: Number,
      nombre: String,
      apellido: String,
      generoId: Number,
      tipoDocumentoId: Number,
      documento: String,
      cuit: String,
      nombreValidadoArcaAt: Date,
      sinCuit: Boolean,
      estadoCivil: String,
      calle: String,
      altura: String,
      pisoDepto: String,
      codigoPostal: String,
      localidad: String,
      paisId: Number,
      nacionalidadId: Number,
      nacionalizado: Boolean,
      paisNacimientoId: Number,
      nivelEstudioId: Number,
      osId: Number,
      osPrepaga: Boolean,
      fechaNac: String,
      fechaAlta: String,
      telefono: String,
      activo: { type: Boolean, default: true },
      tipoEntidadFinanciera: String,
      solicitaCreacionCuenta: Boolean,
      sinBancoMotivo: { type: String, enum: ["crear_cuenta", "proveera_cuenta", "otro", null] },
      sinBancoDetalle: String,
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
      sindicatoIds: [String],
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
      workdaysCalculated: { type: Number, default: undefined },
      workdaysOverridden: { type: Boolean, default: undefined },
      workdaysOverrideReason: { type: String, enum: ["extension_rodaje", "jornada_caida", "feriado_trabajado", "franco_trabajado", "alta_baja_parcial", "reemplazo_parcial", "otro", null], default: undefined },
      workdaysOverrideNote: { type: String, default: undefined },
      terminosAceptados: {
        terminosId: { type: Schema.Types.ObjectId, ref: "TerminosCondiciones" },
        version: { type: Number },
        titulo: { type: String },
        aceptadoEl: { type: Date },
        ip: { type: String },
      },
      registro: {
        linkId: { type: Schema.Types.ObjectId, ref: "RegistroLink" },
        invitadoPor: { type: Schema.Types.ObjectId, ref: "User" },
        projectId: { type: Schema.Types.ObjectId, ref: "Project" },
        areaId: { type: Schema.Types.ObjectId, ref: "Area" },
        shiftId: { type: Schema.Types.ObjectId, ref: "Shift" },
        registradoAt: { type: Date },
      },
      diasPorSemana: { type: Number },
      diasSemana: { type: [Number], default: undefined },
      fechasTrabajadas: { type: [String], default: undefined },
      diasRotativos: { type: Boolean, default: false },
      schedule: String,
      dailyRate: Number,
      isReplacement: Boolean,
      // Ver el comentario de la interfaz: esto viajaba desde la app y se perdía al guardar.
      tipoImpositivo: { type: String, enum: ["alta_temprana_afip", "constancia_cuit"] },
      contratoId: { type: Schema.Types.ObjectId, ref: "Contrato" },
      nombre_contrato: String,
      areaShiftAssignments: [
        {
          _id: false,
          areaId: { type: Schema.Types.ObjectId, ref: "Area" },
          shiftIds: [{ type: Schema.Types.ObjectId, ref: "Shift" }],
        },
      ],
      empresaContratoId: { type: Schema.Types.ObjectId, ref: "Company" },
      convenioId: { type: Schema.Types.ObjectId, ref: "Convenio" },
      // El id de FRAME de la persona reemplazada: puede venir como número o como texto.
      empleado_id_reemplezado: Schema.Types.Mixed,
      replacedUserId: { type: Schema.Types.ObjectId, ref: "User" },
      motivoReemplazoId: { type: Schema.Types.ObjectId, ref: "RequestConfig" },
      comentarios: String,
      isSolicitud: { type: Boolean, default: false },
      solicitudStatus: { type: String, enum: ["pendiente", "aprobada", "rechazada", "cancelada"] },
      solicitudUserId: { type: Schema.Types.ObjectId, ref: "User" },
      solicitudCreadaPor: { type: Schema.Types.ObjectId, ref: "User" },
      solicitudMotivoRechazo: { type: String },
      solicitudRechazadaPor: { type: Schema.Types.ObjectId, ref: "User" },
      solicitudRechazadaEl: { type: Date },
      // Ver el comentario de la interfaz: se guarda en texto, no en ids.
      solicitudRevision: {
        cambios: [{ _id: false, campo: String, pedido: String, aprobado: String }],
        comentario: String,
        porNombre: String,
        el: Date,
      },
      esRenovacion: { type: Boolean },
      renovacionDe: {
        userProjectId: { type: Schema.Types.ObjectId, ref: "UserProject" },
        fechaBajaContrato: { type: String },
      },
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
// Soporta GET /users/eligible-responsables, que lista los candidatos a responsable de un proyecto.
userSchema.index({ tenantId: 1, isProjectResponsible: 1 });

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
