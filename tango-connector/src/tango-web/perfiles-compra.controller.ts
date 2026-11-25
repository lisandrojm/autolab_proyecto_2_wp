import { Controller, Get, Header, Param, ParseIntPipe } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HEADER_API_KEY, KeyActual } from '../auth/api-key.guard';
import { HEADER_ORIGEN } from '../comun/errores';
import type { ApiKey } from '../database/entidades';
import { autorizarEndpointWeb } from '../tenants/autorizar-empresa';
import { TenantsService } from '../tenants/tenants.service';
import { PerfilesCompraService } from './perfiles-compra.service';

/** Proceso de Tango de los perfiles (Compras > Perfiles > de Factura de Compra). */
export const PROCESO_PERFILES = 27;
/** Nombre del endpoint en los permisos de la key: `27:PerfilesDeFacturaDeCompra`. */
export const ENDPOINT_PERFILES = 'PerfilesDeFacturaDeCompra';

/**
 * Perfiles de factura de compra. No existen en la API pública: el connector los lee de la web
 * de Tango con un usuario técnico (ADR 0003). La respuesta es del connector, no de Tango.
 */
@ApiTags('tango-web')
@ApiHeader({ name: HEADER_API_KEY, required: true })
@Controller('tango/:tenant/:empresa/perfiles-de-factura-de-compra')
export class PerfilesCompraController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly perfiles: PerfilesCompraService,
  ) {}

  @Get()
  @Header(HEADER_ORIGEN, 'connector')
  @ApiOperation({ summary: 'Perfiles de factura de compra de la empresa: id, código y descripción' })
  async listar(@Param('tenant') tenant: string, @Param('empresa') empresa: string, @KeyActual() apiKey: ApiKey) {
    const destino = await this.autorizar(apiKey, tenant, empresa);
    return this.perfiles.listar(tenant, destino.tangoCompanyId);
  }

  @Get(':id')
  @Header(HEADER_ORIGEN, 'connector')
  @ApiOperation({ summary: 'Un perfil completo: la fila de CPA128 tal cual (qué edita, muestra u oculta, y valores por defecto)' })
  async obtener(
    @Param('tenant') tenant: string,
    @Param('empresa') empresa: string,
    @Param('id', ParseIntPipe) id: number,
    @KeyActual() apiKey: ApiKey,
  ) {
    const destino = await this.autorizar(apiKey, tenant, empresa);
    return this.perfiles.obtener(tenant, destino.tangoCompanyId, id);
  }

  private autorizar(apiKey: ApiKey, tenant: string, empresa: string) {
    return autorizarEndpointWeb(this.tenants, apiKey, tenant, empresa, PROCESO_PERFILES, ENDPOINT_PERFILES);
  }
}
