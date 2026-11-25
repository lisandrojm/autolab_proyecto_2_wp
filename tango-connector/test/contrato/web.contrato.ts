/**
 * Tests de contrato contra la web REAL de Tango (ADR 0003). Verifican que los endpoints
 * internos que usa el connector siguen como se relevaron. Solo lectura.
 *
 *   npm run test:contrato
 *
 * Variables (en .env): TANGO_WEB_USUARIO, TANGO_WEB_PASSWORD (usuario técnico),
 * TANGO_WEB_URL (por defecto http://servertango:17000), TANGO_WEB_EMPRESA (por defecto 13).
 * Sin credenciales, se saltean.
 *
 * Correrlos después de cada actualización de Tango y antes de cada deploy. Con
 * ACTUALIZAR_CONTRATO=1 se reescribe la lista de campos de CPA128 (cpa128-campos.json).
 */
import * as fs from 'fs';
import * as path from 'path';
import { cargarEnv } from '../../src/config/configuracion';
import { cuerpoConsultaArca, cuerpoEjecutar, cuerpoLista } from '../../src/proveedores/proveedores.service';
import { cuerpoAuxiliares } from '../../src/tango-web/centros-costo-compra.service';
import { cuerpoFicha } from '../../src/tango-web/ordenes-pago.service';
import { separarEtiqueta } from '../../src/tango-web/perfiles-compra.service';
import { SesionWeb, esSesionVencida, extraerAppAuthorization, rutaBundle } from '../../src/tango-web/sesion-web';

cargarEnv();
const URL_BASE = (process.env.TANGO_WEB_URL || 'http://servertango:17000').replace(/\/+$/, '');
const USUARIO = process.env.TANGO_WEB_USUARIO;
const PASSWORD = process.env.TANGO_WEB_PASSWORD;
const EMPRESA = Number(process.env.TANGO_WEB_EMPRESA || 13);
const CAMPOS_GRABADOS = path.join(__dirname, 'cpa128-campos.json');

/** Campos de CPA128 que el connector o las plataformas usan: si desaparecen, el contrato se rompió. */
const CAMPOS_CLAVE = ['ID_CPA128', 'COD_PERFIL', 'DESCRIPCIO', 'COND_DEF', 'CTR_CONDIC', 'D_CONDICIO', 'DEPOSITO', 'COMP_CONCE', 'ALTAPROVEE', 'LEYENDA'];

const conCredenciales = Boolean(USUARIO && PASSWORD);
if (!conCredenciales) {
  console.warn('Tests de contrato salteados: faltan TANGO_WEB_USUARIO y TANGO_WEB_PASSWORD');
}

