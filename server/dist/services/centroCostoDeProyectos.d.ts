/**
 * EL CENTRO DE COSTO DE CADA PROYECTO, RESUELTO POR EL SERVER.
 *
 * Lo necesita cualquier listado que dibuje el badge del centro: sin esto la pantalla se queda
 * esperando a `cargarCentrosCosto` —los 2204 centros del catálogo de Tango— para traducir un número,
 * y hasta que llega muestra «ID: 46» en cada tarjeta. Acá es una consulta por página de proyectos.
 *
 * Estaba escrito adentro de `GET /projects` y el listado por cliente no lo tenía, que es justamente
 * la pantalla donde se veían los ids: el mismo badge resolvía distinto según de qué lista saliera.
 *
 * Salió de `routes/projects.ts` (01/11/2026) para usarlo también en Solicitudes.
 */
export declare function resolverCentroCostoDeProyectos(projects: any[]): Promise<void>;
/**
 * Lo que dice el badge del centro de costo de un proyecto ya resuelto: el código de Tango (o el nombre,
 * en los viejos). Con un id que no resuelve, «ID: n», como la pantalla (`nombreCentroCosto`): distingue
 * un centro borrado de un proyecto sin centro, que es "".
 */
export declare const etiquetaCentroCostoDe: (p: any) => string;
