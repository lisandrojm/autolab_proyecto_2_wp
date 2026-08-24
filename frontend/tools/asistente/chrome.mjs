import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CARPETA_DATOS } from "./seguridad.mjs";

/**
 * El Chrome de ARCA: perfil propio, puerto de depuración, y lo abre el Asistente.
 *
 * Abrir el navegador a mano con flags era el paso más confuso de todo el circuito para alguien que no
 * programa —hay que cerrar el Chrome de siempre, pegar una línea con dos guiones dobles, y si algo
 * sale mal no hay forma de saber qué—. Acá es un botón.
 *
 * El PERFIL DEDICADO no es comodidad, es contención: mientras esta ventana está abierta, cualquier
 * programa de la máquina puede manejarla por el puerto de depuración. Con un perfil aparte, lo único
 * que hay adentro es la sesión de ARCA; con el perfil de todos los días habría además el mail, el
 * banco y todas las pestañas. Y como el perfil persiste, la sesión de ARCA dura días.
 */

const PERFIL = join(CARPETA_DATOS, "chrome-profile");
const ARCHIVO_RUTA = join(CARPETA_DATOS, "chrome-path");
export const PUERTO_CDP = 9222;
export const CDP_URL = `http://127.0.0.1:${PUERTO_CDP}`;

/** El portal de clave fiscal. Se abre, no se completa: la clave la pone la persona. */
const INICIO = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";

/** Dónde vive Chrome en cada sistema. El primero que exista gana. */
const CANDIDATOS = {
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  win32: [
    join(process.env["PROGRAMFILES"] || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env["LOCALAPPDATA"] || "", "Google", "Chrome", "Application", "chrome.exe"),
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"],
};

/**
 * El binario de Chrome. Si no está en las rutas típicas, se usa la que el usuario indicó una vez.
 *
 * Se guarda para no volver a preguntar: quien tiene Chrome en una ruta rara la tiene siempre, y
 * pedírsela en cada arranque convierte una molestia de una vez en una de todos los días.
 */
export function rutaChrome() {
  const guardada = existsSync(ARCHIVO_RUTA) ? readFileSync(ARCHIVO_RUTA, "utf8").trim() : "";
  if (guardada && existsSync(guardada)) return guardada;
  return (CANDIDATOS[process.platform] || CANDIDATOS.linux).find((p) => p && existsSync(p)) || "";
}

export function guardarRutaChrome(ruta) {
  if (!ruta || !existsSync(ruta)) throw new Error(`No existe ningún archivo en «${ruta}».`);
  mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO_RUTA, ruta, "utf8");
  return ruta;
}

/**
 * ¿Ya hay un Chrome escuchando en el puerto de depuración?
 *
 * Se pregunta al propio Chrome en vez de recordar si lo abrimos nosotros: el administrativo puede
 * haberlo cerrado, o el Asistente puede haberse reiniciado con el navegador abierto. Lo que importa
 * es el estado real, no lo que este proceso cree recordar.
 */
