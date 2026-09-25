import mongoose, { Schema, Types } from "mongoose";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PLANTILLA DE EQUIPO: puestos por rol, y los equipos que los ocupan
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Casi siempre se contrata a los mismos equipos de jornaleros. Una plantilla tiene TRES niveles:
 *
 *  1. GENERAL: nombre, empresa (y convenio) y comentario. Nada de áreas, horarios ni tipo de contrato.
 *  2. PUESTOS (`integrantes`): cada uno con su rol empresa, su TIPO DE CONTRATO, su área y turno, su
 *     horario y sus días (los del turno, modificables), su categoría y, si se fijó, su importe. Una plantilla puede cubrir
 *     varias áreas y turnos: cada puesto dice el suyo.
 *  3. EQUIPOS (`equipos`): quién ocupa cada puesto y, si hace falta, CON QUÉ CONDICIONES PROPIAS
 *     (`asignaciones[].condiciones`: otro horario, otros días, otra área y turno, otro contrato…). Los
 *     puestos son la plantilla que se reutiliza; cada equipo es un caso guardado sobre ellos («Semana A»,
 *     «Equipo noche»). Lo que el equipo no pisa sale del puesto. Al contratar se elige uno, se cambia a
 *     alguien sólo esa vez o se guarda el cambio en el equipo.
 *
 * Al contratar salen N solicitudes idénticas a las del formulario individual (`services/plantillasEquipo.ts`).
 *
 * LO QUE NO GUARDA, A PROPÓSITO:
 *  - FECHAS NI DÍAS DEL CALENDARIO: se eligen en cada contratación.
 *  - IMPORTES CALCULADOS: se recalculan al contratar con la escala VIGENTE. Si alguien fijó a mano el
 *    importe de un puesto (`dailyRateManual`), se guarda la escala de ese momento (`escalaAlFijar`): si
 *    después cambió, la contratación lo avisa («antes X, ahora Y»).
 *
 * ALCANCE: `personal` = de un supervisor (`creadoPor`), en un proyecto; sólo él la ve y la usa (móvil).
 * `general` = del escritorio, sin proyecto ni personas ni áreas: puestos por rol que cada supervisor
 * copia («Usar») a una personal.
 *
 * Todo va EMBEBIDO (decisión D1 del plan): una plantilla se lee y se escribe entera. Una persona no
 * PUEDE ocupar dos puestos del mismo equipo (mañana en uno y noche en otro): si se pisan en días y
 * horario, se AVISA (`utils/superposicionContratos.ts`, `choquesDelEquipo`), no se bloquea.
 */

export interface IPuesto {
  _id: Types.ObjectId;
  rolesFrame: Types.ObjectId[];
  orden: number;
  areaId?: Types.ObjectId | null;
  shiftId?: Types.ObjectId | null;
  inTime?: string | null;
  outTime?: string | null;
  diasSemana?: number[];
  diasPorSemana?: number | null;
  diasRotativos?: boolean;
  categoriaSatId?: Types.ObjectId | null;
  dailyRateManual?: number | null;
  /** La escala (ya multiplicada) cuando se fijó `dailyRateManual`: para avisar si cambió. */
  escalaAlFijar?: number | null;
  comentarios?: string | null;
  /** El tipo de contrato de quien ocupe el puesto (cada persona contratada puede ir con uno distinto). */
  contratoId?: Types.ObjectId | null;
  nombreContrato?: string | null;
  /** El trámite del tipo de contrato («constancia_cuit» = servicios). Lo resuelve la pantalla. */
  tipoImpositivo?: string | null;
}

/**
 * Lo que un EQUIPO pisa de un puesto. Sólo se guardan los campos que difieren del puesto (lo resuelve
 * el servicio): lo que no está sale del puesto, así un cambio en el puesto llega a todos sus equipos.
 */
export interface ICondiciones {
  areaId?: Types.ObjectId | null;
  shiftId?: Types.ObjectId | null;
  inTime?: string | null;
  outTime?: string | null;
  diasSemana?: number[];
  diasPorSemana?: number | null;
  diasRotativos?: boolean;
  categoriaSatId?: Types.ObjectId | null;
  dailyRateManual?: number | null;
  escalaAlFijar?: number | null;
  comentarios?: string | null;
  contratoId?: Types.ObjectId | null;
  nombreContrato?: string | null;
  tipoImpositivo?: string | null;
}

/** Los campos de un puesto que un equipo puede pisar (todos menos el rol y el orden). */
export const CAMPOS_DE_CONDICIONES = ["areaId", "shiftId", "inTime", "outTime", "diasSemana", "diasPorSemana", "diasRotativos", "categoriaSatId", "dailyRateManual", "comentarios", "contratoId", "nombreContrato", "tipoImpositivo"] as const;

