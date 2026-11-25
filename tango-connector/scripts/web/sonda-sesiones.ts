/**
 * Sonda de sesiones web de Tango (ADR 0003): abre sesiones con el usuario de TANGO_WEB_USUARIO
 * y cada cierto tiempo informa si siguen vivas, SIN renovarlas. Sirve para ver cómo convive el
 * connector con una persona que usa el mismo usuario (o con otras sesiones del connector).
 * Solo lectura: consulta getprofiles?action=21508.
 *
 *   npx ts-node scripts/web/sonda-sesiones.ts --empresas 13,3 --minutos 10 --intervalo 15 [--sin-cerrar]
 *
 * Al terminar hace SignOut (libera la terminal), salvo con --sin-cerrar.
 */
import { cargarEnv } from '../../src/config/configuracion';
import { SesionWeb } from '../../src/tango-web/sesion-web';

function opcion(nombre: string, defecto: string): string {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : defecto;
}

/** Del diagnóstico solo interesan estos campos (nada de tokens). */
const CAMPOS_DIAGNOSTICO = ['succeeded', 'message', 'terminal', 'hasExceededTerminals', 'userHasActiveTerminal', 'hasLicenseError', 'isNetworkUser', 'companyId'];

const hora = () => new Date().toLocaleTimeString('es-AR', { hour12: false });

async function main(): Promise<void> {
  cargarEnv();
  const usuario = process.env.TANGO_WEB_USUARIO;
  const password = process.env.TANGO_WEB_PASSWORD;
  if (!usuario || !password) throw new Error('Faltan TANGO_WEB_USUARIO y TANGO_WEB_PASSWORD');
  const urlBase = (process.env.TANGO_WEB_URL || 'http://servertango:17000').replace(/\/+$/, '');
  const empresas = opcion('--empresas', '13').split(',').map(Number);
  const minutos = Number(opcion('--minutos', '10'));
  const intervalo = Number(opcion('--intervalo', '15'));

  const sesiones = empresas.map(
    (companyId) =>
      [
        companyId,
        new SesionWeb({
          urlBase,
          usuario,
          password,
          companyId,
          timeoutMs: 60_000,
          diagnostico: (evento, datos) => {
            const visibles = Object.fromEntries(CAMPOS_DIAGNOSTICO.filter((k) => k in datos).map((k) => [k, datos[k]]));
            const companies = Array.isArray(datos.companies) ? { companies: datos.companies.length } : {};
            console.log(`${hora()} empresa ${companyId} ${evento}: ${JSON.stringify({ ...visibles, ...companies })} (campos: ${Object.keys(datos).join(',')})`);
          },
        }),
      ] as const,
  );

  // Ctrl+C: cerrar las sesiones antes de salir, para no dejarlas abiertas en Tango.
  process.once('SIGINT', () => {
    console.log(`${hora()} interrumpido: cerrando sesiones`);
    void Promise.all(sesiones.map(([, s]) => s.cerrar())).finally(() => process.exit(130));
  });

  const fin = Date.now() + minutos * 60_000;
  let vuelta = 0;
  while (Date.now() < fin) {
    const estado: string[] = [];
    for (const [companyId, s] of sesiones) {
      try {
        const r = await s.pedirSinRenovar('GET', '/processresolver/getprofiles?action=21508');
        const perfiles = (r.cuerpo as { profiles?: unknown[] })?.profiles?.length;
        estado.push(`empresa ${companyId}: ${r.vencida ? 'VENCIDA' : `válida (${perfiles ?? '?'} perfiles)`}`);
      } catch (e) {
        estado.push(`empresa ${companyId}: ERROR ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    console.log(`${hora()} #${++vuelta}  ${estado.join('  |  ')}`);
    await new Promise((r) => setTimeout(r, intervalo * 1000));
  }

  if (!process.argv.includes('--sin-cerrar')) {
    for (const [companyId, s] of sesiones) {
      await s.cerrar();
      console.log(`${hora()} empresa ${companyId}: SignOut`);
    }
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
