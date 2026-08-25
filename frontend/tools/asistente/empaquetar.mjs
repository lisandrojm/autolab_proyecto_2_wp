/**
 * Arma los ejecutables del Asistente, uno por sistema.
 *
 *   npm run empaquetar
 *
 * POR QUÉ HAY DOS PASOS Y NO UNO
 *
 * `pkg` no soporta ESM. Su bootstrap arranca el entry con `require()`, así que apuntarlo directo a
 * `servidor.mjs` produce tres binarios de 40 MB que se compilan sin error, se ven perfectos en el
 * disco... y al ejecutarlos tiran `ERR_REQUIRE_ESM` y se cierran. Ese es el modo de falla caro: el
 * build "funciona", el archivo existe, la descarga anda, y el problema recién aparece en la máquina
 * del que lo bajó. Por eso primero se bundlea todo a UN archivo CommonJS con esbuild y recién eso
 * entra a `pkg`.
 *
 * Los dos parches sobre el bundle:
 *
 *   import.meta.url  no existe en CJS. esbuild lo reemplaza por `{}` con un warning, y `VERSION`
 *                    —que sale de leer el package.json de al lado— explota. Se define a mano.
 *
 *   __VERSION__      el servidor la leía del package.json de al lado. Adentro del snapshot ese
 *                    archivo no está y el binario moría al arrancar. Se incrusta acá.
 *
 *   auto-arranque    NO se parcha: se RECHAZA. Ver la guarda de abajo.
 *
 *   playwright-core  se importa con `await import()` dinámico. `pkg` solo sigue `require()` con
 *                    string literal: con el import dinámico el binario arranca igual y falla recién
 *                    al validar obras sociales, que es peor que fallar al arrancar. Se pasa a
 *                    require para que quede DENTRO del snapshot.
 *
 * El bundle sale al lado del package.json a propósito: `AQUI` termina siendo /snapshot/asistente y
 * ahí es donde `pkg` deja el package.json declarado en `assets`.
 *
 * `--no-bytecode` porque la compilación a bytecode cruza arquitecturas con `spawn` y en esta Mac
 * falla con «Unknown system error -86». Sin bytecode el binario es igual de funcional (solo trae el
 * fuente en claro, que acá no es secreto).
 *
 * QUÉ SE PUBLICA
 *
 *   Windows  el .exe pelado. Baja y se hace doble click.
 *   Mac      dos .zip, uno por arquitectura.
 *
 * El .zip no es comodidad: un binario suelto pierde el permiso de ejecución al descargarse, así que
 * bajaría bien, pesaría lo correcto y no arrancaría. El zip lo conserva.
 *
 * NO SE PUEDE HACER UN UNIVERSAL CON `lipo`. Es lo primero que uno intenta para no tener que ofrecer
 * dos botones de Mac, y sale mal de la peor manera: `lipo` junta los dos Mach-O y descarta lo que
 * venga después del final del ejecutable — que es justamente donde `pkg` appendea el snapshot con
 * todo el código. El resultado es un binario válido, ejecutable, de 112 MB, que arranca y muere con
 * `SyntaxError` leyendo un preludio cortado. Compila, pesa, se copia y no anda. Dos botones.
 *
 * VERIFICAR SIEMPRE: al final se ejecuta el binario nativo de verdad y se le pega a /estado. Un
 * ejecutable que no se probó corriendo no está probado.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdirSync, copyFileSync, statSync } from "node:fs";

/**
 * `pkg` no tiene runtimes más nuevos que Node 18: `pkg-fetch` solo trae parches hasta v18.5.0. No es
 * una preferencia, es el techo de la herramienta, y lo que se meta adentro tiene que tolerarlo.
 */
const NODE_MAXIMO = 18;
const TARGETS = `node${NODE_MAXIMO}-win-x64,node${NODE_MAXIMO}-macos-x64,node${NODE_MAXIMO}-macos-arm64`;
const VERSION = JSON.parse(readFileSync("package.json", "utf8")).version;
/**
 * Vite sirve public/ tal cual, así que dejar el archivo acá ES publicarlo.
 *
 * Va en `asistente/descargas/` y no en `asistente/` porque `/asistente/emparejar` es una ruta de la
 * SPA: el middleware que impide el fallback al index.html cuelga de este prefijo y engloba todo lo
 * que esté abajo. Compartir el prefijo dejaba una de las dos cosas rota.
 */
const PUBLICO = "../../public/asistente/descargas";

/**
 * `.command` y no un binario pelado.
 *
 * Un ejecutable Unix sin extensión, al doble click en Finder, no abre Terminal de forma confiable:
 * el usuario hace doble click, no ve NADA, y concluye que el programa no funciona — cuando en
 * realidad arrancó, o ni siquiera se lanzó. Con `.command` macOS abre una Terminal y muestra la
 * salida, que incluye el código de emparejamiento. Es el respaldo visible del auto-emparejamiento.
 */
const MAC = "dist/AsistenteWeProdu.command";
const corre = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

rmSync("dist", { recursive: true, force: true });
rmSync("servidor.cjs", { force: true });

