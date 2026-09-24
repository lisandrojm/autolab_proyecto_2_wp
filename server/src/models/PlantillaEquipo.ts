import mongoose, { Schema, Types } from "mongoose";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PLANTILLA DE EQUIPO: puestos por rol, y los equipos que los ocupan
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Casi siempre se contrata a los mismos equipos de jornaleros. Una plantilla tiene TRES niveles:
 *
 *  1. GENERAL: nombre, empresa (y convenio), tipo de contrato y comentario. Nada de áreas ni horarios.
 *  2. PUESTOS (`integrantes`): cada uno con su rol empresa, su área y turno, su horario y sus días (los
 *     del turno, modificables), su categoría y, si se fijó, su importe. Una plantilla puede cubrir
 *     varias áreas y turnos: cada puesto dice el suyo.
 *  3. EQUIPOS (`equipos`): quién ocupa cada puesto. Se guardan varios con nombre («Semana A», «Semana
 *     B») para repetirlos cuando haga falta. Al contratar se elige uno, se cambia a alguien sólo esa vez
 *     o se guarda el cambio en el equipo.
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
 * puede ocupar dos puestos del mismo equipo: lo controla el servicio.
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
}

export interface IAsignacion {
  puestoId: Types.ObjectId;
  userId: Types.ObjectId;
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
});

const equipoSchema = new Schema<IEquipo>({
  nombre: { type: String, required: true, trim: true, maxlength: 80 },
  asignaciones: [
    {
      _id: false,
      puestoId: { type: Schema.Types.ObjectId, required: true },
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
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
