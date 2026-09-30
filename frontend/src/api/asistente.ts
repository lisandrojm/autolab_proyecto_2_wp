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
  /**
   * Lo que ESE Asistente sabe hacer.
   *
   * WeProdu se actualiza solo; el Asistente no —vive instalado en la máquina de cada persona— así
   * que la app siempre puede ser más nueva que él. `undefined` significa «Asistente anterior a que
   * esto existiera»: hay que asumir que no tiene nada nuevo.
   */
  operaciones?: string[];
  chromeAbierto: boolean;
  /** `viva` = hay una pestaña en Simplificación Registral. `desconocida` = ni siquiera hay Chrome. */
  sesionArca: 'viva' | 'sin-sesion' | 'desconocida';
  /**
   * ¿Hay una pestaña en «Registrar Nuevas Altas»? INFORMATIVO: no gatea ningún botón.
   *
   * `undefined` en Asistentes anteriores a la v1.1.0 — y también cuando no se pudo mirar. En los dos
   * casos se calla: una ayuda que no se puede afirmar no se muestra.
   */
  pantallaAltas?: boolean;
  /**
   * Si el Asistente puede arrancar solo al prender la computadora, y si está activado.
   *
   * `undefined` en Asistentes anteriores a la v1.7.0. `soportado: false` cuando el sistema no lo
   * admite (Linux) o cuando se está corriendo con `node servidor.mjs` en vez del ejecutable.
   */
  inicioAutomatico?: { soportado: boolean; activo: boolean };
  chromeEncontrado: boolean;
  corriendo: boolean;
}

/** Por qué no se pudo hablar con el Asistente. Cada uno lleva a una pantalla distinta. */
export type FalloAsistente =
  /** No contesta: no está instalado, o no está corriendo. */
  | 'no-detectado'
  /** Contesta, pero este navegador no está emparejado. */
  | 'sin-emparejar'
  /**
   * Contesta y está emparejado, pero no conoce esa operación: es de una versión anterior.
   *
   * Se distingue de un error común porque la salida es otra —descargar el Asistente nuevo— y porque
   * el mensaje crudo no le dice nada a nadie: un 404 se leía en pantalla como «No existe esa
   * operación», que es una frase sobre HTTP dicha a alguien que quería ver su ventana de ARCA.
   */
  | 'operacion-desconocida';

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
  if (res.status === 404) throw new ErrorAsistente('operacion-desconocida', 'El Asistente que tenés instalado es de una versión anterior y no sabe hacer esto. Descargalo de nuevo y volvé a ejecutarlo.');
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((cuerpo as { error?: string })?.error || `El Asistente respondió ${res.status}.`);
  return cuerpo as T;
}

/** Un evento del progreso de una corrida. Llega por el stream de `/progreso`. */
export type EventoProgreso =
  /** Arrancó: se está enganchando al Chrome de ARCA. Antes esto era silencio. */
  | { tipo: 'conectando' }
  /**
   * Está esperando a la PERSONA, no a ARCA.
   *
   * El motor aguanta hasta 5 minutos a que aparezca la pantalla de altas. Sin este evento, esa espera
   * se veía como un cuelgue: veinte filas «en cola» y ningún movimiento. Es lo contrario de un error
   * —hay algo concreto que hacer y el trabajo sigue después— así que se muestra como instrucción.
   */
  | { tipo: 'esperando'; que: 'pantalla-altas'; restanMs: number }
  /** Enganchado al Chrome. Parte en dos el tramo ciego: antes es conexión, después es la pantalla. */
  | { tipo: 'conectado' }
  | { tipo: 'listo' }
  | { tipo: 'consultando'; cuil: string }
  | { tipo: 'resultado'; cuil: string; rnos: string; hechas: number; total: number }
  /**
   * ARCA no abrió el bloque para ese CUIL. Es un error DE ESA PERSONA, no de la corrida.
   *
   * Distinto de un `resultado` con `rnos` vacío, que es una respuesta: «no tiene obra social
   * declarada». Las dos cosas se veían casi igual en la tabla y son opuestas — una hay que
   * resolverla, la otra ya está resuelta.
   */
  | { tipo: 'error'; cuil: string; motivo?: string; hechas: number; total: number }
  /**
   * Terminó. OJO: `faltaron > 0` NO es un final exitoso.
   *
   * `motivo` viene del Asistente y nunca está vacío cuando faltaron personas — aunque sea para decir
   * que ni él sabe por qué. Es lo que impide que un fracaso se renderice como silencio, que es como
   * se veía antes: filas «en cola» para siempre y ningún cartel.
   */
  | { tipo: 'fin'; items: Array<{ cuil: string; rnos: string }>; errores: string[]; sinSesion: boolean; faltaron: number; motivo?: string }
  | { tipo: 'fallo'; mensaje: string }
  | { tipo: 'cerrado' };

