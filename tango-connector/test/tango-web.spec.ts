import type { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as http from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { ApiKeyGuard } from '../src/auth/api-key.guard';
import { ApiKeysService } from '../src/auth/api-keys.service';
import { FiltroErrores } from '../src/comun/errores';
import { CONFIGURACION, type Configuracion } from '../src/config/configuracion';
import type { ApiKey } from '../src/database/entidades';
import { ErrorConnector } from '../src/comun/errores';
import { CentrosCostoCompraController } from '../src/tango-web/centros-costo-compra.controller';
import { CentrosCostoCompraService, MAX_COMPROBANTES, cuerpoAuxiliares, parsearIds, parsearTodos } from '../src/tango-web/centros-costo-compra.service';
import { PerfilesCompraController } from '../src/tango-web/perfiles-compra.controller';
import { PerfilesCompraService, separarEtiqueta } from '../src/tango-web/perfiles-compra.service';
import { ErrorSesionWeb, SesionWeb, esSesionVencida, extraerAppAuthorization, rutaBundle } from '../src/tango-web/sesion-web';
import { FETCH_WEB, SesionesWebService } from '../src/tango-web/sesiones-web.service';
import { TenantsService } from '../src/tenants/tenants.service';

// ---------------------------------------------------------------------------------------
// Web de Tango simulada. Reproduce lo relevado (ADR 0003): bundle con la constante, SignIn,
// SelectCompany, cookies, sesión atada a la empresa, invalidSession, getprofiles y
// formdefinition. Los perfiles son de ejemplo, con algunos de los 118 campos de CPA128.
// ---------------------------------------------------------------------------------------

const APP_AUTH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const PERFILES: Record<number, Record<string, unknown>> = {
  3: { ID_CPA128: 3, COD_PERFIL: '001', DESCRIPCIO: 'FACTURA CONTADO', D_CONDICIO: 1, COMP_CONCE: 'E', DEPOSITO: '01', ALTAPROVEE: true },
  4: { ID_CPA128: 4, COD_PERFIL: '002', DESCRIPCIO: 'FACTURA CUENTA CORRIENTE', D_CONDICIO: 2, COMP_CONCE: 'E', DEPOSITO: '01', ALTAPROVEE: true },
};

/** Imputaciones de ejemplo de -14024 (comprobante × cuenta × auxiliar). */
const fila = (id: number, cuenta: string, tipo: string, idAux: number, aux: string, porc: number, debe: number) => ({
  iD_CPA04: id, iD_CUENTA: 22, coD_CUENTA: cuenta, iD_TIPO_AUXILIAR: tipo.startsWith('CC') ? 1 : 2, tipO_AUXILIAR: tipo,
  iD_AUXILIAR: idAux, auxiliar: aux, porC_DE_APROPIACION: porc, debE_CTE: debe, habeR_CTE: 0,
});
const IMPUTACIONES: Record<number, ReturnType<typeof fila>[]> = {
  61386: [fila(61386, '5010050101', 'CC - CENTROS DE COSTO', 747, '99HUI - 99 - Huidobro', 100, 40949.23), fila(61386, '5010050101', 'PR - PROYECTOS', 12, 'P01 - Proyecto uno', 100, 40949.23)],
  61433: [fila(61433, '5010050101', 'CC - CENTROS DE COSTO', 703, '703 - AREA FULL', 60, 600), fila(61433, '5010050101', 'CC - CENTROS DE COSTO', 747, '99HUI - 99 - Huidobro', 40, 400)],
  // Un comprobante con muchas filas, para probar la paginación (500 por página).
  70000: Array.from({ length: 501 }, (_, i) => fila(70000, `C${i}`, 'CC - CENTROS DE COSTO', 1, '01 - Uno', 100, 1)),
};

const web = {
  logins: 0,
  signouts: 0,
  /** Fallas simuladas de -14024 (review). */
  modo14024: '' as '' | 'totalNulo' | 'repetirPagina' | 'ignorarFiltro' | 'sinTipo' | 'error' | 'sinLista' | 'sinGuion',
  /** Simula licencias agotadas: SelectCompany responde hasLicenseError con un descriptor válido. */
  licenciaAgotada: false,
  ultimoLogin: {} as Record<string, unknown>,
  /** clientDescriptor → companyId de las sesiones válidas. */
  sesiones: new Map<string, number>(),
  cookies: new Map<string, string>(),
  /** Cambios para simular fallas: */
  passwordValida: 'secreta',
  bundleSinConstante: false,
  getprofilesSinProfiles: false,
  formdefinitionSinPerfil: false,
  vencerProximo: false,
  /** Cómo avisa la sesión vencida: como processresolver real (NullReference) o con invalidSession. */
  formaVencida: 'nullref' as 'nullref' | 'invalidSession',
  reset() {
    Object.assign(this, { modo14024: '', logins: 0, signouts: 0, licenciaAgotada: false, ultimoLogin: {}, bundleSinConstante: false, getprofilesSinProfiles: false, formdefinitionSinPerfil: false, vencerProximo: false, formaVencida: 'nullref' });
    this.sesiones.clear();
    this.cookies.clear();
  },
};

function leerCuerpo(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((r) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => r(d ? (JSON.parse(d) as Record<string, unknown>) : {}));
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const json = (cuerpo: unknown, extra: Record<string, string> = {}) => {
    res.writeHead(200, { 'Content-Type': 'application/json', ...extra });
    res.end(JSON.stringify(cuerpo));
  };
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<html><script src="/home/settings"></script><script src="main-AB12CD.js" type="module"></script></html>');
  }
  if (url.pathname === '/main-AB12CD.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    const constante = web.bundleSinConstante ? '' : `var QZ=class{static get(){return"${APP_AUTH}"}};`;
    return res.end(`${constante}var x=1;intercept(t){a.ApplicationAuthorization=QZ.get();}`);
  }
  // Todo lo demás exige la constante.
  if (req.headers.applicationauthorization !== APP_AUTH) return json({ succeeded: false, message: 'app' });

  if (url.pathname === '/Authentication/SignIn') {
    const b = await leerCuerpo(req);
    web.logins++;
    web.ultimoLogin = b;
    if (b.username !== 'tecnico' || b.password !== web.passwordValida || b.loginType !== 0) {
      return json({ succeeded: false, message: 'Usuario o contraseña incorrectos' });
    }
    const cookie = `c${web.logins}`;
    web.cookies.set(cookie, 'ok');
    return json({ succeeded: true, userHash: 9000 + web.logins, userName: 'TECNICO', companies: [] }, { 'Set-Cookie': `sesion=${cookie}; Path=/; HttpOnly` });
  }
  if (url.pathname === '/Authentication/SelectCompany') {
    const b = await leerCuerpo(req);
    const cookie = /sesion=(\w+)/.exec(String(req.headers.cookie))?.[1];
    if (!cookie || !web.cookies.has(cookie) || req.headers.userhash !== String(b.userHash) || req.headers.user !== String(b.userHash)) {
      return json({ succeeded: false, message: 'sin login' });
    }
    if (b.companyID === 66) return json({ succeeded: false, message: 'Empresa sin acceso para el usuario' });
    const cd = `041321/002SERVERTANGO ${String(b.companyID)}-${web.logins}`;
    web.sesiones.set(cd, Number(b.companyID));
    return json({ succeeded: true, clientDescriptor: cd, companyId: b.companyID, hasLicenseError: web.licenciaAgotada });
  }
  if (url.pathname === '/Authentication/SignOut') {
    web.signouts++;
    web.sesiones.delete(String(req.headers.authorization));
    return json({ succeeded: true });
  }
  if (url.pathname === '/colgado') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.write('{"a":'); // nunca termina
  }

  // Endpoints con sesión.
  const empresa = web.sesiones.get(String(req.headers.authorization));
  if (empresa === undefined || req.headers.user !== '0' || web.vencerProximo) {
    web.vencerProximo = false;
    web.sesiones.delete(String(req.headers.authorization));
    if (web.formaVencida === 'invalidSession') return json({ invalidSession: true });
    return json({ fieldMessage: null, message: 'Se detectó una situación inesperada', exceptionInfo: { messages: ['Object reference not set to an instance of an object.'] }, succeeded: false });
  }
  if (url.pathname === '/processresolver/getprofiles' && url.searchParams.get('action') === '21508') {
    if (web.getprofilesSinProfiles) return json({ perfiles: [], succeeded: true });
    return json({
      profiles: Object.values(PERFILES).map((p) => ({ key: p.ID_CPA128, displayLabel: `${String(p.COD_PERFIL)} - ${String(p.DESCRIPCIO)}` })),
      required: false,
      size: 30,
      description: 'Seleccione un perfil',
      succeeded: true,
    });
  }
  if (url.pathname === '/processresolver/execute') {
    const b = (await leerCuerpo(req)) as unknown as {
      processNumber: string;
      data: { pageIndex: number; pageSize: number };
      context: { configuration: { filter: { rules: { rules: { value: number; type?: string; condition?: string; input?: string }[] }[] }; selectedColumns?: unknown; periodConfiguration?: unknown } };
    };
    if (b.processNumber !== '-14024') return json({ succeeded: false, message: 'proceso' });
    const cfg = b.context.configuration;
    // Las trampas relevadas (docs/tango/imputacion-comprobante-compra.md):
    if (!cfg.selectedColumns) return json({ succeeded: false, exceptionInfo: { messages: ["Value cannot be null. (Parameter 'source')"] } });
    const reglas = cfg.filter.rules[0].rules;
    if (reglas.some((r) => !r.type || !r.condition || !r.input)) {
      return json({ succeeded: false, exceptionInfo: { messages: ["Value cannot be null. (Parameter 'value')"] } });
    }
    let todas: Record<string, unknown>[] = cfg.periodConfiguration ? [] : reglas.flatMap((r) => IMPUTACIONES[r.value] ?? []);
    const { pageIndex, pageSize } = b.data;
    const m = web.modo14024;
    if (m === 'error') return json({ succeeded: false, exceptionInfo: { messages: ['Timeout expired'] } });
    if (m === 'sinLista') return json({ resultData: { filas: [] }, succeeded: true });
    if (m === 'ignorarFiltro') todas = [...todas, fila(999, '1', 'CC - CENTROS DE COSTO', 1, '01 - Uno', 100, 1)];
    if (m === 'sinTipo') todas = todas.map(({ tipO_AUXILIAR: _, ...resto }) => resto);
    if (m === 'sinGuion') todas = todas.map((f) => ({ ...f, auxiliar: '703' }));
    const desde = m === 'repetirPagina' ? 0 : pageIndex * pageSize;
    return json({
      resultData: { list: todas.slice(desde, desde + pageSize), totalCount: m === 'totalNulo' ? null : todas.length, pageIndex, pageSize },
      succeeded: true,
    });
  }
  if (url.pathname === '/processresolver/formdefinition') {
    const b = await leerCuerpo(req);
    const ctx = b.context as { selectedProfileId: number; companyId: number };
    const perfil = PERFILES[ctx.selectedProfileId];
    if (web.formdefinitionSinPerfil || ctx.companyId !== empresa) return json({ definition: {}, wizardGlobalContext: null });
    if (!perfil) return json({ definition: {}, wizardGlobalContext: { PERFIL_USUARIO: { ID_CPA128: 0, COD_PERFIL: null, DESCRIPCIO: null, D_CONDICIO: null } } });
    return json({ definition: {}, wizardGlobalContext: { PERFIL_USUARIO: perfil } });
  }
  res.writeHead(404);
  res.end();
});

