import { Body, Controller, Header, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HEADER_API_KEY, KeyActual } from '../auth/api-key.guard';
import { HEADER_ORIGEN } from '../comun/errores';
import type { ApiKey } from '../database/entidades';
import { autorizarEndpointWeb } from '../tenants/autorizar-empresa';
import { TenantsService } from '../tenants/tenants.service';
import { PROCESO_PROVEEDORES, ProveedoresService } from './proveedores.service';
import { validarCambios, validarEntradaAlta, validarEntradaAltaExterior } from './validaciones';

/** Permisos de la key: `3142:AltaDeProveedor` y `3142:ActualizarProveedor`. */
export const ENDPOINT_ALTA = 'AltaDeProveedor';
export const ENDPOINT_ACTUALIZAR = 'ActualizarProveedor';

const EJEMPLO_ALTA = { cuit: '30-50279317-5', cbu: '2850123540000987654324', descripcionCbu: 'Cuenta principal', codigoProvincia: '03' };
const EJEMPLO_ALTA_EXTERIOR = { cuitPais: '55-00000212-6', razonSocial: 'Anthropic, PBC', categoriaIva: 'EX' };

/**
 * Alta y actualización de proveedores (ADR 0004). Endpoints propios del connector: parten del
 * CUIT, suman lo de ARCA (por la web de Tango) y escriben por la API pública.
 */
@ApiTags('proveedores')
@ApiHeader({ name: HEADER_API_KEY, required: true })
@Controller('tango/:tenant/:empresa/proveedores')
export class ProveedoresController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly proveedores: ProveedoresService,
  ) {}

  @Post('vista-previa')
  @HttpCode(200)
  @Header(HEADER_ORIGEN, 'connector')
  @ApiOperation({
    summary: 'Arma el alta sin escribir: lo que se mandaría a Tango, los obligatorios que faltan y los avisos',
    description: 'Mismo cuerpo que el alta. Sirve para mostrar los datos de ARCA y pedir lo que falte (p. ej. codigoProvincia) antes de confirmar.',
  })
  @ApiBody({ schema: { example: EJEMPLO_ALTA } })
  async vistaPrevia(@Param('tenant') tenant: string, @Param('empresa') empresa: string, @Body() cuerpo: unknown, @KeyActual() apiKey: ApiKey) {
    const entrada = validarEntradaAlta(cuerpo);
    const destino = await autorizarEndpointWeb(this.tenants, apiKey, tenant, empresa, PROCESO_PROVEEDORES, ENDPOINT_ALTA);
    return this.proveedores.vistaPrevia(tenant, destino, entrada);
  }

  @Post()
  @HttpCode(201)
  @Header(HEADER_ORIGEN, 'connector')
  @ApiOperation({
    summary: 'Da de alta un proveedor a partir del CUIT (datos de ARCA, valores por defecto de Tango y reglas del ADR 0004)',
    description:
      '201 { id, codigo, proveedor, avisos } (proveedor null, con aviso, si no se pudo releer). 400 datos inválidos; 409 CUIT ya cargado; 422 ARCA sin datos o faltan obligatorios (con la lista); 502 Tango rechazó o cambió; 502/504 "No se sabe si Tango guardó" si la escritura se cortó. No reintentar a ciegas: buscar el CUIT antes (un nuevo intento da 409).',
  })
  @ApiBody({ schema: { example: EJEMPLO_ALTA } })
  async alta(@Param('tenant') tenant: string, @Param('empresa') empresa: string, @Body() cuerpo: unknown, @KeyActual() apiKey: ApiKey) {
    const entrada = validarEntradaAlta(cuerpo);
    const destino = await autorizarEndpointWeb(this.tenants, apiKey, tenant, empresa, PROCESO_PROVEEDORES, ENDPOINT_ALTA);
    return this.proveedores.alta(tenant, destino, entrada, apiKey);
  }

  @Post('exterior/vista-previa')
  @HttpCode(200)
  @Header(HEADER_ORIGEN, 'connector')
  @ApiOperation({
    summary: 'Arma el alta de un proveedor del exterior (CUIT país) sin escribir',
    description: 'Mismo cuerpo que el alta del exterior. 409 si ya hay uno con ese CUIT país y esa razón social.',
  })
  @ApiBody({ schema: { example: EJEMPLO_ALTA_EXTERIOR } })
  async vistaPreviaExterior(@Param('tenant') tenant: string, @Param('empresa') empresa: string, @Body() cuerpo: unknown, @KeyActual() apiKey: ApiKey) {
    const entrada = validarEntradaAltaExterior(cuerpo);
    const destino = await autorizarEndpointWeb(this.tenants, apiKey, tenant, empresa, PROCESO_PROVEEDORES, ENDPOINT_ALTA);
    return this.proveedores.vistaPreviaExterior(tenant, destino, entrada);
  }

  @Post('exterior')
  @HttpCode(201)
  @Header(HEADER_ORIGEN, 'connector')
  @ApiOperation({
    summary: 'Da de alta un proveedor del exterior: CUIT país, razón social y el modelo del exterior, sin ARCA',
    description:
      '201 { id, codigo, proveedor, avisos }. Provincia 99 Exterior, RG 3685 X y 019, CITI I y B, "Aplica retenciones" destildado; categoriaIva EX (por defecto) o RI. 400 datos inválidos; 409 ya existe (mismo CUIT país y razón social); 502/504 como el alta.',
  })
  @ApiBody({ schema: { example: EJEMPLO_ALTA_EXTERIOR } })
  async altaExterior(@Param('tenant') tenant: string, @Param('empresa') empresa: string, @Body() cuerpo: unknown, @KeyActual() apiKey: ApiKey) {
    const entrada = validarEntradaAltaExterior(cuerpo);
    const destino = await autorizarEndpointWeb(this.tenants, apiKey, tenant, empresa, PROCESO_PROVEEDORES, ENDPOINT_ALTA);
    return this.proveedores.altaExterior(tenant, destino, entrada, apiKey);
  }

  @Patch(':id')
  @Header(HEADER_ORIGEN, 'connector')
  @ApiOperation({
    summary: 'Cambia el CBU y/o su descripción (null los borra) y los datos fiscales de un proveedor del exterior',
    description:
      'Lee el registro completo y lo manda a Update, que reemplaza todo. operacionAfip, comprobanteAfip y categoriaIva van por su código de Tango (el connector los traduce al ID de la empresa); citiOpera O/E/I, citiTipo B/S/N; aplicaRetenciones solo false; habilitado true/false. Sin cambios reales, no escribe. Responde { id, proveedor, cambios, avisos }.',
  })
  @ApiBody({ schema: { example: { operacionAfip: 'X', comprobanteAfip: '019', citiOpera: 'I', citiTipo: 'B', aplicaRetenciones: false } } })
  async actualizar(
    @Param('tenant') tenant: string,
    @Param('empresa') empresa: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @KeyActual() apiKey: ApiKey,
  ) {
    const cambios = validarCambios(cuerpo);
    const destino = await autorizarEndpointWeb(this.tenants, apiKey, tenant, empresa, PROCESO_PROVEEDORES, ENDPOINT_ACTUALIZAR);
    return this.proveedores.actualizar(tenant, destino, id, cambios, apiKey);
  }
}
