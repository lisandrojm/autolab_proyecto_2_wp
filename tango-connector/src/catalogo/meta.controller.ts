import { Controller, Get, HttpStatus, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HEADER_API_KEY, KeyActual } from '../auth/api-key.guard';
import { ENDPOINTS_LECTURA, endpointsPermitidos } from '../auth/permisos';
import { ErrorConnector } from '../comun/errores';
import type { ApiKey } from '../database/entidades';
import { CatalogoService, type Proceso } from './catalogo.service';

/** Endpoints del proceso con lo que la key puede hacer en cada uno. */
function conPermisos(proceso: Proceso, apiKey: ApiKey) {
  const permitidos = endpointsPermitidos(apiKey.permisos, proceso.id);
  return proceso.endpoints.map((e) => ({
    ...e,
    habilitado: ENDPOINTS_LECTURA.has(e.nombre.toLowerCase()),
    permitido: permitidos.has(e.nombre.toLowerCase()),
  }));
}

/**
 * Metadatos para el desarrollador (ADR 0002): qué procesos hay, cómo se llaman sus
 * endpoints, qué columnas devuelven. Salen del catálogo relevado.
 */
@ApiTags('meta')
@ApiHeader({ name: HEADER_API_KEY, required: true })
@Controller('meta')
export class MetaController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get('yo')
  @ApiOperation({ summary: 'La API key: plataforma y permisos' })
  yo(@KeyActual() apiKey: ApiKey) {
    return {
      plataforma: apiKey.plataforma,
      prefijo: apiKey.prefijo,
      permisos: apiKey.permisos,
      catalogo: this.catalogo.fechaRelevamiento,
    };
  }

  @Get('procesos')
  @ApiOperation({ summary: 'Procesos que la key puede usar' })
  @ApiQuery({ name: 'tipo', required: false, enum: ['CRUD', 'LIVE', 'EXEC', 'PDF'] })
  @ApiQuery({ name: 'modulo', required: false })
  @ApiQuery({ name: 'buscar', required: false, description: 'Texto en la descripción o la ruta del menú' })
  procesos(
    @KeyActual() apiKey: ApiKey,
    @Query('tipo') tipo?: string,
    @Query('modulo') modulo?: string,
    @Query('buscar') buscar?: string,
  ) {
    const b = buscar?.toLowerCase();
    return this.catalogo
      .listar()
      .filter((p) => !tipo || p.tipo === tipo.toUpperCase())
      .filter((p) => !modulo || p.modulo.toLowerCase() === modulo.toLowerCase())
      .filter((p) => !b || `${p.descripcion} ${p.path}`.toLowerCase().includes(b))
      .map((p) => ({
        id: p.id,
        descripcion: p.descripcion,
        modulo: p.modulo,
        path: p.path,
        tipo: p.tipo,
        // Solo lo que la key puede usar y el connector tiene habilitado.
        endpoints: conPermisos(p, apiKey)
          .filter((e) => e.permitido && e.habilitado)
          .map((e) => e.nombre),
      }))
      .filter((p) => p.endpoints.length > 0);
  }

  @Get('procesos/:id')
  @ApiOperation({ summary: 'Detalle de un proceso: endpoints, parámetros, schemas y columnas' })
  proceso(@KeyActual() apiKey: ApiKey, @Param('id', ParseIntPipe) id: number) {
    const p = this.catalogo.obtener(id);
    if (!p) throw new ErrorConnector(HttpStatus.NOT_FOUND, `El proceso ${id} no tiene API`);
    return { ...p, endpoints: conPermisos(p, apiKey), catalogo: this.catalogo.fechaRelevamiento };
  }

  @Get('campos')
  @ApiOperation({ summary: 'En qué procesos y tablas está un campo' })
  @ApiQuery({ name: 'buscar', required: true, description: 'Parte del nombre del campo, p. ej. cuit' })
  campos(@KeyActual() apiKey: ApiKey, @Query('buscar') buscar?: string) {
    if (!buscar || buscar.trim().length < 2) {
      throw new ErrorConnector(HttpStatus.BAD_REQUEST, 'buscar: al menos 2 caracteres');
    }
    return this.catalogo
      .buscarCampos(buscar.trim())
      .filter((c) => endpointsPermitidos(apiKey.permisos, c.proceso).size > 0);
  }
}