export async function chromeAbierto() {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(1200) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Qué páginas de ARCA hay abiertas, para saber si la sesión de trabajo está viva.
 *
 * "Viva" quiere decir que hay una pestaña parada en Simplificación Registral. No se puede afirmar más
 * que eso desde afuera —la sesión del servicio vence sola y ARCA no lo dice hasta que se le pide algo—
 * y por eso el tercer estado es `desconocida` y no un optimista `viva`.
 */
export async function estadoSesionArca() {
  if (!(await chromeAbierto())) return "desconocida";
  try {
    const urls = (await pestañas()).map((p) => String(p.url || ""));
    if (urls.some((u) => /serviciossegsoc\.afip\.gob\.ar/i.test(u))) return "viva";
    return "sin-sesion";
  } catch {
    return "desconocida";
  }
}

/**
 * ¿Hay una pestaña parada en «Registrar Nuevas Altas»?
 *
 * ES INFORMATIVO Y NO BLOQUEA NADA. Se agregó por un cuelgue muy concreto: con la sesión de ARCA
 * abierta pero en la pantalla de datos del empleador, la app decía «Listo para validar», la corrida
 * arrancaba, y el motor se quedaba HASTA CINCO MINUTOS esperando en silencio a que apareciera la
 * pantalla correcta. Veinte filas «en cola» y nada moviéndose.
 *
 * Se mira la URL y no el DOM porque desde acá solo hay `/json/list`. Por eso mismo no gatea el botón:
 * si ARCA renombra la pantalla, una heurística de URL equivocada dejaría a alguien sin poder validar
 * nada. Acá lo peor que puede pasar es que no se muestre una ayuda; el que decide de verdad es
 * `estadoPantalla` del motor, que busca el campo de CUIL en la página real.
 */
export async function enPantallaDeAltas() {
  try {
    return (await pestañas()).some((p) => /Altas\.aspx/i.test(String(p.url || "")));
  } catch {
    return false;
  }
}

/**
 * Trae al frente la ventana de ARCA que ya está abierta.
 *
 * POR QUÉ HACE FALTA UN ENDPOINT PARA ESTO
 *
 * El estado más frecuente no es «falta abrir Chrome» sino «Chrome está abierto y falta loguearse»,
 * y ahí la ventana suele estar detrás de todo. Sin esto, la única acción posible era un botón que
 * decía «Ya está abierto» — una respuesta, no una acción. La persona sabe QUÉ le falta y no tiene
 * cómo llegar; el navegador no se puede enfocar desde una página web.
 *
 * Se hace en dos pasos y los dos importan: `Page.bringToFront` por CDP levanta la VENTANA, y
 * `Target.activateTarget` elige la PESTAÑA correcta dentro de ella. Traer al frente una ventana
 * parada en otra pestaña deja a la persona igual de perdida.
 *
 * Se prefiere una pestaña de AFIP si hay alguna; si no, la primera que haya. Ante cualquier fallo se
 * devuelve `{ enfocada: false }` en vez de tirar: no poder enfocar es una molestia, no un error que
 * justifique una pantalla roja — la ventana existe y la persona puede ir a mano.
 */
/**
 * Las pestañas reales del Chrome de ARCA.
 *
 * Se filtra por `type === "page"`: `/json/list` también devuelve service workers y extensiones, que
 * no son ventanas y no se pueden enfocar ni mostrar.
 */
async function pestañas() {
  try {
    const res = await fetch(`${CDP_URL}/json/list`, { signal: AbortSignal.timeout(1500) });
    const lista = await res.json();
    return (Array.isArray(lista) ? lista : []).filter((p) => p.type === "page");
  } catch {
    return [];
  }
}

export async function enfocarChrome() {
  if (!(await chromeAbierto())) return { enfocada: false, motivo: "chrome_cerrado" };
  try {
    const abiertas = await pestañas();
    const elegida = abiertas.find((p) => /afip\.gob\.ar/i.test(String(p.url || ""))) || abiertas[0];
    if (!elegida) return { enfocada: false, motivo: "sin_pestanas" };

    // Paso 1, universal y sin dependencias: elegir la PESTAÑA. `/json/activate/<id>` es el atajo HTTP
    // de `Target.activateTarget`, así que no hace falta abrir un websocket — que además no se podría:
    // el binario corre sobre Node 18, donde `WebSocket` global todavía no existe.
    await fetch(`${CDP_URL}/json/activate/${elegida.id}`, { signal: AbortSignal.timeout(1500) });

    // Paso 2: levantar la VENTANA por encima del resto de las aplicaciones. Eso ya no es CDP —Chrome
    // no expone nada que suba su propia ventana en el escritorio— así que lo hace el sistema.
    return { enfocada: await levantarVentana(elegida.url), url: elegida.url };
  } catch {
    return { enfocada: false, motivo: "error" };
  }
}

/**
 * Sube la ventana de Chrome por encima de las demás aplicaciones.
 *
 * En macOS `open -a` activa la app y listo. En Windows y Linux se relanza el binario contra el MISMO
 * `--user-data-dir`: Chrome es de instancia única, así que el segundo proceso le pasa el pedido al
 * que ya corre y ese levanta la ventana. Va con la URL de la pestaña elegida —y no vacío— porque sin
 * URL Chrome abre una pestaña nueva en blanco y tapa justo la que se quería mostrar.
 *
 * Lo que esto NO garantiza, dicho para que sea una decisión: Chrome puede terminar abriendo una
 * segunda pestaña en la misma dirección en vez de reusar la que ya estaba. Dos pestañas de ARCA es un
 * costo menor frente a que la persona no encuentre la ventana; y el texto de la pantalla igual dice
 * cuál es la ventana, así que el enfoque es una ayuda, nunca el único camino.
 *
 * Devuelve `false` en vez de tirar: no poder enfocar es una molestia, no un error. La ventana existe.
 */
async function levantarVentana(url) {
  const binario = rutaChrome();
  try {
    if (process.platform === "darwin") {
      // De ".../Google Chrome.app/Contents/MacOS/Google Chrome" al .app, que es lo que `open -a` toma.
      const app = binario.replace(/\.app\/Contents\/MacOS\/.*$/, ".app");
      if (!app.endsWith(".app")) return false;
      spawn("open", ["-a", app], { detached: true, stdio: "ignore" }).unref();
      return true;
    }
    if (!binario) return false;
    spawn(binario, [`--user-data-dir=${PERFIL}`, url], { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Abre el Chrome de ARCA. IDEMPOTENTE: si ya está, no abre otro.
 *
 * Abrir un segundo Chrome sobre el mismo `--user-data-dir` no levanta una instancia nueva: se lo pasa
 * a la que ya está, que ignora el `--remote-debugging-port`. El resultado sería una ventana más y
 * ningún puerto, con el Asistente informando que todo salió bien.
 */
export async function abrirChrome() {
  /*
    "El puerto contesta" no es lo mismo que "hay una ventana".

    Un Chrome al que le cerraron todas las ventanas sigue vivo y sigue atendiendo el puerto de
    depuración, pero con CERO pestañas. Ese estado era un callejón sin salida perfecto: `/estado`
    informaba `chromeAbierto: true`, la pantalla decía «está abierto, falta iniciar sesión», «Abrir
    ARCA» contestaba `yaEstaba: true` sin abrir nada, y «Ir a esa ventana» no encontraba ninguna
    ventana que traer al frente. Tres afirmaciones correctas por separado y ninguna salida.

    Con pestañas no hay nada que hacer; sin pestañas se relanza igual, y como Chrome es de instancia
    única el proceso que ya corre abre la ventana en vez de arrancar un segundo navegador.
  */
  if (await chromeAbierto()) {
    if ((await pestañas()).length > 0) return { yaEstaba: true };
    const binario = rutaChrome();
    if (binario) {
      spawn(binario, [`--user-data-dir=${PERFIL}`, INICIO], { detached: true, stdio: "ignore" }).unref();
      for (let i = 0; i < 20; i++) {
        if ((await pestañas()).length > 0) return { yaEstaba: true, ventanaRecuperada: true };
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    return { yaEstaba: true, sinVentana: true };
  }

  const binario = rutaChrome();
  if (!binario) {
    const e = new Error("No encontré Chrome en este sistema. Indicá dónde está instalado y lo guardo para la próxima.");
    e.codigo = "chrome_no_encontrado";
    throw e;
  }

  mkdirSync(PERFIL, { recursive: true });
  // `detached` + `unref`: si el Asistente se cierra, la sesión de ARCA recién abierta no se va con él.
  const hijo = spawn(binario, [`--user-data-dir=${PERFIL}`, `--remote-debugging-port=${PUERTO_CDP}`, "--no-first-run", "--no-default-browser-check", INICIO], { detached: true, stdio: "ignore" });
  hijo.unref();

  // Se espera a que el puerto conteste antes de decir que está: contestar enseguida haría que la
  // pantalla mostrara "conectado" y el primer intento de validar fallara sin motivo aparente.
  for (let i = 0; i < 40; i++) {
    if (await chromeAbierto()) return { yaEstaba: false };
    await new Promise((r) => setTimeout(r, 250));
  }
  const e = new Error("Abrí Chrome pero no respondió en el puerto de depuración. Cerralo del todo y probá de nuevo.");
  e.codigo = "chrome_sin_puerto";
  throw e;
}
