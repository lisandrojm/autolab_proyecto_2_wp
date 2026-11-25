import { readFileSync } from 'fs';
import { parseEnv } from 'util';

/**
 * Configuración del servicio, leída del entorno y validada al arrancar. Si falta algo
 * obligatorio, el servicio no levanta: es mejor fallar al inicio que con el primer request.
 */
export interface Configuracion {
  /** Interfaz donde escucha. Por defecto solo localhost: nginx es la única puerta de entrada. */
  host: string;
  puerto: number;
  produccion: boolean;
  db: { host: string; puerto: number; nombre: string; usuario: string; password: string };
  /** 32 bytes para AES-256-GCM. */
  claveCifrado: Buffer;
  catalogoDir: string;
  /**
   * `timeoutMs`: por request a la API. `webTimeoutMs`: por request a la web (ADR 0003); más
   * corto, porque un request web en frío encadena varios (bundle, SignIn, SelectCompany…).
   */
  tango: { timeoutMs: number; webTimeoutMs: number; concurrencia: number; pageSizeMax: number };
}

function entero(env: Record<string, string | undefined>, nombre: string, defecto: number): number {
  const valor = env[nombre];
  if (valor === undefined || valor === '') return defecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${nombre} tiene que ser un entero positivo`);
  return n;
}

function obligatorio(env: Record<string, string | undefined>, nombre: string): string {
  const valor = env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} en el entorno`);
  return valor;
}

export function leerConfiguracion(env: Record<string, string | undefined> = process.env): Configuracion {
  const claveCifrado = Buffer.from(obligatorio(env, 'CLAVE_CIFRADO'), 'base64');
  if (claveCifrado.length !== 32) throw new Error('CLAVE_CIFRADO tiene que ser de 32 bytes en base64');

  return {
    host: env.HOST || '127.0.0.1',
    puerto: entero(env, 'PORT', 3100),
    produccion: env.NODE_ENV === 'production',
    db: {
      host: env.DB_HOST ?? '127.0.0.1',
      puerto: entero(env, 'DB_PORT', 5432),
      nombre: obligatorio(env, 'DB_NAME'),
      usuario: obligatorio(env, 'DB_USER'),
      password: obligatorio(env, 'DB_PASSWORD'),
    },
    claveCifrado,
    catalogoDir: env.CATALOGO_DIR ?? 'docs/tango/catalogo/2026-10-08',
    tango: {
      timeoutMs: entero(env, 'TANGO_TIMEOUT_MS', 120_000),
      webTimeoutMs: entero(env, 'TANGO_WEB_TIMEOUT_MS', 20_000),
      concurrencia: entero(env, 'TANGO_CONCURRENCIA', 4),
      pageSizeMax: entero(env, 'TANGO_PAGE_SIZE_MAX', 1000),
    },
  };
}

/** Carga `.env` de la raíz si existe. Sin `.env` se usa el entorno tal cual. */
export function cargarEnv(): void {
  let texto: string;
  try {
    texto = readFileSync('.env', 'utf8');
  } catch {
    // No hay .env: en producción las variables vienen del entorno (PM2).
    return;
  }
  // Se copian a mano (no con process.loadEnvFile): Jest les da a los tests una copia de
  // process.env que loadEnvFile no actualiza. Como loadEnvFile, no pisa lo que ya está definido.
  for (const [clave, valor] of Object.entries(parseEnv(texto))) {
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
}

/** Token de inyección de la configuración. */
export const CONFIGURACION = Symbol('CONFIGURACION');
