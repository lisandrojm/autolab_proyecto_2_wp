import mongoose, { Schema, Document } from "mongoose";

/**
 * PERMISOS EN DESARROLLO: visibles en el editor de roles, pero que nadie puede tildar ni destildar.
 *
 * Mientras una pantalla se está construyendo, su permiso ya existe en el código —y por lo tanto en el
 * editor—, pero darlo abriría algo sin terminar. Ocultarlo no alcanza: después nadie sabe que existe.
 * Queda a la vista, apagado y con el rótulo «En desarrollo».
 *
 * Es de PLATAFORMA, no de un tenant: lo que no está terminado no lo está para nadie. Un único
 * documento (`clave: "global"`) y sólo el SuperAdmin lo cambia.
 */
export interface IPermisosEnDesarrollo extends Document {
  clave: string;
  permisos: string[];
  createdAt: Date;
  updatedAt: Date;
}

const permisosEnDesarrolloSchema = new Schema<IPermisosEnDesarrollo>(
  {
    clave: { type: String, required: true, unique: true, default: "global" },
    permisos: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const PermisosEnDesarrollo = mongoose.model<IPermisosEnDesarrollo>("PermisosEnDesarrollo", permisosEnDesarrolloSchema);

/** La lista actual. Sin documento todavía, ninguno está en desarrollo. */
export async function permisosEnDesarrollo(): Promise<string[]> {
  const doc = await PermisosEnDesarrollo.findOne({ clave: "global" }).select("permisos").lean();
  return doc?.permisos || [];
}
