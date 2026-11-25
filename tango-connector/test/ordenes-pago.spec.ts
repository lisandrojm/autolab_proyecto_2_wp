import { type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as path from 'path';
import request from 'supertest';
import { ApiKeyGuard } from '../src/auth/api-key.guard';
import { ApiKeysService } from '../src/auth/api-keys.service';
import { FiltroErrores } from '../src/comun/errores';
import { CONFIGURACION, type Configuracion } from '../src/config/configuracion';
import type { ApiKey } from '../src/database/entidades';
import { TangoClient } from '../src/tango/tango.client';
import { OrdenesPagoController } from '../src/tango-web/ordenes-pago.controller';
import { OrdenesPagoService, separarMoneda } from '../src/tango-web/ordenes-pago.service';
import { FETCH_WEB, SesionesWebService } from '../src/tango-web/sesiones-web.service';
import { TenantsService } from '../src/tenants/tenants.service';

// Respuestas reales de GetData (2030 SRL Gestion, 2026-10-19), con el adjunto recortado.
const fixture = (nombre: string) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ordenes-pago', nombre), 'utf8')) as Record<string, unknown>;
const FICHAS: Record<string, Record<string, unknown>> = {
  '14184:1787': fixture('14184-1787.json'),
  '14184:1793': fixture('14184-1793.json'),
  '14162:1785': fixture('14162-1785.json'),
  // Notas (2026-10-25): PICK UP ART, factura 1004 anulada por dos N/C (1005 y 1031); la 774, con OP;
  // SENCINET (FZERO), N/D 57977 a cuenta (sin imputar)
  '14162:1004': fixture('14162-1004.json'),
  '14162:1005': fixture('14162-1005.json'),
  '14162:774': fixture('14162-774.json'),
  '14162:57977': fixture('14162-57977.json'),
};
/** Lo que responde Tango a un ID inexistente: OK, con data casi vacía. */
const INEXISTENTE = { data: { triggerToExecuteGetData: true }, succeeded: true };

const estado = { getData: [] as string[], cuitRoto: false, fichaRota: '', extra: {} as Record<string, unknown> };

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const json = (c: unknown) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(c));
  };
  const p = url.pathname;
  if (p === '/') return void res.end('<script src="main-T1.js"></script>');
  if (p === '/main-T1.js') return void res.end('var QZ=class{static get(){return"k"}};a.ApplicationAuthorization=QZ.get();');
  if (p === '/Authentication/SignIn') return json({ succeeded: true, userHash: 77 });
  if (p === '/Authentication/SelectCompany') return json({ succeeded: true, clientDescriptor: 'cd' });
  if (p === '/Authentication/SignOut') return json({ succeeded: true });
  if (p === '/processresolver/execute') {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => {
      const b = JSON.parse(d) as { processNumber: string; method: string; data: { iD_CPA04: number } };
      const clave = `${b.processNumber}:${b.data.iD_CPA04}`;
      estado.getData.push(clave);
      if (estado.fichaRota === clave) return json({ succeeded: true, data: { t_COMP: 'O/P', iD_CPA01: 1, totaL_CTE: 1, valores: 'no es lista' } });
      if (b.method !== 'GetData') return json({ succeeded: false, exceptionInfo: { messages: ['método inesperado'] } });
      if (estado.extra[clave]) return json(estado.extra[clave]);
      // Como Tango: la ficha abre cualquier ID_CPA04, sea del tipo que sea.
      const ficha = FICHAS[clave] ?? FICHAS[`14184:${b.data.iD_CPA04}`] ?? FICHAS[`14162:${b.data.iD_CPA04}`];
      json(ficha ?? INEXISTENTE);
    });
    return;
  }
  if (p === '/Api/GetById' && url.searchParams.get('process') === '3142') {
    if (estado.cuitRoto) return json({ succeeded: false, exceptionInfo: { messages: ['Registro inexistente'] } });
    return json({ succeeded: true, value: { ID_CPA01: 4516, N_CUIT: '20-26116576-8', CBU: '0070033730004014288363' } });
  }
  res.writeHead(404);
  res.end();
});

