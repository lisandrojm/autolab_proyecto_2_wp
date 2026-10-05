declare const router: import("express-serve-static-core").Router;
/**
 * Backfill idempotente: antes de esta feature, el "tipo de contrato" y la "plantilla" (contenido +
 * membrete) vivían juntos en `ContratoFrame`. Para toda Plantilla que todavía no tenga `contratoId`,
 * se busca o crea un Contrato con su mismo nombre/jornadas/multiplicador/tiempo indeterminado y se
 * vincula. Se corre solo (no hace falta un script manual): al no haber pendientes, es un no-op rápido.
 */
declare function ensureContratosBackfilled(): Promise<void>;
export { router as contratoRoutes, ensureContratosBackfilled };
