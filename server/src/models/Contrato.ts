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
      requiereFirma: { type: Boolean, default: true },
      afipModalidadContrato: { type: String },
      afipTipoServicio: { type: String },
      afipActividad: { type: String },
      afipModalidadLiquidacion: { type: String },
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "contratos",
  },
);

export const Contrato: Model<IContrato> = mongoose.model<IContrato>("Contrato", contratoSchema);
