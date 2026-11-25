import { HttpStatus, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as http from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { ApiKeyGuard } from '../src/auth/api-key.guard';
import { ApiKeysService } from '../src/auth/api-keys.service';
import { CatalogoService } from '../src/catalogo/catalogo.service';
import { ErrorConnector, FiltroErrores } from '../src/comun/errores';
import { Locks } from '../src/comun/locks';
import { CONFIGURACION, type Configuracion } from '../src/config/configuracion';
import { AuditoriaEscritura, type ApiKey } from '../src/database/entidades';
import { ProveedoresController } from '../src/proveedores/proveedores.controller';
import { ProveedoresService } from '../src/proveedores/proveedores.service';
import { normalizarCuit, normalizarCuitPais, razonSocialClave, validarCambios, validarCbu, validarEntradaAlta, validarEntradaAltaExterior } from '../src/proveedores/validaciones';
import { TangoClient } from '../src/tango/tango.client';
import { FETCH_WEB, SesionesWebService } from '../src/tango-web/sesiones-web.service';
import { TenantsService } from '../src/tenants/tenants.service';

const estado = (f: () => unknown) => {
  try {
    f();
    return 'ok';
  } catch (e) {
    return e instanceof ErrorConnector ? e.getStatus() : 'otro';
  }
};

describe('validaciones de proveedores', () => {
  it('CUIT: normaliza a XX-XXXXXXXX-X y controla el dígito verificador', () => {
    expect(normalizarCuit('30502793175')).toBe('30-50279317-5');
    expect(normalizarCuit(' 30-50279317-5 ')).toBe('30-50279317-5');
    expect(estado(() => normalizarCuit('30-50279317-4'))).toBe(400);
    expect(estado(() => normalizarCuit('30-5027931-5'))).toBe(400);
    expect(estado(() => normalizarCuit(undefined))).toBe(400);
    expect(estado(() => normalizarCuit(30502793175))).toBe(400);
  });

  it('CBU: 22 dígitos con sus dos verificadores', () => {
    expect(validarCbu('2850123540000123456782')).toBe('2850123540000123456782');
    expect(estado(() => validarCbu('2850123540000123456783'))).toBe(400);
    expect(estado(() => validarCbu('2850123550000123456782'))).toBe(400);
    expect(estado(() => validarCbu('285012354000012345678'))).toBe(400);
    expect(estado(() => validarCbu('2850-1235400001234567'))).toBe(400);
  });

  it('cuerpo del alta: rechaza campos desconocidos y textos largos', () => {
    expect(validarEntradaAlta({ cuit: '30502793175', codigoProvincia: '3' })).toEqual({ cuit: '30-50279317-5', cbu: undefined, descripcionCbu: undefined, codigoProvincia: '3' });
    expect(estado(() => validarEntradaAlta({ cuit: '30502793175', razonSocial: 'X' }))).toBe(400);
    expect(estado(() => validarEntradaAlta({ cuit: '30502793175', descripcionCbu: 'x'.repeat(31) }))).toBe(400);
    expect(estado(() => validarEntradaAlta([]))).toBe(400);
  });

  it('cambios: solo cbu y descripcionCbu, null borra', () => {
    expect(validarCambios({ cbu: null })).toEqual({ cbu: null });
    expect(estado(() => validarCambios({}))).toBe(400);
    expect(estado(() => validarCambios({ NOM_PROVEE: 'X' }))).toBe(400);
  });

  it('CUIT país: 50, 51 o 55, sin controlar el dígito verificador (ARCA tiene algunos que no cumplen)', () => {
    expect(normalizarCuitPais('55000002126')).toBe('55-00000212-6');
    expect(normalizarCuitPais('51-60000415-1')).toBe('51-60000415-1');
    expect(normalizarCuitPais('50000002213')).toBe('50-00000221-3');
    expect(estado(() => normalizarCuitPais('30502793175'))).toBe(400);
    expect(estado(() => normalizarCuitPais('5500000212'))).toBe(400);
  });

  it('alta del exterior: razón social obligatoria, categoría EX por defecto (o RI), sin campos desconocidos', () => {
    expect(validarEntradaAltaExterior({ cuitPais: '55000002126', razonSocial: ' Anthropic, PBC ' })).toEqual({
      cuitPais: '55-00000212-6', razonSocial: 'Anthropic, PBC', categoriaIva: 'EX', cbu: undefined, descripcionCbu: undefined,
    });
    expect(validarEntradaAltaExterior({ cuitPais: '55000002126', razonSocial: 'Adobe', categoriaIva: 'RI' }).categoriaIva).toBe('RI');
    expect(estado(() => validarEntradaAltaExterior({ cuitPais: '55000002126' }))).toBe(400);
    expect(estado(() => validarEntradaAltaExterior({ cuitPais: '55000002126', razonSocial: 'X', categoriaIva: 'RS' }))).toBe(400);
    expect(estado(() => validarEntradaAltaExterior({ cuitPais: '55000002126', razonSocial: 'x'.repeat(61) }))).toBe(400);
    expect(estado(() => validarEntradaAltaExterior({ cuitPais: '55000002126', razonSocial: 'X', codigoProvincia: '99' }))).toBe(400);
  });

  it('cambios fiscales: códigos de Tango, CITI de su lista, retenciones solo destildar', () => {
    expect(validarCambios({ operacionAfip: 'X', comprobanteAfip: '019', citiOpera: 'I', citiTipo: 'B', aplicaRetenciones: false, habilitado: false })).toEqual({
      operacionAfip: 'X', comprobanteAfip: '019', citiOpera: 'I', citiTipo: 'B', aplicaRetenciones: false, habilitado: false,
    });
    expect(estado(() => validarCambios({ citiOpera: 'Z' }))).toBe(400);
    expect(estado(() => validarCambios({ comprobanteAfip: '19' }))).toBe(400);
    expect(estado(() => validarCambios({ aplicaRetenciones: true }))).toBe(400);
    expect(estado(() => validarCambios({ habilitado: 'N' }))).toBe(400);
  });

  it('razón social: la misma sin forma societaria, acentos ni puntuación', () => {
    expect(razonSocialClave('OpenAI, LLC')).toBe(razonSocialClave('OPENAI,LLC'));
    expect(razonSocialClave('RX FRANCE S A S')).toBe('RXFRANCE');
    expect(razonSocialClave('Me-Team LTD')).not.toBe(razonSocialClave('Otra LTD'));
  });

  it('Locks: las tareas con la misma clave corren de a una', async () => {
    const locks = new Locks();
    const orden: string[] = [];
    const tarea = (n: string, ms: number) => () => new Promise<void>((r) => setTimeout(() => { orden.push(n); r(); }, ms));
    await Promise.all([locks.con('a', tarea('1', 30)), locks.con('a', tarea('2', 1)), locks.con('b', tarea('3', 1))]);
    expect(orden).toEqual(['3', '1', '2']);
  });
});

// ---------------------------------------------------------------------------------------
// Tango simulado: API pública (/Api) y web (sesión, defaults, ARCA, listas) de la empresa 13.
// ---------------------------------------------------------------------------------------

type Prov = Record<string, unknown>;
const PROVINCIAS = [
  { ID_CPA57: 15, COD_CPA57: '00', NOM_PROVIN: 'Capital Federal' },
  { ID_CPA57: 24, COD_CPA57: '01', NOM_PROVIN: 'Buenos Aires' },
  { ID_CPA57: 23, COD_CPA57: '03', NOM_PROVIN: 'Córdoba' },
  { ID_CPA57: 25, COD_CPA57: '99', NOM_PROVIN: 'Exterior' },
];
/** ARCA, por CUIT. 30-54668997-9 viene sin provincia; 30-70308853-4 no está en ARCA. */
const ARCA: Record<string, Prov> = {
  '30-50279317-5': { noM_PROVEE: 'ARCOR S A I C', domicilio: 'AV FULVIO S PAGANI 487', localidad: 'ARROYITO', c_POSTAL: '2434', iD_CPA57: 23, n_IVA: 'ELABORACIÓN DE PRODUCTOS', iD_CATEGORIA_IVA_COND_IVA: 1, categoriA_IVA: { coD_DESCRIP: 'RI - Responsable inscripto' }, calcU_RET: 'S', ivA_L: true, retenciones: [] },
  '30-54668997-9': { noM_PROVEE: 'YPF SOCIEDAD ANONIMA', domicilio: 'MACACHA GUEMES 515', localidad: '', c_POSTAL: '1106', iD_CPA57: null, n_IVA: 'EXTRACCIÓN DE PETRÓLEO', iD_CATEGORIA_IVA_COND_IVA: 1, calcU_RET: 'S', retenciones: [{ tipO_RETEN: 'G', coD_RETEN: '01' }] },
};

const tango = {
  proveedores: new Map<number, Prov>(),
  creates: 0,
  rechazarCreate: '',
  proximoCodigoForzado: '',
  /** Create responde HTTP 500 sin JSON después de guardar (como un corte). */
  createRoto: false,
  createSinId: false,
  filtroRoto: false,
  arcaDataNull: false,
  updates: 0,
  paginasComprobante: [] as number[],
  /** Campos que Update ignora (como el real ignora lo que no está en su schema, ej. HABILITADO). */
  ignorarEnUpdate: ['HABILITADO'] as string[],
  reset() {
    this.proveedores.clear();
    this.proveedores.set(100, { ID_CPA01: 100, COD_CPA01: '000100', NOM_PROVEE: 'EXISTENTE SA', N_CUIT: '30-50001091-2', ID_CPA57: 15, ID_TIPO_DOCUMENTO_GV: 26, ID_CATEGORIA_IVA_COND_IVA: 1, EDITA_COMPROBANTE_REFERENCIA_REMITO: 'N', MON_CTE_HA: 'S', NUM_AUTOMA: 'N', CITI_OPERA: 'O', CITI_TIPO: 'B', CBU: null, DESCRIPCION_CBU: null, TELEFONO_1: '1234' });
    this.proveedores.set(90, { ID_CPA01: 90, COD_CPA01: '000090', NOM_PROVEE: 'VIEJO SIN GUIONES', N_CUIT: '30708806389' });
    this.creates = 0;
    this.rechazarCreate = '';
    this.proximoCodigoForzado = '';
    this.createRoto = false;
    this.createSinId = false;
    this.filtroRoto = false;
    this.arcaDataNull = false;
    this.updates = 0;
    this.paginasComprobante = [];
    this.ignorarEnUpdate = ['HABILITADO'];
    // Uno del exterior, cargado como la mayoría (fuera del modelo)
    this.proveedores.set(95, { ID_CPA01: 95, COD_CPA01: '000095', NOM_PROVEE: 'Anthropic, PBC', N_CUIT: '55-00000212-6', ID_CPA57: 25, ID_TIPO_DOCUMENTO_GV: 26, ID_CATEGORIA_IVA_COND_IVA: 1, EDITA_COMPROBANTE_REFERENCIA_REMITO: 'N', MON_CTE_HA: 'S', NUM_AUTOMA: 'N', CITI_OPERA: 'O', CITI_TIPO: 'B', CALCU_RET: 'S', HABILITADO: true, ID_OPERACION_AFIP_RG_3685_TIPO_OPERACION_COMPRAS: 30, ID_TIPO_COMPROBANTE_AFIP_RG_3685_COMPROBANTE_COMPRAS: 40 });
  },
};

function leer(req: http.IncomingMessage): Promise<Prov> {
  return new Promise((r) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => r(d ? (JSON.parse(d) as Prov) : {}));
  });
}

