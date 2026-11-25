import { All, Controller, Inject, Param, Req, Res } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { HEADER_API_KEY, KeyActual } from '../auth/api-key.guard';
import { CatalogoService } from '../catalogo/catalogo.service';
import { HEADER_ORIGEN } from '../comun/errores';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { ApiKey } from '../database/entidades';
import { autorizarEmpresa } from '../tenants/autorizar-empresa';
import { TenantsService } from '../tenants/tenants.service';
import { TangoClient } from './tango.client';
import { validarRequest } from './validaciones';

/**
 * La API de Tango, idéntica (ADR 0002). Igual que el proxy de lumba-tango
 * (`tango/:tenantSlug/:companySlug/*path`): mismo endpoint, misma query, y la respuesta de
 * Tango sin cambios. Cambian la URL y la autenticación.
 */
@ApiTags('tango')
@ApiHeader({ name: HEADER_API_KEY, required: true })
@Controller('tango/:tenant/:empresa')
export class TangoController {
  constructor(
    private readonly catalogo: CatalogoService,
    private readonly tenants: TenantsService,
    private readonly tango: TangoClient,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  @All(':endpoint')
  @ApiOperation({
    summary: 'Reenvía a /Api/<endpoint> de Tango',
    description:
      'Mismos parámetros que la API de Tango (process, pageSize, pageIndex, view, id, filtroSql, fromDate, toDate, customQuery). En esta etapa, solo lecturas.',
  })
  async reenviar(
    @Param('tenant') tenant: string,
    @Param('empresa') empresa: string,
    @Param('endpoint') endpoint: string,
    @KeyActual() apiKey: ApiKey,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const validado = validarRequest(
      { metodo: req.method, endpoint, query: req.query as Record<string, unknown> },
      { catalogo: this.catalogo, permisos: apiKey.permisos, pageSizeMax: this.config.tango.pageSizeMax },
    );

    // `empresa` es el slug o el Company ID.
    const destino = await autorizarEmpresa(this.tenants, apiKey, tenant, empresa);

    // La query va tal cual llegó: mismo orden, misma codificación (API idéntica).
    const i = req.originalUrl.indexOf('?');
    const queryString = i >= 0 ? req.originalUrl.slice(i + 1) : '';
    const r = await this.tango.enviar(destino, req.method, validado.endpoint.nombre, queryString);

    res.status(r.status).setHeader(HEADER_ORIGEN, 'tango');
    if (r.contentType) res.setHeader('Content-Type', r.contentType);
    res.send(r.cuerpo);
  }
}
