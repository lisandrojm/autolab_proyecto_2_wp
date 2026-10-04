/**
 * LA SESIÓN DE ARCA, TIBIA ENTRE UNA CORRIDA Y LA SIGUIENTE.
 *
 * Medido en los logs (`ArcaObrasSocialesLog.tiempos`): de los ~15 s que tarda validar la obra social
 * de UNA persona, ~11 se van en abrir la sesión —lanzar Chromium, probar la sesión guardada, loguearse
 * y llegar al servicio— y menos de 2 en la persona. Y el login se paga SIEMPRE: las cookies de AFIP
 * son todas de sesión (sin vencimiento propio), la sesión vive del lado del organismo y muere por
 * inactividad, así que el `storageState` guardado en la base llega muerto a la corrida siguiente salvo
 * que venga pegada a la anterior.
 *
 * En vez de cerrar el navegador al terminar, la corrida lo deja acá unos minutos. La siguiente lo
 * pide, verifica contra ARCA que sigue adentro del servicio (una navegación, ~1 s) y lo usa; si no
 * sigue, se cierra y se abre una sesión nueva como siempre. Nada cambia en el trámite: es el mismo
 * navegador, la misma página y el mismo usuario, sólo que no se tira entre dos usos seguidos.
 *
 * LO QUE ESTE MÓDULO GARANTIZA
 *
 *  - UNA SOLA POR TENANT, y nunca dos navegadores del mismo usuario de AFIP a la vez. Quien la pide
 *    (`tomarSesionTibia`) se la LLEVA: sale del mapa antes de devolverla, así que no hay forma de que
 *    dos corridas la compartan. Y cualquier camino que abra una sesión nueva (`abrirSesionArca`)
 *    cierra primero la tibia de ese tenant (`cerrarSesionTibia`): las corridas de altas, nombres y
 *    catálogo no saben de esto y siguen abriendo la suya, pero nunca al lado de una ociosa.
 *  - NO QUEDAN CHROMIUM HUÉRFANOS. Vence sola por inactividad y se cierra; dejar una segunda cierra
 *    la primera; el temporizador no retiene el proceso (`unref`). Al apagar el proceso por señal
 *    (SIGINT/SIGTERM/SIGHUP) los cierra Playwright, que registra esos handlers al lanzar el
 *    navegador. Lo único que esto no cubre es un SIGKILL o un OOM, que tampoco cubría el camino de
 *    antes en medio de una corrida.
 *  - SIEMPRE BAJO EL CANDADO. Se toma y se deja dentro de una corrida, que ya tiene `candadoArca`.
 *    Ociosa no la toca nadie: sólo el temporizador, para cerrarla.
 *
 * EN MEMORIA, como la corrida y el candado: un proceso, sin Redis. Si el proceso se reinicia, la
 * tibia se pierde y la corrida siguiente abre una nueva, que es lo que pasaba siempre.
 *
 * No importa Playwright ni `navegador.ts`: recibe la sesión como un objeto que se sabe cerrar. Por eso
 * se prueba sin navegador (`sesionTibia.test.ts`) y `navegador.ts` puede importarlo sin ciclo.
 */

/** Lo mínimo que hace falta para guardarla y cerrarla. La `SesionArca` de `navegador.ts` lo cumple. */
export interface SesionCerrable {
  browser: { close(): Promise<unknown> };
}

interface Tibia {
  sesion: SesionCerrable;
  vence: ReturnType<typeof setTimeout>;
  desde: number;
}

const tibias = new Map<string, Tibia>();

/** Cuánto se mantiene, si nadie dice otra cosa. Menos que la inactividad con la que AFIP corta la sesión. */
export const MINUTOS_TIBIA_DEFAULT = 10;

/**
 * Los milisegundos que una sesión se mantiene tibia. `ARCA_SESION_TIBIA_MIN=0` lo apaga: cada corrida
 * abre y cierra su navegador, como antes. Un valor que no es un número cae al default.
 */
