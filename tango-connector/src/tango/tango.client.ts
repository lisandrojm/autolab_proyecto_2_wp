import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { ErrorConnector } from '../comun/errores';
import type { DestinoTango } from '../tenants/tenants.service';

export interface RespuestaTango {
  status: number;
  contentType: string | null;
  cuerpo: Buffer;
}

/** Semáforo simple: limita cuántos requests hay en curso contra un mismo servidor Tango. */
class Semaforo {
  private enCurso = 0;
  private readonly cola: (() => void)[] = [];

  constructor(private readonly maximo: number) {}

  async usar<T>(tarea: () => Promise<T>): Promise<T> {
    if (this.enCurso >= this.maximo) await new Promise<void>((r) => this.cola.push(r));
    this.enCurso++;
    try {
      return await tarea();
    } finally {
      this.enCurso--;
      this.cola.shift()?.();
    }
  }
}

/**
 * Habla con la API pública de Tango. Toma el núcleo del proxy de lumba-tango
 * (`server/src/modules/tango/tango.service.ts`: `executeRequest`): mismos headers
 * `ApiAuthorization` y `Company`, misma URL `/Api/<endpoint>?<query>`. La diferencia es que
 * la respuesta vuelve en bytes, sin parsear, para devolverla idéntica.
 */
@Injectable()
export class TangoClient {
  private readonly logger = new Logger(TangoClient.name);
  private readonly semaforos = new Map<string, Semaforo>();

  constructor(@Inject(CONFIGURACION) private readonly config: Configuracion) {}

  /** `cuerpo`: solo para las escrituras (ADR 0004); se manda como JSON. */
  async enviar(destino: DestinoTango, metodo: string, endpoint: string, queryString: string, cuerpo?: unknown): Promise<RespuestaTango> {
    const url = `${destino.urlBase}/Api/${endpoint}${queryString ? `?${queryString}` : ''}`;
    return this.semaforo(destino.urlBase).usar(async () => {
      const inicio = Date.now();
      try {
        const headers: Record<string, string> = { ApiAuthorization: destino.token, Company: String(destino.tangoCompanyId) };
        if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
        const r = await fetch(url, {
          method: metodo,
          headers,
          body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(this.config.tango.timeoutMs),
        });
        const respuesta = Buffer.from(await r.arrayBuffer());
        this.logger.log(`${metodo} ${endpoint} empresa=${destino.tangoCompanyId} → ${r.status} ${Date.now() - inicio}ms`);
        return { status: r.status, contentType: r.headers.get('content-type'), cuerpo: respuesta };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          throw new ErrorConnector(HttpStatus.GATEWAY_TIMEOUT, 'Tango no respondió a tiempo', [
            `Límite: ${this.config.tango.timeoutMs / 1000} s`,
          ]);
        }
        this.logger.error(`${metodo} ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
        throw new ErrorConnector(HttpStatus.BAD_GATEWAY, 'No se pudo conectar con Tango', [
          'El túnel o el servidor Tango no responden',
        ]);
      }
    });
  }

  private semaforo(urlBase: string): Semaforo {
    let s = this.semaforos.get(urlBase);
    if (!s) {
      s = new Semaforo(this.config.tango.concurrencia);
      this.semaforos.set(urlBase, s);
    }
    return s;
  }
}