let urlBase: string;
beforeAll(async () => {
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', () => r()));
  urlBase = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => servidor.close(() => r())));
beforeEach(() => web.reset());

const sesion = (password = 'secreta', companyId = 13) =>
  new SesionWeb({ urlBase, usuario: 'tecnico', password, companyId, timeoutMs: 5000 });

// ---------------------------------------------------------------------------------------

describe('extracción del bundle', () => {
  it('ubica la constante por su uso, sin depender del nombre minificado', () => {
    expect(extraerAppAuthorization('var $x=class{static get(){return"abc"}};h.ApplicationAuthorization=$x.get()')).toBe('abc');
    expect(extraerAppAuthorization('var EX=class{static get(){return"abc"}}')).toBeNull();
  });

  it('encuentra el bundle main-*.js en el HTML', () => {
    expect(rutaBundle('<script src="main-XA6EKTHE.js" type="module"></script>')).toBe('/main-XA6EKTHE.js');
    expect(rutaBundle('<script src="/main-AB.js"></script>')).toBe('/main-AB.js');
    expect(rutaBundle('<script src="polyfills.js"></script>')).toBeNull();
  });

  it('reconoce las dos formas de sesión vencida, y no confunde otros errores', () => {
    expect(esSesionVencida(200, { invalidSession: true })).toBe(true);
    expect(esSesionVencida(200, { succeeded: false, exceptionInfo: { messages: ['Object reference not set to an instance of an object.'] } })).toBe(true);
    expect(esSesionVencida(401, {})).toBe(true);
    expect(esSesionVencida(200, { succeeded: false, exceptionInfo: { messages: ['Registro inexistente'] } })).toBe(false);
    expect(esSesionVencida(200, { profiles: [] })).toBe(false);
  });

  it('separa código y descripción de la etiqueta', () => {
    expect(separarEtiqueta('001 - FACTURA CONTADO')).toEqual({ codigo: '001', descripcion: 'FACTURA CONTADO' });
    expect(separarEtiqueta('004 - DEBITO AUTOMATICO BANCO ')).toEqual({ codigo: '004', descripcion: 'DEBITO AUTOMATICO BANCO' });
    expect(separarEtiqueta('SIN CODIGO')).toEqual({ codigo: '', descripcion: 'SIN CODIGO' });
  });
});

