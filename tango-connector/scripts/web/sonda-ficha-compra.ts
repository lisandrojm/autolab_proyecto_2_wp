/**
 * Sonda de la ficha de un comprobante de compra (14162, 2026-10-30). Solo lectura: muestra los campos de la
 * cabecera y de las pestañas (listas), para ver dónde están los datos de la clasificación AFIP (CITI y RG 3685)
 * y qué más se puede verificar.
 *
 *   npx ts-node scripts/web/sonda-ficha-compra.ts --empresa 12 --id 1578
 *
 * Al terminar hace SignOut (libera la terminal).
 */
import { cargarEnv } from '../../src/config/configuracion';
import { cuerpoFicha } from '../../src/tango-web/ordenes-pago.service';
import { SesionWeb } from '../../src/tango-web/sesion-web';

function opcion(nombre: string, defecto: string): string {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : defecto;
}

async function main(): Promise<void> {
  cargarEnv();
  const usuario = process.env.TANGO_WEB_USUARIO;
  const password = process.env.TANGO_WEB_PASSWORD;
  if (!usuario || !password) throw new Error('Faltan TANGO_WEB_USUARIO y TANGO_WEB_PASSWORD');
  const urlBase = (process.env.TANGO_WEB_URL || 'http://servertango:17000').replace(/\/+$/, '');
  const empresa = Number(opcion('--empresa', '13'));
  const id = Number(opcion('--id', '0'));
  const sesion = new SesionWeb({ urlBase, usuario, password, companyId: empresa, timeoutMs: 60_000 });
  try {
    const r = await sesion.pedir<{ data?: Record<string, unknown> }>('POST', '/processresolver/execute', cuerpoFicha(14162, id));
    const d = r.data ?? {};
    const listas = Object.entries(d).filter(([, v]) => Array.isArray(v));
    console.log('== Cabecera');
    for (const [k, v] of Object.entries(d)) if (!Array.isArray(v) && (v === null || typeof v !== 'object')) console.log(`   ${k} = ${JSON.stringify(v)?.slice(0, 120)}`);
    for (const [k, v] of listas) {
      const l = v as Record<string, unknown>[];
      console.log(`\n== ${k} (${l.length})`);
      for (const fila of l.slice(0, 5)) console.log('  ', JSON.stringify(fila).slice(0, 600));
    }
  } finally {
    await sesion.cerrar();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
