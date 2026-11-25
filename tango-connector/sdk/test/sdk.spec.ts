import * as http from 'http';
import type { AddressInfo } from 'net';
import { ErrorTango, TangoConnector, fechaTango, filas, sql, sqlLike, type OpcionesCliente } from '../src';

type Manejador = (url: URL, res: http.ServerResponse) => void;

/** Connector simulado. Cada test puede reemplazar la respuesta con `responder`. */
const recibidos: URL[] = [];
let responder: Manejador | undefined;

function json(res: http.ServerResponse, status: number, cuerpo: unknown, origen: string | null = 'tango') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (origen) headers['X-Connector-Origin'] = origen;
  res.writeHead(status, headers);
  res.end(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
}

/** Una página de `total` filas `{ ID }`, como la arma Tango. */
function pagina(url: URL, total: number) {
  const size = Number(url.searchParams.get('pageSize'));
  const index = Number(url.searchParams.get('pageIndex'));
  const desde = index * size;
  const list = Array.from({ length: Math.max(0, Math.min(size, total - desde)) }, (_, i) => ({ ID: desde + i }));
  const totalPages = Math.ceil(total / size);
  return {
    resultData: { list, pageIndex: index, pageSize: size, totalCount: total, totalPages, hasPreviousPage: index > 0, hasNextPage: index < totalPages - 1 },
    succeeded: true,
  };
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  recibidos.push(url);
  if (req.headers['x-api-key'] !== 'tc_ok') {
    return json(res, 401, { succeeded: false, message: 'API key inválida o inactiva', exceptionInfo: { messages: ['API key inválida o inactiva'] } }, 'connector');
  }
  if (responder) return responder(url, res);
  const p = url.pathname;
  if (p.endsWith('/Get')) return json(res, 200, pagina(url, 2500));
  if (p.endsWith('/GetApiLiveQueryData')) return json(res, 200, pagina(url, 3));
  if (p.endsWith('/GetByFilter')) return json(res, 200, { list: [{ ID: 1 }, { ID: 2 }], totalCount: 0 });
  if (p.endsWith('/GetById')) {
    return json(res, 200, { message: 'Se detectó una situación inesperada', exceptionInfo: { messages: ['Registro inexistente'] }, succeeded: false });
  }
  if (p.endsWith('/meta/yo')) return json(res, 200, { plataforma: 'pruebas', prefijo: 'x', permisos: {}, catalogo: '2026-10-08' }, 'connector');
  if (p.endsWith('/meta/procesos')) return json(res, 200, [], 'connector');
  json(res, 404, { succeeded: false, message: 'no', exceptionInfo: { messages: ['no'] } }, 'connector');
});

let base: string;
const cliente = (extra: Partial<OpcionesCliente> = {}) =>
  new TangoConnector({ url: base, apiKey: 'tc_ok', tenant: 'servertango', empresa: 'pruebas-fzero', reintentos: { intentos: 2, esperaMs: 1 }, ...extra });

