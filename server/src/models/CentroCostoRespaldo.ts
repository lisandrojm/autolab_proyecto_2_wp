import mongoose, { Schema, Document, Types } from "mongoose";

/*
  EL RESPALDO DE CADA REEMPLAZO DEL CATÁLOGO DE CENTROS DE COSTO.

  Importar en modo «reemplazar» borra los 47 centros que había y corrige a qué centro apunta cada
  proyecto. Las dos cosas son irreversibles con lo que queda en la base después, así que antes de
  escribir se guarda acá lo que estaba: el catálogo anterior completo y, por proyecto, el valor de
  `metadata.centroCostoId` antes y después.

  Va a una colección y no a un archivo a propósito: el que corre el import desde la pantalla no tiene
  acceso al disco del servidor, y un respaldo que hay que ir a buscar por SSH no es un respaldo. Con
  esto, deshacer es una consulta: `centros_costo_respaldos` ordenado por fecha, el último.
*/
export interface ICentroCostoRespaldo extends Document {
  /** Quién lo corrió y desde dónde (la pantalla o el script). */
  ejecutadoPor?: Types.ObjectId;
  origen: "pantalla" | "script";
  modo: string;
  /** El catálogo tal cual estaba, crudo. */
  catalogoAnterior: unknown[];
  /** Un registro por proyecto tocado: `despues` es null cuando sólo se anotó el estado previo. */
  proyectos: Array<{ projectId: Types.ObjectId; nombre?: string; antes: number; despues?: number | null }>;
  /** Los que no se pudieron remapear, con el motivo, para que alguien los resuelva. */
  sinEquivalente: Array<{ projectId: Types.ObjectId; nombre?: string; centroCostoId: number; motivo: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ICentroCostoRespaldo>(
  {
    ejecutadoPor: { type: Schema.Types.ObjectId, ref: "User" },
    origen: { type: String, enum: ["pantalla", "script"], default: "pantalla" },
    modo: { type: String },
    catalogoAnterior: { type: [Schema.Types.Mixed], default: [] },
    proyectos: [
      {
        _id: false,
        projectId: { type: Schema.Types.ObjectId, ref: "Project" },
        nombre: String,
        antes: Number,
        despues: { type: Number, default: null },
      },
    ],
    sinEquivalente: [
      {
        _id: false,
        projectId: { type: Schema.Types.ObjectId, ref: "Project" },
        nombre: String,
        centroCostoId: Number,
        motivo: String,
      },
    ],
  },
  { timestamps: true, collection: "centros_costo_respaldos" }
);

export const CentroCostoRespaldo = mongoose.model<ICentroCostoRespaldo>("CentroCostoRespaldo", schema);