describe('órdenes de pago (e2e, web de Tango simulada con respuestas reales)', () => {
  let app: INestApplication;
  const KEY = 'tc_0123456789ab_' + 'x'.repeat(43);
  const apiKey: ApiKey = {
    id: '00000000-0000-0000-0000-000000000009', plataforma: 'pruebas', prefijo: '0123456789ab', hash: '', activa: true, creada: new Date(), ultimoUso: null,
    permisos: { empresas: ['servertango/2030-srl-gestion'], procesos: { '*': ['Get', 'GetById'], '14162': ['OrdenesDePagoDeFacturaDeCompra', 'ComprobantesRelacionadosDeCompra'], '14184': ['OrdenDePago'] }, filtroSql: false },
  };

  beforeAll(async () => {
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', () => r()));
    const urlBase = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    const config = { tango: { timeoutMs: 5000, webTimeoutMs: 5000, concurrencia: 4, pageSizeMax: 1000 } } as Configuracion;
    const modulo = await Test.createTestingModule({
      controllers: [OrdenesPagoController],
      providers: [
        { provide: CONFIGURACION, useValue: config },
        TangoClient,
        SesionesWebService,
        OrdenesPagoService,
        { provide: FETCH_WEB, useValue: globalThis.fetch },
        { provide: ApiKeysService, useValue: { validar: async (k: string) => (k === KEY ? apiKey : null) } },
        {
          provide: TenantsService,
          useValue: {
            resolver: async (t: string, e: string) => (t === 'servertango' && (e === '2030-srl-gestion' || e === '8') ? { slug: '2030-srl-gestion', urlBase, tangoCompanyId: 8, token: 'tok' } : null),
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
    estado.getData.length = 0;
    estado.cuitRoto = false;
    estado.fichaRota = '';
    estado.extra = {};
  });

  const get = (ruta: string) => request(app.getHttpServer()).get(`/v1/tango/servertango/2030-srl-gestion${ruta}`).set('X-Api-Key', KEY);

  it('factura 1785: una sola OP, la 1787, con lo que cancela (no la 1793, que es de otra factura)', async () => {
    const r = await get('/facturas-de-compra/1785/ordenes-de-pago').expect(200);
    expect(r.headers['x-connector-origin']).toBe('connector');
    expect(r.body).toEqual([
      { idCpa04: 1787, tipo: 'O/P', numero: '0000100000795', fecha: '2026-10-07', estado: 'IMP', anulada: false, total: 6000000, importeCancelado: 6000000, importeCanceladoExt: 3986.7109634551493 },
    ]);
    expect(estado.getData).toEqual(['14162:1785', '14184:1787']);
  });

  it('ficha de la OP 1787 como en el pedido (y en el PDF de la API)', async () => {
    const r = await get('/ordenes-de-pago/1787').expect(200);
    expect(r.body).toMatchObject({
      idCpa04: 1787,
      tipo: 'O/P',
      numero: '0000100000795',
      fecha: '2026-10-07',
      estado: 'IMP',
      proveedor: { idCpa01: 4516, codigo: '005239', razonSocial: 'PELLEGRINI HERNAN MARCELO', cuit: '20-26116576-8', cbu: '0070033730004014288363' },
      moneda: 'CTE',
      cotizacion: 1505,
      total: 6000000,
      totalExt: 3986.71,
      leyendas: [],
      observaciones: { comerciales: null, otras: null },
      pagadoCon: [{ cuenta: '1010010201', descripcion: 'BANCO GALICIA', importe: 6000000 }],
      imputaciones: [{ idCpa04Factura: 1785, tipo: 'FAC', numero: 'C0000200000017', vencimiento: '2026-11-05', estado: 'CAN', moneda: 'CTE', cancelado: 6000000 }],
      retenciones: [],
      documentos: [],
      totales: [{ concepto: 'Total', importe: 6000000, importeExt: 3986.71 }],
      comprobantesRelacionados: [{ tipo: 'Factura', numero: 'FAC - C0000200000017', fecha: '2026-10-06', idCpa04Factura: 1785 }],
      ingreso: { fecha: '07/10/26 - 15:23', usuario: 'MARTIN' },
    });
    expect(r.body.valores).toEqual([
      { cuenta: '2010010101', descripcion: 'PROVEEDORES', operacion: null, debe: 6000000, haber: 0, debeExt: 3986.71, haberExt: 0 },
      { cuenta: '1010010201', descripcion: 'BANCO GALICIA', operacion: null, debe: 0, haber: 6000000, debeExt: 0, haberExt: 3986.71 },
    ]);
  });

  it('sin 3142:GetById en la key, no se leen CUIT ni CBU del proveedor', async () => {
    const antes = apiKey.permisos.procesos;
    apiKey.permisos.procesos = { ...antes, '*': ['Get'] };
    const r = await get('/ordenes-de-pago/1787').expect(200);
    expect(r.body.proveedor).toEqual({ idCpa01: 4516, codigo: '005239', razonSocial: 'PELLEGRINI HERNAN MARCELO' });
    apiKey.permisos.procesos = antes;
  });

  it('varias OP: parciales, anulada, borrada y relacionados que no son O/P', async () => {
    const base = FICHAS['14184:1787'] as { data: Record<string, unknown> };
    const imp = (base.data.imputaciones as Record<string, unknown>[])[0];
    const op = (id: number, n: string, f: string, est: string, total: number, imps: Record<string, unknown>[]) => ({
      ...base,
      data: { ...base.data, n_COMP: ` ${n}`, fecha: `${f}T00:00:00`, estadO_CTE: est, totaL_CTE: total, imputaciones: imps },
    });
    // Paga 1.000.000 de la 1785 y 500.000 de otra factura, en dos imputaciones a la 1785.
    estado.extra['14184:2001'] = op(2001, '0000100000900', '2026-10-09', 'IMP', 1500000, [
      { ...imp, totaL_CANCELADO_CTE: 600000, totaL_CANCELADO_EXT: 398.67 },
      { ...imp, totaL_CANCELADO_CTE: 400000, totaL_CANCELADO_EXT: 265.78 },
      { ...imp, iD_CPA04_FACCREDEB: 1799, totaL_CANCELADO_CTE: 500000 },
    ]);
    estado.extra['14184:2002'] = op(2002, '0000100000901', '2026-10-08', 'ANU', 5000000, [{ ...imp, totaL_CANCELADO_CTE: 5000000 }]);
    const factura = FICHAS['14162:1785'] as { data: Record<string, unknown> };
    const rel = factura.data.comprobanteS_RELACIONADOS as Record<string, unknown>[];
    estado.extra['14162:1785'] = {
      ...factura,
      data: {
        ...factura.data,
        comprobanteS_RELACIONADOS: [
          ...rel,
          { ...rel[0], iD_CPA04_OP: 2001 },
          { ...rel[0], iD_CPA04_OP: 2002 },
          { ...rel[0], iD_CPA04_OP: 999999 }, // borrada
          { ...rel[0], tipo: 'Nota de crédito', iD_CPA04_OP: null, iD_CPA04_FACCREDEB: 1800 },
        ],
      },
    };
    const r = await get('/facturas-de-compra/1785/ordenes-de-pago').expect(200);
    expect(r.body.map((o: { idCpa04: number; anulada: boolean; importeCancelado: number }) => [o.idCpa04, o.anulada, o.importeCancelado])).toEqual([
      [1787, false, 6000000],
      [2002, true, 0],
      [2001, false, 1000000],
    ]);
    expect(r.body[2].importeCanceladoExt).toBeCloseTo(664.45);
  });

  it('retenciones con datos y montos que no son números', async () => {
    const base = FICHAS['14184:1787'] as { data: Record<string, unknown> };
    estado.extra['14184:3001'] = {
      ...base,
      data: { ...base.data, retenciones: [{ retencion: 'GAN - Ganancias', nrO_CERTIFICADO: '0001-00000012', fecha: '2026-10-07T00:00:00', importe: 12500.5, certificadO_RELACIONADO: '' }] },
    };
    const r = await get('/ordenes-de-pago/3001').expect(200);
    expect(r.body.retenciones).toEqual([{ retencion: 'GAN - Ganancias', certificado: '0001-00000012', fecha: '2026-10-07', importe: 12500.5, certificadoRelacionado: null }]);
    estado.extra['14184:3002'] = { ...base, data: { ...base.data, totaL_CTE: 1, imputaciones: [{ iD_CPA04_FACCREDEB: 1785, totaL_CANCELADO_CTE: '6000000' }] } };
    const roto = await get('/ordenes-de-pago/3002').expect(502);
    expect(roto.body.exceptionInfo.messages.join(' ')).toContain('totaL_CANCELADO_CTE no es un número');
  });

  it('moneda y cotización en los formatos de Tango', () => {
    expect(separarMoneda('CTE (Cotización: 1505.0000000)')).toEqual({ moneda: 'CTE', cotizacion: 1505 });
    expect(separarMoneda('EXT (Cotización: 1.505,25)')).toEqual({ moneda: 'EXT', cotizacion: 1505.25 });
    expect(separarMoneda('U$S (Cotización: 1505,5)')).toEqual({ moneda: 'U$S', cotizacion: 1505.5 });
    expect(separarMoneda('CTE')).toEqual({ moneda: 'CTE', cotizacion: null });
    expect(separarMoneda('CTE (sin dato)')).toEqual({ moneda: 'CTE', cotizacion: null });
  });

  it('sin CUIT del proveedor, la OP sale igual', async () => {
    estado.cuitRoto = true;
    const r = await get('/ordenes-de-pago/1787').expect(200);
    expect(r.body.proveedor).toEqual({ idCpa01: 4516, codigo: '005239', razonSocial: 'PELLEGRINI HERNAN MARCELO' });
  });

  it('inexistente: 404; tipo cruzado: 404 que lo dice', async () => {
    await get('/ordenes-de-pago/999999').expect(404);
    await get('/facturas-de-compra/999999/ordenes-de-pago').expect(404);
    const op = await get('/ordenes-de-pago/1785').expect(404);
    expect(op.body.message).toContain('no es una orden de pago (es FAC)');
    const fac = await get('/facturas-de-compra/1787/ordenes-de-pago').expect(404);
    expect(fac.body.message).toContain('es una orden de pago');
  });

  it('ID inválido: 400 sin ir a Tango', async () => {
    await get('/ordenes-de-pago/abc').expect(400);
    await get('/ordenes-de-pago/0').expect(400);
    await get('/facturas-de-compra/99999999999/ordenes-de-pago').expect(400);
    expect(estado.getData).toEqual([]);
  });

  it('si Tango cambia la forma: 502', async () => {
    estado.fichaRota = '14184:1787';
    const r = await get('/ordenes-de-pago/1787').expect(502);
    expect(r.body.exceptionInfo.messages.join(' ')).toContain('valores no es una lista');
  });

  it('relacionados de una factura anulada por dos N/C: las notas imputadas, sin OP', async () => {
    const r = await get('/facturas-de-compra/1004/relacionados').expect(200);
    expect(r.headers['x-connector-origin']).toBe('connector');
    expect(r.body).toEqual({
      idCpa04: 1004,
      tipo: 'FAC',
      numero: 'A0000100000066',
      fecha: '2025-11-10',
      fechaContable: '2025-11-10',
      estado: 'CAN',
      proveedor: { idCpa01: 4552, codigo: '005275', razonSocial: 'PICK UP ART S.R.L.' },
      moneda: 'CTE',
      cotizacion: 1460,
      total: 1815000,
      totalExt: 1243.15,
      vencimientos: [{ fecha: '2025-12-10', importe: 1815000, estado: 'Pagado' }],
      relacionados: [
        { tipo: 'N/C', numero: 'A0000100000011', fecha: '2025-11-10', idCpa04: 1005, ordenDePago: false },
        { tipo: 'N/C', numero: 'A0000100000012', fecha: '2025-12-10', idCpa04: 1031, ordenDePago: false },
      ],
      fiscal: {
        tipoOperacion: 'Operación Gravada',
        clasificacionCiti: 'Bienes y Servicios',
        operacionRg3685: { codigo: '0', descripcion: 'Operaciones gravadas' },
        comprobanteAfip: { codigo: '001', descripcion: 'Facturas A' },
        caiCae: null,
      },
    });
    expect(estado.getData).toEqual(['14162:1004']);
  });

  it('relacionados de una nota: su factura; de una factura con OP: la OP; de una nota a cuenta: ninguno', async () => {
    const nota = await get('/facturas-de-compra/1005/relacionados').expect(200);
    expect(nota.body).toMatchObject({ tipo: 'N/C', estado: 'IMP', total: 181500, vencimientos: [] });
    expect(nota.body.relacionados).toEqual([{ tipo: 'FAC', numero: 'A0000100000066', fecha: '2025-11-10', idCpa04: 1004, ordenDePago: false }]);
    const conOp = await get('/facturas-de-compra/774/relacionados').expect(200);
    expect(conOp.body.relacionados).toEqual([{ tipo: 'O/P', numero: '0000100000421', fecha: '2025-12-05', idCpa04: 992, ordenDePago: true }]);
    const aCuenta = await get('/facturas-de-compra/57977/relacionados').expect(200);
    expect(aCuenta.body).toMatchObject({ tipo: 'N/D', estado: 'CTA', total: 20100, relacionados: [] });
  });

  it('relacionados: lo fiscal de un invoice del exterior (importación, RG 3685 X, comprobante AFIP 019)', async () => {
    const base = (FICHAS['14162:1004'] as { data: Record<string, unknown> }).data;
    estado.extra['14162:6'] = {
      succeeded: true,
      data: {
        ...base,
        tipO_OPERACION: 'Importación',
        clasificacioN_CITI: 'Bienes y Servicios',
        tipO_OPERACION_RG_3685_4597: 'X - Importaciones del exterior',
        comprobantE_AFIP: '019 - Facturas de exportación',
        caI_CAE: '',
      },
    };
    const r = await get('/facturas-de-compra/6/relacionados').expect(200);
    expect(r.body.fiscal).toEqual({
      tipoOperacion: 'Importación',
      clasificacionCiti: 'Bienes y Servicios',
      operacionRg3685: { codigo: 'X', descripcion: 'Importaciones del exterior' },
      comprobanteAfip: { codigo: '019', descripcion: 'Facturas de exportación' },
      caiCae: null,
    });
  });

  it('relacionados: inexistente u orden de pago, 404; ID inválido, 400; sin ID, se saltea', async () => {
    await get('/facturas-de-compra/999999/relacionados').expect(404);
    const op = await get('/facturas-de-compra/1787/relacionados').expect(404);
    expect(op.body.message).toContain('es una orden de pago');
    await get('/facturas-de-compra/abc/relacionados').expect(400);
    const base = (FICHAS['14162:1004'] as { data: Record<string, unknown> }).data;
    estado.extra['14162:5'] = { succeeded: true, data: { ...base, comprobanteS_RELACIONADOS: [{ tipo: 'X', numero: 'N/C - A1', iD_CPA04_OP: null, iD_CPA04_FACCREDEB: null }] } };
    const sinId = await get('/facturas-de-compra/5/relacionados').expect(200);
    expect(sinId.body.relacionados).toEqual([]);
  });

  it('sin permiso: 403 con el que falta', async () => {
    const antes = apiKey.permisos.procesos;
    apiKey.permisos.procesos = { '*': ['Get'] };
    const r = await get('/ordenes-de-pago/1787').expect(403);
    expect(r.body.exceptionInfo.messages).toContain('Hace falta el permiso "14184:OrdenDePago"');
    await get('/facturas-de-compra/1785/ordenes-de-pago').expect(403);
    const rel = await get('/facturas-de-compra/1004/relacionados').expect(403);
    expect(rel.body.exceptionInfo.messages).toContain('Hace falta el permiso "14162:ComprobantesRelacionadosDeCompra"');
    apiKey.permisos.procesos = antes;
  });
});
