// Caché en memoria (por sesión) para datos de referencia estables y compartidos
// entre páginas (áreas, cargos, niveles, turnos, clientes, proyectos, tipos de info,
// roleFrames, etc.). Evita re-consultar al server los mismos datos pesados cada vez
// que se abre una página. Se invalida por TTL o manualmente.

type Entry = { at: number; data: unknown; inflight?: Promise<unknown> };

const store = new Map<string, Entry>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Devuelve el valor cacheado si está fresco; si no, ejecuta `fn`, lo cachea y lo devuelve.
 * Deduplica llamadas concurrentes con la misma `key` (comparten la misma promesa en vuelo),
 * así montar la misma página dos veces rápido no dispara la consulta dos veces.
 */
export async function cachedFetch<T>(key: string, fn: () => Promise<T>, ttl = DEFAULT_TTL_MS): Promise<T> {
  const hit = store.get(key);
  const now = nowMs();
  if (hit && now - hit.at < ttl && hit.data !== undefined) {
    return hit.data as T;
  }
  if (hit?.inflight) {
    return hit.inflight as Promise<T>;
  }
  const inflight = fn()
    .then((data) => {
      store.set(key, { at: nowMs(), data });
      return data;
    })
    .catch((err) => {
      // No cachear el error; permitir reintento en la próxima llamada.
      store.delete(key);
      throw err;
    });
  store.set(key, { at: now, data: hit?.data, inflight });
  return inflight as Promise<T>;
}

/** Invalida una clave, un prefijo (si termina en ':') o todo el caché si no se pasa nada. */
export function invalidateRefCache(keyOrPrefix?: string): void {
  if (!keyOrPrefix) {
    store.clear();
    return;
  }
  if (keyOrPrefix.endsWith(":")) {
    for (const k of Array.from(store.keys())) {
      if (k.startsWith(keyOrPrefix)) store.delete(k);
    }
    return;
  }
  store.delete(keyOrPrefix);
}

function nowMs(): number {
  return new Date().getTime();
}
