/**
 * Ejecuta el binario de esta máquina y comprueba que CONTESTA.
 *
 *   npm run verificar
 *
 * Existe por una razón concreta: el primer build salió sin errores, dejó tres archivos de 40 MB con
 * permisos de ejecución, y los tres morían al arrancar con `ERR_REQUIRE_ESM`. Nada en el disco lo
 * delataba. Si esos binarios se copiaban a public/, la descarga andaba, el HEAD daba 200, y el que lo
 * bajaba veía una ventana que se abre y se cierra.
 *
 * Por eso lo único que cuenta como verificación es levantarlo y pegarle. Un binario que existe no es
 * un binario que anda.
 *
 * Solo se puede verificar el de ESTA arquitectura. Los otros dos se compilan igual desde el mismo
 * bundle CJS, así que si este arranca hay motivo para confiar en ellos — pero el de Windows solo lo
 * prueba de verdad una máquina Windows.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PUERTO = 47653;
// Se prueba el binario de ESTA máquina, que es el único que se puede correr acá. Lo que esto NO
// cubre, y conviene tener presente antes de anunciar una versión: en una Mac Intel el slice arm64 ni
// se toca («bad CPU type in executable»), así que el de Apple Silicon solo lo prueba de verdad una
// Mac Apple Silicon, y el de Windows una máquina Windows. Los tres salen del mismo bundle CJS, que es
// motivo para confiar — no para dar por probado.
const BIN = process.platform === "win32" ? "dist/AsistenteWeProdu-win-x64.exe" : process.arch === "arm64" ? "dist/AsistenteWeProdu-macos-arm64" : "dist/AsistenteWeProdu-macos-x64";

if (!existsSync(BIN)) {
  console.error(`✗ No existe ${BIN}. Corré primero \`npm run empaquetar\`.`);
  process.exit(1);
}

const proc = spawn(`./${BIN}`, { stdio: ["ignore", "pipe", "pipe"] });
let salida = "";
proc.stdout.on("data", (d) => (salida += d));
proc.stderr.on("data", (d) => (salida += d));

const terminar = (codigo, msg) => {
  proc.kill();
  console[codigo ? "error" : "log"](msg);
  process.exit(codigo);
};

// Si el proceso se muere solo, el binario está roto: eso es exactamente lo que se está buscando.
proc.on("exit", (code) => terminar(1, `✗ ${BIN} se cerró solo (código ${code}).\n\n${salida.trim()}`));

// El origen tiene que ser uno de los permitidos: /estado con Origin inválido contesta 403, que
// también probaría que arrancó, pero conviene ejercitar el camino real.
const url = `http://127.0.0.1:${PUERTO}/estado`;
setTimeout(async () => {
  try {
    const r = await fetch(url, { headers: { Origin: "http://localhost:5173" } });
    const cuerpo = await r.text();
    // 401 es un SÍ: es la guarda de token del propio servidor contestando, y para contestar tuvo que
    // arrancar, bindear el puerto y rutear el pedido. Sin el código de emparejamiento —que se genera
    // en la máquina del usuario— no hay forma de sacarle un 200 desde acá, y lo que se está probando
    // es que el ejecutable VIVE, no que la autenticación funciona (eso lo cubre seguridad.test.mjs).
    if (!r.ok && r.status !== 401) return terminar(1, `✗ ${url} contestó ${r.status}: ${cuerpo.slice(0, 200)}`);
    terminar(0, `✓ ${BIN} arranca y contesta en ${url} (${r.status})\n  ${cuerpo.slice(0, 200)}`);
  } catch (e) {
    terminar(1, `✗ ${BIN} no contesta en ${url}: ${e.message}\n\n${salida.trim()}`);
  }
}, 4000);
