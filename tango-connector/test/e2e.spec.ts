import type { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as http from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { ApiKeyGuard } from '../src/auth/api-key.guard';
import { ApiKeysService } from '../src/auth/api-keys.service';
import { CatalogoService } from '../src/catalogo/catalogo.service';
import { MetaController } from '../src/catalogo/meta.controller';
import { FiltroErrores } from '../src/comun/errores';
import { CONFIGURACION, type Configuracion } from '../src/config/configuracion';
import type { ApiKey } from '../src/database/entidades';
import { TangoClient } from '../src/tango/tango.client';
import { TangoController } from '../src/tango/tango.controller';
import { TenantsService } from '../src/tenants/tenants.service';

const KEY = 'tc_0123456789ab_' + 'x'.repeat(43);
const API_KEY: ApiKey = {
  id: '00000000-0000-0000-0000-000000000001',
  plataforma: 'pruebas',
  prefijo: '0123456789ab',
  hash: '',
  activa: true,
  creada: new Date(),
  ultimoUso: null,
  permisos: {
    empresas: ['cliente/fzero'],
    procesos: { '3142': ['Get', 'GetById', 'GetByFilter'], '10091': ['GetApiLiveQueryData'] },
    filtroSql: false,
  },
};

/** Tango simulado: registra lo que recibe y responde como Tango. */
const recibidos: { url: string; headers: http.IncomingHttpHeaders }[] = [];
const tango = http.createServer((req, res) => {
  recibidos.push({ url: req.url ?? '', headers: req.headers });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.url?.startsWith('/Api/GetById')) {
    res.end('{"message":"Se detectó una situación inesperada","exceptionInfo":{"messages":["Registro inexistente"]},"succeeded":false}');
    return;
  }
  res.end('{"resultData":{"list":[{"ID_CPA01":1,"NOM_PROVEE":"ACME"}],"pageIndex":0,"pageSize":2,"totalCount":1},"succeeded":true}');
});

