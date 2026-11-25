import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HEADER_API_KEY, KeyActual } from '../auth/api-key.guard';
import { HEADER_ORIGEN } from '../comun/errores';
import type { ApiKey } from '../database/entidades';
import { autorizarEndpointWeb } from '../tenants/autorizar-empresa';
import { TenantsService } from '../tenants/tenants.service';
import { CentrosCostoCompraService, MAX_COMPROBANTES, parsearIds, parsearTodos } from './centros-costo-compra.service';

/** "Detalle por auxiliar", el proceso de la web de donde se leen las imputaciones. */
export const PROCESO_AUXILIARES = -14024;
/** Nombre del endpoint en los permisos de la key: `-14024:CentrosDeCostoDeComprobantesDeCompra`. */
export const ENDPOINT_CENTROS_COSTO = 'CentrosDeCostoDeComprobantesDeCompra';

/**
 * Centros de costo imputados en comprobantes de compra ya cargados. No están en la API
 * pública: se leen de la web (ADR 0003, docs/tango/imputacion-comprobante-compra.md).
 */
@ApiTags('tango-web')
@ApiHeader({ name: HEADER_API_KEY, required: true })
@Controller('tango/:tenant/:empresa/centros-de-costo-de-comprobantes-de-compra')
export class CentrosCostoCompraController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly centros: CentrosCostoCompraService,
  ) {}

  @Get()
  @Header(HEADER_ORIGEN, 'connector')
  @ApiOperation({
    summary: 'Centros de costo reales (auxiliar de la imputación) de comprobantes de compra, por ID_CPA04',
    description:
      'Una fila por comprobante × cuenta × centro de costo, con su porcentaje de apropiación. Las cuentas sin auxiliar (proveedores, IVA) no aparecen. Un comprobante sin imputaciones no devuelve filas.',
  })
  @ApiQuery({ name: 'idCpa04', required: true, description: `ID_CPA04 separados por coma (máximo ${MAX_COMPROBANTES})` })
  @ApiQuery({ name: 'todos', required: false, description: 'true: todos los tipos de auxiliar, no solo centros de costo' })
  async listar(
    @Param('tenant') tenant: string,
    @Param('empresa') empresa: string,
    @Query('idCpa04') idCpa04: unknown,
    @Query('todos') todos: unknown,
    @KeyActual() apiKey: ApiKey,
  ) {
    const ids = parsearIds(idCpa04);
    const todosLosAuxiliares = parsearTodos(todos);
    const destino = await autorizarEndpointWeb(this.tenants, apiKey, tenant, empresa, PROCESO_AUXILIARES, ENDPOINT_CENTROS_COSTO);
    return this.centros.imputaciones(tenant, destino.tangoCompanyId, ids, todosLosAuxiliares);
  }
}
