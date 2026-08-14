import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Grupo salarial dentro de un Convenio Colectivo.
 *
 * Es el nivel que define la ESCALA: en el convenio 0634/11 (SAT — Televisión) las 3 categorías del
 * Grupo 1 (Director de Programas, Productor de Programas, Técnico Electrónico) comparten exactamente
 * el mismo básico, adicional, presentismo, bruto y neto. Verificado sobre los datos reales: los 15
 * grupos cargados tienen escalas 100% consistentes entre sus categorías.
 *
 * Antes la escala vivía repetida en cada categoría — 106 filas para ~12 escalas distintas, o sea
 * cada una duplicada unas 9 veces. Una paritaria obligaba a tocar las 106, y el botón "Actualizar
 * por Categoría" existía para compensar eso: era un parche sobre el modelo, no una funcionalidad.
 *
 * En ARCA el grupo no es una entidad aparte: viene embebido en la descripción de la categoría
 * ("DIRECTOR DE PROGRAMAS - GRUPO 1"). Acá se modela explícito porque es donde vive el sueldo.
 */
export interface IConvenioGrupo extends Document {
  /** Código del CCT al que pertenece, formato ARCA ("0634/11"). */
  convenio: string;
  /** Número de grupo dentro del convenio (la columna "Nº Cat." de la tabla vieja). */
  numero: number;
  /** Nombre opcional del grupo, si el convenio le da uno. */
  nombre?: string;
  sueldoBasico: number;
  sueldoAdicional: number;
  presentismo: number;
  sueldoBruto: number;
  sueldoBrutoLetras: string;
  neto: number;
  sueldoNetoLetras: string;
  /** Desde cuándo rige esta escala (última paritaria aplicada). */
  fechaActualizacion?: Date | string;
  createdAt: Date;
  updatedAt: Date;
}

const convenioGrupoSchema = new Schema<IConvenioGrupo>(
  {
    convenio: { type: String, required: true },
    numero: { type: Number, required: true },
    nombre: { type: String, default: "" },
    sueldoBasico: { type: Number, default: 0 },
    sueldoAdicional: { type: Number, default: 0 },
    presentismo: { type: Number, default: 0 },
    sueldoBruto: { type: Number, default: 0 },
    sueldoBrutoLetras: { type: String, default: "" },
    neto: { type: Number, default: 0 },
    sueldoNetoLetras: { type: String, default: "" },
    fechaActualizacion: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: "convenio-grupos" }
);

// Un grupo es único dentro de su convenio: el Grupo 1 del SAT no es el Grupo 1 de otro CCT.
convenioGrupoSchema.index({ convenio: 1, numero: 1 }, { unique: true });

export const ConvenioGrupo: Model<IConvenioGrupo> = mongoose.model<IConvenioGrupo>("ConvenioGrupo", convenioGrupoSchema);
