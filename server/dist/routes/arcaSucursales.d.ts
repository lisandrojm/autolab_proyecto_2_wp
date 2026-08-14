/**
 * ABM de Sucursales de ARCA (Simplificación Registral). Catálogo global, mismo criterio que el resto
 * de la configuración: sin tenantId, solo `authenticateToken`.
 *
 * Acá se cargan TODOS los datos de la sucursal (código, domicilio, actividades). Las empresas
 * después solo eligen cuáles les corresponden.
 */
declare const router: import("express-serve-static-core").Router;
export { router as arcaSucursalRoutes };
