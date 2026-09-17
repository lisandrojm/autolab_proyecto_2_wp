import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Contrato: el tipo de contrato real (Jornada, Plazo fijo 5x7, Tiempo Indeterminado, ...), con su
 * configuración de jornadas/multiplicador/vigencia. Es la unidad que se elige en el wizard de
 * Agregar/Configurar miembro.
 *
 * Distinto de `ContratoFrame` (la Plantilla): la Plantilla es el documento PDF en sí (contenido +
 * membrete) y apunta a un Contrato vía `contratoId`. Un Contrato puede tener varias Plantillas
 * (por ejemplo variantes con/sin membrete, o por empresa); el wizard resuelve cuál usar.
 */
export interface IContrato extends Document {
  name: string;
  data: {
    cantidadJornadas: number;
    multiplicadorDiario: number;
    esTiempoIndeterminado: boolean;
    /**
     * CÓMO SE ELIGEN LAS FECHAS DE ESTE TIPO DE CONTRATO.
     *
     *   periodo  desde y hasta, y la persona trabaja los días de la semana que se marquen adentro.
     *            Es lo de siempre y el valor por defecto.
     *   dias     se pintan los días uno por uno en un calendario, como en Vacaciones. Cada día
     *            marcado es UNA jornada: sirve para lo que se contrata por día suelto —una cobertura,
     *            tres días de rodaje salteados— donde un período miente sobre lo que se trabaja.
     *
     * Es del TIPO DE CONTRATO y no de cada solicitud: cómo se contrata un «Jornada» no lo decide
     * quien carga el alta.
     */
    modoFechas?: "periodo" | "dias";
    /**
     * Límites de la jornada de este tipo de contrato (un «6x6»: 6 días por semana, 6 horas por jornada).
     * Opcionales: `null` = sin límite. Son la base para acotar la solicitud de contratación.
     */
    horasPorJornada?: number | null;
    diasPorSemana?: number | null;
    /** Si al firmar el contrato el documento se envía a firmar (p. ej. por Dropbox Sign). */
    requiereFirma: boolean;
    /**
     * Códigos AFIP para la generación del TXT de Alta masiva. Son específicos del convenio/modalidad,
     * por eso se cargan por Tipo de Contrato. Se guardan como string para conservar ceros a la izquierda.
     */
    afipModalidadContrato?: string; // pos. 17-19 (3 díg.)
    afipTipoServicio?: string; // pos. 107-109 (3 díg.)
    /**
     * @deprecated NO se usa más para generar el TXT y ya no se edita desde el ABM.
     *
     * La actividad (pos. 79-84) es la del DOMICILIO de desempeño, no la del tipo de contrato: en el
     * padrón de ARCA cuelga de cada sucursal de cada CUIT. Mientras vivió acá, dos personas del mismo
     * tipo de contrato en sedes distintas salían con la misma actividad — un alta válida para ARCA
     * pero mal declarada, y sin ningún control que lo frenara. Ahora sale de la sucursal elegida en
     * el contrato: `companies.sucursalIds` → `ArcaSucursal.actividades[]` (con una sola actividad el
     * contrato la hereda; con varias, elige cuál declara en `contracts.actividadArca`).
     *
     * El campo se conserva para no perder lo ya cargado; se puede borrar en una limpieza posterior.
     */
    afipActividad?: string;
    afipModalidadLiquidacion?: string; // pos. 73 (1 díg.) — 1 = mensual, etc.
    /**
     * Si este tipo de contrato genera alta temprana ante ARCA.
     *
     * VACÍO NO ES LO MISMO QUE «NO CORRESPONDE», Y HOY SE VEN IGUAL. «Servicios» es una locación de
     * servicios: no es relación laboral, no lleva modalidad de contrato y no se declara. Sin este
     * campo queda con los tres códigos en blanco, indistinguible de un tipo al que le falta
     * cargarlos — así que figura como incompleto para siempre y alguien, tarde o temprano, va a
     * «completarlo» declarando ante el organismo una relación que no existe.
     *
     * `true` por defecto: la enorme mayoría de los tipos sí generan alta, y un default en `false`
     * haría desaparecer de la pestaña de altas a cualquier tipo nuevo sin que nadie lo note.
     */
    generaAlta?: boolean;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const contratoSchema = new Schema<IContrato>(
  {
    // `unique` evita duplicados aunque dos requests concurrentes disparen el backfill al mismo
    // tiempo (ver `ensureContratosBackfilled` en routes/contratos.ts).
    name: { type: String, required: true, unique: true },
    data: {
      cantidadJornadas: { type: Number, default: 0 },
      multiplicadorDiario: { type: Number, default: 0 },
      esTiempoIndeterminado: { type: Boolean, default: false },
      modoFechas: { type: String, enum: ["periodo", "dias"], default: "periodo" },
      horasPorJornada: { type: Number, default: null },
      diasPorSemana: { type: Number, default: null },
      requiereFirma: { type: Boolean, default: true },
      afipModalidadContrato: { type: String },
      afipTipoServicio: { type: String },
      afipActividad: { type: String },
      afipModalidadLiquidacion: { type: String },
      generaAlta: { type: Boolean, default: true },
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "contratos",
  },
);

export const Contrato: Model<IContrato> = mongoose.model<IContrato>("Contrato", contratoSchema);