describe('connector (e2e, Tango simulado)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await new Promise<void>((r) => tango.listen(0, '127.0.0.1', () => r()));
    const urlBase = `http://127.0.0.1:${(tango.address() as AddressInfo).port}`;
    const config = {
      catalogoDir: 'docs/tango/catalogo/2026-10-08',
      tango: { timeoutMs: 5000, concurrencia: 2, pageSizeMax: 1000 },
    } as Configuracion;

    const modulo = await Test.createTestingModule({
      controllers: [MetaController, TangoController],
      providers: [
        { provide: CONFIGURACION, useValue: config },
        CatalogoService,
        TangoClient,
        { provide: ApiKeysService, useValue: { validar: async (k: string) => (k === KEY ? API_KEY : null) } },
        {
          provide: TenantsService,
          useValue: {
            // Registradas: fzero (Company 13, permitida) y otra (Company 99, sin permiso en la key).
            resolver: async (t: string, e: string) => {
              if (t !== 'cliente') return null;
              const registradas = [
                { slug: 'fzero', urlBase, tangoCompanyId: 13, token: 'token-de-tango' },
                { slug: 'otra', urlBase, tangoCompanyId: 99, token: 'token-de-otra' },
              ];
              return registradas.find((r) => r.slug === e || String(r.tangoCompanyId) === e) ?? null;
            },
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
    await new Promise<void>((r) => tango.close(() => r()));
  });

  beforeEach(() => {
    recibidos.length = 0;
  });

  const get = (ruta: string) => request(app.getHttpServer()).get(ruta).set('X-Api-Key', KEY);

  it('reenvía idéntico: misma query, headers de Tango y respuesta sin cambios', async () => {
    const r = await get('/v1/tango/cliente/fzero/Get?process=3142&pageSize=2&pageIndex=0&view=').expect(200);
    expect(r.headers['x-connector-origin']).toBe('tango');
    expect(r.body).toEqual({
      resultData: { list: [{ ID_CPA01: 1, NOM_PROVEE: 'ACME' }], pageIndex: 0, pageSize: 2, totalCount: 1 },
      succeeded: true,
    });
    expect(recibidos[0].url).toBe('/Api/Get?process=3142&pageSize=2&pageIndex=0&view=');
    expect(recibidos[0].headers.apiauthorization).toBe('token-de-tango');
    expect(recibidos[0].headers.company).toBe('13');
    expect(recibidos[0].headers['x-api-key']).toBeUndefined();
  });

  it('la empresa también se puede indicar por Company ID', async () => {
    await get('/v1/tango/cliente/13/Get?process=3142&pageSize=1').expect(200);
    expect(recibidos[0].headers.company).toBe('13');
    expect(recibidos[0].headers.apiauthorization).toBe('token-de-tango');
  });

  it('por ID, una empresa registrada sin permiso o una que no existe dan 403', async () => {
    await get('/v1/tango/cliente/99/Get?process=3142').expect(403);
    await get('/v1/tango/cliente/12345/Get?process=3142').expect(403);
    expect(recibidos).toHaveLength(0);
  });

  it('los errores de Tango pasan tal cual, con HTTP 200', async () => {
    const r = await get('/v1/tango/cliente/fzero/GetById?process=3142&id=999').expect(200);
    expect(r.headers['x-connector-origin']).toBe('tango');
    expect(r.body.exceptionInfo.messages).toEqual(['Registro inexistente']);
  });

  it('sin key o con key inválida: 401 con la forma de Tango', async () => {
    const r = await request(app.getHttpServer()).get('/v1/tango/cliente/fzero/Get?process=3142').expect(401);
    expect(r.headers['x-connector-origin']).toBe('connector');
    expect(r.body).toMatchObject({ succeeded: false, exceptionInfo: { messages: ['Falta el header X-Api-Key'] } });
    await request(app.getHttpServer()).get('/v1/meta/yo').set('X-Api-Key', 'tc_nope').expect(401);
  });

  it('rechaza sin llegar a Tango: empresa, proceso, escritura, filtroSql', async () => {
    await get('/v1/tango/cliente/otra/Get?process=3142').expect(403);
    await get('/v1/tango/cliente/fzero/Get?process=2117').expect(403);
    await request(app.getHttpServer())
      .post('/v1/tango/cliente/fzero/Create?process=3142')
      .set('X-Api-Key', KEY)
      .send({ NOM_PROVEE: 'X' })
      .expect(403);
    await get("/v1/tango/cliente/fzero/GetByFilter?process=3142&view=&filtroSql=WHERE%20ID_CPA01%3D1").expect(403);
    await get('/v1/tango/cliente/fzero/Get?process=3142&pageSize=5000').expect(400);
    expect(recibidos).toHaveLength(0);
  });

  it('meta: solo los procesos que la key puede usar', async () => {
    const lista = (await get('/v1/meta/procesos').expect(200)).body as { id: number; endpoints: string[] }[];
    expect(lista.map((p) => p.id).sort((a, b) => a - b)).toEqual([3142, 10091]);
    expect(lista.find((p) => p.id === 3142)?.endpoints).toEqual(['Get', 'GetById', 'GetByFilter']);

    const detalle = (await get('/v1/meta/procesos/3142').expect(200)).body;
    expect(detalle.tablas.AXV_PROVEEDOR).toContain('N_CUIT');
    expect(detalle.endpoints.find((e: { nombre: string }) => e.nombre === 'Create')).toMatchObject({
      habilitado: false,
      permitido: false,
    });

    const campos = (await get('/v1/meta/campos?buscar=cuit').expect(200)).body as { proceso: number }[];
    // Con "*", un EXEC no aparece: sus endpoints (Process, Custom) no están habilitados.
    const todo = { ...API_KEY.permisos, procesos: { '*': ['Get', 'GetApiLiveQueryData'] } };
    API_KEY.permisos = todo;
    const conComodin = (await get('/v1/meta/procesos').expect(200)).body as { tipo: string }[];
    expect(conComodin.length).toBe(229 + 382);
    expect(conComodin.some((p) => p.tipo === 'EXEC')).toBe(false);
    API_KEY.permisos = { ...todo, procesos: { '3142': ['Get', 'GetById', 'GetByFilter'], '10091': ['GetApiLiveQueryData'] } };

    // Hay CUIT en muchos procesos, pero la key solo ve los suyos (10091 no tiene CUIT).
    expect(new Set(campos.map((c) => c.proceso))).toEqual(new Set([3142]));
  });
});