/**
 * ¿Este Asistente sabe hacer esta operación?
 *
 * Se pregunta ANTES de ofrecer el botón, no después de que falle. Un botón que existe y devuelve un
 * error es peor que un botón que no está: promete algo, se aprieta, y lo que vuelve es un cartel
 * rojo que no explica qué hacer.
 */
export const asistentePuede = (estado: EstadoAsistente | null, operacion: string): boolean => !!estado?.operaciones?.includes(operacion);

export const asistenteAPI = {
  estado: () => pedir<EstadoAsistente>('/estado'),

  /** Abre el Chrome de ARCA. Idempotente: si ya está, devuelve `yaEstaba`. */
  abrirChrome: () => pedir<EstadoAsistente & { yaEstaba: boolean }>('/chrome', { method: 'POST' }),

  /**
   * Trae al frente la ventana de ARCA que ya está abierta.
   *
   * Es la acción del estado más frecuente —«Chrome abierto, falta iniciar sesión»—, donde antes solo
   * había un botón que decía «Ya está abierto»: una respuesta a una pregunta que nadie hizo. Una
   * página web no puede enfocar una ventana del sistema, así que sin este endpoint ese estado se
   * quedaba sin ninguna acción posible.
   *
   * `enfocada: false` significa que no se pudo levantar la ventana, no que algo se rompió: la ventana
   * sigue existiendo y la persona puede ir a mano. La pantalla dice cuál es igual.
   */
  enfocarChrome: () => pedir<EstadoAsistente & { enfocada: boolean }>('/chrome/focus', { method: 'POST' }),

  /**
   * Registra (o saca) el Asistente del arranque de la computadora.
   *
   * Existe porque la ventana de Terminal ES el programa: cerrarla lo apaga, y había que dejarla
   * abierta todo el día. Registrado en el inicio de sesión no hay ventana ni hay que acordarse.
   *
   * Se pide desde acá y el Asistente nunca lo hace solo: meterse en el arranque de la máquina de
   * alguien sin preguntar es lo que hace que después no se quiera instalar nada.
   */
  inicioAutomatico: (activar: boolean) => pedir<EstadoAsistente & { activo: boolean }>('/inicio-automatico', { method: 'POST', body: JSON.stringify({ activar }) }),

  /**
   * Arranca la corrida. Vuelve enseguida: lo que tarda se sigue por `progreso()`.
   *
   * `empresaCuit` es lo que le deja al Asistente ELEGIR SOLO la empleadora en ARCA y navegar hasta la
   * pantalla de altas. Sin él igual funciona: espera a que la persona lo haga a mano, como antes. Y
   * es exacto por los once dígitos a propósito — con una coincidencia dudosa el Asistente no elige
   * nada, porque correr contra la empleadora equivocada guarda datos que parecen bien y están mal.
   */
  validar: (personas: Array<{ cuil: string }>, empresaCuit = '') => pedir<{ arrancada: true; total: number }>('/validar', { method: 'POST', body: JSON.stringify({ personas, empresaCuit }) }),

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
 * Son ARCHIVOS de verdad en `public/asistente/descargas/`, no rutas de la SPA: los arma
 * `tools/asistente/empaquetar.mjs` y `vite.config.ts` / `vercel.json` se encargan de que ese prefijo
 * nunca caiga al `index.html`. Antes apuntaban a `/descargas/…`, que no existía en ningún lado y por
 * lo tanto devolvía el HTML de la app con status 200 — el navegador guardaba un «.exe» de 2 KB que
 * era una página web.
 *
 * El prefijo es `/asistente/descargas/` y no `/asistente/` porque `/asistente/emparejar` SÍ es una
 * ruta de la SPA: es donde aterriza el navegador que abre el Asistente. La regla de «esto es un
 * archivo, si falta es 404» engloba todo lo que cuelga del prefijo, así que compartirlo dejaba rota
 * una de las dos cosas.
 *
 * Mac va en .zip y separado por arquitectura, y las dos cosas son por el mismo motivo: un binario
 * suelto pierde el permiso de ejecución al bajarse, y un slice de la arquitectura equivocada arranca
 * con «bad CPU type». Ver el comentario largo en `empaquetar.mjs` (ahí está también por qué no se
 * puede unificar con `lipo`).
 */
export const DESCARGAS_ASISTENTE = {
  windows: '/asistente/descargas/AsistenteWeProdu-windows.exe',
  macAppleSilicon: '/asistente/descargas/AsistenteWeProdu-mac-apple-silicon.zip',
  macIntel: '/asistente/descargas/AsistenteWeProdu-mac-intel.zip',
  guia: '/arca/guia-obras-sociales',
};

/** Qué versión hay publicada. La escribe `empaquetar.mjs`; ver `versionPublicada()`. */
const VERSION_PUBLICADA_URL = '/asistente/descargas/version.json';

/** Qué build le corresponde a esta máquina. `desconocido` = no se pudo averiguar. */
export type SistemaProbable = 'windows' | 'mac-arm' | 'mac-intel' | 'desconocido';

/**
 * Qué versión del Asistente hay que ofrecerle a quien está mirando la pantalla.
 *
 * Existe para no hacer una pregunta que la persona no puede contestar. Elegir mal entre las dos Macs
 * no da un error entendible: da «bad CPU type in executable», y ahí la instalación se abandona.
 *
 * LA REGLA DE DESEMPATE ES ASIMÉTRICA, y es lo importante de esta función: ante cualquier duda en
 * Mac se devuelve `mac-intel`. El build de Intel corre en las dos —Rosetta lo traduce— y el de Apple
 * Silicon NO puede correr en una Intel. Equivocarse hacia Intel cuesta a lo sumo un prompt de
 * Rosetta; equivocarse hacia arm64 deja a alguien sin poder instalar nada.
 *
 * Por eso mismo un Chrome corriendo bajo Rosetta en una Mac con chip Apple —que reporta `x86`— es un
 * falso positivo benigno: se le ofrece el de Intel y le funciona.
 *
 * `getHighEntropyValues` es de Chromium y hace falta para saber la arquitectura; en Safari o Firefox
 * no existe y solo se puede saber el sistema. No pasa nada: la asimetría de arriba cubre ese caso.
 */
export async function sistemaProbable(): Promise<SistemaProbable> {
  const uaData = (navigator as any).userAgentData;
  const plataforma = String(uaData?.platform || navigator.platform || '').toLowerCase();

  if (plataforma.includes('win')) return 'windows';
  if (!plataforma.includes('mac')) return 'desconocido';

  try {
    const { architecture } = await uaData.getHighEntropyValues(['architecture']);
    return architecture === 'arm' ? 'mac-arm' : 'mac-intel';
  } catch {
    return 'mac-intel';
  }
}

/**
 * La versión del Asistente que está publicada hoy.
 *
 * La escribe `tools/asistente/empaquetar.mjs` en el mismo paso que copia los binarios, así que no se
 * puede desincronizar de lo que hay para descargar.
 *
 * DEVUELVE `''` ANTE CUALQUIER PROBLEMA, y eso es deliberado: un aviso de «hay una versión nueva»
 * disparado por un error de red o por un deploy a medias es peor que no avisar. Manda a actualizar
 * algo que quizá ya está actualizado, y la persona pierde el rato bajando 39 MB por nada.
 *
 * `no-store` porque es justamente el archivo cuyo valor cambia cuando se publica: servido desde caché
 * diría que no hay nada nuevo el día que lo hay.
 */
export async function versionPublicada(): Promise<string> {
  try {
    const r = await fetch(VERSION_PUBLICADA_URL, { cache: 'no-store' });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return '';
    const { version } = (await r.json()) as { version?: string };
    return typeof version === 'string' ? version : '';
  } catch {
    return '';
  }
}

/**
 * ¿`a` es una versión posterior a `b`?
 *
 * Compara SEGMENTO A SEGMENTO y no como texto: `'1.10.0' > '1.9.0'` es falso comparando strings —el
 * `1` de `10` pierde contra el `9`— y el aviso desaparecería justo al pasar de la 9 a la 10.
 *
 * Estrictamente posterior: si la instalada es más nueva que la publicada (alguien probando un build
 * local) no hay nada que avisar, y mandarlo a «actualizar» hacia atrás sería un consejo malo.
 */
export function esPosterior(a: string, b: string): boolean {
  const partes = (v: string) => String(v || '').split('.').map((n) => parseInt(n, 10) || 0);
  const [x, y] = [partes(a), partes(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

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
