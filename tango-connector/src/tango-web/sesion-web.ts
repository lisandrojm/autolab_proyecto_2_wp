/**
 * Sesión en la **web** de Tango, para los datos que la API pública no expone (ADR 0003).
 * Reproduce lo que hace la app Angular de Tango (bundle `main-*.js`, 25.01.000.4263):
 *
 *   1. `POST /Authentication/SignIn` { username, password, loginType: 0 }   → userHash
 *   2. `POST /Authentication/SelectCompany` { userHash, companyID }         → clientDescriptor
 *   3. Cada request: `Authorization: <clientDescriptor>`, `User: 0`,
 *      `ApplicationAuthorization: <constante del bundle>` y las cookies.
 *
 * Una sesión vencida responde `{ "invalidSession": true }`: se inicia sesión de nuevo una vez.
 * Son endpoints internos de Tango: si cambian, los tests de contrato lo detectan
 * (`npm run test:contrato`).
 */

/** Un problema con la sesión web: credenciales, login, o una respuesta que cambió de forma. */
export class ErrorSesionWeb extends Error {
  constructor(
    mensaje: string,
    /** `credenciales`: login rechazado. `contrato`: Tango cambió la forma. `red`: sin respuesta. */
    readonly tipo: 'credenciales' | 'contrato' | 'red',
  ) {
    super(mensaje);
    this.name = 'ErrorSesionWeb';
  }
}

export interface ConfigSesionWeb {
  urlBase: string;
  usuario: string;
  password: string;
  /** Empresa de Tango: la sesión queda atada a ella. */
  companyId: number;
  timeoutMs: number;
  fetch?: typeof fetch;
  /**
   * Recibe lo que Tango responde al login y al elegir empresa: solo terminal, licencias,
   * empresa y mensaje (lista blanca, nunca tokens). Para logs y diagnóstico.
   */
  diagnostico?: (evento: 'login' | 'empresa', datos: Record<string, unknown>) => void;
}

/**
 * Lo único que sale del cliente hacia el diagnóstico: lista blanca, para que un campo
 * sensible nuevo de Tango no se filtre a los logs.
 */
const CAMPOS_DIAGNOSTICO = ['succeeded', 'message', 'terminal', 'isNetworkUser', 'companyId', 'companyEnabled', 'hasLicenseError', 'hasExceededTerminals', 'userHasActiveTerminal'];

function paraDiagnostico(datos: Record<string, unknown>): Record<string, unknown> {
  const visibles = Object.fromEntries(CAMPOS_DIAGNOSTICO.filter((k) => k in datos).map((k) => [k, datos[k]]));
  return Array.isArray(datos.companies) ? { ...visibles, companies: datos.companies.length } : visibles;
}

/**
 * La constante `ApplicationAuthorization` del bundle de la web. El nombre de la clase cambia
 * con cada build (`EX` en 25.01.000.4263), así que se ubica por su uso en el interceptor.
 */
export function extraerAppAuthorization(js: string): string | null {
  // El bundle la usa como `ApplicationAuthorization:EX.get()` y como `a.ApplicationAuthorization=EX.get()`.
  const uso = /ApplicationAuthorization\s*[:=]\s*([A-Za-z_$][\w$]*)\.get\(\)/.exec(js);
  if (!uso) return null;
  const nombre = uso[1].replace(/\$/g, '\\$');
  const definicion = new RegExp(`${nombre}=class\\{static get\\(\\)\\{return"([^"]+)"\\}\\}`).exec(js);
  return definicion?.[1] ?? null;
}

/**
 * Si una respuesta indica que la sesión no existe o venció. Tango lo dice de dos formas
 * (relevado contra la web real, ver test/contrato):
 * - `{ invalidSession: true }`, la que mira el interceptor de la app web;
 * - `{ succeeded: false }` con "Object reference not set to an instance of an object.": es
 *   lo que responde `processresolver` con un clientDescriptor que ya no existe (tras SignOut,
 *   o inventado). Es una NullReference del servidor al no encontrar la sesión.
 */
export function esSesionVencida(status: number, cuerpo: unknown): boolean {
  const c = cuerpo as RespuestaTango | undefined;
  if (status === 401 || c?.invalidSession === true || c?.invalidSession === 'true') return true;
  return c?.succeeded === false && (c.exceptionInfo?.messages ?? []).some((m) => /Object reference not set to an instance of an object/i.test(m));
}

