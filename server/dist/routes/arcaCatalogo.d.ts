/**
 * EL CATÁLOGO DE ARCA (espejo `arca_catalogo`): leerlo de ARCA y aplicar lo leído con confirmación.
 *
 * Esta es la ÚNICA ruta que escribe en el espejo, y solo a través de `aplicarLectura` (una lectura de
 * ARCA que alguien confirmó). Ningún ABM lo hace: un test lo verifica.
 */
declare const router: import("express-serve-static-core").Router;
export { router as arcaCatalogoRoutes };
