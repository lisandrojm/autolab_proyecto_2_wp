import { HttpStatus } from '@nestjs/common';
import { puedeUsarEmpresa, puedeUsarEndpoint } from '../auth/permisos';
import { ErrorConnector } from '../comun/errores';
import type { ApiKey } from '../database/entidades';
import type { DestinoTango, TenantsService } from './tenants.service';

/**
 * Resuelve `:tenant/:empresa` (slug o Company ID) y controla que la key tenga acceso.
 * Los permisos se controlan con el slug registrado. Una empresa no registrada o sin permiso
 * da 403; solo a quien tendría acceso se le dice que no está registrada (404).
 */
export async function autorizarEmpresa(
  tenants: TenantsService,
  apiKey: ApiKey,
  tenant: string,
  empresa: string,
): Promise<DestinoTango> {
  const destino = await tenants.resolver(tenant, empresa);
  const sinAcceso = new ErrorConnector(HttpStatus.FORBIDDEN, `La API key no tiene acceso a ${tenant}/${empresa}`);
  if (!destino) {
    if (puedeUsarEmpresa(apiKey.permisos, tenant, empresa)) {
      throw new ErrorConnector(HttpStatus.NOT_FOUND, `Empresa no registrada: ${tenant}/${empresa}`);
    }
    throw sinAcceso;
  }
  if (!puedeUsarEmpresa(apiKey.permisos, tenant, destino.slug)) throw sinAcceso;
  return destino;
}

/**
 * Para los endpoints propios del connector que leen la web (ADR 0003): la empresa, más un
 * permiso con nombre propio en la key (`<proceso>:<Endpoint>`), que el comodín `*` de las
 * lecturas no habilita.
 */
export async function autorizarEndpointWeb(
  tenants: TenantsService,
  apiKey: ApiKey,
  tenant: string,
  empresa: string,
  proceso: number,
  endpoint: string,
): Promise<DestinoTango> {
  const destino = await autorizarEmpresa(tenants, apiKey, tenant, empresa);
  if (!puedeUsarEndpoint(apiKey.permisos, proceso, endpoint)) {
    throw new ErrorConnector(HttpStatus.FORBIDDEN, `La API key no puede usar ${endpoint}`, [
      `Hace falta el permiso "${proceso}:${endpoint}"`,
    ]);
  }
  return destino;
}
