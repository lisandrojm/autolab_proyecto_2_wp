import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/** Header que dice de dónde salió la respuesta: `tango` o `connector` (ADR 0002). */
export const HEADER_ORIGEN = 'X-Connector-Origin';

/** Body de error con la misma forma que los errores de Tango. */
export interface CuerpoError {
  succeeded: false;
  message: string;
  exceptionInfo: { title: string; messages: string[] };
}

/** Un rechazo del connector: auth, permisos, validación o resguardos. */
export class ErrorConnector extends HttpException {
  constructor(status: HttpStatus, titulo: string, mensajes: string[] = []) {
    const cuerpo: CuerpoError = {
      succeeded: false,
      message: titulo,
      // El título va primero: quien lea solo `messages` (como el SDK) no pierde el motivo.
      exceptionInfo: { title: titulo, messages: [...new Set([titulo, ...mensajes])] },
    };
    super(cuerpo, status);
  }
}

/**
 * Todo error que sale del connector tiene la forma de Tango y el header de origen. Las
 * respuestas de Tango (incluidos sus errores) no pasan por acá: el proxy las devuelve tal
 * cual.
 */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger(FiltroErrores.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.setHeader(HEADER_ORIGEN, 'connector');

    if (error instanceof ErrorConnector) {
      res.status(error.getStatus()).json(error.getResponse());
      return;
    }
    if (error instanceof HttpException) {
      // Errores propios de Nest (404 de ruta, JSON inválido, …): se pasan a la forma de Tango.
      const r = error.getResponse();
      const mensaje =
        typeof r === 'string' ? r : String((r as { message?: unknown }).message ?? error.message);
      res.status(error.getStatus()).json(new ErrorConnector(error.getStatus(), mensaje).getResponse());
      return;
    }

    this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(new ErrorConnector(HttpStatus.INTERNAL_SERVER_ERROR, 'Error interno del connector').getResponse());
  }
}
