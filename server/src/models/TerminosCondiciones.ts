import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * TÉRMINOS Y CONDICIONES que acepta quien se registra con un link.
 *
 * Puede haber varios cargados (borradores, una versión nueva en preparación), pero a lo sumo UNO
 * VIGENTE por tenant: es el que muestra el formulario de registro y el que hay que aceptar para
 * terminarlo. Sin ninguno vigente el registro sigue como siempre, sin casilla.
 *
 * EL TEXTO ACEPTADO NO SE PIERDE AL EDITARLO. Cada cambio de título o contenido sube la `version` y
 * guarda la anterior en `historial`. La persona queda registrada con la versión que aceptó
 * (`metadata.terminosAceptados.version`), así que siempre se puede saber qué decía el texto que
 * aceptó, aunque después se haya corregido.
 */
export interface ITerminosCondiciones extends Document {
  tenantId: Types.ObjectId;
  titulo: string;
  /** HTML del editor (negrita, cursiva, subrayado, listas, tablas…). */
  contenido: string;
  vigente: boolean;
  version: number;
  historial: { version: number; titulo: string; contenido: string; hasta: Date }[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const terminosCondicionesSchema = new Schema<ITerminosCondiciones>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    titulo: { type: String, required: true, trim: true },
    contenido: { type: String, default: "" },
    vigente: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    historial: [
      {
        _id: false,
        version: { type: Number, required: true },
        titulo: { type: String },
        contenido: { type: String },
        /** Hasta cuándo fue ése el texto: el momento en que se lo reemplazó. */
        hasta: { type: Date, required: true },
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, collection: "terminos_condiciones" },
);

export const TerminosCondiciones = mongoose.model<ITerminosCondiciones>("TerminosCondiciones", terminosCondicionesSchema);