export interface IAsignacion {
  puestoId: Types.ObjectId;
  /** `null` = el puesto no tiene persona en este equipo, pero sí condiciones propias. */
  userId: Types.ObjectId | null;
  condiciones?: ICondiciones | null;
  /** El equipo NO usa este puesto: no se asigna, no se contrata, no cuenta. Sigue en la plantilla para los demás equipos. */
  excluido?: boolean;
  /** Si entró en lugar de otra persona en ese puesto de este equipo: a quién y cuándo. Informativo. */
  reemplazadoDePersonaId?: Types.ObjectId | null;
  reemplazadoEl?: Date | null;
}

export interface IEquipo {
  _id: Types.ObjectId;
  nombre: string;
  asignaciones: IAsignacion[];
  ultimaContratacionEl?: Date | null;
}

export interface IPlantillaEquipo {
  tenantId: Types.ObjectId;
  alcance: "personal" | "general";
  /** `null` en las generales. */
  projectId: Types.ObjectId | null;
  nombre: string;
  empresaContratoId?: Types.ObjectId | null;
  /** Derivado de la empresa, guardado para detectar que cambió. */
  convenioId?: Types.ObjectId | null;
  /** VIEJO: el tipo de contrato ahora va por puesto. Los puestos sin uno propio heredan éste. */
  contratoId?: Types.ObjectId | null;
  nombreContrato?: string;
  /** El trámite del tipo de contrato («constancia_cuit» = servicios). Lo resuelve la pantalla, igual que en el alta individual. */
  tipoImpositivo?: string;
  comentarios?: string;
  integrantes: IPuesto[];
  equipos: IEquipo[];
  activo: boolean;
  creadoPor: Types.ObjectId;
  ultimaContratacionEl?: Date | null;
  ultimoLoteId?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const puestoSchema = new Schema<IPuesto>({
  rolesFrame: [{ type: Schema.Types.ObjectId, ref: "RoleFrame" }],
  orden: { type: Number, default: 0 },
  areaId: { type: Schema.Types.ObjectId, ref: "Area", default: null },
  shiftId: { type: Schema.Types.ObjectId, ref: "Shift", default: null },
  inTime: { type: String, default: null },
  outTime: { type: String, default: null },
  diasSemana: { type: [Number], default: [] },
  diasPorSemana: { type: Number, default: null },
  diasRotativos: { type: Boolean, default: false },
  categoriaSatId: { type: Schema.Types.ObjectId, ref: "CategoriaSat", default: null },
  dailyRateManual: { type: Number, default: null },
  escalaAlFijar: { type: Number, default: null },
  comentarios: { type: String, default: null },
  contratoId: { type: Schema.Types.ObjectId, ref: "Contrato", default: null },
  nombreContrato: { type: String, default: null },
  tipoImpositivo: { type: String, default: null },
});

const equipoSchema = new Schema<IEquipo>({
  nombre: { type: String, required: true, trim: true, maxlength: 80 },
  asignaciones: [
    {
      _id: false,
      puestoId: { type: Schema.Types.ObjectId, required: true },
      userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
      // Mixed: sólo las claves pisadas (un esquema con campos llenaría arrays vacíos que no son «pisar»).
      condiciones: { type: Schema.Types.Mixed, default: null },
      excluido: { type: Boolean, default: false },
      reemplazadoDePersonaId: { type: Schema.Types.ObjectId, ref: "User", default: null },
      reemplazadoEl: { type: Date, default: null },
    },
  ],
  ultimaContratacionEl: { type: Date, default: null },
});

const plantillaEquipoSchema = new Schema<IPlantillaEquipo>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    alcance: { type: String, enum: ["personal", "general"], default: "personal" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    empresaContratoId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    convenioId: { type: Schema.Types.ObjectId, default: null },
    contratoId: { type: Schema.Types.ObjectId, ref: "Contrato", default: null },
    nombreContrato: { type: String, default: "" },
    tipoImpositivo: { type: String, default: "" },
    comentarios: { type: String, default: "" },
    integrantes: { type: [puestoSchema], default: [] },
    equipos: { type: [equipoSchema], default: [] },
    activo: { type: Boolean, default: true },
    creadoPor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ultimaContratacionEl: { type: Date, default: null },
    ultimoLoteId: { type: Schema.Types.ObjectId, ref: "LoteContratacion", default: null },
  },
  { timestamps: true, collection: "plantillas_equipo" },
);

plantillaEquipoSchema.index({ tenantId: 1, creadoPor: 1, projectId: 1, activo: 1 });
// El nombre no se repite entre las plantillas vivas (las borradas quedan con `activo: false`): las de un
// supervisor, dentro de su proyecto; las generales, en todo el tenant.
plantillaEquipoSchema.index({ tenantId: 1, creadoPor: 1, projectId: 1, nombre: 1 }, { unique: true, name: "nombre_personal_unico", partialFilterExpression: { activo: true, alcance: "personal" } });
plantillaEquipoSchema.index({ tenantId: 1, nombre: 1 }, { unique: true, name: "nombre_general_unico", partialFilterExpression: { activo: true, alcance: "general" } });

export const PlantillaEquipo = mongoose.model<IPlantillaEquipo>("PlantillaEquipo", plantillaEquipoSchema);
