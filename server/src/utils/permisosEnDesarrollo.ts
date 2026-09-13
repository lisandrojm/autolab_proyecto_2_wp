import { Info } from "../models/Info.js";

/**
 * PERMISOS EN DESARROLLO: visibles en el editor de roles, pero que nadie puede tildar ni destildar.
 *
 * Mientras una pantalla se está construyendo, su permiso ya existe en el código —y por lo tanto en el
 * editor—, pero darlo abriría algo sin terminar. Ocultarlo no alcanza: después nadie sabe que existe.
 * Queda a la vista, apagado y con el rótulo «En desarrollo». Es de PLATAFORMA, no de un tenant: lo que
 * no está terminado no lo está para nadie. Sólo el SuperAdmin lo cambia.
 *
 * VIVE COMO UN DOCUMENTO DE `infos`, NO EN UNA COLECCIÓN PROPIA, y es a propósito: el cluster de Atlas
 * tiene un tope de 500 colecciones (entre todas sus bases) y ya está lleno. Una colección nueva para un
 * solo documento hacía fallar el guardado con «cannot create a new collection». `infos` ya guarda
 * catálogos globales por `type` y admite campos libres (`strict: false`).
 */

const TIPO = "permisos-en-desarrollo";

/** La lista actual. Sin documento todavía, ninguno está en desarrollo. */
export async function permisosEnDesarrollo(): Promise<string[]> {
  const doc: any = await Info.findOne({ type: TIPO }).select("data.permisos").lean();
  const permisos = doc?.data?.permisos;
  return Array.isArray(permisos) ? permisos.map(String) : [];
}

/** Reemplaza la lista entera y devuelve la que quedó guardada. */
export async function guardarPermisosEnDesarrollo(permisos: string[]): Promise<string[]> {
  const unicos = [...new Set(permisos.map(String))];
  await Info.updateOne({ type: TIPO }, { $set: { "data.permisos": unicos }, $setOnInsert: { type: TIPO, externalId: TIPO, name: "Permisos en desarrollo" } }, { upsert: true, strict: false });
  return permisosEnDesarrollo();
}