console.log("\n[1/3] Bundle a CommonJS…");
corre("../../node_modules/.bin/esbuild", [
  "servidor.mjs",
  "--bundle",
  "--platform=node",
  "--target=node18",
  "--format=cjs",
  "--external:playwright-core",
  `--define:__VERSION__=${JSON.stringify(VERSION)}`,
  "--define:import.meta.url=__CJS_URL",
  '--banner:js=const __CJS_URL=require("url").pathToFileURL(__filename).href;',
  "--outfile=servidor.cjs",
]);

const bundle = readFileSync("servidor.cjs", "utf8");

/*
  NINGÚN MÓDULO PUEDE ARRANCARSE SOLO DENTRO DEL BUNDLE.

  La guarda habitual de un script de Node es «¿soy yo el archivo que se ejecutó?»:

      if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()

  Al bundlear, los tres módulos pasan a compartir un único `__filename`, así que esa pregunta da que
  sí para todos. Ya ocurrió: al apretar «Validar», la CLI de validación se disparaba adentro del
  Asistente, no encontraba `--empresa` y hacía `process.exit(1)` — matando al servidor en medio del
  request. Desde WeProdu se veía «conectado» y enseguida «no detectado», sin ningún error a la vista.

  Se corta acá y no en un comentario porque el arreglo real —los entries `*.cli.mjs`— es una
  convención, y una convención se rompe sola con el tiempo. Esto falla el BUILD, que es antes de que
  exista un binario que alguien pueda descargar.
*/
const autoArranque = /process\.argv\[1\]\s*&&/;
if (autoArranque.test(bundle)) {
  throw new Error(
    "El bundle contiene una guarda de auto-arranque (`process.argv[1] && …`).\n\n" +
      "Dentro del bundle todos los módulos comparten __filename, así que esa guarda es verdadera para\n" +
      "todos y la CLI se ejecuta adentro del servidor. Mové el arranque a un entry `*.cli.mjs`.",
  );
}

const conRequire = bundle.replaceAll('await import("playwright-core")', 'require("playwright-core")');
if (conRequire === bundle) throw new Error("No encontré el import dinámico de playwright-core: si cambió de forma, `pkg` lo va a dejar afuera del binario en silencio.");
writeFileSync("servidor.cjs", conRequire);

console.log("\n[2/4] pkg…");
corre("node_modules/.bin/pkg", ["servidor.cjs", "--targets", TARGETS, "--no-bytecode", "--public", "--output", "dist/AsistenteWeProdu"]);

console.log("\n[3/4] Verificación: corriendo el binario nativo…");
corre("node", ["verificar-binario.mjs"]);

console.log("\n[4/4] Publicando en public/asistente/…");
mkdirSync(PUBLICO, { recursive: true });
copyFileSync("dist/AsistenteWeProdu-win-x64.exe", `${PUBLICO}/AsistenteWeProdu-windows.exe`);
// -j: sin rutas adentro del zip, para que salga el binario pelado y no `dist/…`.
// -X: sin metadata de Finder. -q: el listado no aporta nada al lado del resumen de abajo.
for (const [slice, nombre] of [["macos-x64", "mac-intel"], ["macos-arm64", "mac-apple-silicon"]]) {
  rmSync(`${PUBLICO}/AsistenteWeProdu-${nombre}.zip`, { force: true }); // zip AGREGA al que ya existe
  corre("cp", [`dist/AsistenteWeProdu-${slice}`, MAC]);
  corre("zip", ["-j", "-X", "-q", `${PUBLICO}/AsistenteWeProdu-${nombre}.zip`, MAC]);
}
rmSync(MAC, { force: true });

/*
  QUÉ VERSIÓN ESTÁ PUBLICADA, para que la app pueda avisar que la instalada quedó vieja.

  WeProdu se actualiza sola —es una web— y el Asistente no: vive instalado en la máquina de cada
  persona y se queda en la versión del día que la bajó. Hasta ahora nada avisaba del desfasaje: se
  descubría cuando un botón devolvía 404, o sea por un error y no por un aviso.

  SE ESCRIBE ACÁ, en el mismo paso que copia los binarios, y no en una constante del frontend, porque
  el criterio es que no se pueda desincronizar: publicar una versión sin actualizar el número deja de
  ser posible cuando lo escribe el mismo comando que la genera. Una constante en el código del front
  son dos fuentes de verdad, y se olvida de actualizar justo cuando importa.

  Cae bajo `/asistente/descargas/`, que ya tiene la regla de «esto es un archivo, si falta es 404»
  (ver `RUTAS_DE_DESCARGA` en vite.config.ts y el rewrite de vercel.json). Sin esa regla, un deploy
  sin este archivo devolvería el index.html con status 200 y el `JSON.parse` del otro lado fallaría
  con un error que no se parece en nada a la causa.
*/
writeFileSync(`${PUBLICO}/version.json`, `${JSON.stringify({ version: VERSION }, null, 2)}\n`, "utf8");

const mb = (f) => `${(statSync(f).size / 1024 / 1024).toFixed(1)} MB`;
for (const f of ["AsistenteWeProdu-windows.exe", "AsistenteWeProdu-mac-intel.zip", "AsistenteWeProdu-mac-apple-silicon.zip"]) {
  console.log(`  ✓ ${PUBLICO}/${f}  ${mb(`${PUBLICO}/${f}`)}`);
}
console.log(`  ✓ ${PUBLICO}/version.json  → ${VERSION}`);
console.log("");
