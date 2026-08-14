/**
 * ABM de Sucursales de ARCA (Simplificación Registral). Catálogo global, mismo criterio que el resto
 * de la configuración: sin tenantId, solo `authenticateToken`.
 *
 * Acá se cargan TODOS los datos de la sucursal (código, domicilio, actividades). Las empresas
 * después solo eligen cuáles les corresponden.
 */
declare const router: import("express-serve-static-core").Router;
export interface SucursalParseada {
    codigo: string;
    domicilio: string;
    localidad: string;
    codigoPostal: string;
    actividades: Array<{
        codigo: string;
        descripcion: string;
    }>;
}
/**
 * Parsea el archivo del export de ARCA (o la plantilla) a sucursales agrupadas por código.
 *
 * Exportada para poder testearla sin levantar el server ni tocar la base: el parseo es la parte
 * frágil (encabezados desconocidos, una fila por actividad), el upsert es trivial.
 *
 * Lanza `Error` con un mensaje para el usuario si el archivo está vacío o no se reconocen columnas.
 */
export declare function parsearExportSucursales(buffer: Buffer): {
    sucursales: SucursalParseada[];
    errores: string[];
};
export { router as arcaSucursalRoutes };
