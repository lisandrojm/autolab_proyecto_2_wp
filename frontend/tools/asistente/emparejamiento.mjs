/**
 * Cómo el navegador se entera del código, sin que nadie copie nada.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * WeProdu decía «la ventana del Asistente muestra un código». No hay ventana: esto es un ejecutable
 * de consola. Y los seis endpoints piden token, así que tampoco había forma de pedírselo desde la
 * app. Para alguien que no abre terminales, eso era un callejón sin salida — el producto tenía un
 * paso que era literalmente imposible de completar.
 *
 * LA SALIDA
 *
 * Al arrancar, el Asistente abre el navegador de siempre en:
 *
 *     https://…/asistente/emparejar#token=XXXX
 *
 * En el FRAGMENTO, no en la query. El fragmento no viaja al servidor: se queda del lado del
 * navegador. Con `?token=` el código quedaría en los logs de acceso de Vercel, en el Referer de todo
 * lo que la página cargue después, y en cualquier proxy del camino. Es el mismo token que autoriza a
 * manejar la sesión de ARCA de una empresa: no puede salir de la máquina.
 *
 * LOS TRES RESPALDOS, en orden de qué tan roto esté el camino feliz:
 *
 *   1. `GET /emparejar` en el propio Asistente — la única ruta sin token. Muestra el código y nada
 *      más. Es la «ventana» que no existía.
 *   2. La consola, con marco. Para quien lo corre desde una terminal.
 *   3. `codigo-de-emparejamiento.txt` al lado del ejecutable, con su ruta dicha en la consola.
 *
 * NO MOLESTAR EN CADA ARRANQUE: ver `yaEmparejado`. La marca la escribe el servidor la primera vez
 * que llega un request con el token correcto, que es la única prueba real de que el emparejamiento
 * funcionó.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CARPETA_DATOS, ORIGENES_PERMITIDOS } from "./seguridad.mjs";
import { escribirAlLado } from "./diagnostico.mjs";

const ARCHIVO_URL = join(CARPETA_DATOS, "weprodu-url");
const ARCHIVO_MARCA = join(CARPETA_DATOS, "emparejado");

/**
 * Dónde vive WeProdu para ESTA instalación.
 *
 * Por defecto el dominio real, que es el caso de casi todo el mundo. Se cambia con `WEPRODU_URL` o
 * escribiendo la URL en `~/.weprodu-arca/weprodu-url` — que es lo que hace quien desarrolla contra
 * `localhost:5173`. No se adivina mirando qué puerto está abierto: abrir el navegador en la app
 * equivocada manda el token a un lugar que no lo esperaba.
 */
export function urlWeProdu() {
  const guardada = existsSync(ARCHIVO_URL) ? readFileSync(ARCHIVO_URL, "utf8").trim() : "";
  return (process.env.WEPRODU_URL || guardada || "https://autolab.fun").replace(/\/+$/, "");
}

/**
 * ¿La URL configurada es una de las que el Asistente atiende?
 *
 * Si no lo es, el emparejamiento «funciona» —la página guarda el token— y después todos los pedidos
 * mueren en un 403 de origen, que desde la app se ve como «el Asistente no responde». Vale más
 * avisarlo en el arranque, cuando todavía se puede corregir el archivo de config.
 */
