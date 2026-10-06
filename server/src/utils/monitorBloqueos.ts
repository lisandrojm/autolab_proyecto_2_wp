/**
 * DEJA EN EL LOG CADA VEZ QUE NODE SE QUEDA BLOQUEADO.
 *
 * El servidor atiende TODO —requests, TLS, tareas programadas— en un solo hilo. Si algo hace trabajo
 * síncrono pesado (recorrer miles de archivos, armar un documento enorme) o la memoria está al límite
 * y el recolector de basura frena el proceso, nada responde: el 06/10/2026 el TLS tardaba 23 s en
 * abrir y la pantalla de Usuarios vencía, sin un solo error en el log.
 *
 * Esto mide cuánto se atrasa un timer que debería disparar cada segundo. Si se atrasa más de
 * `UMBRAL_MS`, deja una línea con cuánto duró y la memoria del momento. Cruzándola con los logs de
 * las tareas programadas, se ve qué estaba corriendo. No cuesta nada: un timer por segundo.
 */
const INTERVALO_MS = 1000;
const UMBRAL_MS = 2000;

const mb = (b: number) => `${Math.round(b / 1024 / 1024)} MB`;

export function iniciarMonitorDeBloqueos(): void {
  let esperado = Date.now() + INTERVALO_MS;
  const t = setInterval(() => {
    const ahora = Date.now();
    const atraso = ahora - esperado;
    esperado = ahora + INTERVALO_MS;
    if (atraso < UMBRAL_MS) return;
    const m = process.memoryUsage();
    console.warn(`[BLOQUEO] Node estuvo bloqueado ${(atraso / 1000).toFixed(1)} s · heap ${mb(m.heapUsed)} de ${mb(m.heapTotal)} · rss ${mb(m.rss)}`);
  }, INTERVALO_MS);
  // No mantiene vivo el proceso por sí solo.
  t.unref();
}