describe('centros de costo: parámetros y cuerpo para -14024', () => {
  const estado = (f: () => unknown) => {
    try {
      f();
      return 'ok';
    } catch (e) {
      return e instanceof ErrorConnector ? e.getStatus() : 'otro';
    }
  };

  it('parsea los ID_CPA04: separados por coma, sin repetidos, enteros positivos y hasta el máximo', () => {
    expect(parsearIds(' 61386, 61566,61386 ')).toEqual([61386, 61566]);
    expect(estado(() => parsearIds(undefined))).toBe(400);
    expect(estado(() => parsearIds('61386,abc'))).toBe(400);
    expect(estado(() => parsearIds('0'))).toBe(400);
    expect(estado(() => parsearIds(Array.from({ length: MAX_COMPROBANTES + 1 }, (_, i) => i + 1).join(',')))).toBe(400);
    expect(estado(() => parsearIds(Array.from({ length: MAX_COMPROBANTES }, (_, i) => i + 1).join(',')))).toBe('ok');
  });

  it('rechaza lo que no es un ID: hexadecimal, exponente, decimales, signo, fuera de int32', () => {
    for (const malo of ['0x10', '1e3', '12.0', '+5', '9007199254740993', '2147483648', '-3']) {
      expect([malo, estado(() => parsearIds(malo))]).toEqual([malo, 400]);
    }
    expect(parsearIds('2147483647')).toEqual([2147483647]);
  });

  it('acepta el parámetro repetido (llega como array) y rechaza otros tipos', () => {
    expect(parsearIds(['61386', '61433'])).toEqual([61386, 61433]);
    expect(estado(() => parsearIds({ a: '1' }))).toBe(400);
  });

  it('todos: solo true/1/false/0 o ausente', () => {
    expect(parsearTodos(undefined)).toBe(false);
    expect(parsearTodos('true')).toBe(true);
    expect(parsearTodos('1')).toBe(true);
    expect(parsearTodos('0')).toBe(false);
    for (const malo of ['TRUE', 'yes', ['true', 'true']]) expect(estado(() => parsearTodos(malo))).toBe(400);
  });

  it('el orden de los controllers deja las rutas de la web antes que el proxy :endpoint', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as { AppModule: object };
    const nombres = (Reflect.getMetadata('controllers', AppModule) as { name: string }[]).map((c) => c.name);
    expect(nombres.indexOf('CentrosCostoCompraController')).toBeLessThan(nombres.indexOf('TangoController'));
    expect(nombres.indexOf('PerfilesCompraController')).toBeLessThan(nombres.indexOf('TangoController'));
  });

  it('arma el cuerpo como lo relevado: OR de reglas equal completas, selectedColumns, sin periodConfiguration', () => {
    const c = cuerpoAuxiliares([61386, 61433], 0);
    expect(c.processNumber).toBe('-14024');
    expect(c.context.configuration).not.toHaveProperty('periodConfiguration');
    expect(c.context.configuration.selectedColumns.map((x) => x.field)).toEqual(expect.arrayContaining(['iD_CPA04', 'coD_CUENTA', 'auxiliar']));
    expect(c.data.columns.map((x) => x.field)).not.toContain('nrO_COMPROBANTE');
    expect(c.context.configuration.filter.rules[0].rules).toEqual([
      { field: 'axvLiveAsientoComprobanteCp.ID_CPA04', operator: 'equal', type: 'integer', value: 61386, condition: 'OR', input: 'text' },
      { field: 'axvLiveAsientoComprobanteCp.ID_CPA04', operator: 'equal', type: 'integer', value: 61433, condition: 'OR', input: 'text' },
    ]);
  });
});