const OBLIGATORIOS_TANGO = ['COD_CPA01', 'NOM_PROVEE', 'ID_CPA57', 'ID_TIPO_DOCUMENTO_GV', 'ID_CATEGORIA_IVA_COND_IVA', 'EDITA_COMPROBANTE_REFERENCIA_REMITO', 'MON_CTE_HA', 'NUM_AUTOMA', 'CITI_OPERA', 'CITI_TIPO'];

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const json = (c: unknown, extra: Record<string, string> = {}) => {
    res.writeHead(200, { 'Content-Type': 'application/json', ...extra });
    res.end(JSON.stringify(c));
  };
  const p = url.pathname;
  // --- web ---
  if (p === '/') return void res.end('<script src="main-T1.js"></script>');
  if (p === '/main-T1.js') return void res.end('var QZ=class{static get(){return"k"}};a.ApplicationAuthorization=QZ.get();');
  if (p === '/Authentication/SignIn') return json({ succeeded: true, userHash: 77, userName: 'T' }, { 'Set-Cookie': 's=1' });
  if (p === '/Authentication/SelectCompany') return json({ succeeded: true, clientDescriptor: 'cd', hasLicenseError: false });
  if (p === '/Authentication/SignOut') return json({ succeeded: true });
  if (p === '/processresolver/execute') {
    const b = await leer(req);
    const data = b.data as Prov;
    if (b.method === 'GetDefaultValues') {
      const max = Math.max(...[...tango.proveedores.values()].map((x) => Number(x.COD_CPA01)));
      return json({ succeeded: true, data: {
        codigo: tango.proximoCodigoForzado || String(max + 1).padStart(6, '0'), iD_TIPO_DOCUMENTO_GV: 26, iD_CATEGORIA_IVA_COND_IVA: 1, calcU_RET: 'S',
        citI_OPERA: 'O', citI_TIPO: 'B', nuM_AUTOMA: 'N', moN_CTE_HA: 'S', editA_COMPROBANTE_REFERENCIA_REMITO: 'N', fechA_ALTA: '2026-10-19T00:00:00',
        iD_CLASIFICACION_RETENCION: 1, cuiT_OBLIGATORIO_NOTMAPPED: 'N', retenciones: [],
      } });
    }
    if (b.method === 'ActualizaAutomaticamenteCuit') {
      const cuit = String(data.n_CUIT);
      if (tango.arcaDataNull) return json({ succeeded: true, data: null });
      const duplicado = [...tango.proveedores.values()].some((x) => x.N_CUIT === cuit);
      // Tango devuelve el pedido con lo que completó ARCA: lo demás vuelve null (p. ej. iD_TIPO_DOCUMENTO_GV).
      return json({ succeeded: true, data: { ...data, iD_TIPO_DOCUMENTO_GV: null, cuiT_DUPLICADO: duplicado, ...(ARCA[cuit] ?? {}) } });
    }
  }
  if (p === '/processresolver/getdatalookup') {
    const b = await leer(req);
    // IDs distintos de los de PRUEBAS FZERO: el connector tiene que tomar el primero, no un ID fijo.
    if (b.lookup === 'OperacionAfipComprasLookup')
      return json({ succeeded: true, resultData: { list: [{ iD_OPERACION_AFIP_COMPRAS: 30, coD_OPERACION_AFIP_COMPRAS: '0' }, { iD_OPERACION_AFIP_COMPRAS: 33, coD_OPERACION_AFIP_COMPRAS: 'X' }] } });
    // De a páginas: el 019 está en la segunda
    if (b.lookup === 'TipoComprobanteAfipHabilitadoCompraLookup') {
      tango.paginasComprobante.push(Number(b.pageIndex));
      const paginas = [[{ iD_TIPO_COMPROBANTE_AFIP: 40, coD_TIPO_COMPROBANTE_AFIP: '001' }], [{ iD_TIPO_COMPROBANTE_AFIP: 58, coD_TIPO_COMPROBANTE_AFIP: '019' }]];
      return json({ succeeded: true, resultData: { list: paginas[Number(b.pageIndex)] ?? [], totalCount: 2 } });
    }
    if (b.lookup === 'CategoriaIvaExcluyeExeSncLookup')
      return json({ succeeded: true, resultData: { list: [{ iD_CATEGORIA_IVA: 1, coD_CATEGORIA_IVA: 'RI' }, { iD_CATEGORIA_IVA: 5, coD_CATEGORIA_IVA: 'EX' }] } });
  }
  // --- API pública ---
  if (p === '/Api/Get' && url.searchParams.get('process') === '2728') return json({ succeeded: true, resultData: { list: PROVINCIAS } });
  if (p === '/Api/GetByFilter') {
    if (tango.filtroRoto) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return void res.end(JSON.stringify({ message: 'Error interno' }));
    }
    const filtro = String(url.searchParams.get('filtroSql'));
    const cuit = /^WHERE REPLACE\(N_CUIT, '-', ''\) = '(\d{11})'$/.exec(filtro);
    const codigo = /^WHERE COD_CPA01 = '([^']*)'$/.exec(filtro);
    if (!cuit && !codigo) return json({ succeeded: false, exceptionInfo: { messages: [`filtro inesperado: ${filtro}`] } });
    const list = [...tango.proveedores.values()].filter((x) =>
      cuit ? String(x.N_CUIT).replace(/-/g, '') === cuit[1] : x.COD_CPA01 === codigo![1],
    );
    return json({ list });
  }
  if (p === '/Api/GetById') {
    const v = tango.proveedores.get(Number(url.searchParams.get('id')));
    return json(v ? { succeeded: true, value: v } : { succeeded: false, exceptionInfo: { messages: ['Registro inexistente'] } });
  }
  if (p === '/Api/Create') {
    const b = await leer(req);
    if (tango.rechazarCreate) return json({ succeeded: false, exceptionInfo: { messages: [tango.rechazarCreate] } });
    const falta = OBLIGATORIOS_TANGO.find((c) => b[c] === undefined || b[c] === null);
    if (falta) return json({ succeeded: false, exceptionInfo: { messages: [`El campo ${falta} es requerido`] } });
    const id = Math.max(...tango.proveedores.keys()) + 1;
    tango.creates++;
    tango.proveedores.set(id, { ...b, ID_CPA01: id });
    if (tango.createRoto) {
      res.writeHead(500);
      return void res.end('<html>error</html>');
    }
    return json(tango.createSinId ? { succeeded: true } : { succeeded: true, savedId: id });
  }
  if (p === '/Api/Update') {
    const b = await leer(req);
    const falta = OBLIGATORIOS_TANGO.find((c) => c !== 'COD_CPA01' && (b[c] === undefined || b[c] === null));
    if (falta) return json({ succeeded: false, exceptionInfo: { messages: [`El campo ${falta} es requerido`] } });
    tango.updates++;
    const antes = tango.proveedores.get(Number(b.ID_CPA01)) ?? {};
    for (const c of tango.ignorarEnUpdate) if (c in b) b[c] = antes[c];
    tango.proveedores.set(Number(b.ID_CPA01), b);
    return json({ succeeded: true, savedId: b.ID_CPA01 });
  }
  res.writeHead(404);
  res.end();
});

