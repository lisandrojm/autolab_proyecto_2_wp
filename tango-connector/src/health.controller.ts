import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Publico } from './auth/api-key.guard';
import { CatalogoService } from './catalogo/catalogo.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DataSource,
    private readonly catalogo: CatalogoService,
  ) {}

  @Get()
  @Publico()
  async health() {
    let db = 'ok';
    try {
      await this.db.query('SELECT 1');
    } catch {
      db = 'error';
    }
    return {
      estado: db === 'ok' ? 'ok' : 'degradado',
      db,
      catalogo: { fecha: this.catalogo.fechaRelevamiento, procesos: this.catalogo.listar().length },
    };
  }
}
