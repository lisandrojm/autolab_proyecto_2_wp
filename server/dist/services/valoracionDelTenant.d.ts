import { Types } from "mongoose";
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
export declare function valoracionParaMargen(tenantId: Types.ObjectId | string, margen: number | null | undefined): Promise<Types.ObjectId | null>;
