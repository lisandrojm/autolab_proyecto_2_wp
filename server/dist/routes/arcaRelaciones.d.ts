/**
 * RELACIONES LABORALES DE ARCA Y ANTIGÜEDAD: lo que se lee en la pestaña «Antigüedad ARCA» de
 * Documentos y lo que la hace sincronizar. Nada de acá escribe en ARCA; la sincronización sólo lee.
 * Mismo permiso que las altas automáticas (`/contratos/altas-arca/*`).
 */
declare const router: import("express-serve-static-core").Router;
export declare const arcaRelacionesRoutes: import("express-serve-static-core").Router;
export default router;
