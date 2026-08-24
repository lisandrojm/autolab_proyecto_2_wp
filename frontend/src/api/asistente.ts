/**
 * Cliente del Asistente WeProdu: el servicio local que maneja el Chrome de ARCA.
 *
 * POR QUÉ NO PASA POR `axiosConfig`
 *
 * Todo lo demás de esta carpeta habla con la API de WeProdu: mismo `baseURL`, mismo JWT, mismos
 * interceptores —el que redirige al login cuando vuelve un 401, entre otros—. El Asistente es otra
 * cosa: corre en `127.0.0.1`, se autoriza con SU token de emparejamiento, y un 401 suyo significa
 * «falta emparejar este navegador», no «se venció tu sesión». Colgarlo del axios compartido haría que
 * un Asistente sin emparejar te expulse de WeProdu.
 *
 * QUÉ NO VIAJA POR ACÁ
 *
 * Ninguna credencial de WeProdu. El Asistente lee de ARCA y devuelve los códigos; quien los GUARDA es
 * esta app, con la sesión de quien está sentado adelante. Es a propósito: una credencial menos
 * viviendo en un servicio local es una credencial menos que robar.
 */

const BASE = 'http://127.0.0.1:47653';

/** Dónde queda el código de emparejamiento. Por navegador: es lo que el Asistente autoriza. */
const CLAVE_TOKEN = 'weprodu.asistente.token';

export const tokenAsistente = {
  leer: (): string => localStorage.getItem(CLAVE_TOKEN) || '',
  guardar: (t: string) => localStorage.setItem(CLAVE_TOKEN, t.trim()),
  borrar: () => localStorage.removeItem(CLAVE_TOKEN),
};

export interface EstadoAsistente {
  ok: true;
  version: string;
  chromeAbierto: boolean;
  /** `viva` = hay una pestaña en Simplificación Registral. `desconocida` = ni siquiera hay Chrome. */
  sesionArca: 'viva' | 'sin-sesion' | 'desconocida';
  chromeEncontrado: boolean;
  corriendo: boolean;
}

/** Por qué no se pudo hablar con el Asistente. Cada uno lleva a una pantalla distinta. */
export type FalloAsistente =
  /** No contesta: no está instalado, o no está corriendo. */
  | 'no-detectado'
  /** Contesta, pero este navegador no está emparejado. */
  | 'sin-emparejar';

export class ErrorAsistente extends Error {
  constructor(
    public motivo: FalloAsistente,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', 'X-WeProdu-Token': tokenAsistente.leer(), ...(opciones.headers || {}) },
      // Sin sesión ni cookies: el Asistente se autoriza SOLO con el token de emparejamiento.
      credentials: 'omit',
    });
  } catch {
    // Un `fetch` que ni siquiera conecta —o que CORS bloquea— llega acá indistinguible: para la
    // pantalla las dos cosas son «no lo tengo», que es la misma salida (descargar / ejecutar).
    throw new ErrorAsistente('no-detectado', 'No encontré el Asistente WeProdu en esta máquina.');
  }
  if (res.status === 401) throw new ErrorAsistente('sin-emparejar', 'Este navegador todavía no está emparejado con el Asistente.');
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((cuerpo as { error?: string })?.error || `El Asistente respondió ${res.status}.`);
  return cuerpo as T;
}

/** Un evento del progreso de una corrida. Llega por el stream de `/progreso`. */
export type EventoProgreso =
  | { tipo: 'consultando'; cuil: string }
  | { tipo: 'resultado'; cuil: string; rnos: string; hechas: number; total: number }
  | { tipo: 'error'; cuil: string; hechas: number; total: number }
  | { tipo: 'fin'; items: Array<{ cuil: string; rnos: string }>; errores: string[]; sinSesion: boolean; faltaron: number }
  | { tipo: 'fallo'; mensaje: string }
  | { tipo: 'cerrado' };

