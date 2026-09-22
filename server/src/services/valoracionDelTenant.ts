import { Types } from "mongoose";
import { Valoracion } from "../models/Valoracion.js";
import { resolverValoracion, ValoracionParaResolver } from "../utils/valoracionAutomatica.js";

/**
 * La valoración que le corresponde a un margen EN ESTE TENANT, o `null` si no hay ninguna aplicable.
 *
 * Lee las valoraciones activas y aplica `resolverValoracion` (la regla vive ahí, pura y con tests).
 * Sin margen —lo normal en un alta— devuelve la POR DEFECTO.
 *
 * Existe porque son tres los lugares que resuelven la valoración de un proyecto: el alta a mano, el
 * alta desde el sync de FRAME y la edición. Estaba copiado en la edición, y el alta no lo hacía: todo
 * proyecto nuevo nacía «Sin valorar» hasta que alguien lo editaba, así que la valoración por defecto
 * no se veía en ningún lado.
 */
export async function valoracionParaMargen(tenantId: Types.ObjectId | string, margen: number | null | undefined): Promise<Types.ObjectId | null> {
  const valoraciones = await Valoracion.find({ tenantId, activo: { $ne: false } })
    .select("_id orden margenDesde margenHasta esDefault activo")
    .lean();
  const elegida = resolverValoracion(margen ?? null, valoraciones as unknown as ValoracionParaResolver[]);
  return elegida ? (elegida._id as Types.ObjectId) : null;
}
