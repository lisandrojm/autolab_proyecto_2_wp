import { Types } from "mongoose";
declare const router: import("express-serve-static-core").Router;
/**
 * Backfill idempotente: antes de esta feature, "Plantillas | Release" (colección `Release`) no
 * tenía ningún concepto de tipo. Para todo Release del tenant que todavía no tenga
 * `releaseTipoId`, se busca o crea un ReleaseTipo con su mismo nombre y se vincula. Se corre solo
 * (no hace falta un script manual): al no haber pendientes, es un no-op rápido.
 */
declare function ensureReleaseTiposBackfilled(tenantId: Types.ObjectId): Promise<void>;
export { router as releaseTipoRoutes, ensureReleaseTiposBackfilled };