export const asistenteAPI = {
  estado: () => pedir<EstadoAsistente>('/estado'),

  /** Abre el Chrome de ARCA. Idempotente: si ya está, devuelve `yaEstaba`. */
  abrirChrome: () => pedir<EstadoAsistente & { yaEstaba: boolean }>('/chrome', { method: 'POST' }),

  /** Arranca la corrida. Vuelve enseguida: lo que tarda se sigue por `progreso()`. */
  validar: (personas: Array<{ cuil: string }>) => pedir<{ arrancada: true; total: number }>('/validar', { method: 'POST', body: JSON.stringify({ personas }) }),

  detener: () => pedir<{ detenida: boolean }>('/detener', { method: 'POST' }),

  /**
   * El stream de progreso.
   *
   * Se usa `fetch` con `ReadableStream` y NO `EventSource`, que sería lo obvio: `EventSource` no deja
   * mandar cabeceras, así que el token tendría que viajar en la query string — donde queda en los
   * logs y en el historial. El formato del otro lado sigue siendo SSE; lo único distinto es cómo se
   * lo lee.
   *
   * Devuelve una función para cortar.
   */
  progreso(alEvento: (e: EventoProgreso) => void): () => void {
    const control = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${BASE}/progreso`, { headers: { 'X-WeProdu-Token': tokenAsistente.leer() }, credentials: 'omit', signal: control.signal });
        if (!res.ok || !res.body) return;
        const lector = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Los eventos SSE se separan por línea en blanco. Se procesa lo completo y se guarda el
          // resto: un chunk puede cortar un evento al medio.
          const partes = buffer.split('\n\n');
          buffer = partes.pop() || '';
          for (const parte of partes) {
            const linea = parte.split('\n').find((l) => l.startsWith('data:'));
            if (!linea) continue; // un latido (`: latido`), que existe para que la conexión no muera
            try {
              alEvento(JSON.parse(linea.slice(5).trim()) as EventoProgreso);
            } catch {
              /* un evento ilegible no puede tumbar el stream entero */
            }
          }
        }
      } catch {
        /* abortado al cerrar la pantalla, o el Asistente se cayó: la pantalla ya lo refleja */
      }
    })();
    return () => control.abort();
  },
};

/** De dónde se bajan los ejecutables. Se sirven desde WeProdu para no depender de un tercero. */
/**
 * Los ejecutables, tal como quedan publicados.
 *
 * Son ARCHIVOS de verdad en `public/asistente/`, no rutas de la SPA: los arma
 * `tools/asistente/empaquetar.mjs` y `vite.config.ts` / `vercel.json` se encargan de que ese prefijo
 * nunca caiga al `index.html`. Antes apuntaban a `/descargas/…`, que no existía en ningún lado y por
 * lo tanto devolvía el HTML de la app con status 200 — el navegador guardaba un «.exe» de 2 KB que
 * era una página web.
 *
 * Mac va en .zip y separado por arquitectura, y las dos cosas son por el mismo motivo: un binario
 * suelto pierde el permiso de ejecución al bajarse, y un slice de la arquitectura equivocada arranca
 * con «bad CPU type». Ver el comentario largo en `empaquetar.mjs` (ahí está también por qué no se
 * puede unificar con `lipo`).
 */
export const DESCARGAS_ASISTENTE = {
  windows: '/asistente/AsistenteWeProdu-windows.exe',
  macAppleSilicon: '/asistente/AsistenteWeProdu-mac-apple-silicon.zip',
  macIntel: '/asistente/AsistenteWeProdu-mac-intel.zip',
  guia: '/arca/guia-obras-sociales',
};

/**
 * ¿El archivo está realmente publicado?
 *
 * Un HEAD antes de ofrecer el botón. Sin esto, «el ejecutable no se subió» y «el ejecutable anda» se
 * ven exactamente igual en pantalla: hay un botón azul, se clickea, y lo que baja es el index.html
 * renombrado — o no baja nada. El error se descubre en la máquina del que lo instala.
 *
 * Se mira el status Y el content-type. El status solo no alcanza: cualquier fallback de SPA contesta
 * 200 con HTML, y ese es justamente el caso que hay que atrapar. `vite.config.ts` y `vercel.json` ya
 * cortan ese fallback para `/asistente/`, así que esto es el segundo cinturón: si alguien agrega un
 * rewrite nuevo arriba, o publica en una plataforma distinta, la UI se entera igual.
 *
 * Ante un error de red devuelve `false`: preferimos decir «todavía no está publicado» y quedar cortos
 * antes que ofrecer una descarga que no sabemos si existe.
 */
export async function descargaDisponible(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return false;
    return !(r.headers.get('content-type') || '').includes('text/html');
  } catch {
    return false;
  }
}