describe('alta y actualización de proveedores (e2e, Tango simulado)', () => {
  let app: INestApplication;
  let urlBase: string;
  const auditoria: Prov[] = [];
  const KEY = 'tc_0123456789ab_' + 'x'.repeat(43);
  const apiKey: ApiKey = {
    id: '00000000-0000-0000-0000-000000000009', plataforma: 'pruebas', prefijo: '0123456789ab', hash: '', activa: true, creada: new Date(), ultimoUso: null,
    permisos: { empresas: ['servertango/pruebas-fzero'], procesos: { '*': ['Get'], '3142': ['AltaDeProveedor', 'ActualizarProveedor'] }, filtroSql: false },
  };

  beforeAll(async () => {
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', () => r()));
    urlBase = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    const config = { catalogoDir: 'docs/tango/catalogo/2026-10-08', tango: { timeoutMs: 5000, webTimeoutMs: 5000, concurrencia: 4, pageSizeMax: 1000 } } as Configuracion;
    const modulo = await Test.createTestingModule({
      controllers: [ProveedoresController],
      providers: [
        { provide: CONFIGURACION, useValue: config },
        CatalogoService,
        TangoClient,
        SesionesWebService,
        ProveedoresService,
        { provide: FETCH_WEB, useValue: globalThis.fetch },
        { provide: getRepositoryToken(AuditoriaEscritura), useValue: { create: (x: Prov) => x, save: async (x: Prov) => auditoria.push(x) } },
        { provide: ApiKeysService, useValue: { validar: async (k: string) => (k === KEY ? apiKey : null) } },
        {
          provide: TenantsService,
          useValue: {
            resolver: async (t: string, e: string) => (t === 'servertango' && (e === 'pruebas-fzero' || e === '13') ? { slug: 'pruebas-fzero', urlBase, tangoCompanyId: 13, token: 'tok' } : null),
            credencialesWeb: async () => ({ urlBase, usuario: 'u', password: 'p' }),
          },
        },
        { provide: APP_GUARD, useClass: ApiKeyGuard },
        { provide: APP_FILTER, useClass: FiltroErrores },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    app.setGlobalPrefix('v1');
    await app.init();
  }, 30000);
  afterAll(async () => {
    await app.close();
    await new Promise<void>((r) => servidor.close(() => r()));
  });
  beforeEach(() => {
    tango.reset();
    auditoria.length = 0;
  });

  const post = (ruta: string, cuerpo: unknown) => request(app.getHttpServer()).post(`/v1/tango/servertango/pruebas-fzero${ruta}`).set('X-Api-Key', KEY).send(cuerpo as object);
  const patch = (ruta: string, cuerpo: unknown) => request(app.getHttpServer()).patch(`/v1/tango/servertango/pruebas-fzero${ruta}`).set('X-Api-Key', KEY).send(cuerpo as object);

  it('vista previa: arma el alta con ARCA y las reglas, sin escribir', async () => {
    const r = await post('/proveedores/vista-previa', { cuit: '30502793175', cbu: '2850123540000987654324', descripcionCbu: 'Principal' }).expect(200);
    expect(r.body.listo).toBe(true);
    expect(r.body.faltantes).toEqual([]);
    expect(r.body.arca).toMatchObject({ razonSocial: 'ARCOR S A I C', idProvincia: 23, categoriaIva: 'RI - Responsable inscripto' });
    expect(r.body.cuerpo).toMatchObject({
      COD_CPA01: '000101', N_CUIT: '30-50279317-5', NOM_PROVEE: 'ARCOR S A I C', ID_CPA57: 23, CALCU_RET: 'N',
      ID_OPERACION_AFIP_RG_3685_TIPO_OPERACION_COMPRAS: 30, ID_TIPO_COMPROBANTE_AFIP_RG_3685_COMPROBANTE_COMPRAS: 40,
      CBU: '2850123540000987654324', DESCRIPCION_CBU: 'Principal', CITI_OPERA: 'O',
    });
    expect(r.body.cuerpo).not.toHaveProperty('ID_CLASIFICACION_RETENCION');
    expect(r.body.cuerpo).not.toHaveProperty('CUIT_OBLIGATORIO_NOTMAPPED');
    expect(tango.creates).toBe(0);
  });

  it('alta: crea, devuelve el proveedor y audita', async () => {
    const r = await post('/proveedores', { cuit: '30-50279317-5', cbu: '2850123540000987654324' }).expect(201);
    expect(r.headers['x-connector-origin']).toBe('connector');
    expect(r.body).toMatchObject({ id: 101, codigo: '000101', avisos: [] });
    expect(r.body.proveedor).toMatchObject({ NOM_PROVEE: 'ARCOR S A I C', CALCU_RET: 'N', CBU: '2850123540000987654324' });
    expect(auditoria).toEqual([expect.objectContaining({ operacion: 'AltaDeProveedor', idRegistro: 101, resultado: 'ok', plataforma: 'pruebas', companyId: 13 })]);
  });

  it('ARCA sin provincia: 422 que pide codigoProvincia; con el código, alta y aviso de retenciones', async () => {
    const sin = await post('/proveedores', { cuit: '30-54668997-9' }).expect(422);
    expect(sin.body.exceptionInfo.messages.join(' ')).toContain('ID_CPA57');
    expect(sin.body.exceptionInfo.messages.join(' ')).toContain('codigoProvincia');
    const previa = await post('/proveedores/vista-previa', { cuit: '30-54668997-9' }).expect(200);
    expect(previa.body.listo).toBe(false);
    expect(previa.body.faltantes.map((f: { campo: string }) => f.campo)).toEqual(['ID_CPA57']);
    const con = await post('/proveedores', { cuit: '30-54668997-9', codigoProvincia: '0' }).expect(201);
    expect(con.body.proveedor.ID_CPA57).toBe(15);
    expect(con.body.avisos.join(' ')).toContain('retenciones');
    expect(tango.creates).toBe(1);
  });

  it('codigoProvincia desconocido: 400 con los válidos', async () => {
    const r = await post('/proveedores', { cuit: '30-50279317-5', codigoProvincia: '77' }).expect(400);
    expect(r.body.exceptionInfo.messages.join(' ')).toContain('00, 01, 03');
  });

  it('CUIT ya cargado: 409 con el existente, sin llamar a Create', async () => {
    const r = await post('/proveedores', { cuit: '30500010912' }).expect(409);
    expect(r.body.exceptionInfo.messages.join(' ')).toContain('proveedor 100, código 000100');
    expect(tango.creates).toBe(0);
  });

  it('ARCA sin datos: 422', async () => {
    const r = await post('/proveedores', { cuit: '30-70308853-4' }).expect(422);
    expect(r.body.message).toContain('ARCA no devolvió datos');
    expect(tango.creates).toBe(0);
  });

  it('datos inválidos: 400 sin tocar Tango', async () => {
    await post('/proveedores', { cuit: '30-50279317-4' }).expect(400);
    await post('/proveedores', { cuit: '30-50279317-5', cbu: '123' }).expect(400);
    await post('/proveedores', { cuit: '30-50279317-5', NOM_PROVEE: 'X' }).expect(400);
    expect(tango.creates).toBe(0);
  });

  it('Tango rechaza el Create: 502 con su detalle, y queda auditado como error', async () => {
    tango.rechazarCreate = 'Error de Tango simulado';
    const r = await post('/proveedores', { cuit: '30-50279317-5' }).expect(502);
    expect(r.body.exceptionInfo.messages).toContain('Error de Tango simulado');
    expect(auditoria).toEqual([expect.objectContaining({ resultado: 'error', mensaje: 'Error de Tango simulado' })]);
  });

  it('el código que propone Tango ya existe: 409', async () => {
    tango.proximoCodigoForzado = '000100';
    await post('/proveedores', { cuit: '30-50279317-5' }).expect(409);
    expect(tango.creates).toBe(0);
  });

  it('dos altas a la vez en la misma empresa toman códigos distintos (lock)', async () => {
    const [a, b] = await Promise.all([
      post('/proveedores', { cuit: '30-50279317-5' }),
      post('/proveedores', { cuit: '30-54668997-9', codigoProvincia: '01' }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(new Set([a.body.codigo, b.body.codigo]).size).toBe(2);
  });

  it('PATCH: cambia solo el CBU con el registro completo; 404 si no existe', async () => {
    const r = await patch('/proveedores/100', { cbu: '2850123540000123456782', descripcionCbu: 'Nueva' }).expect(200);
    expect(r.body.proveedor).toMatchObject({ CBU: '2850123540000123456782', DESCRIPCION_CBU: 'Nueva', TELEFONO_1: '1234', NOM_PROVEE: 'EXISTENTE SA' });
    expect(auditoria).toEqual([expect.objectContaining({ operacion: 'ActualizarProveedor', idRegistro: 100, resultado: 'ok', cuerpo: { ID_CPA01: 100, CBU: '2850123540000123456782', DESCRIPCION_CBU: 'Nueva' } })]);
    await patch('/proveedores/100', { cbu: null }).expect(200);
    expect(tango.proveedores.get(100)?.CBU).toBeNull();
    await patch('/proveedores/999', { cbu: '2850123540000123456782' }).expect(404);
    await patch('/proveedores/100', { NOM_PROVEE: 'X' }).expect(400);
  });

  it('un null de ARCA no pisa el valor por defecto', async () => {
    const r = await post('/proveedores/vista-previa', { cuit: '30-50279317-5' }).expect(200);
    expect(r.body.cuerpo.ID_TIPO_DOCUMENTO_GV).toBe(26);
    expect(r.body.listo).toBe(true);
  });

  it('ARCA responde sin data: 422 (no 502)', async () => {
    tango.arcaDataNull = true;
    const r = await post('/proveedores', { cuit: '30-50279317-5' }).expect(422);
    expect(r.body.message).toContain('ARCA no devolvió datos');
  });

  it('un CUIT cargado sin guiones también es duplicado', async () => {
    const r = await post('/proveedores/vista-previa', { cuit: '30-70880638-9' }).expect(409);
    expect(r.body.exceptionInfo.messages.join(' ')).toContain('proveedor 90');
  });

  it('si GetByFilter falla, no se da el alta', async () => {
    tango.filtroRoto = true;
    await post('/proveedores', { cuit: '30-50279317-5' }).expect(502);
    expect(tango.creates).toBe(0);
  });

  it('Create cortado: 502 que dice que no se sabe si se guardó, auditado como desconocido', async () => {
    tango.createRoto = true;
    const r = await post('/proveedores', { cuit: '30-50279317-5' }).expect(502);
    expect(r.body.message).toContain('No se sabe si Tango guardó');
    expect(r.body.exceptionInfo.messages.join(' ')).toContain('Buscar el CUIT 30-50279317-5');
    expect(auditoria).toEqual([expect.objectContaining({ operacion: 'AltaDeProveedor', resultado: 'desconocido' })]);
    // Repetirla da 409: el alta se había guardado.
    await post('/proveedores', { cuit: '30-50279317-5' }).expect(409);
  });

  it('Create OK sin savedId: busca el ID por CUIT y responde 201', async () => {
    tango.createSinId = true;
    const r = await post('/proveedores', { cuit: '30-50279317-5' }).expect(201);
    expect(r.body.id).toBe(101);
    expect(r.body.proveedor.NOM_PROVEE).toBe('ARCOR S A I C');
    expect(auditoria).toEqual([expect.objectContaining({ resultado: 'ok', idRegistro: 101 })]);
  });

  it('dos PATCH a la vez no se pisan (lock)', async () => {
    await Promise.all([patch('/proveedores/100', { cbu: '2850123540000123456782' }), patch('/proveedores/100', { descripcionCbu: 'Otra' })]);
    expect(tango.proveedores.get(100)).toMatchObject({ CBU: '2850123540000123456782', DESCRIPCION_CBU: 'Otra' });
  });

  it('alta del exterior: vista previa con el modelo (99 Exterior, X, 019, CITI I y B, sin retenciones), sin ARCA ni escribir', async () => {
    const r = await post('/proveedores/exterior/vista-previa', { cuitPais: '55000002126', razonSocial: 'OpenAI, LLC' }).expect(200);
    expect(r.body.listo).toBe(true);
    expect(r.body.cuerpo).toMatchObject({
      COD_CPA01: '000101', N_CUIT: '55-00000212-6', NOM_PROVEE: 'OpenAI, LLC', NOM_FANT: 'OpenAI, LLC', ORDEN: 'OpenAI, LLC',
      ID_CPA57: 25, ID_CATEGORIA_IVA_COND_IVA: 5, CALCU_RET: 'N', CITI_OPERA: 'I', CITI_TIPO: 'B',
      ID_OPERACION_AFIP_RG_3685_TIPO_OPERACION_COMPRAS: 33, ID_TIPO_COMPROBANTE_AFIP_RG_3685_COMPROBANTE_COMPRAS: 58,
    });
    expect(r.body.cuerpo).not.toHaveProperty('ID_CLASIFICACION_RETENCION');
    // El 019 está en la segunda página de la lista
    expect(tango.paginasComprobante).toEqual([0, 1]);
    expect(tango.creates).toBe(0);
  });

  it('alta del exterior: crea; con el mismo CUIT país y otra razón social también; la misma razón social, 409', async () => {
    const r = await post('/proveedores/exterior', { cuitPais: '55-00000212-6', razonSocial: 'OpenAI, LLC', categoriaIva: 'RI' }).expect(201);
    expect(r.body).toMatchObject({ id: 101, codigo: '000101' });
    expect(r.body.proveedor).toMatchObject({ NOM_PROVEE: 'OpenAI, LLC', ID_CATEGORIA_IVA_COND_IVA: 1, CITI_OPERA: 'I' });
    expect(auditoria).toEqual([expect.objectContaining({ operacion: 'AltaDeProveedor', idRegistro: 101, resultado: 'ok' })]);
    const repetido = await post('/proveedores/exterior', { cuitPais: '55000002126', razonSocial: 'OPENAI,LLC' }).expect(409);
    expect(repetido.body.exceptionInfo.messages.join(' ')).toContain('código 000101');
    await post('/proveedores/exterior/vista-previa', { cuitPais: '55000002126', razonSocial: 'Anthropic PBC' }).expect(409);
    expect(tango.creates).toBe(1);
  });

  it('PATCH fiscal: corrige uno del exterior al modelo (por código, con el ID de la empresa) y audita solo lo que cambió', async () => {
    const r = await patch('/proveedores/95', { operacionAfip: 'X', comprobanteAfip: '019', categoriaIva: 'EX', citiOpera: 'I', citiTipo: 'B', aplicaRetenciones: false }).expect(200);
    expect(r.body.proveedor).toMatchObject({
      ID_OPERACION_AFIP_RG_3685_TIPO_OPERACION_COMPRAS: 33, ID_TIPO_COMPROBANTE_AFIP_RG_3685_COMPROBANTE_COMPRAS: 58, ID_CATEGORIA_IVA_COND_IVA: 5,
      CITI_OPERA: 'I', CITI_TIPO: 'B', CALCU_RET: 'N', NOM_PROVEE: 'Anthropic, PBC',
    });
    // CITI_TIPO ya era B: no figura entre los cambios
    expect(r.body.cambios.sort()).toEqual(['CALCU_RET', 'CITI_OPERA', 'ID_CATEGORIA_IVA_COND_IVA', 'ID_OPERACION_AFIP_RG_3685_TIPO_OPERACION_COMPRAS', 'ID_TIPO_COMPROBANTE_AFIP_RG_3685_COMPROBANTE_COMPRAS']);
    expect(auditoria[0].cuerpo).toEqual({ ID_CPA01: 95, ID_OPERACION_AFIP_RG_3685_TIPO_OPERACION_COMPRAS: 33, ID_TIPO_COMPROBANTE_AFIP_RG_3685_COMPROBANTE_COMPRAS: 58, ID_CATEGORIA_IVA_COND_IVA: 5, CITI_OPERA: 'I', CALCU_RET: 'N' });
    // Repetirlo no escribe
    const otra = await patch('/proveedores/95', { operacionAfip: 'X', citiOpera: 'I' }).expect(200);
    expect(otra.body.cambios).toEqual([]);
    expect(tango.updates).toBe(1);
  });

  it('PATCH: deshabilita un duplicado con la fecha de inhabilitación (HABILITADO Update lo ignora); un código que no existe, 400', async () => {
    const baja = await patch('/proveedores/95', { habilitado: false }).expect(200);
    expect(baja.body.cambios).toEqual(['FECHA_INHA']);
    expect(tango.proveedores.get(95)?.FECHA_INHA).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00$/);
    // Ya deshabilitado: no se escribe de nuevo
    expect((await patch('/proveedores/95', { habilitado: false }).expect(200)).body.cambios).toEqual([]);
    await patch('/proveedores/95', { habilitado: true }).expect(200);
    expect(tango.proveedores.get(95)?.FECHA_INHA).toBeNull();
    const r = await patch('/proveedores/95', { comprobanteAfip: '999' }).expect(400);
    expect(r.body.exceptionInfo.messages.join(' ')).toContain('001, 019');
  });

  it('PATCH: si Tango responde OK pero no guarda un campo, 502 y auditado como error', async () => {
    tango.ignorarEnUpdate = ['CITI_OPERA'];
    const r = await patch('/proveedores/95', { citiOpera: 'I', citiTipo: 'S' }).expect(502);
    expect(r.body.exceptionInfo.messages.join(' ')).toContain('no guardó: CITI_OPERA (quedó "O")');
    expect(auditoria).toEqual([expect.objectContaining({ operacion: 'ActualizarProveedor', resultado: 'error' })]);
  });

  it('permisos: sin AltaDeProveedor, 403', async () => {
    const antes = apiKey.permisos.procesos;
    apiKey.permisos.procesos = { '*': ['Get'] };
    const r = await post('/proveedores', { cuit: '30-50279317-5' }).expect(HttpStatus.FORBIDDEN);
    expect(r.body.exceptionInfo.messages).toContain('Hace falta el permiso "3142:AltaDeProveedor"');
    await patch('/proveedores/100', { cbu: null }).expect(HttpStatus.FORBIDDEN);
    apiKey.permisos.procesos = antes;
  });
});