export function origenAtendido(url) {
  try {
    return ORIGENES_PERMITIDOS.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

/** Ya hubo al menos un request autorizado con ESTE token: no hace falta volver a ofrecer nada. */
export const yaEmparejado = (token) => {
  try {
    return readFileSync(ARCHIVO_MARCA, "utf8").trim() === token;
  } catch {
    return false;
  }
};

export const marcarEmparejado = (token) => {
  try {
    writeFileSync(ARCHIVO_MARCA, token, "utf8");
  } catch {
    // Perder la marca solo cuesta una pestaña de más en el próximo arranque. No es motivo para
    // hacer fallar un request que el usuario ya autorizó correctamente.
  }
};

/**
 * El código, en un .txt al lado del ejecutable.
 *
 * Va al lado del ejecutable porque es donde el usuario lo va a buscar. Ver `escribirAlLado`: si esa
 * carpeta no deja escribir, cae a la de datos en vez de romper el arranque — el archivo es el tercer
 * respaldo del emparejamiento, no puede tumbar al primero.
 */
export function guardarCodigoEnArchivo(token) {
  return escribirAlLado("codigo-de-emparejamiento.txt", `${token}\n`);
}

/**
 * Abre la URL en el navegador POR DEFECTO del usuario.
 *
 * No en el Chrome de ARCA: ese tiene un perfil dedicado y sin sesión de WeProdu, así que el token
 * quedaría guardado en un navegador donde la app nunca se usa.
 *
 * Es best-effort a propósito. Si falla —no hay entorno gráfico, es un servidor, el sistema no tiene
 * navegador por defecto— se devuelve false y el arranque sigue con los tres respaldos. Que no se
 * pueda abrir una pestaña no puede impedir que el servicio levante.
 */
export function abrirNavegador(url) {
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    const p = spawn(cmd, args, { detached: true, stdio: "ignore" });
    p.on("error", () => {});
    p.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * La página local de emparejamiento: `GET /emparejar`, la única ruta sin token.
 *
 * SOLO EL CÓDIGO. Ni estado, ni botones que hagan algo, ni la ruta de Chrome, ni un enlace que
 * dispare una acción. Es la única puerta abierta del servicio y todo lo que se le agregue es
 * superficie que no pide autorización — la próxima persona que sume «un botoncito para abrir ARCA,
 * que total ya está la página» le estaría dando esa acción a cualquier cosa que corra en la máquina.
 *
 * Sin CSS externo ni fuentes remotas: se sirve desde 127.0.0.1 y tiene que verse igual sin internet.
 */
export function paginaEmparejar(token) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Código de emparejamiento · Asistente WeProdu</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#f6f7f9; color:#111827;
         font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  @media (prefers-color-scheme: dark) { body { background:#0b0f16; color:#e5e7eb; } .caja { background:#111827 !important; border-color:#1f2937 !important; } }
  .caja { background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:32px; max-width:560px; width:calc(100% - 32px); text-align:center; }
  h1 { font-size:15px; font-weight:600; margin:0 0 4px; }
  p  { font-size:13px; opacity:.7; margin:0 0 20px; }
  code { display:block; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:15px; line-height:1.6;
         word-break:break-all; background:rgba(127,127,127,.12); border-radius:10px; padding:16px; user-select:all; }
  button { margin-top:16px; font:inherit; font-size:13px; font-weight:600; padding:9px 18px; border-radius:10px;
           border:0; background:#2563eb; color:#fff; cursor:pointer; }
  button:hover { background:#1d4ed8; }
  small { display:block; margin-top:16px; font-size:11.5px; opacity:.55; }
</style>
</head>
<body>
  <div class="caja">
    <h1>Código de emparejamiento</h1>
    <p>Pegalo en WeProdu cuando te lo pida.</p>
    <code id="codigo">${token}</code>
    <button id="copiar" type="button">Copiar</button>
    <small>No lo compartas: con este código se puede manejar el Chrome de ARCA de esta máquina.</small>
  </div>
<script>
  var boton = document.getElementById("copiar");
  boton.addEventListener("click", function () {
    var texto = document.getElementById("codigo").textContent;
    // El portapapeles necesita contexto seguro y http://127.0.0.1 lo es, pero puede estar denegado
    // por política. El fallback importa: sin él el botón «no hace nada» y no hay otra salida.
    var listo = function () { boton.textContent = "Copiado"; setTimeout(function () { boton.textContent = "Copiar"; }, 1500); };
    if (navigator.clipboard) { navigator.clipboard.writeText(texto).then(listo, seleccionar); } else { seleccionar(); }
    function seleccionar() {
      var r = document.createRange();
      r.selectNodeContents(document.getElementById("codigo"));
      var s = getSelection(); s.removeAllRanges(); s.addRange(r);
      boton.textContent = "Copialo con Ctrl+C";
    }
  });
</script>
</body>
</html>`;
}

/** El cartel del arranque. Grande y con marco: es el segundo respaldo y tiene que saltar a la vista. */
export function banner({ version, token, url, archivo, abrio, atendido }) {
  const linea = "─".repeat(62);
  return `
  ╔${"═".repeat(62)}╗
  ║  Asistente WeProdu ${version}${" ".repeat(Math.max(0, 42 - version.length))}║
  ╚${"═".repeat(62)}╝

  Ya está funcionando. Dejá esta ventana abierta y volvé a WeProdu.

  (Si no querés dejarla abierta: en WeProdu, cuando diga «Listo para validar»,
   tocá «Que arranque solo». Después esta ventana se puede cerrar.)

  ${abrio ? `Te abrí WeProdu en el navegador para emparejarlo solo:\n\n      ${url}` : `Abrí WeProdu y, si te pide el código, entrá a:\n\n      http://127.0.0.1:47653/emparejar`}
${atendido ? "" : `\n  ⚠ ${url} no está entre los orígenes que este Asistente atiende.\n    Corregí la URL en ~/.weprodu-arca/weprodu-url o el emparejamiento no va a servir de nada.\n`}
  ${linea}

  CÓDIGO DE EMPAREJAMIENTO (por si tenés que pegarlo a mano):

      ${token}
${archivo ? `\n  También quedó guardado en:\n\n      ${archivo}\n` : ""}
  ${linea}

  No lo compartas: con ese código se puede manejar el Chrome de ARCA
  de esta máquina.
`;
}
