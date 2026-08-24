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
    const res = await fetch(`${CDP_URL}/json/list`, { signal: AbortSignal.timeout(1500) });
    const pestañas = await res.json();
    const urls = (Array.isArray(pestañas) ? pestañas : []).map((p) => String(p.url || ""));
    if (urls.some((u) => /serviciossegsoc\.afip\.gob\.ar/i.test(u))) return "viva";
    return "sin-sesion";
  } catch {
    return "desconocida";
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
  if (await chromeAbierto()) return { yaEstaba: true };

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
