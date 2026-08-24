import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Quién puede hablarle al Asistente.
 *
 * ⚠ ESTO NO ES UN DETALLE DE IMPLEMENTACIÓN.
 *
 * El Asistente es un proceso local que MANEJA UN NAVEGADOR con la sesión de ARCA de una empresa
 * real. Cualquier página web que el administrativo tenga abierta puede intentar hablarle: un banner
 * publicitario, una pestaña vieja, un mail con HTML. Sin las tres barreras de acá, «abrí WeProdu»
 * pasaría a significar «cualquier sitio puede manejar tu sesión de AFIP».
 *
 * Las tres, y por qué ninguna sobra:
 *
 *   1. ESCUCHA SOLO EN 127.0.0.1. Nadie de la red puede siquiera abrir la conexión. Esto no está acá
 *      sino en `servidor.mjs`, en el `listen`, pero es la primera de las tres.
 *
 *   2. CORS CON LISTA BLANCA. El navegador no le deja LEER la respuesta a un origen que no está en la
 *      lista. Ojo: el navegador igual MANDA la request si es simple, así que CORS solo no alcanza —
 *      protege la respuesta, no la ejecución.
 *
 *   3. TOKEN DE EMPAREJAMIENTO. Lo que de verdad autoriza. Se genera al arrancar, se muestra una vez,
 *      y va en `X-WeProdu-Token`. Sin token válido no se ejecuta NADA, ni siquiera con el origen
 *      correcto. Es también lo único que protege contra un cliente que no sea un navegador, donde
 *      CORS no existe.
 *
 * LO QUE ESTO NO RESUELVE, dicho para que sea una decisión y no un descuido: otro programa que ya
 * corra en la misma máquina con el mismo usuario puede leer el archivo del token y usar el Asistente.
 * Es inherente a cualquier agente local —el sistema operativo no separa procesos del mismo usuario— y
 * el techo real de esta defensa es «una web cualquiera no», no «nadie». Por eso el Asistente no pide
 * ni guarda la clave fiscal, y por eso no expone ningún endpoint genérico que ejecute comandos: si
 * algo local se lo apropia, lo peor que puede hacer es leer obras sociales en ARCA.
 */

/** Carpeta de datos del Asistente. Fuera del repo y fuera del perfil de Chrome personal. */
export const CARPETA_DATOS = join(homedir(), ".weprodu-arca");
const ARCHIVO_TOKEN = join(CARPETA_DATOS, "token");

/**
 * Los orígenes de WeProdu que pueden hablarle.
 *
 * Se pueden sumar con `WEPRODU_ORIGENES` (separados por coma) para una instalación con otro dominio.
 * No hay comodines a propósito: `*.autolab.fun` dejaría entrar a cualquier subdominio, y basta uno
 * tomado —o un sitio de staging olvidado— para que la lista deje de significar algo.
 */
export const ORIGENES_PERMITIDOS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://autolab.fun",
  "https://www.autolab.fun",
  ...String(process.env.WEPRODU_ORIGENES || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
];

export const origenPermitido = (origen) => Boolean(origen) && ORIGENES_PERMITIDOS.includes(origen);

/**
 * El token de esta instalación. Se genera una vez y se reusa: si cambiara en cada arranque, el
 * administrativo tendría que volver a emparejar cada vez que reinicia la máquina.
 *
 * 32 bytes al azar de `randomBytes`, que es el generador criptográfico del sistema. `Math.random()`
 * acá sería un token adivinable, que es lo mismo que no tener token.
 */
export function tokenDeInstalacion() {
  mkdirSync(CARPETA_DATOS, { recursive: true });
  if (existsSync(ARCHIVO_TOKEN)) {
    const guardado = readFileSync(ARCHIVO_TOKEN, "utf8").trim();
    if (guardado.length >= 32) return guardado;
  }
  const nuevo = randomBytes(32).toString("hex");
  writeFileSync(ARCHIVO_TOKEN, nuevo, "utf8");
  // Solo el dueño puede leerlo. En Windows no hace nada —el modelo de permisos es otro— y no se
  // trata como error: la barrera que cuenta ahí es que el archivo esté en el perfil del usuario.
  try {
    chmodSync(ARCHIVO_TOKEN, 0o600);
  } catch {
    /* sin permisos POSIX */
  }
  return nuevo;
}

/**
 * Compara en tiempo CONSTANTE.
 *
 * Un `===` sobre strings corta en el primer carácter distinto, y esa diferencia de microsegundos
 * alcanza para adivinar el token de a un carácter por vez. Contra un servicio local —donde se pueden
 * hacer miles de intentos por segundo sin red de por medio— no es un ataque teórico.
 */
export function tokenValido(recibido, esperado) {
  const a = Buffer.from(String(recibido || ""), "utf8");
  const b = Buffer.from(String(esperado || ""), "utf8");
  // `timingSafeEqual` explota si los largos difieren, y el largo en sí no es un secreto.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
