import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Diccionario de actividades del nomenclador de ARCA (Simplificación Registral).
 *
 * ES SOLO UN DICCIONARIO. No define qué puede declarar un contrato: eso lo define, y únicamente, lo
 * que ARCA tiene declarado para ESE domicilio de explotación (ver `ArcaSucursal.actividades`). Un
 * código válido en otra sucursal es rechazado por el organismo, así que un selector de contrato que
 * ofreciera este catálogo estaría ofreciendo códigos inválidos.
 *
 * Para qué sirve entonces: para no tipear el código a mano al cargar una actividad en un domicilio, y
 * para que la descripción salga siempre idéntica. Es lo que evita el caso real que lo motivó — la
 * misma actividad escrita de dos formas distintas en dos sucursales.
 *
 * Se llena solo: el importador de Domicilios de Explotación da de alta cada código que no exista, así
 * que el diccionario termina teniendo exactamente las actividades en uso y todas correctas, porque
 * vienen del padrón. Sembrar el nomenclador completo (~2.350) es opcional, por Importar Excel.
 *
 * `externalId` es el CÓDIGO tal cual va al TXT (6 díg., pos. 79-84), con sus ceros a la izquierda:
 * se guarda como string para no perderlos.
 */
export interface IArcaActividad extends Document {
  externalId: string;
  name: string;
  data: {
    id: number;
    nombre: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IArcaActividad>(
  {
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
    },
  },
  {
    timestamps: true,
    collection: "arca-actividades",
  }
);

export const ArcaActividad: Model<IArcaActividad> = mongoose.model<IArcaActividad>("ArcaActividad", schema);