beforeAll(async () => {
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/v1/`;
});
afterAll(() => new Promise<void>((r) => servidor.close(() => r())));
beforeEach(() => {
  recibidos.length = 0;
  responder = undefined;
});

const queryDe = (u: URL) => Object.fromEntries(u.searchParams);

describe('requests', () => {
  it('Get: URL y query como Tango; view vacío y pageSize 1000 por defecto', async () => {
    const r = await cliente().get(3142);
    expect(r.resultData?.list).toHaveLength(1000);
    expect(recibidos[0].pathname).toBe('/v1/tango/servertango/pruebas-fzero/Get');
    expect(queryDe(recibidos[0])).toEqual({ process: '3142', pageSize: '1000', pageIndex: '0', view: '' });
  });

  it('view con espacios y tenant/empresa con caracteres a codificar', async () => {
    await cliente({ tenant: 'mi server', empresa: 'a/b' }).get(3142, { view: 'Vista Predeterminada' });
    expect(recibidos[0].pathname).toBe('/v1/tango/mi%20server/a%2Fb/Get');
    expect(recibidos[0].searchParams.get('view')).toBe('Vista Predeterminada');
  });

  it('LIVE: query por defecto', async () => {
    await cliente().getApiLiveQueryData(10091);
    expect(queryDe(recibidos[0])).toEqual({ process: '10091', fromDate: '', toDate: '', pageSize: '1000', pageIndex: '0', customQuery: '0' });
  });

  it('LIVE: fechas Date en la zona de Argentina, yyyy-MM-dd convertido, customQuery', async () => {
    // 01/02/2026 02:30 UTC es todavía el 31/01 en Argentina.
    await cliente().getApiLiveQueryData(10091, { fromDate: new Date('2026-02-01T02:30:00Z'), toDate: '2026-02-28', customQuery: 157 });
    expect(queryDe(recibidos[0])).toMatchObject({ fromDate: '31/01/2026', toDate: '28/02/2026', customQuery: '157' });
  });

  it('GetByFilter: list en la raíz y filtroSql escapado', async () => {
    const r = await cliente().getByFilter(3142, `WHERE N_CUIT = ${sql("30-1'x")}`);
    expect(filas(r)).toEqual([{ ID: 1 }, { ID: 2 }]);
    expect(recibidos[0].searchParams.get('filtroSql')).toBe("WHERE N_CUIT = '30-1''x'");
  });

  it('meta', async () => {
    expect((await cliente().meta.yo()).plataforma).toBe('pruebas');
    await cliente().meta.procesos({ tipo: 'LIVE', buscar: 'compras' });
    expect(queryDe(recibidos[1])).toEqual({ tipo: 'LIVE', buscar: 'compras' });
  });

  it('conEmpresa cambia la ruta', async () => {
    await cliente().conEmpresa('otra').get(3142);
    expect(recibidos[0].pathname).toBe('/v1/tango/servertango/otra/Get');
  });

  it('la empresa puede ser el Company ID', async () => {
    await cliente({ empresa: 3 }).get(3142);
    await cliente().conEmpresa(12).get(3142);
    expect(recibidos.map((u) => u.pathname)).toEqual(['/v1/tango/servertango/3/Get', '/v1/tango/servertango/12/Get']);
  });
});

describe('opciones', () => {
  it('una opción undefined no pisa el valor por defecto', async () => {
    const c = cliente({ timeoutMs: undefined, lanzarErrores: undefined });
    await expect(c.getById(3142, 1)).rejects.toMatchObject({ origen: 'tango', mensajes: ['Registro inexistente'] });
  });

  it('valida timeoutMs y las opciones obligatorias', () => {
    expect(() => cliente({ timeoutMs: 0 })).toThrow('timeoutMs');
    expect(() => cliente({ empresa: '' })).toThrow('obligatorias');
  });
});

describe('errores', () => {
  it('succeeded:false de Tango lanza ErrorTango con el detalle y el request', async () => {
    const e = (await cliente().getById(3142, 999).catch((x: unknown) => x)) as ErrorTango;
    expect(e).toBeInstanceOf(ErrorTango);
    expect(e).toMatchObject({ origen: 'tango', status: 200, mensajes: ['Registro inexistente'] });
    expect(e.request).toEqual({ ruta: '/tango/servertango/pruebas-fzero/GetById', tenant: 'servertango', empresa: 'pruebas-fzero', query: { process: '3142', id: '999' } });
    expect(e.message).toContain('GetById');
    expect(e.message).not.toContain('tc_ok');
  });

  it('con lanzarErrores:false los métodos devuelven la respuesta tal cual', async () => {
    const r = await cliente({ lanzarErrores: false }).getById(3142, 999);
    expect(r.succeeded).toBe(false);
  });

  it('un rechazo del connector lanza siempre, con origen connector', async () => {
    const malo = new TangoConnector({ url: base, apiKey: 'tc_mala', tenant: 't', empresa: 'e', lanzarErrores: false });
    await expect(malo.get(3142)).rejects.toMatchObject({ origen: 'connector', status: 401, mensajes: ['API key inválida o inactiva'] });
  });

  it('el 401 problem+json de Tango conserva el motivo', async () => {
    responder = (_, res) => json(res, 401, { type: 'x', title: 'Unauthorized', status: 401 });
    await expect(cliente().get(3142)).rejects.toMatchObject({ origen: 'tango', status: 401, mensajes: ['Unauthorized'] });
  });

  it('body vacío con 200: ErrorTango, no TypeError', async () => {
    responder = (_, res) => json(res, 200, '');
    await expect(cliente().get(3142)).rejects.toBeInstanceOf(ErrorTango);
  });

  it('error de red: reintenta y después lanza origen red', async () => {
    const caido = new TangoConnector({ url: 'http://127.0.0.1:1/v1', apiKey: 'x', tenant: 't', empresa: 'e', reintentos: { intentos: 1, esperaMs: 1 } });
    await expect(caido.get(1)).rejects.toMatchObject({ origen: 'red', status: 0, reintentable: true });
  });

  it('502 HTML de nginx: reintenta, y si sigue, lanza origen red', async () => {
    let n = 0;
    responder = (url, res) => {
      if (n++ < 2) {
        res.writeHead(502, { 'Content-Type': 'text/html' });
        return res.end('<html>502 Bad Gateway</html>');
      }
      json(res, 200, pagina(url, 5));
    };
    expect(filas(await cliente().get(3142))).toHaveLength(5);
    expect(recibidos).toHaveLength(3);

    n = -100;
    recibidos.length = 0;
    await expect(cliente().get(3142)).rejects.toMatchObject({ origen: 'red', status: 502 });
    expect(recibidos).toHaveLength(3);
  });

  it('timeout, también si el body se corta a mitad', async () => {
    responder = (_, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"resultData":'); // y nunca termina
    };
    const e = await cliente({ timeoutMs: 100, reintentos: { intentos: 0, esperaMs: 0 } }).get(3142).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorTango);
    expect(e).toMatchObject({ origen: 'red', mensajes: ['El connector no respondió en 0.1 s'] });
  });

  it('cancelación con signal', async () => {
    responder = () => undefined; // no responde nunca
    const control = new AbortController();
    setTimeout(() => control.abort(), 50);
    await expect(cliente().get(3142, { signal: control.signal })).rejects.toMatchObject({ origen: 'cancelado' });
  });
});

describe('getPdf y pdf', () => {
  // La forma real de Tango (14184, orden de pago 58877): el PDF en base64 dentro de un JSON.
  const respuestaPdf = {
    fileResult: {
      fileContents: Buffer.from('%PDF-1.3 contenido').toString('base64'),
      contentType: 'application/file',
      fileDownloadName: 'OP- 0000000024207.pdf',
      lastModified: null,
      entityTag: null,
      enableRangeProcessing: false,
    },
    contentResult: '',
    message: null,
    exceptionInfo: null,
    succeeded: true,
  };

  it('getPdf devuelve la respuesta de Tango tal cual', async () => {
    responder = (_, res) => json(res, 200, respuestaPdf);
    const r = await cliente().getPdf(14184, 58877);
    expect(r.fileResult?.fileDownloadName).toBe('OP- 0000000024207.pdf');
    expect(queryDe(recibidos[0])).toEqual({ process: '14184', id: '58877' });
  });

  it('pdf() decodifica: nombre y bytes', async () => {
    responder = (_, res) => json(res, 200, respuestaPdf);
    const { nombre, bytes } = await cliente().pdf(14184, 58877);
    expect(nombre).toBe('OP- 0000000024207.pdf');
    expect(Buffer.from(bytes).toString()).toBe('%PDF-1.3 contenido');
  });

  it('pdf(): el nombre de una N/C se vuelve seguro para el sistema de archivos', async () => {
    responder = (_, res) =>
      json(res, 200, { ...respuestaPdf, fileResult: { ...respuestaPdf.fileResult, fileDownloadName: 'N/C-A0000200000085.pdf' } });
    const { nombre, nombreOriginal } = await cliente().pdf(14077, 14617);
    expect(nombre).toBe('N-C-A0000200000085.pdf');
    expect(nombreOriginal).toBe('N/C-A0000200000085.pdf');
  });

  it('Registro inexistente lanza, también en pdf() con lanzarErrores:false', async () => {
    responder = (_, res) => json(res, 200, { succeeded: false, exceptionInfo: { messages: ['Registro inexistente'] } });
    await expect(cliente().getPdf(14184, 1)).rejects.toMatchObject({ origen: 'tango', mensajes: ['Registro inexistente'] });
    await expect(cliente({ lanzarErrores: false }).pdf(14184, 1)).rejects.toMatchObject({ mensajes: ['Registro inexistente'] });
  });

  it('pdf() sin fileResult lanza; JSON roto es ErrorTango', async () => {
    responder = (_, res) => json(res, 200, { succeeded: true, fileResult: null });
    await expect(cliente().pdf(14184, 1)).rejects.toThrow('no devolvió el PDF');
    responder = (_, res) => json(res, 200, '{roto');
    await expect(cliente().getPdf(14184, 1)).rejects.toBeInstanceOf(ErrorTango);
  });
});

describe('órdenes de pago', () => {
  it('pide las rutas del connector y el PDF por GetPdf de 14184', async () => {
    responder = (url, res) => {
      if (url.pathname.endsWith('/GetPdf')) {
        return json(res, 200, { fileResult: { fileContents: Buffer.from('%PDF').toString('base64'), fileDownloadName: 'OP- 0000100000795.pdf' }, succeeded: true });
      }
      json(res, 200, url.pathname.endsWith('/ordenes-de-pago') ? [{ idCpa04: 1787 }] : { idCpa04: 1787 }, 'connector');
    };
    const t = cliente();
    expect(await t.ordenesDePagoDeFacturaDeCompra(1785)).toEqual([{ idCpa04: 1787 }]);
    expect(await t.ordenDePago(1787)).toEqual({ idCpa04: 1787 });
    const pdf = await t.pdfDeOrdenDePago(1787);
    expect(pdf.nombreOriginal).toBe('OP- 0000100000795.pdf');
    expect(Buffer.from(pdf.bytes).toString()).toBe('%PDF');
    expect(recibidos.map((u) => u.pathname + u.search)).toEqual([
      '/v1/tango/servertango/pruebas-fzero/facturas-de-compra/1785/ordenes-de-pago',
      '/v1/tango/servertango/pruebas-fzero/ordenes-de-pago/1787',
      '/v1/tango/servertango/pruebas-fzero/GetPdf?process=14184&id=1787',
    ]);
  });
});

describe('perfiles de factura de compra', () => {
  it('lista y detalle, por la ruta del connector', async () => {
    responder = (url, res) =>
      url.pathname.endsWith('/perfiles-de-factura-de-compra')
        ? json(res, 200, [{ id: 4, codigo: '002', descripcion: 'FACTURA CUENTA CORRIENTE' }], 'connector')
        : json(res, 200, { ID_CPA128: 4, COD_PERFIL: '002', DESCRIPCIO: 'FACTURA CUENTA CORRIENTE', D_CONDICIO: 2 }, 'connector');
    const lista = await cliente({ empresa: 3 }).perfilesDeFacturaDeCompra();
    expect(lista[0]).toEqual({ id: 4, codigo: '002', descripcion: 'FACTURA CUENTA CORRIENTE' });
    const perfil = await cliente({ empresa: 3 }).perfilDeFacturaDeCompra(4);
    expect(perfil.D_CONDICIO).toBe(2);
    expect(recibidos.map((u) => u.pathname)).toEqual([
      '/v1/tango/servertango/3/perfiles-de-factura-de-compra',
      '/v1/tango/servertango/3/perfiles-de-factura-de-compra/4',
    ]);
  });

  it('un rechazo del connector (sin usuario web) lanza con el motivo', async () => {
    responder = (_, res) =>
      json(res, 503, { succeeded: false, message: 'El servidor servertango no tiene usuario web configurado', exceptionInfo: { messages: ['El servidor servertango no tiene usuario web configurado'] } }, 'connector');
    await expect(cliente().perfilesDeFacturaDeCompra()).rejects.toMatchObject({ origen: 'connector', status: 503 });
  });
});

describe('centros de costo de comprobantes de compra', () => {
  it('manda los ID_CPA04 separados por coma y todos solo si se pide', async () => {
    responder = (_, res) =>
      json(res, 200, [{ idCpa04: 61386, codCuenta: '5010050101', tipoAuxiliar: 'CC - CENTROS DE COSTO', idAuxiliar: 747, codigo: '99HUI', descripcion: '99 - Huidobro', porcentaje: 100, debe: 1, haber: 0 }], 'connector');
    const filas = await cliente({ empresa: 3 }).centrosDeCostoDeComprobantesDeCompra([61386, 61433]);
    expect(filas[0].codigo).toBe('99HUI');
    await cliente({ empresa: 3 }).centrosDeCostoDeComprobantesDeCompra([61386], { todos: true });
    expect(recibidos[0].pathname).toBe('/v1/tango/servertango/3/centros-de-costo-de-comprobantes-de-compra');
    expect(queryDe(recibidos[0])).toEqual({ idCpa04: '61386,61433' });
    expect(queryDe(recibidos[1])).toEqual({ idCpa04: '61386', todos: 'true' });
  });

  it('sin comprobantes no va al connector; más de 50 lanza antes de pedir', async () => {
    expect(await cliente().centrosDeCostoDeComprobantesDeCompra([])).toEqual([]);
    await expect(cliente().centrosDeCostoDeComprobantesDeCompra(Array.from({ length: 51 }, (_, i) => i + 1))).rejects.toThrow('50');
    expect(recibidos).toHaveLength(0);
  });
});

describe('paginación', () => {
  it('todas: recorre las páginas de a 1.000', async () => {
    const todas = await cliente().todas(3142);
    expect(todas).toHaveLength(2500);
    expect(todas[2499]).toEqual({ ID: 2499 });
    expect(recibidos.map((u) => u.searchParams.get('pageIndex'))).toEqual(['0', '1', '2']);
  });

  it('paginas: entrega la posición para mostrar progreso', async () => {
    const vistas: string[] = [];
    for await (const p of cliente().paginas('CRUD', 3142)) vistas.push(`${p.pageIndex + 1}/${p.totalPages}:${p.filas.length}:${p.totalCount}`);
    expect(vistas).toEqual(['1/3:1000:2500', '2/3:1000:2500', '3/3:500:2500']);
  });

  it('cortar el for await no pide más páginas', async () => {
    for await (const p of cliente().paginas('CRUD', 3142)) {
      expect(p.pageIndex).toBe(0);
      break;
    }
    expect(recibidos).toHaveLength(1);
  });

  it('un error en una página del medio lanza aunque lanzarErrores sea false', async () => {
    responder = (url, res) =>
      url.searchParams.get('pageIndex') === '1'
        ? json(res, 200, { succeeded: false, exceptionInfo: { messages: ['Timeout SQL'] }, resultData: null })
        : json(res, 200, pagina(url, 2500));
    await expect(cliente({ lanzarErrores: false }).todas(3142)).rejects.toMatchObject({ origen: 'tango', mensajes: ['Timeout SQL'] });
  });

  it('si Tango repite la página (ignora pageIndex), corta con error', async () => {
    responder = (url, res) => {
      const r = pagina(new URL(url.toString().replace(/pageIndex=\d+/, 'pageIndex=0')), 5000);
      json(res, 200, r);
    };
    await expect(cliente().todas(3142)).rejects.toThrow('misma página');
  });

  it('si totalCount cambia mientras se lee, corta con error', async () => {
    responder = (url, res) => json(res, 200, pagina(url, url.searchParams.get('pageIndex') === '0' ? 2500 : 2501));
    await expect(cliente().todas(3142)).rejects.toThrow('cambiaron');
  });

  it('sin resultData de paginado: corta con una página incompleta; con maxPaginas, no sigue para siempre', async () => {
    responder = (url, res) => json(res, 200, { list: pagina(url, 2500).resultData.list });
    // GetByFilter-like: list en la raíz. paginas usa Get, pero filas() lo lee igual.
    expect(await cliente().todas(3142)).toHaveLength(2500);

    responder = (url, res) => json(res, 200, { list: Array.from({ length: 1000 }, (_, i) => ({ ID: Number(url.searchParams.get('pageIndex')) * 1000 + i })) });
    await expect(cliente({ maxPaginas: 3 }).todas(3142)).rejects.toThrow('maxPaginas');
  });

  it('todasLive', async () => {
    expect(await cliente().todasLive(10091, { fromDate: '01/02/2026', toDate: '28/02/2026' })).toHaveLength(3);
  });
});

describe('helpers', () => {
  it('fechaTango: zona de Argentina, yyyy-MM-dd y textos de Tango', () => {
    expect(fechaTango(new Date('2026-01-05T12:00:00-03:00'))).toBe('05/01/2026');
    expect(fechaTango(new Date('2026-02-01T02:30:00Z'))).toBe('31/01/2026');
    expect(fechaTango(new Date('2026-02-01T02:30:00Z'), 'UTC')).toBe('01/02/2026');
    expect(fechaTango('2026-02-01')).toBe('01/02/2026');
    expect(fechaTango('2026-02-01T00:00:00')).toBe('2026-02-01T00:00:00');
    expect(() => fechaTango(new Date('x'))).toThrow();
  });

  it('sql escapa', () => {
    expect(sql("O'Higgins")).toBe("'O''Higgins'");
    expect(sql(5)).toBe('5');
    expect(sql(true)).toBe('1');
    expect(sql(new Date('2026-02-03T04:05:06-03:00'))).toBe("'2026-02-03T04:05:06'");
    expect(() => sql(Number.NaN)).toThrow();
  });

  it('sqlLike escapa los comodines del texto', () => {
    expect(sqlLike('50%_off')).toBe("'%50[%][_]off%'");
    expect(sqlLike("O'H", 'empieza')).toBe("'O''H%'");
    expect(sqlLike('[a]', 'igual')).toBe("'[[]a]'");
  });

  it('filas de cada forma', () => {
    expect(filas({ resultData: { list: [{ a: 1 }] } } as never)).toEqual([{ a: 1 }]);
    expect(filas({ list: [{ a: 2 }] })).toEqual([{ a: 2 }]);
    expect(filas({ value: { a: 3 } })).toEqual([{ a: 3 }]);
    expect(filas({ succeeded: false, resultData: null })).toEqual([]);
  });
});

describe('proveedores (escrituras)', () => {
  const pedidos: { metodo?: string; ruta: string; tipo?: string; cuerpo: unknown }[] = [];
  let estado = 201;
  let origen: string | null = 'connector';
  const srv = http.createServer((req, res) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => {
      pedidos.push({ metodo: req.method, ruta: req.url ?? '', tipo: req.headers['content-type'], cuerpo: d ? JSON.parse(d) : undefined });
      // 502 sin X-Connector-Origin: como nginx o el túnel. En una lectura se reintenta.
      if (estado === 502 && origen === null) return json(res, 502, '<html>Bad Gateway</html>', null);
      if (estado >= 400) return json(res, estado, { succeeded: false, message: 'Tango rechazó el alta', exceptionInfo: { messages: ['Tango rechazó el alta', 'El campo X es requerido'] } }, origen);
      json(res, estado, { id: 7, codigo: '000007', proveedor: { ID_CPA01: 7 }, avisos: [] }, 'connector');
    });
  });
  let url: string;
  beforeAll(async () => {
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`;
  });
  afterAll(() => new Promise<void>((r) => srv.close(() => r())));
  beforeEach(() => {
    pedidos.length = 0;
    estado = 201;
    origen = 'connector';
  });
  const c = () => new TangoConnector({ url, apiKey: 'tc_ok', tenant: 'servertango', empresa: 'pruebas-fzero', reintentos: { intentos: 2, esperaMs: 1 } });

  it('altaProveedor manda POST con el cuerpo JSON', async () => {
    const r = await c().altaProveedor({ cuit: '30-50279317-5', cbu: '2850123540000987654324' });
    expect(r).toMatchObject({ id: 7, codigo: '000007' });
    expect(pedidos).toEqual([{ metodo: 'POST', ruta: '/v1/tango/servertango/pruebas-fzero/proveedores', tipo: 'application/json', cuerpo: { cuit: '30-50279317-5', cbu: '2850123540000987654324' } }]);
  });

  it('actualizarProveedor manda PATCH al ID', async () => {
    estado = 200;
    await c().actualizarProveedor(7, { cbu: null });
    expect(pedidos).toEqual([expect.objectContaining({ metodo: 'PATCH', ruta: '/v1/tango/servertango/pruebas-fzero/proveedores/7', cuerpo: { cbu: null } })]);
  });

  it('las escrituras no se reintentan; la vista previa sí', async () => {
    estado = 502;
    origen = null;
    await expect(c().altaProveedor({ cuit: '30-50279317-5' })).rejects.toBeInstanceOf(ErrorTango);
    expect(pedidos).toHaveLength(1);
    await expect(c().actualizarProveedor(7, { cbu: null })).rejects.toBeInstanceOf(ErrorTango);
    expect(pedidos).toHaveLength(2);
    await expect(c().vistaPreviaAltaProveedor({ cuit: '30-50279317-5' })).rejects.toBeInstanceOf(ErrorTango);
    expect(pedidos).toHaveLength(5);
  });

  it('un 502 del connector en una escritura trae el motivo y no es reintentable', async () => {
    estado = 502;
    origen = 'connector';
    const e = (await c().altaProveedor({ cuit: '30-50279317-5' }).catch((x: unknown) => x)) as ErrorTango;
    expect(e).toMatchObject({ origen: 'connector', status: 502, reintentable: false });
    expect(e.mensajes).toContain('El campo X es requerido');
    expect(pedidos).toHaveLength(1);
  });

  it('una escritura sin respuesta (red) no es reintentable', async () => {
    const caido = new TangoConnector({ url: 'http://127.0.0.1:1/v1', apiKey: 'x', tenant: 't', empresa: 'e', reintentos: { intentos: 2, esperaMs: 1 } });
    await expect(caido.altaProveedor({ cuit: '30-50279317-5' })).rejects.toMatchObject({ origen: 'red', reintentable: false });
  });

  it('un 422 del connector llega como ErrorTango con sus mensajes', async () => {
    estado = 422;
    const e = (await c().altaProveedor({ cuit: '30-54668997-9' }).catch((x: unknown) => x)) as ErrorTango;
    expect(e).toBeInstanceOf(ErrorTango);
    expect(e).toMatchObject({ origen: 'connector', status: 422 });
  });
});