/** La ruta del bundle principal (`/main-XXXX.js`) en el HTML de la web. */
export function rutaBundle(html: string): string | null {
  const m = /<script[^>]*\ssrc="\/?(main-[\w-]+\.js)"/.exec(html);
  return m ? `/${m[1]}` : null;
}

interface RespuestaTango {
  succeeded?: boolean;
  message?: string | null;
  invalidSession?: boolean | string;
  exceptionInfo?: { messages?: string[] } | null;
}

function detalle(r: RespuestaTango): string {
  return r.exceptionInfo?.messages?.filter(Boolean).join(' | ') || r.message || 'sin detalle';
}

export class SesionWeb {
  private readonly fetch: typeof fetch;
  private cookies = new Map<string, string>();
  private appAuthorization: string | null = null;
  private clientDescriptor: string | null = null;
  private iniciando: Promise<void> | null = null;

  constructor(private readonly config: ConfigSesionWeb) {
    this.fetch = config.fetch ?? globalThis.fetch;
  }

  get activa(): boolean {
    return this.clientDescriptor !== null;
  }

  /** Un request a la web con la sesión. Si la sesión venció, la renueva una vez. */
  async pedir<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> {
    await this.asegurarSesion();
    const usada = this.clientDescriptor;
    let r = await this.http(metodo, ruta, cuerpo);
    if (this.vencida(r)) {
      // Solo la descarta quien todavía la ve: si otro request ya la renovó, se usa la nueva.
      if (usada && this.clientDescriptor === usada) await this.descartar(usada);
      await this.asegurarSesion();
      r = await this.http(metodo, ruta, cuerpo);
      // El mensaje de sesión vencida es genérico (NullReference): si sigue después de renovar,
      // no era la sesión sino otra falla de Tango.
      if (this.vencida(r)) {
        throw new ErrorSesionWeb(`Tango sigue fallando con una sesión nueva en ${ruta}: ${detalle(r.cuerpo as RespuestaTango)}`, 'contrato');
      }
    }
    if (r.status >= 400) throw new ErrorSesionWeb(`Tango respondió HTTP ${r.status} en ${ruta}`, 'contrato');
    return r.cuerpo as T;
  }

