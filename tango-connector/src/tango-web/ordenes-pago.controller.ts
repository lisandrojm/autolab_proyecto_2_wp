import { Controller, Get, Header, HttpStatus, Param } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HEADER_API_KEY, KeyActual } from '../auth/api-key.guard';
import { ErrorConnector, HEADER_ORIGEN } from '../comun/errores';
import type { ApiKey } from '../database/entidades';
import { autorizarEndpointWeb } from '../tenants/autorizar-empresa';
import { TenantsService } from '../tenants/tenants.service';
import { OrdenesPagoService, PROCESO_FICHA_FACTURA, PROCESO_FICHA_OP } from './ordenes-pago.service';

/** Permisos de la key: `14162:OrdenesDePagoDeFacturaDeCompra`, `14162:ComprobantesRelacionadosDeCompra` y `14184:OrdenDePago`. */
export const ENDPOINT_OP_DE_FACTURA = 'OrdenesDePagoDeFacturaDeCompra';
export const ENDPOINT_RELACIONADOS = 'ComprobantesRelacionadosDeCompra';
export const ENDPOINT_ORDEN_DE_PAGO = 'OrdenDePago';

/** El mayor ID que acepta Tango (int32). */
const MAX_ID = 2_147_483_647;

function idCpa04(valor: string): number {
  const id = Number(valor);
  if (!/^\d+$/.test(valor) || id < 1 || id > MAX_ID) {
    throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'idCpa04 inválido', ['Un ID_CPA04 entero positivo']);
  }
  return id;
}

/**
 * Órdenes de pago de facturas de compra. Las fichas Live 14162 y 14184 no están en la API
 * pública: se leen de la web (ADR 0003, docs/tango/ordenes-de-pago.md). El PDF sí está en la
 * API: `GetPdf` de 14184.
 */
@ApiTags('tango-web')
@ApiHeader({ name: HEADER_API_KEY, required: true })
@Controller('tango/:tenant/:empresa')
export class OrdenesPagoController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly ordenes: OrdenesPagoService,
  ) {}

  @Get('facturas-de-compra/:idCpa04/ordenes-de-pago')
  @Header(HEADER_ORIGEN, 'connector')
  @ApiOperation({
    summary: 'Órdenes de pago que cancelan una factura de compra (ID_CPA04), con lo que cancela cada una',
    description: 'De los comprobantes relacionados de la ficha 14162. [] si no tiene. Las anuladas vienen con `anulada: true` e importeCancelado 0. 404 si no existe o si es una orden de pago.',
  })
  async deFactura(@Param('tenant') tenant: string, @Param('empresa') empresa: string, @Param('idCpa04') id: string, @KeyActual() apiKey: ApiKey) {
    const idFactura = idCpa04(id);
    const destino = await autorizarEndpointWeb(this.tenants, apiKey, tenant, empresa, PROCESO_FICHA_FACTURA, ENDPOINT_OP_DE_FACTURA);
    return this.ordenes.deFactura(tenant, destino, idFactura);
  }

  @Get('facturas-de-compra/:idCpa04/relacionados')
  @Header(HEADER_ORIGEN, 'connector')
  @ApiOperation({
    summary: 'Un comprobante de compra (factura, crédito o débito, ID_CPA04) con su estado, sus vencimientos y sus relacionados: órdenes de pago y comprobantes imputados',
    description: 'De la ficha 14162. Sin importes por relacionado (la ficha no los da); el saldo pendiente sale del Live 17696. 404 si no existe o si es una orden de pago.',
  })
  async relacionados(@Param('tenant') tenant: string, @Param('empresa') empresa: string, @Param('idCpa04') id: string, @KeyActual() apiKey: ApiKey) {
    const idComprobante = idCpa04(id);
    const destino = await autorizarEndpointWeb(this.tenants, apiKey, tenant, empresa, PROCESO_FICHA_FACTURA, ENDPOINT_RELACIONADOS);
    return this.ordenes.relacionados(tenant, destino, idComprobante);
  }

  @Get('ordenes-de-pago/:idCpa04')
  @Header(HEADER_ORIGEN, 'connector')
  @ApiOperation({
    summary: 'Ficha de una orden de pago (ID_CPA04): cabecera, leyendas, valores, imputaciones, retenciones y totales',
    description: 'De la ficha 14184 de la web. `pagadoCon`: las cuentas del haber. CUIT y CBU del proveedor solo con `3142:GetById`. El PDF: GET GetPdf?process=14184&id=…',
  })
  async orden(@Param('tenant') tenant: string, @Param('empresa') empresa: string, @Param('idCpa04') id: string, @KeyActual() apiKey: ApiKey) {
    const idOrden = idCpa04(id);
    const destino = await autorizarEndpointWeb(this.tenants, apiKey, tenant, empresa, PROCESO_FICHA_OP, ENDPOINT_ORDEN_DE_PAGO);
    return this.ordenes.orden(tenant, destino, idOrden, apiKey);
  }
}
