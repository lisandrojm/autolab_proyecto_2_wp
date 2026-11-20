/**
 * BAJA, MODIFICACIÓN Y ANULACIÓN DE UNA RELACIÓN LABORAL EN ARCA (Relaciones Laborales → Modificaciones y Bajas,
 * 20/11/2026). Ver `services/arca/corridaOperacionRelacion.ts`. Mismo permiso que las altas.
 *
 *   GET  /arca/operaciones/relacion?userProjectId=&contratoKey=|contractIndex=   el contrato, sus marcas, el espejo y las situaciones de baja
 *   POST /arca/operaciones/plan      { op, userProjectId, contratoKey?, contractIndex?, datos }   qué se mandaría, sin tocar ARCA
 *   POST /arca/operaciones/corrida   { …lo mismo…, confirmar?: boolean }   en seco salvo `confirmar: true` (y el server lo permita)
 *   GET  /arca/operaciones/corrida   estado y eventos de la operación en curso (o la última)
 *   POST /arca/operaciones/corrida/detener
 *   GET  /arca/operaciones/historial?userProjectId=&contratoKey=&limit=
 */
declare const router: import("express-serve-static-core").Router;
export { router as arcaOperacionesRoutes };
