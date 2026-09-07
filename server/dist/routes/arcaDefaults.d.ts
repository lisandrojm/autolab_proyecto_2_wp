/**
 * Los valores por defecto de ARCA de la instalación. Ver `models/ArcaDefault.ts` para la cascada.
 *
 * Un solo documento, así que no hay ABM: se lee entero y se parchea campo por campo. Cada pantalla
 * de nomenclador manda SOLO su campo (la ★ de esa pantalla), y los que no vienen no se tocan — si
 * mandara el objeto completo, abrir dos pantallas en dos pestañas haría que la última en guardar
 * borrara lo que marcó la otra.
 */
declare const router: import("express-serve-static-core").Router;
export { router as arcaDefaultsRoutes };
