import mongoose, { Schema, Types } from "mongoose";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PLANTILLA DE EQUIPO: un grupo fijo de personas que se contrata junto
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Casi siempre se contrata a los mismos equipos de jornaleros. La plantilla guarda lo que se repite
 * —proyecto, empresa, tipo de contrato, área y turno, horario, días— y a cada integrante con su rol y
 * su categoría; al contratarla salen N solicitudes de contratación idénticas a las del formulario
 * individual (ver `services/plantillasEquipo.ts`).
 *
 * LO QUE NO GUARDA, A PROPÓSITO:
 *  - FECHAS NI DÍAS DEL CALENDARIO: se eligen en cada contratación.
 *  - IMPORTES CALCULADOS: se recalculan al contratar con la escala VIGENTE. Guarda la categoría y, si
 *    alguien fijó a mano el importe de un integrante (`dailyRateManual`), la escala que regía en ese
 *    momento (`escalaAlFijar`): si después cambió, la contratación lo avisa («antes X, ahora Y»).
 *
 * CADA INTEGRANTE ES UN PUESTO: un rol empresa (Director, Cámara, Microfonista…) y, si ya se sabe, la
 * persona que lo ocupa. El equipo se arma primero por roles —«1 director, 2 cámaras, 1 sonido»— y la
 * gente se asigna después; un puesto sin persona se completa al contratar (sólo esa vez) o se excluye.
 *
 * Los integrantes van EMBEBIDOS (decisión D1 del plan): una plantilla se lee y se escribe entera, sus
 * integrantes no existen fuera de ella y el orden es el del array. Una persona no puede estar dos
 * veces (los puestos sin asignar sí pueden repetirse): lo controla el servicio.
 */

export interface IIntegrantePlantilla {
  _id: Types.ObjectId;
  /** La persona del puesto. `null` = puesto sin asignar. */
  userId: Types.ObjectId | null;
  rolesFrame: Types.ObjectId[];
  orden: number;
  // Lo propio de esta persona. `null`/ausente = usa el valor de la plantilla.
  categoriaSatId?: Types.ObjectId | null;
  inTime?: string | null;
  outTime?: string | null;
  dailyRateManual?: number | null;
  /** La escala (ya multiplicada) cuando se fijó `dailyRateManual`: para avisar si cambió. */
  escalaAlFijar?: number | null;
  comentarios?: string | null;
  /** Si reemplazó a otro integrante de la plantilla: a quién y cuándo. Sólo informativo. */
  reemplazadoDePersonaId?: Types.ObjectId | null;
  reemplazadoEl?: Date | null;
}

export interface IPlantillaEquipo {
  tenantId: Types.ObjectId;
  /**
   * `personal`: de un supervisor (el que la creó, `creadoPor`), en un proyecto. Sólo él la ve y la usa.
   * `general`: del escritorio, SIN proyecto: puestos por rol y valores de base. En el móvil se copia a
   * una personal («Usar»); no se contrata directo ni lleva personas.
   */
  alcance: "personal" | "general";
  /** `null` en las generales. */
  projectId: Types.ObjectId | null;
  nombre: string;
  empresaContratoId?: Types.ObjectId | null;
  /** Derivado de la empresa (y del CCT de su rol), guardado para detectar que cambió. */
  convenioId?: Types.ObjectId | null;
  contratoId?: Types.ObjectId | null;
  nombreContrato?: string;
  /** El trámite del tipo de contrato («constancia_cuit» = servicios). Lo resuelve la pantalla, igual que en el alta individual. */
  tipoImpositivo?: string;
  areaShiftAssignments: { areaId: Types.ObjectId; shiftIds: Types.ObjectId[] }[];
  inTime: string;
  outTime: string;
  diasSemana: number[];
  diasPorSemana?: number | null;
  diasRotativos: boolean;
  comentarios?: string;
  integrantes: IIntegrantePlantilla[];
  activo: boolean;
  creadoPor: Types.ObjectId;
  ultimaContratacionEl?: Date | null;
  ultimoLoteId?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const integranteSchema = new Schema<IIntegrantePlantilla>({
  userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  rolesFrame: [{ type: Schema.Types.ObjectId, ref: "RoleFrame" }],
  orden: { type: Number, default: 0 },
  categoriaSatId: { type: Schema.Types.ObjectId, ref: "CategoriaSat", default: null },
  inTime: { type: String, default: null },
  outTime: { type: String, default: null },
  dailyRateManual: { type: Number, default: null },
  escalaAlFijar: { type: Number, default: null },
  comentarios: { type: String, default: null },
  reemplazadoDePersonaId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  reemplazadoEl: { type: Date, default: null },
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
    areaShiftAssignments: [
      {
        _id: false,
        areaId: { type: Schema.Types.ObjectId, ref: "Area" },
        shiftIds: [{ type: Schema.Types.ObjectId, ref: "Shift" }],
      },
    ],
    inTime: { type: String, default: "" },
    outTime: { type: String, default: "" },
    diasSemana: { type: [Number], default: [] },
    diasPorSemana: { type: Number, default: null },
    diasRotativos: { type: Boolean, default: false },
    comentarios: { type: String, default: "" },
    integrantes: { type: [integranteSchema], default: [] },
    activo: { type: Boolean, default: true },
    creadoPor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ultimaContratacionEl: { type: Date, default: null },
    ultimoLoteId: { type: Schema.Types.ObjectId, ref: "LoteContratacion", default: null },
  },
  { timestamps: true, collection: "plantillas_equipo" },
);

plantillaEquipoSchema.index({ tenantId: 1, creadoPor: 1, projectId: 1, activo: 1 });
// El nombre no se repite entre las plantillas vivas (las borradas quedan con `activo: false`): las de un
// supervisor, dentro de su proyecto; las generales, en todo el tenant. Dos supervisores sí pueden tener
// cada uno su «Equipo noche».
plantillaEquipoSchema.index({ tenantId: 1, creadoPor: 1, projectId: 1, nombre: 1 }, { unique: true, name: "nombre_personal_unico", partialFilterExpression: { activo: true, alcance: "personal" } });
plantillaEquipoSchema.index({ tenantId: 1, nombre: 1 }, { unique: true, name: "nombre_general_unico", partialFilterExpression: { activo: true, alcance: "general" } });

export const PlantillaEquipo = mongoose.model<IPlantillaEquipo>("PlantillaEquipo", plantillaEquipoSchema);
