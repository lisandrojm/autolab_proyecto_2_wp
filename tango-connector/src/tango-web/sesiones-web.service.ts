import { HttpStatus, Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ErrorConnector } from '../comun/errores';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { TenantsService } from '../tenants/tenants.service';
import { ErrorSesionWeb, SesionWeb } from './sesion-web';

/** El `fetch` de las sesiones web: el global, salvo en los tests. */
export const FETCH_WEB = Symbol('FETCH_WEB');

/**
 * Cuánto tiempo no se reintenta el login después de que Tango rechazó las credenciales. Sin
 * esto, cada request de una plataforma haría un SignIn fallido: con una contraseña cambiada,
 * eso puede bloquear la cuenta del usuario en Tango.
 */
export const BLOQUEO_CREDENCIALES_MS = 5 * 60_000;

/**
 * Las sesiones web abiertas, una por empresa (`tenant:companyId`), con el usuario web del
 * tenant (ADR 0003). Se abren cuando hacen falta y se cierran al apagar el servicio.
 *
 * Las credenciales se leen al abrir la sesión: después de cambiarlas con
 * `tenant:credenciales-web`, hay que reiniciar el servicio (`pm2 reload`).
 */
@Injectable()
export class SesionesWebService implements OnModuleDestroy {
  private readonly logger = new Logger(SesionesWebService.name);
  /** Promesas y no sesiones: dos requests simultáneos en frío comparten la misma sesión. */
  private readonly sesiones = new Map<string, Promise<SesionWeb>>();
  private readonly bloqueadas = new Map<string, number>();

  constructor(
    private readonly tenants: TenantsService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
    @Inject(FETCH_WEB) private readonly fetchWeb: typeof fetch,
  ) {}

  /** Un request a la web de Tango en nombre de una empresa. Traduce los errores al connector. */
  async pedir<T>(tenant: string, companyId: number, metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> {
    const clave = `${tenant}:${companyId}`;
    const hasta = this.bloqueadas.get(clave);
    if (hasta && hasta > Date.now()) throw this.credencialesRechazadas(tenant, hasta);

    const sesion = await this.sesion(tenant, companyId);
    try {
      return await sesion.pedir<T>(metodo, ruta, cuerpo);
    } catch (error) {
      if (!(error instanceof ErrorSesionWeb)) throw error;
      // El detalle de Tango va al log; a la plataforma, un mensaje sin datos de infraestructura.
      this.logger.error(`${clave} ${ruta}: ${error.message}`);
      if (error.tipo === 'credenciales') {
        this.sesiones.delete(clave);
        const bloqueo = Date.now() + BLOQUEO_CREDENCIALES_MS;
        this.bloqueadas.set(clave, bloqueo);
        throw this.credencialesRechazadas(tenant, bloqueo);
      }
      throw this.traducir(error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const sesiones = await Promise.allSettled(this.sesiones.values());
    await Promise.all(sesiones.map((s) => (s.status === 'fulfilled' ? s.value.cerrar() : undefined)));
    this.sesiones.clear();
  }

  private sesion(tenant: string, companyId: number): Promise<SesionWeb> {
    const clave = `${tenant}:${companyId}`;
    let sesion = this.sesiones.get(clave);
    if (!sesion) {
      sesion = this.crear(tenant, companyId);
      this.sesiones.set(clave, sesion);
      // Si no se pudo crear (p. ej. sin credenciales), no queda en el Map.
      sesion.catch(() => this.sesiones.delete(clave));
    }
    return sesion;
  }

  private async crear(tenant: string, companyId: number): Promise<SesionWeb> {
    const clave = `${tenant}:${companyId}`;
    const credenciales = await this.tenants.credencialesWeb(tenant);
    if (!credenciales) {
      throw new ErrorConnector(HttpStatus.SERVICE_UNAVAILABLE, `El servidor ${tenant} no tiene usuario web configurado`, [
        'Este dato solo existe en la web de Tango y hace falta un usuario técnico (ADR 0003)',
      ]);
    }
    return new SesionWeb({
      ...credenciales,
      companyId,
      timeoutMs: this.config.tango.webTimeoutMs,
      fetch: this.fetchWeb,
      // Al log: con qué terminal y licencia abrió la sesión Tango (sin tokens).
      diagnostico: (evento, datos) => this.logger.log(`Sesión web ${clave} ${evento}: ${JSON.stringify(datos)}`),
    });
  }

  private credencialesRechazadas(tenant: string, hasta: number): ErrorConnector {
    // 503: el SDK no lo reintenta (no es una falla pasajera).
    return new ErrorConnector(HttpStatus.SERVICE_UNAVAILABLE, `Tango rechazó el usuario web del servidor ${tenant}`, [
      'Revisar las credenciales con tenant:credenciales-web y reiniciar el connector',
      `No se reintenta hasta las ${new Date(hasta).toISOString()}`,
    ]);
  }

  private traducir(error: ErrorSesionWeb): ErrorConnector {
    if (error.tipo === 'contrato') {
      return new ErrorConnector(HttpStatus.BAD_GATEWAY, 'La web de Tango cambió: el connector no la entiende', [
        error.message,
        'Correr los tests de contrato (npm run test:contrato) y ajustar el connector',
      ]);
    }
    return new ErrorConnector(HttpStatus.BAD_GATEWAY, 'No se pudo conectar con la web de Tango', [
      'El túnel o el servidor Tango no responden',
    ]);
  }
}
