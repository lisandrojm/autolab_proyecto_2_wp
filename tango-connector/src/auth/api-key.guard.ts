import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorConnector } from '../comun/errores';
import type { ApiKey } from '../database/entidades';
import { ApiKeysService } from './api-keys.service';

export const HEADER_API_KEY = 'x-api-key';

const PUBLICO = 'publico';
/** Ruta sin API key (health). */
export const Publico = () => SetMetadata(PUBLICO, true);

type RequestConKey = Request & { apiKey?: ApiKey };

/** La key que autenticó el request. */
export const KeyActual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ApiKey => ctx.switchToHttp().getRequest<RequestConKey>().apiKey!,
);

/** Exige `X-Api-Key` en todas las rutas, salvo las marcadas con `@Publico()`. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeysService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest<RequestConKey>();
    const texto = req.header(HEADER_API_KEY);
    if (!texto) throw new ErrorConnector(HttpStatus.UNAUTHORIZED, 'Falta el header X-Api-Key');

    const apiKey = await this.apiKeys.validar(texto);
    if (!apiKey) throw new ErrorConnector(HttpStatus.UNAUTHORIZED, 'API key inválida o inactiva');
    req.apiKey = apiKey;
    return true;
  }
}
