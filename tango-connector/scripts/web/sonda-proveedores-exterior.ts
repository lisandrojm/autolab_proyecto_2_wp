/**
 * Sonda para el alta y la corrección de proveedores del exterior (CUIT país, 2026-10-28). Solo lectura:
 * las listas de la ficha de Proveedores (3142) que hacen falta para traducir códigos a IDs de cada empresa
 * (operación y comprobante AFIP de la RG 3685, categoría de IVA, provincias) y los valores por defecto de
 * un alta (GetDefaultValues, sin grabar nada).
 *
 *   npx ts-node scripts/web/sonda-proveedores-exterior.ts --empresa 13
 *
 * Al terminar hace SignOut (libera la terminal).
 */
import { cargarEnv } from '../../src/config/configuracion';
import { cuerpoEjecutar, cuerpoLista } from '../../src/proveedores/proveedores.service';
import { SesionWeb } from '../../src/tango-web/sesion-web';

function opcion(nombre: string, defecto: string): string {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : defecto;
}

const LISTAS = [
  'OperacionAfipComprasLookup',
  'TipoComprobanteAfipHabilitadoCompraLookup',
  'CategoriaIvaExcluyeExeSncLookup',
  'ProvinciasComprasHiddenPaisesLookup',
  'ProvinciasComprasConJurisdiccionLookup',
  'TiposDocumentosGvLookup',
];

type Lista = { succeeded?: boolean; message?: string; resultData?: { list?: Record<string, unknown>[]; totalCount?: number } };

async function main(): Promise<void> {
  cargarEnv();
  const usuario = process.env.TANGO_WEB_USUARIO;
  const password = process.env.TANGO_WEB_PASSWORD;
  if (!usuario || !password) throw new Error('Faltan TANGO_WEB_USUARIO y TANGO_WEB_PASSWORD');
  const urlBase = (process.env.TANGO_WEB_URL || 'http://servertango:17000').replace(/\/+$/, '');
  const empresa = Number(opcion('--empresa', '13'));
  const sesion = new SesionWeb({ urlBase, usuario, password, companyId: empresa, timeoutMs: 60_000 });
  try {
    for (const lookup of LISTAS) {
      const r = await sesion.pedir<Lista>('POST', '/processresolver/getdatalookup', { ...cuerpoLista(lookup), pageSize: 500 });
      const lista = r.resultData?.list ?? [];
      console.log(`\n== ${lookup}: ${r.succeeded === false ? `error ${r.message}` : `${lista.length} de ${r.resultData?.totalCount ?? '?'}`}`);
      if (lista[0]) console.log('   campos:', Object.keys(lista[0]).join(', '));
      for (const item of lista.slice(0, 40)) console.log('  ', JSON.stringify(item));
    }
    const d = await sesion.pedir<{ data?: Record<string, unknown> }>('POST', '/processresolver/execute', cuerpoEjecutar('GetDefaultValues', { defaultParams: null, context: { companyId: empresa } }));
    const datos = d.data ?? {};
    const interesan = Object.entries(datos).filter(([k]) => /cpa57|categoria|tipo_documento|citi|afip|calcu|clasificacion|habilitado|codigo|rg_3685/i.test(k));
    console.log('\n== GetDefaultValues (campos de interés):');
    for (const [k, v] of interesan) console.log(`   ${k} = ${JSON.stringify(v)?.slice(0, 160)}`);
  } finally {
    await sesion.cerrar();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
