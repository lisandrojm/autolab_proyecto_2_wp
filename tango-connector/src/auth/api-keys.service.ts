import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Repository } from 'typeorm';
import { ApiKey, type Permisos } from '../database/entidades';

/** Formato de la key: `tc_<prefijo>_<secreto>`. */
const FORMATO = /^tc_([0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;

function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

@Injectable()
export class ApiKeysService {
  constructor(@InjectRepository(ApiKey) private readonly repo: Repository<ApiKey>) {}

  /** Crea una key. La key completa se devuelve **una sola vez**: solo se guarda su hash. */
  async crear(plataforma: string, permisos: Permisos): Promise<{ key: string; apiKey: ApiKey }> {
    const prefijo = randomBytes(6).toString('hex');
    const key = `tc_${prefijo}_${randomBytes(32).toString('base64url')}`;
    const apiKey = await this.repo.save(this.repo.create({ plataforma, prefijo, hash: sha256(key), permisos }));
    return { key, apiKey };
  }

  /** La key activa que corresponde al texto, o `null`. */
  async validar(texto: string): Promise<ApiKey | null> {
    const m = FORMATO.exec(texto);
    if (!m) return null;
    const apiKey = await this.repo.findOneBy({ prefijo: m[1], activa: true });
    if (!apiKey) return null;
    const esperado = Buffer.from(apiKey.hash, 'hex');
    const recibido = Buffer.from(sha256(texto), 'hex');
    if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return null;

    // El último uso es informativo: si falla, no corta el request.
    void this.repo.update(apiKey.id, { ultimoUso: new Date() }).catch(() => undefined);
    return apiKey;
  }

  listar(): Promise<ApiKey[]> {
    return this.repo.find({ order: { creada: 'ASC' } });
  }

  /** Reemplaza los permisos de una key. La key en sí no cambia. */
  async cambiarPermisos(prefijo: string, permisos: Permisos): Promise<ApiKey | null> {
    const apiKey = await this.repo.findOneBy({ prefijo });
    if (!apiKey) return null;
    apiKey.permisos = permisos;
    return this.repo.save(apiKey);
  }

  async desactivar(prefijo: string): Promise<boolean> {
    const r = await this.repo.update({ prefijo }, { activa: false });
    return (r.affected ?? 0) > 0;
  }
}
