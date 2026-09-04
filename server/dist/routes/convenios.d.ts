/**
 * Catálogo de Convenios de Trabajo (CCT).
 *
 * Los encabezados de la plantilla y del import coinciden con los de la tabla informativa de AFIP
 * (Código / Actividad / Signatario), así que el XLSX que genera
 * `src/scripts/convenios/conveniosToXlsx.ts` se importa sin tocar nada.
 */
declare const router: import('express').Router;
export { router as convenioRoutes };