  /**
   * Un request con la sesión actual, **sin** renovarla si venció. Para diagnóstico: saber si
   * la sesión sigue viva sin que el reintento automático lo tape.
   */
  async pedirSinRenovar(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<{ vencida: boolean; status: number; cuerpo: unknown }> {
    await this.asegurarSesion();
    const r = await this.http(metodo, ruta, cuerpo);
    return { vencida: this.vencida(r), ...r };
  }

  /** Cierra la sesión en Tango (libera la terminal). No falla si ya no estaba abierta. */
  async cerrar(): Promise<void> {
    // Si hay un login en curso, se espera: si no, la sesión se abriría después del SignOut.
    if (this.iniciando) await this.iniciando.catch(() => undefined);
    if (!this.clientDescriptor) return;
    await this.descartar(this.clientDescriptor);
    this.cookies.clear();
  }

  /**
   * SignOut de una sesión que se deja de usar (best effort): así no quedan sesiones abiertas
   * en Tango al renovar ni cuando el login queda a medias. Si Tango ya la había cerrado, no pasa nada.
   */
  private async descartar(clientDescriptor: string | null, extra: Record<string, string> = {}): Promise<void> {
    if (this.clientDescriptor === clientDescriptor) this.clientDescriptor = null;
    try {
      await this.http('POST', '/Authentication/SignOut', null, clientDescriptor ? { ...extra, Authorization: clientDescriptor } : extra);
    } catch {
      // Best effort: si Tango no responde, la sesión vence sola.
    }
  }

  private asegurarSesion(): Promise<void> {
    if (this.clientDescriptor) return Promise.resolve();
    // Dos requests simultáneos comparten el mismo inicio de sesión.
    this.iniciando ??= this.iniciar().finally(() => {
      this.iniciando = null;
    });
    return this.iniciando;
  }

  private async iniciar(): Promise<void> {
    this.cookies.clear();
    this.appAuthorization ??= await this.leerAppAuthorization();

    const login = await this.http('POST', '/Authentication/SignIn', {
      username: this.config.usuario,
      password: this.config.password,
      loginType: 0,
    }, { User: '0' });
    const datos = login.cuerpo as RespuestaTango & { userHash?: number; userName?: string };
    if (datos && typeof datos === 'object') this.config.diagnostico?.('login', paraDiagnostico(datos as Record<string, unknown>));
    if (login.status >= 400 || !datos?.succeeded || !datos.userHash) {
      // Puede ser la constante vieja (Tango se actualizó): la próxima vez se vuelve a leer.
      this.appAuthorization = null;
      throw new ErrorSesionWeb(`Tango rechazó el login del usuario web: ${datos ? detalle(datos) : `HTTP ${login.status}`}`, 'credenciales');
    }

    const userHash = String(datos.userHash);
    const empresa = await this.http(
      'POST',
      '/Authentication/SelectCompany',
      { userHash: datos.userHash, companyID: this.config.companyId },
      { User: userHash, userHash, userName: datos.userName ?? this.config.usuario },
    );
    const sel = empresa.cuerpo as RespuestaTango & { clientDescriptor?: string; hasLicenseError?: boolean };
    if (sel && typeof sel === 'object') this.config.diagnostico?.('empresa', paraDiagnostico(sel as Record<string, unknown>));
    if (empresa.status >= 400 || !sel?.succeeded || !sel.clientDescriptor) {
      // El SignIn quedó hecho: se cierra para no dejar la sesión abierta en Tango.
      await this.descartar(null, { User: userHash, userHash });
      throw new ErrorSesionWeb(
        `Tango no abrió la empresa ${this.config.companyId}: ${sel ? detalle(sel) : `HTTP ${empresa.status}`}`,
        'credenciales',
      );
    }
    if (sel.hasLicenseError) {
      // Con licencias agotadas es cuando más importa no dejar sesiones abiertas.
      await this.descartar(sel.clientDescriptor);
      throw new ErrorSesionWeb(`Tango no tiene licencia disponible para el usuario web: ${detalle(sel)}`, 'credenciales');
    }
    this.clientDescriptor = sel.clientDescriptor;
  }

  private async leerAppAuthorization(): Promise<string> {
    const html = await this.texto('/');
    const ruta = rutaBundle(html);
    if (!ruta) throw new ErrorSesionWeb('No se encontró el bundle main-*.js en la web de Tango', 'contrato');
    const valor = extraerAppAuthorization(await this.texto(ruta));
    if (!valor) throw new ErrorSesionWeb(`El bundle ${ruta} ya no tiene la constante ApplicationAuthorization`, 'contrato');
    return valor;
  }

  private vencida(r: { status: number; cuerpo: unknown }): boolean {
    return esSesionVencida(r.status, r.cuerpo);
  }

  private async texto(ruta: string): Promise<string> {
    try {
      const r = await this.fetch(this.config.urlBase + ruta, { signal: AbortSignal.timeout(this.config.timeoutMs) });
      if (!r.ok) throw new ErrorSesionWeb(`Tango respondió HTTP ${r.status} en ${ruta}`, 'contrato');
      return await r.text();
    } catch (error) {
      if (error instanceof ErrorSesionWeb) throw error;
      throw new ErrorSesionWeb(`No se pudo conectar con la web de Tango (${ruta})`, 'red');
    }
  }

  private async http(
    metodo: 'GET' | 'POST',
    ruta: string,
    cuerpo: unknown,
    extra: Record<string, string> = {},
  ): Promise<{ status: number; cuerpo: unknown }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      User: '0',
      ApplicationAuthorization: this.appAuthorization ?? '',
      ...extra,
    };
    if (this.clientDescriptor && !extra.Authorization) headers.Authorization = this.clientDescriptor;
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');

    let r: Response;
    let texto: string;
    try {
      r = await this.fetch(this.config.urlBase + ruta, {
        method: metodo,
        headers,
        body: metodo === 'POST' && cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      // El body se lee dentro del mismo timeout: un corte a mitad también es un error de red.
      texto = await r.text();
    } catch {
      throw new ErrorSesionWeb(`No se pudo conectar con la web de Tango (${ruta})`, 'red');
    }
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [par] = c.split(';');
      const i = par.indexOf('=');
      if (i > 0) this.cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
    let json: unknown;
    try {
      json = texto ? JSON.parse(texto) : undefined;
    } catch {
      json = undefined;
    }
    return { status: r.status, cuerpo: json };
  }
}
