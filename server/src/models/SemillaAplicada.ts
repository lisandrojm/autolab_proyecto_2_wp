import mongoose, { Schema, Model } from "mongoose";

/**
 * Registro de las cargas iniciales que ya se hicieron, para que corran UNA SOLA VEZ.
 *
 * Existe porque "si la colección está vacía, cargarla" no alcanza: si alguien vacía un catálogo a
 * propósito desde su ABM, el próximo reinicio del server lo volvería a llenar, que es justo lo que no
 * tiene que pasar con algo que ya administra una persona. Y "si la colección no existe" tampoco sirve:
 * Mongoose la crea sola al arrancar para armar sus índices, antes de que la carga llegue a mirarla.
 */
export interface ISemillaAplicada {
  clave: string;
  aplicadaEl: Date;
  detalle?: string;
}

const semillaAplicadaSchema = new Schema<ISemillaAplicada>(
  {
    clave: { type: String, required: true, unique: true },
    aplicadaEl: { type: Date, required: true },
    detalle: { type: String },
  },
  { collection: "semillas_aplicadas" },
);

export const SemillaAplicada: Model<ISemillaAplicada> = mongoose.model<ISemillaAplicada>("SemillaAplicada", semillaAplicadaSchema);
