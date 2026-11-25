import type { Permisos } from '../database/entidades';

/**
 * Procesos que ninguna key puede usar, aunque sus permisos digan lo contrario: EXEC del
 * Administrador que afectan a toda la instalación (ver catalogo/2026-10-08/README.md).
 */
export const PROCESOS_BLOQUEADOS: ReadonlySet<number> = new Set([
  19785, // Restaurar empresa
  3436, // Instalar actualizaciones
  3359, // Compactar base
  3366, // Restablecer configuración técnica
]);

/**
 * Endpoints de Tango que el proxy idéntico habilita: solo lectura. Las escrituras van por
 * endpoints propios con sus reglas (ADR 0004, proveedores), nunca por el proxy.
 */
export const ENDPOINTS_LECTURA: ReadonlySet<string> = new Set([
  'get',
  'getbyid',
  'getbyfilter',
  'getapilivequerydata',
  'getpdf',
]);

export function puedeUsarEmpresa(permisos: Permisos, tenant: string, empresa: string): boolean {
  return permisos.empresas.some((p) => p === `${tenant}/${empresa}` || p === `${tenant}/*`);
}

/** Endpoints que la key puede usar en un proceso, en minúsculas. */
export function endpointsPermitidos(permisos: Permisos, proceso: number): Set<string> {
  if (PROCESOS_BLOQUEADOS.has(proceso)) return new Set();
  return new Set(
    [...(permisos.procesos[String(proceso)] ?? []), ...(permisos.procesos['*'] ?? [])].map((e) =>
      e.toLowerCase(),
    ),
  );
}

export function puedeUsarEndpoint(permisos: Permisos, proceso: number, endpoint: string): boolean {
  return endpointsPermitidos(permisos, proceso).has(endpoint.toLowerCase());
}
