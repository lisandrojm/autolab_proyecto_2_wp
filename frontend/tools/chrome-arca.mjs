#!/usr/bin/env node
/**
 * Levanta un Chrome APARTE, con perfil propio y el puerto de depuración abierto.
 *
 * POR QUÉ UN PERFIL DEDICADO Y NO EL DE TODOS LOS DÍAS
 *
 * Antes el instructivo te hacía cerrar Chrome y reabrirlo con `--remote-debugging-port`. Dos
 * problemas: te obligaba a cortar lo que estuvieras haciendo, y —más grave— dejaba el puerto abierto
 * sobre TU perfil, con tu mail, tu banco y todas tus pestañas al alcance de cualquier programa local.
 *
 * Con `--user-data-dir` propio, el puerto solo alcanza a esta ventana. Lo único que vive acá adentro
 * es la sesión de ARCA. Tu Chrome de siempre sigue abierto y fuera del alcance.
 *
 * Y como el perfil es persistente, la sesión de ARCA sobrevive días: el login deja de ser "cada
 * corrida" y pasa a ser "cada tanto".
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PERFIL = join(RAIZ, ".chrome-arca");
const PUERTO = process.env.WEPRODU_CDP_PORT || "9222";
const INICIO = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";

/** Dónde vive Chrome en cada sistema. El primero que exista gana. */
const CANDIDATOS = {
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  win32: [
    `${process.env["PROGRAMFILES"] || "C:\\\\Program Files"}\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"] || "C:\\\\Program Files (x86)"}\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe`,
    `${process.env["LOCALAPPDATA"] || ""}\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe`,
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"],
};

const binario = (CANDIDATOS[process.platform] || CANDIDATOS.linux).find((p) => p && existsSync(p));
if (!binario) {
  console.error(
    `No encontré Chrome en este sistema (${process.platform}).\n\n` +
      "Abrilo a mano con el perfil dedicado:\n" +
      `  <ruta-a-chrome> --user-data-dir="${PERFIL}" --remote-debugging-port=${PUERTO} ${INICIO}\n`,
  );
  process.exit(1);
}

mkdirSync(PERFIL, { recursive: true });

console.log(
  `Abriendo Chrome con el perfil de ARCA…\n` +
    `  perfil: ${PERFIL}\n` +
    `  puerto: ${PUERTO}\n\n` +
    "Entrá con clave fiscal → Simplificación Registral - Empleadores → elegí el CUIT de la empleadora\n" +
    "→ Relaciones Laborales → Registrar Nuevas Altas, y dejá esa pantalla abierta.\n\n" +
    "Después, en otra terminal:\n" +
    "  npm run validar-obras-sociales -- --empresa <id>\n",
);

// `detached` + `unref`: la terminal queda libre y Chrome sigue vivo. Cerrar la terminal no puede
// llevarse puesta la sesión de ARCA que se acaba de abrir.
const hijo = spawn(binario, [`--user-data-dir=${PERFIL}`, `--remote-debugging-port=${PUERTO}`, "--no-first-run", "--no-default-browser-check", INICIO], {
  detached: true,
  stdio: "ignore",
});
hijo.unref();
