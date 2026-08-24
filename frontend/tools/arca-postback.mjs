/**
 * Cómo se espera a ARCA. Un hecho del sitio, no una preferencia de estilo.
 *
 * LOS BOTONES DE ARCA NO NAVEGAN. Son postbacks AJAX de ASP.NET: se ve un velo gris con un spinner,
 * la página se actualiza por partes y NUNCA se dispara un evento de carga. Por lo tanto:
 *
 *     await page.waitForLoadState("load")   ← resuelve en el mismo instante en que se lo llama
 *
 * Los dos motores de ARCA tenían esa línea y los dos leían la pantalla mientras el organismo todavía
 * estaba procesando. En la validación salía como «ARCA no abrió el bloque para este CUIL» en las
 * veinte personas, con ARCA andando perfecto; en el registro de obras sociales, como «falla» en cada
 * alta. El mismo error, dos síntomas que no se parecen en nada.
 *
 * Vive acá, compartido, justamente por eso: arreglarlo en un motor y no en el otro los deja
 * divergiendo sobre un hecho que es del sitio y vale para los dos.
 */

/** Cuánto se le da a ARCA para contestar un postback. Generoso: solo se agota cuando algo falló. */
export const ESPERA_POSTBACK_MS = 25_000;

/**
 * Espera a que la pantalla llegue a un ESTADO.
 *
 * Un estado y no un tiempo fijo: un `sleep` de dos segundos sería lento cuando ARCA anda bien y
 * seguiría fallando cuando anda lento — que es exactamente cuando importa.
 *
 * Devuelve `false` al agotarse en vez de tirar: «no llegó a tiempo» y «ARCA rechazó esto» son cosas
 * distintas y quien llama es el único que sabe cuál es cuál. Confundirlas fue lo que llenó la tabla
 * de errores rojos que no existían.
 */
export async function esperarEstado(condicion, { ms = ESPERA_POSTBACK_MS, que = "", log } = {}) {
  const hasta = Date.now() + ms;
  for (;;) {
    if (await condicion().catch(() => false)) return true;
    if (Date.now() > hasta) {
      log?.(`  (se agotó la espera de ${Math.round(ms / 1000)}s: ${que})`);
      return false;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}