export function msSesionTibia(valor: string | undefined = process.env.ARCA_SESION_TIBIA_MIN): number {
  const crudo = String(valor ?? "").trim();
  const min = crudo === "" ? MINUTOS_TIBIA_DEFAULT : Number(crudo);
  return Number.isFinite(min) && min >= 0 ? Math.round(min * 60_000) : MINUTOS_TIBIA_DEFAULT * 60_000;
}

const cerrar = async (s: SesionCerrable | undefined | null): Promise<void> => {
  // Que falle el cierre (el navegador ya murió) no es un error de nadie: no hay nada que cerrar.
  await s?.browser.close().catch(() => {});
};

/** ¿Hay una sesión tibia de este tenant? Sólo para mostrar/medir: no la reserva. */
export const hayTibia = (tenantId: string): boolean => tibias.has(tenantId);

/**
 * Deja la sesión para la corrida siguiente. Devuelve `false` si NO la guardó (está apagado), y en
 * ese caso quien llama tiene que cerrarla, como siempre.
 *
 * Sólo se deja una sesión SANA: quien llama no la deja si la corrida terminó con error, sin sesión o
 * cortada a mano (puede haber quedado a mitad de un bloque).
 */
export function dejarSesionTibia(tenantId: string, sesion: SesionCerrable, ms: number = msSesionTibia()): boolean {
  if (!(ms > 0)) return false;
  // Si ya había una (no debería: quien corre se la lleva), se cierra: nunca dos del mismo tenant.
  const previa = tibias.get(tenantId);
  if (previa) {
    clearTimeout(previa.vence);
    if (previa.sesion !== sesion) void cerrar(previa.sesion);
  }
  const vence = setTimeout(() => {
    // Sólo cierra si sigue siendo ESTA: una corrida pudo llevársela y dejar otra después.
    if (tibias.get(tenantId)?.sesion === sesion) {
      tibias.delete(tenantId);
      void cerrar(sesion);
    }
  }, ms);
  // El temporizador no tiene que impedir que el proceso termine.
  vence.unref?.();
  tibias.set(tenantId, { sesion, vence, desde: Date.now() });
  return true;
}

/**
 * Se lleva la sesión tibia del tenant, si hay y sigue sirviendo.
 *
 * Sale del mapa ANTES de revalidar: mientras se revalida ya es de quien la pidió, y nadie más puede
 * tomarla ni el temporizador cerrarla. `revalidar` es quien pregunta a ARCA si la sesión sigue adentro
 * del servicio (ver `revalidarSesionArca`); si dice que no —o tira—, se cierra y se devuelve `null`,
 * y quien llama abre una nueva por el camino de siempre.
 */
export async function tomarSesionTibia<T extends SesionCerrable>(tenantId: string, revalidar: (sesion: T) => Promise<boolean>): Promise<T | null> {
  const t = tibias.get(tenantId);
  if (!t) return null;
  tibias.delete(tenantId);
  clearTimeout(t.vence);
  const sesion = t.sesion as T;
  let sirve = false;
  try {
    sirve = await revalidar(sesion);
  } catch {
    sirve = false;
  }
  if (!sirve) {
    await cerrar(sesion);
    return null;
  }
  return sesion;
}

/** Cierra la tibia de un tenant. Lo llama todo el que va a abrir una sesión nueva con ese usuario. */
export async function cerrarSesionTibia(tenantId: string): Promise<void> {
  const t = tibias.get(tenantId);
  if (!t) return;
  tibias.delete(tenantId);
  clearTimeout(t.vence);
  await cerrar(t.sesion);
}

/** Cierra todas. Para apagar el proceso con prolijidad y para los tests. */
export async function cerrarSesionesTibias(): Promise<void> {
  const todas = [...tibias.keys()];
  await Promise.all(todas.map((id) => cerrarSesionTibia(id)));
}