(conCredenciales ? describe : describe.skip)(`contrato de la web de Tango (${URL_BASE}, empresa ${EMPRESA})`, () => {
  jest.setTimeout(120_000);
  const sesion = new SesionWeb({ urlBase: URL_BASE, usuario: USUARIO!, password: PASSWORD!, companyId: EMPRESA, timeoutMs: 60_000 });
  let perfiles: { key: number; displayLabel: string }[] = [];

  afterAll(() => sesion.cerrar());

  it('la web publica el bundle main-*.js con la constante ApplicationAuthorization', async () => {
    const html = await (await fetch(`${URL_BASE}/`)).text();
    const ruta = rutaBundle(html);
    expect(ruta).toMatch(/^\/main-[\w-]+\.js$/);
    const js = await (await fetch(URL_BASE + ruta!)).text();
    expect(extraerAppAuthorization(js)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('getprofiles?action=21508 devuelve { profiles: [{ key, displayLabel }] }', async () => {
    const r = await sesion.pedir<{ profiles?: { key: number; displayLabel: string }[]; succeeded?: boolean }>(
      'GET',
      '/processresolver/getprofiles?action=21508',
    );
    expect(sesion.activa).toBe(true);
    expect(Array.isArray(r.profiles)).toBe(true);
    expect(r.profiles!.length).toBeGreaterThan(0);
    for (const p of r.profiles!) {
      expect(typeof p.key).toBe('number');
      expect(separarEtiqueta(p.displayLabel).codigo).toMatch(/^\d+$/);
    }
    perfiles = r.profiles!;
  });

  it('formdefinition de 21508 con selectedProfileId trae el perfil en wizardGlobalContext.PERFIL_USUARIO', async () => {
    expect(perfiles.length).toBeGreaterThan(0); // depende del test anterior
    const primero = perfiles[0];
    const r = await sesion.pedir<{ wizardGlobalContext?: { PERFIL_USUARIO?: Record<string, unknown> } }>(
      'POST',
      '/processresolver/formdefinition',
      { action: '21508', context: { selectedProfileId: primero.key, companyId: EMPRESA } },
    );
    const perfil = r.wizardGlobalContext?.PERFIL_USUARIO;
    expect(perfil).toBeDefined();
    expect(perfil!.ID_CPA128).toBe(primero.key);
    expect(`${String(perfil!.COD_PERFIL)} - ${String(perfil!.DESCRIPCIO)}`.trim()).toBe(primero.displayLabel.trim());
    for (const campo of CAMPOS_CLAVE) expect(Object.keys(perfil!)).toContain(campo);

    // Compara la lista de campos con la grabada: los que desaparecen rompen el contrato.
    const campos = Object.keys(perfil!).sort();
    if (process.env.ACTUALIZAR_CONTRATO === '1' || !fs.existsSync(CAMPOS_GRABADOS)) {
      fs.writeFileSync(CAMPOS_GRABADOS, JSON.stringify(campos, null, 2) + '\n');
    } else {
      const grabados = JSON.parse(fs.readFileSync(CAMPOS_GRABADOS, 'utf8')) as string[];
      const nuevos = campos.filter((c) => !grabados.includes(c));
      if (nuevos.length) console.warn(`CPA128 tiene campos nuevos (no rompe): ${nuevos.join(', ')}`);
      expect(grabados.filter((c) => !campos.includes(c))).toEqual([]);
    }
  });

  it('formdefinition con un perfil inexistente devuelve una plantilla vacía (ID_CPA128 0): el connector responde 404', async () => {
    const r = await sesion.pedir<{ wizardGlobalContext?: { PERFIL_USUARIO?: { ID_CPA128?: number } } | null }>(
      'POST',
      '/processresolver/formdefinition',
      { action: '21508', context: { selectedProfileId: 999_999, companyId: EMPRESA } },
    );
    expect(r.wizardGlobalContext?.PERFIL_USUARIO?.ID_CPA128 ?? 0).not.toBe(999_999);
    expect(perfiles.some((p) => p.key === 999_999)).toBe(false);
  });

  it('-14024 (Detalle por auxiliar): un comprobante conocido da su centro de costo real', async () => {
    // Comprobante de referencia (docs/tango/imputacion-comprobante-compra.md): FZERO SRL (3),
    // ID_CPA04 61386, centro de costo 99HUI al 100%. Se puede cambiar por variables.
    const empresa = Number(process.env.CONTRATO_CC_EMPRESA || 3);
    const comprobante = Number(process.env.CONTRATO_CC_COMPROBANTE || 61386);
    const esperado = process.env.CONTRATO_CC_CODIGO || '99HUI';
    const enEmpresa = new SesionWeb({ urlBase: URL_BASE, usuario: USUARIO!, password: PASSWORD!, companyId: empresa, timeoutMs: 60_000 });
    try {
      const r = await enEmpresa.pedir<{ succeeded?: boolean; resultData?: { list?: Record<string, unknown>[] } }>(
        'POST',
        '/processresolver/execute',
        cuerpoAuxiliares([comprobante], 0),
      );
      expect(r.succeeded).not.toBe(false);
      const filas = r.resultData?.list ?? [];
      for (const campo of ['iD_CPA04', 'coD_CUENTA', 'tipO_AUXILIAR', 'iD_AUXILIAR', 'auxiliar', 'porC_DE_APROPIACION', 'debE_CTE', 'habeR_CTE']) {
        expect(Object.keys(filas[0] ?? {})).toContain(campo);
      }
      const centros = filas.filter((f) => String(f.tipO_AUXILIAR).startsWith('CC '));
      expect(centros.map((f) => separarEtiqueta(String(f.auxiliar)).codigo)).toContain(esperado);
      const fila = centros.find((f) => separarEtiqueta(String(f.auxiliar)).codigo === esperado)!;
      expect(fila.iD_CPA04).toBe(comprobante);
      expect(fila.porC_DE_APROPIACION).toBe(100);
    } finally {
      await enEmpresa.cerrar();
    }
  });

  it('-14024: la paginación real coincide con una sola página; un ID inexistente da lista vacía sin error; la sesión vencida se reconoce', async () => {
    const empresa = Number(process.env.CONTRATO_CC_EMPRESA || 3);
    // Comprobantes de referencia de la spec (FZERO SRL), una fila CC cada uno.
    const ids = (process.env.CONTRATO_CC_VARIOS || '61566,61594,61386,61264,61433').split(',').map(Number);
    const s = new SesionWeb({ urlBase: URL_BASE, usuario: USUARIO!, password: PASSWORD!, companyId: empresa, timeoutMs: 60_000 });
    type R = { succeeded?: boolean; resultData?: { list?: Record<string, unknown>[]; totalCount?: unknown } };
    try {
      const unaPagina = await s.pedir<R>('POST', '/processresolver/execute', cuerpoAuxiliares(ids, 0));
      const total = unaPagina.resultData?.totalCount;
      expect(typeof total).toBe('number');
      expect(unaPagina.resultData?.list).toHaveLength(total as number);

      // De a 2 filas: mismas filas, sin repetidas ni faltantes.
      const paginadas: Record<string, unknown>[] = [];
      for (let p = 0; paginadas.length < (total as number) && p < 20; p++) {
        const r = await s.pedir<R>('POST', '/processresolver/execute', cuerpoAuxiliares(ids, p, 2));
        expect(r.resultData?.totalCount).toBe(total);
        paginadas.push(...(r.resultData?.list ?? []));
      }
      const clave = (f: Record<string, unknown>) => JSON.stringify([f.iD_CPA04, f.coD_CUENTA, f.iD_AUXILIAR, f.tipO_AUXILIAR, f.porC_DE_APROPIACION]);
      expect(paginadas.map(clave).sort()).toEqual(unaPagina.resultData!.list!.map(clave).sort());

      const inexistente = await s.pedir<R>('POST', '/processresolver/execute', cuerpoAuxiliares([2_000_000_000], 0));
      expect(inexistente.succeeded).not.toBe(false);
      expect(inexistente.resultData?.list ?? []).toEqual([]);

      // Sesión cerrada: execute la reporta igual que getprofiles (esSesionVencida).
      const headers = { 'Content-Type': 'application/json', Authorization: s['clientDescriptor'] as string, User: '0', ApplicationAuthorization: s['appAuthorization'] as string };
      await s.cerrar();
      const vencida = await fetch(`${URL_BASE}/processresolver/execute`, { method: 'POST', headers, body: JSON.stringify(cuerpoAuxiliares(ids, 0)) });
      expect(esSesionVencida(vencida.status, await vencida.json())).toBe(true);
    } finally {
      await s.cerrar();
    }
  });

  describe('proveedores (ADR 0004): lo que usa el alta, sin escribir', () => {
    type Web = { succeeded?: boolean; data?: Record<string, unknown>; resultData?: { list?: Record<string, unknown>[] } };
    let defaults: Record<string, unknown> = {};

    it('GetDefaultValues de 3142 propone el código y los valores por defecto', async () => {
      const r = await sesion.pedir<Web>('POST', '/processresolver/execute', cuerpoEjecutar('GetDefaultValues', { defaultParams: null, context: { companyId: EMPRESA } }));
      expect(r.succeeded).not.toBe(false);
      defaults = r.data!;
      expect(String(defaults.codigo)).toMatch(/^\S+$/);
      for (const c of ['iD_TIPO_DOCUMENTO_GV', 'editA_COMPROBANTE_REFERENCIA_REMITO', 'moN_CTE_HA', 'nuM_AUTOMA', 'citI_OPERA', 'citI_TIPO']) {
        expect(defaults[c]).not.toBeUndefined();
      }
    });

    it('ActualizaAutomaticamenteCuit trae ARCA y cuiT_DUPLICADO; un CUIT inexistente vuelve vacío', async () => {
      expect(defaults.codigo).toBeDefined(); // depende del test anterior
      const ok = await sesion.pedir<Web>('POST', '/processresolver/execute', cuerpoEjecutar('ActualizaAutomaticamenteCuit', cuerpoConsultaArca(defaults, '30-50279317-5')));
      expect(ok.succeeded).not.toBe(false);
      expect(typeof ok.data!.noM_PROVEE).toBe('string');
      expect(String(ok.data!.noM_PROVEE).length).toBeGreaterThan(0);
      expect(typeof ok.data!.cuiT_DUPLICADO).toBe('boolean');
      expect(ok.data).toHaveProperty('iD_CPA57');
      expect(ok.data).toHaveProperty('iD_CATEGORIA_IVA_COND_IVA');

      const nada = await sesion.pedir<Web>('POST', '/processresolver/execute', cuerpoEjecutar('ActualizaAutomaticamenteCuit', cuerpoConsultaArca(defaults, '20-00000000-1')));
      expect(nada.succeeded).not.toBe(false);
      expect(nada.data?.noM_PROVEE ?? '').toBeFalsy();
    });

    it.each([
      ['OperacionAfipComprasLookup', 'iD_OPERACION_AFIP_COMPRAS'],
      ['TipoComprobanteAfipHabilitadoCompraLookup', 'iD_TIPO_COMPROBANTE_AFIP'],
    ])('getdatalookup %s devuelve una lista con %s numérico', async (lookup, campo) => {
      const r = await sesion.pedir<Web>('POST', '/processresolver/getdatalookup', cuerpoLista(lookup));
      expect(r.succeeded).not.toBe(false);
      expect(typeof r.resultData?.list?.[0]?.[campo]).toBe('number');
    });
  });

  describe('órdenes de pago (fichas 14162 y 14184)', () => {
    // Caso de docs/tango/ordenes-de-pago.md: 2030 SRL Gestion (8), factura 1785 pagada por la OP 1787.
    const EMPRESA_OP = Number(process.env.TANGO_CONTRATO_OP_EMPRESA || 8);
    const FACTURA = Number(process.env.TANGO_CONTRATO_OP_FACTURA || 1785);
    const OP = Number(process.env.TANGO_CONTRATO_OP || 1787);
    type Ficha = { succeeded?: boolean; data?: Record<string, unknown> };
    const s8 = new SesionWeb({ urlBase: URL_BASE, usuario: USUARIO!, password: PASSWORD!, companyId: EMPRESA_OP, timeoutMs: 60_000 });
    afterAll(() => s8.cerrar());

    it('GetData de 14162 trae comprobanteS_RELACIONADOS con iD_CPA04_OP', async () => {
      const r = await s8.pedir<Ficha>('POST', '/processresolver/execute', cuerpoFicha(14162, FACTURA));
      expect(r.succeeded).not.toBe(false);
      expect(typeof r.data!.t_COMP).toBe('string');
      const rel = r.data!.comprobanteS_RELACIONADOS as Record<string, unknown>[];
      expect(Array.isArray(rel)).toBe(true);
      expect(rel.map((x) => x.iD_CPA04_OP)).toContain(OP);
    });

    it('GetData de 14162 trae lo que usa relacionados: estado, total, vencimientos y relacionados con sus ID', async () => {
      const r = await s8.pedir<Ficha>('POST', '/processresolver/execute', cuerpoFicha(14162, FACTURA));
      const d = r.data!;
      for (const c of ['n_COMP', 'fecha', 'estadO_CTE', 'moneda', 'proveedoR_RAZON_SOCI']) expect(d).toHaveProperty(c);
      expect(typeof d.iD_CPA01).toBe('number');
      expect(typeof d.totaL_CTE_VALUE).toBe('number');
      expect(Array.isArray(d.vencimientos)).toBe(true);
      const rel = (d.comprobanteS_RELACIONADOS as Record<string, unknown>[])[0];
      for (const c of ['numero', 'fecha', 'iD_CPA04_OP', 'iD_CPA04_FACCREDEB']) expect(rel).toHaveProperty(c);
    });

    it('GetData de 14184 trae la cabecera y las pestañas que usa el connector', async () => {
      const r = await s8.pedir<Ficha>('POST', '/processresolver/execute', cuerpoFicha(14184, OP));
      const d = r.data!;
      expect(d.t_COMP).toBe('O/P');
      expect(typeof d.iD_CPA01).toBe('number');
      expect(typeof d.totaL_CTE).toBe('number');
      for (const c of ['n_COMP', 'fecha', 'estadO_CTE', 'moneda', 'proveedoR_RAZON_SOCI', 'leyendA_1', 'observacioneS_COMERCIALES', 'otraS_OBSERVACIONES']) {
        expect(d).toHaveProperty(c);
      }
      for (const c of ['valores', 'imputaciones', 'retenciones', 'documentos', 'totales', 'comprobanteS_RELACIONADOS']) expect(Array.isArray(d[c])).toBe(true);
      const imp = (d.imputaciones as Record<string, unknown>[])[0];
      expect(imp.iD_CPA04_FACCREDEB).toBe(FACTURA);
      expect(typeof imp.totaL_CANCELADO_CTE).toBe('number');
      const valor = (d.valores as Record<string, unknown>[])[0];
      for (const c of ['cuenta', 'descripcion', 'debE_CTE', 'habeR_CTE']) expect(valor).toHaveProperty(c);
    });

    it('un ID inexistente vuelve OK sin t_COMP (el connector responde 404)', async () => {
      const r = await s8.pedir<Ficha>('POST', '/processresolver/execute', cuerpoFicha(14184, 2_000_000_000));
      expect(r.succeeded).not.toBe(false);
      expect(r.data?.t_COMP ?? null).toBeNull();
    });
  });

  it('una sesión cerrada (SignOut) o inventada se reconoce como vencida', async () => {
    const otra = new SesionWeb({ urlBase: URL_BASE, usuario: USUARIO!, password: PASSWORD!, companyId: EMPRESA, timeoutMs: 60_000 });
    await otra.pedirSinRenovar('GET', '/processresolver/getprofiles?action=21508');
    // Se reusan los headers de una sesión ya cerrada: así la ve Tango cuando venció.
    const headers = {
      Authorization: otra['clientDescriptor'] as string,
      User: '0',
      ApplicationAuthorization: otra['appAuthorization'] as string,
    };
    await otra.cerrar();
    const r = await fetch(`${URL_BASE}/processresolver/getprofiles?action=21508`, { headers });
    expect(esSesionVencida(r.status, await r.json())).toBe(true);

    const inventada = await fetch(`${URL_BASE}/processresolver/getprofiles?action=21508`, { headers: { ...headers, Authorization: 'inexistente' } });
    expect(esSesionVencida(inventada.status, await inventada.json())).toBe(true);
  });
});