describe('SesionWeb', () => {
  it('inicia sesión como la web: SignIn, SelectCompany con cookie y headers, y pide con la sesión', async () => {
    const s = sesion();
    const r = await s.pedir<{ profiles: unknown[] }>('GET', '/processresolver/getprofiles?action=21508');
    expect(r.profiles).toHaveLength(2);
    expect(web.ultimoLogin).toEqual({ username: 'tecnico', password: 'secreta', loginType: 0 });
    expect(s.activa).toBe(true);
  });

  it('reutiliza la sesión: un solo login para varios requests', async () => {
    const s = sesion();
    await s.pedir('GET', '/processresolver/getprofiles?action=21508');
    await s.pedir('GET', '/processresolver/getprofiles?action=21508');
    expect(web.logins).toBe(1);
  });

  it('dos requests simultáneos comparten el login', async () => {
    const s = sesion();
    await Promise.all([1, 2, 3].map(() => s.pedir('GET', '/processresolver/getprofiles?action=21508')));
    expect(web.logins).toBe(1);
  });

  it.each(['nullref', 'invalidSession'] as const)('si la sesión venció (%s), inicia sesión de nuevo una vez y reintenta', async (forma) => {
    const s = sesion();
    await s.pedir('GET', '/processresolver/getprofiles?action=21508');
    web.formaVencida = forma;
    web.vencerProximo = true;
    const r = await s.pedir<{ profiles: unknown[] }>('GET', '/processresolver/getprofiles?action=21508');
    expect(r.profiles).toHaveLength(2);
    expect(web.logins).toBe(2);
  });

  it('contraseña incorrecta: ErrorSesionWeb de credenciales, con el mensaje de Tango', async () => {
    const e = await sesion('mala').pedir('GET', '/processresolver/getprofiles?action=21508').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorSesionWeb);
    expect(e).toMatchObject({ tipo: 'credenciales' });
    expect((e as Error).message).toContain('Usuario o contraseña incorrectos');
  });

  it('si el bundle ya no tiene la constante: ErrorSesionWeb de contrato', async () => {
    web.bundleSinConstante = true;
    await expect(sesion().pedir('GET', '/processresolver/getprofiles?action=21508')).rejects.toMatchObject({ tipo: 'contrato' });
  });

  it('sin conexión: ErrorSesionWeb de red', async () => {
    const s = new SesionWeb({ urlBase: 'http://127.0.0.1:1', usuario: 'u', password: 'p', companyId: 1, timeoutMs: 2000 });
    await expect(s.pedir('GET', '/x')).rejects.toMatchObject({ tipo: 'red' });
  });

  it('al renovar, cierra la sesión vieja: no quedan sesiones abiertas en Tango', async () => {
    const s = sesion();
    await s.pedir('GET', '/processresolver/getprofiles?action=21508');
    web.vencerProximo = true;
    await s.pedir('GET', '/processresolver/getprofiles?action=21508');
    expect(web.logins).toBe(2);
    expect(web.signouts).toBe(1);
    await s.cerrar();
    expect(web.sesiones.size).toBe(0);
  });

  it('licencias agotadas: cierra la sesión que Tango igual abrió', async () => {
    web.licenciaAgotada = true;
    await expect(sesion().pedir('GET', '/processresolver/getprofiles?action=21508')).rejects.toMatchObject({ tipo: 'credenciales' });
    expect(web.signouts).toBe(1);
    expect(web.sesiones.size).toBe(0);
  });

  it('SelectCompany rechazado: hace SignOut del login a medias', async () => {
    await expect(sesion('secreta', 66).pedir('GET', '/processresolver/getprofiles?action=21508')).rejects.toMatchObject({ tipo: 'credenciales' });
    expect(web.signouts).toBe(1);
  });

  it('cerrar durante un login en curso espera el login y cierra esa sesión', async () => {
    const s = sesion();
    const pedido = s.pedir('GET', '/processresolver/getprofiles?action=21508');
    await s.cerrar();
    await pedido.catch(() => undefined);
    await s.cerrar();
    expect(web.sesiones.size).toBe(0);
  });

  it('un body que se corta por timeout es ErrorSesionWeb de red, no una excepción cruda', async () => {
    const s = new SesionWeb({ urlBase, usuario: 'tecnico', password: 'secreta', companyId: 13, timeoutMs: 300 });
    await s.pedir('GET', '/processresolver/getprofiles?action=21508');
    await expect(s.pedir('GET', '/colgado')).rejects.toMatchObject({ tipo: 'red' });
  });

  it('cerrar hace SignOut y la próxima vez inicia sesión de nuevo', async () => {
    const s = sesion();
    await s.pedir('GET', '/processresolver/getprofiles?action=21508');
    await s.cerrar();
    expect(s.activa).toBe(false);
    await s.pedir('GET', '/processresolver/getprofiles?action=21508');
    expect(web.logins).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------

describe('endpoint /perfiles-de-factura-de-compra (e2e)', () => {
  let app: INestApplication;
  const KEY = 'tc_0123456789ab_' + 'x'.repeat(43);
  const apiKey: ApiKey = {
    id: '1',
    plataforma: 'pruebas',
    prefijo: '0123456789ab',
    hash: '',
    activa: true,
    creada: new Date(),
    ultimoUso: null,
    permisos: { empresas: ['servertango/pruebas-fzero', 'servertango/sin-sesion', 'servertango/en-frio', 'servertango/clave-mala'], procesos: { '*': ['Get'], '27': ['PerfilesDeFacturaDeCompra'], '-14024': ['CentrosDeCostoDeComprobantesDeCompra'] }, filtroSql: false },
  };
  let conCredenciales = true;
  let passwordWeb = 'secreta';

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [PerfilesCompraController, CentrosCostoCompraController],
      providers: [
        { provide: CONFIGURACION, useValue: { tango: { timeoutMs: 5000, webTimeoutMs: 5000 } } as Configuracion },
        SesionesWebService,
        PerfilesCompraService,
        CentrosCostoCompraService,
        { provide: FETCH_WEB, useValue: globalThis.fetch },
        { provide: ApiKeysService, useValue: { validar: async (k: string) => (k === KEY ? apiKey : null) } },
        {
          provide: TenantsService,
          useValue: {
            resolver: async (t: string, e: string) =>
              t === 'servertango' && (e === 'pruebas-fzero' || e === '13')
                ? { slug: 'pruebas-fzero', urlBase, tangoCompanyId: 13, token: 'x' }
                : t === 'servertango' && e === 'en-frio'
                  ? { slug: 'en-frio', urlBase, tangoCompanyId: 21, token: 'x' }
                  : t === 'servertango' && e === 'clave-mala'
                    ? { slug: 'clave-mala', urlBase, tangoCompanyId: 22, token: 'x' }
                    : t === 'servertango' && e === 'sin-sesion'
                  ? { slug: 'sin-sesion', urlBase, tangoCompanyId: 77, token: 'x' }
                  : t === 'servertango' && e === '3'
                  ? { slug: 'fzero-srl', urlBase, tangoCompanyId: 3, token: 'x' }
                  : null,
            credencialesWeb: async () => (conCredenciales ? { urlBase, usuario: 'tecnico', password: passwordWeb } : null),
          },
        },
        { provide: APP_GUARD, useClass: ApiKeyGuard },
        { provide: APP_FILTER, useClass: FiltroErrores },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    app.setGlobalPrefix('v1');
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    conCredenciales = true;
    passwordWeb = 'secreta';
  });

  const get = (ruta: string) => request(app.getHttpServer()).get(`/v1/tango/servertango${ruta}`).set('X-Api-Key', KEY);

  it('lista: id, código y descripción', async () => {
    const r = await get('/pruebas-fzero/perfiles-de-factura-de-compra').expect(200);
    expect(r.headers['x-connector-origin']).toBe('connector');
    expect(r.body).toEqual([
      { id: 3, codigo: '001', descripcion: 'FACTURA CONTADO' },
      { id: 4, codigo: '002', descripcion: 'FACTURA CUENTA CORRIENTE' },
    ]);
  });

  it('detalle: la fila de CPA128 tal cual; la empresa también por Company ID', async () => {
    const r = await get('/13/perfiles-de-factura-de-compra/4').expect(200);
    expect(r.body).toMatchObject({ ID_CPA128: 4, COD_PERFIL: '002', D_CONDICIO: 2, DEPOSITO: '01' });
  });

  it('perfil inexistente: 404', async () => {
    await get('/pruebas-fzero/perfiles-de-factura-de-compra/999').expect(404);
  });

  it('si Tango cambia la forma: 502 que lo dice', async () => {
    web.getprofilesSinProfiles = true;
    const r = await get('/pruebas-fzero/perfiles-de-factura-de-compra').expect(502);
    expect(r.body.exceptionInfo.messages.join(' ')).toContain('getprofiles');
    web.getprofilesSinProfiles = false;
    web.formdefinitionSinPerfil = true;
    const d = await get('/pruebas-fzero/perfiles-de-factura-de-compra/4').expect(502);
    expect(d.body.exceptionInfo.messages.join(' ')).toContain('PERFIL_USUARIO');
  });

  it('sin usuario web en el tenant: 503 que explica por qué', async () => {
    conCredenciales = false;
    // Una empresa sin sesión abierta: las sesiones abiertas no vuelven a leer las credenciales.
    const r = await get('/sin-sesion/perfiles-de-factura-de-compra').expect(503);
    expect(r.body.message).toContain('usuario web');
  });

  it('perfil 0 o negativo: 404 sin ir a Tango', async () => {
    const antes = web.logins;
    await get('/pruebas-fzero/perfiles-de-factura-de-compra/0').expect(404);
    await get('/pruebas-fzero/perfiles-de-factura-de-compra/-3').expect(404);
    expect(web.logins).toBe(antes);
  });

  it('arranque en frío con requests simultáneos: un solo login', async () => {
    web.reset();
    await Promise.all([1, 2, 3].map(() => get('/en-frio/perfiles-de-factura-de-compra').expect(200)));
    expect(web.logins).toBe(1);
  });

  it('credenciales rechazadas: 503 genérico y no vuelve a intentar el login enseguida', async () => {
    web.reset();
    passwordWeb = 'mala';
    const r = await get('/clave-mala/perfiles-de-factura-de-compra').expect(503);
    expect(r.body.message).toContain('rechazó el usuario web');
    expect(JSON.stringify(r.body)).not.toContain('Usuario o contraseña incorrectos');
    await get('/clave-mala/perfiles-de-factura-de-compra').expect(503);
    await get('/clave-mala/perfiles-de-factura-de-compra').expect(503);
    expect(web.logins).toBe(1);
  });

  it('centros de costo: solo los CC, con código y descripción separados, una fila por centro', async () => {
    const r = await get('/pruebas-fzero/centros-de-costo-de-comprobantes-de-compra?idCpa04=61386,61433').expect(200);
    expect(r.headers['x-connector-origin']).toBe('connector');
    expect(r.body).toEqual([
      { idCpa04: 61386, codCuenta: '5010050101', tipoAuxiliar: 'CC - CENTROS DE COSTO', idAuxiliar: 747, codigo: '99HUI', descripcion: '99 - Huidobro', porcentaje: 100, debe: 40949.23, haber: 0 },
      { idCpa04: 61433, codCuenta: '5010050101', tipoAuxiliar: 'CC - CENTROS DE COSTO', idAuxiliar: 703, codigo: '703', descripcion: 'AREA FULL', porcentaje: 60, debe: 600, haber: 0 },
      { idCpa04: 61433, codCuenta: '5010050101', tipoAuxiliar: 'CC - CENTROS DE COSTO', idAuxiliar: 747, codigo: '99HUI', descripcion: '99 - Huidobro', porcentaje: 40, debe: 400, haber: 0 },
    ]);
  });

  it('centros de costo: todos=true trae los demás tipos; un comprobante sin imputaciones no trae filas', async () => {
    const r = await get('/pruebas-fzero/centros-de-costo-de-comprobantes-de-compra?idCpa04=61386&todos=true').expect(200);
    expect(r.body.map((f: { tipoAuxiliar: string }) => f.tipoAuxiliar)).toEqual(['CC - CENTROS DE COSTO', 'PR - PROYECTOS']);
    await get('/pruebas-fzero/centros-de-costo-de-comprobantes-de-compra?idCpa04=123').expect(200, []);
  });

  it('centros de costo: pagina contra Tango cuando hay más de 500 filas', async () => {
    const r = await get('/pruebas-fzero/centros-de-costo-de-comprobantes-de-compra?idCpa04=70000').expect(200);
    expect(r.body).toHaveLength(501);
  });

  it('centros de costo: si Tango falla o cambia de forma, 502 y nunca datos incompletos', async () => {
    for (const modo of ['totalNulo', 'repetirPagina', 'ignorarFiltro', 'sinTipo', 'error', 'sinLista'] as const) {
      web.modo14024 = modo;
      const ids = modo === 'repetirPagina' ? '70000' : '61386,61433';
      const r = await get(`/pruebas-fzero/centros-de-costo-de-comprobantes-de-compra?idCpa04=${ids}`);
      expect([modo, r.status]).toEqual([modo, 502]);
    }
    web.modo14024 = '';
  });

  it('centros de costo: un auxiliar sin " - " usa el texto entero como código', async () => {
    web.modo14024 = 'sinGuion';
    const r = await get('/pruebas-fzero/centros-de-costo-de-comprobantes-de-compra?idCpa04=61386').expect(200);
    expect(r.body[0]).toMatchObject({ codigo: '703', descripcion: '' });
    web.modo14024 = '';
  });

  it('centros de costo: idCpa04 repetido en la query se une; todos inválido da 400', async () => {
    const r = await get('/pruebas-fzero/centros-de-costo-de-comprobantes-de-compra?idCpa04=61386&idCpa04=61433').expect(200);
    expect(new Set(r.body.map((f: { idCpa04: number }) => f.idCpa04))).toEqual(new Set([61386, 61433]));
    await get('/pruebas-fzero/centros-de-costo-de-comprobantes-de-compra?idCpa04=61386&todos=yes').expect(400);
  });

  it('centros de costo: parámetros inválidos 400 y sin permiso 403', async () => {
    await get('/pruebas-fzero/centros-de-costo-de-comprobantes-de-compra').expect(400);
    await get('/pruebas-fzero/centros-de-costo-de-comprobantes-de-compra?idCpa04=x').expect(400);
    const antes = apiKey.permisos.procesos;
    apiKey.permisos.procesos = { '*': ['Get'], '27': ['PerfilesDeFacturaDeCompra'] };
    const sinPermiso = await get('/pruebas-fzero/centros-de-costo-de-comprobantes-de-compra?idCpa04=61386').expect(403);
    expect(sinPermiso.body.exceptionInfo.messages).toContain('Hace falta el permiso "-14024:CentrosDeCostoDeComprobantesDeCompra"');
    apiKey.permisos.procesos = antes;
  });

  it('permisos: empresa sin acceso (403) y key sin el permiso del proceso 27 (403)', async () => {
    await get('/3/perfiles-de-factura-de-compra').expect(403);
    const antes = apiKey.permisos.procesos;
    apiKey.permisos.procesos = { '*': ['Get', 'GetById'] };
    const r = await get('/pruebas-fzero/perfiles-de-factura-de-compra').expect(403);
    expect(r.body.exceptionInfo.messages).toContain('Hace falta el permiso "27:PerfilesDeFacturaDeCompra"');
    apiKey.permisos.procesos = antes;
  });
});
