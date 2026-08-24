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
 *
 * POR QUÉ NO ALCANZA CON UN /estado
 *
 * La primera versión de esto pegaba un solo `/estado` a los 4 segundos y daba verde. Un bug pasó ese
 * chequeo entero: el servidor arrancaba perfecto y moría recién al recibir el PRIMER `/validar`, con
 * un `process.exit(1)` que venía de un módulo importado. El binario quedaba «verificado», publicado y
 * descargado, y fallaba en la máquina del usuario en el momento exacto en que se lo necesitaba.
 *
 * Así que ahora se prueba lo que se rompió: que siga vivo un rato, y que sobreviva a que le PIDAN
 * algo. Un chequeo que solo mira el arranque solo prueba el arranque.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { tokenDeInstalacion } from "./seguridad.mjs";

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

/*
  El puerto tiene que estar LIBRE antes de arrancar.

  Si ya hay algo escuchando en 47653 —un Asistente viejo de una prueba anterior— el binario nuevo
  muere con EADDRINUSE y todo lo que este verificador mida a continuación es el proceso VIEJO. Daría
  verde sobre un binario que ni siquiera arrancó, que es peor que dar rojo. Ya pasó mientras se
  escribía esto: un 409 inexplicable que venía de otro ejecutable.
*/
const libre = await new Promise((resolve) => {
  const s = createServer();
  s.once("error", () => resolve(false));
  s.once("listening", () => s.close(() => resolve(true)));
  s.listen(PUERTO, "127.0.0.1");
});
if (!libre) {
  console.error(`✗ El puerto ${PUERTO} ya está ocupado: hay otro Asistente corriendo.\n\n  Cerralo antes de verificar, o esto mediría ESE proceso y no el binario recién compilado.`);
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
/*
  Los pedidos van CON EL TOKEN, y esto no es un detalle.

  La primera versión de este chequeo los mandaba sin token y recibía 401 en todo. Daba verde y no
  probaba nada: el 401 se contesta en la puerta, antes de que se importe ningún módulo, así que el
  bug que mataba al proceso al importar el motor de validación quedaba del otro lado de la guarda.
  Un chequeo que solo toca la puerta solo prueba la puerta.

  El token sale de `tokenDeInstalacion()`, que es el mismo archivo que lee el binario: misma máquina,
  mismo usuario.
*/
const TOKEN = tokenDeInstalacion();
const pedir = (ruta, opciones = {}) =>
  fetch(`http://127.0.0.1:${PUERTO}${ruta}`, {
    ...opciones,
    headers: { Origin: "http://localhost:5173", "Content-Type": "application/json", "X-WeProdu-Token": TOKEN, ...opciones.headers },
  });

/**
 * Qué cuenta como VIVO.
 *
 * Cualquier respuesta HTTP sirve: para contestar, el proceso tuvo que seguir en pie y rutear. Un 409
 * («ya hay una corrida») o un 500 son respuestas — el fracaso que se busca es que no conteste NADA.
 * Acá no se está probando que la validación funcione (eso necesita ARCA y una sesión abierta), sino
 * que pedirla no tumbe el servicio.
 */
const vivo = (r) => r.status >= 200 && r.status < 600;

/** Lo mismo, pero además exige que la operación se haya ACEPTADO: un 409 acá sería el turno trabado. */
const aceptado = (r) => r.status === 200;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function verificar() {
  const paso = async (que, ruta, opciones, criterio = vivo) => {
    let r;
    try {
      r = await pedir(ruta, opciones);
    } catch (e) {
      return terminar(1, `✗ ${que}: ${BIN} no contesta en ${ruta} (${e.message})\n\n${salida.trim()}`);
    }
    if (!criterio(r)) return terminar(1, `✗ ${que}: ${ruta} contestó ${r.status}\n  ${(await r.text()).slice(0, 200)}`);
    console.log(`  ✓ ${que} — ${ruta} → ${r.status}`);
  };

  /**
   * Detener y COMPROBAR que se detuvo, no solo pedirlo.
   *
   * `/detener` iza una bandera; quien tiene que mirarla es el motor. Hubo un tramo —la espera de hasta
   * cinco minutos a que aparezca la pantalla de altas— donde nadie la miraba: el botón contestaba 200,
   * la pantalla decía que había parado, y la corrida seguía ocupando el turno, así que la siguiente
   * recibía «Ya hay una corrida en curso». Pedirlo y seguir de largo daba verde sobre eso.
   */
  async function detenerYesperar() {
    await paso("pide detener", "/detener", { method: "POST", body: "{}" });
    for (let i = 0; i < 20; i++) {
      const r = await pedir("/estado");
      if (r.ok && (await r.clone().json()).corriendo === false) {
        console.log("  ✓ la corrida se detuvo de verdad");
        return;
      }
      await esperar(500);
    }
    terminar(1, "✗ `/detener` contestó 200 pero la corrida sigue en curso 10 s después.");
  }

  /**
   * Una corrida que no hace nada tiene que DECIR por qué.
   *
   * Este chequeo existe porque el anterior no alcanzaba: comprobaba que el proceso SOBREVIVIERA a un
   * `/validar`, no que hiciera algo. Y hubo un binario que pasaba ese verde mientras abortaba antes
   * de la primera persona y devolvía un final exitoso con cero hechas — la pantalla se quedaba con
   * las filas «en cola» para siempre y parecía colgada. El binario estaba «verificado».
   *
   * Acá no se exige que valide (no hay sesión de ARCA en una máquina de build): se exige que el
   * resultado sea LEGIBLE. Un `fin` con `faltaron > 0` y sin `motivo` es el bug, y falla el build.
   */
  async function laCorridaSeExplica() {
    /*
      Con TIMEOUT. `/progreso` es un stream: si la corrida sigue viva, el cuerpo no termina nunca y
      `r.text()` espera para siempre. Ya colgó un build entero — quince minutos sin que nada estuviera
      roto, que es la peor forma de fallar que tiene una herramienta de verificación.
    */
    let texto = "";
    try {
      const r = await pedir("/progreso", { signal: AbortSignal.timeout(15_000) });
      texto = await r.text();
    } catch {
      return console.log("  · la corrida sigue en curso a los 15 s: nada que auditar todavía");
    }
    const eventos = texto
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => JSON.parse(l.slice(5)));
    const fin = eventos.find((e) => e.tipo === "fin");
    const fallo = eventos.find((e) => e.tipo === "fallo");
    if (fallo) return console.log(`  ✓ la corrida explica por qué no anduvo — "${String(fallo.mensaje).split("\n")[0].slice(0, 70)}"`);
    if (!fin) return console.log("  · la corrida sigue en curso: nada que auditar todavía");
    if (fin.faltaron > 0 && !fin.motivo) {
      return terminar(1, `✗ La corrida terminó con faltaron=${fin.faltaron} y SIN motivo.\n\n  Ese es el fracaso silencioso: desde la pantalla se ve como un cuelgue.`);
    }
    console.log(`  ✓ la corrida se explica — faltaron ${fin.faltaron}${fin.motivo ? `: "${fin.motivo.slice(0, 60)}…"` : " (ninguna: salió todo)"}`);
  }

  await esperar(4000);
  await paso("arranca", "/estado");

  /*
    EL REQUEST QUE LO MATABA.

    Los datos tienen que ser VÁLIDOS en formato, o el handler contesta 400 antes de importar el motor
    — y el import es justamente lo que disparaba la CLI y el `process.exit(1)`. Con un 400 temprano
    este chequeo volvería a dar verde sin haber tocado el camino roto.

    Que después no haya un Chrome de ARCA escuchando es lo esperado en una máquina de build: la
    corrida arranca, no puede conectarse y emite un evento de fallo. Eso está bien. Lo que se mide es
    la línea de abajo: que el proceso siga contestando.
  */
  await paso("sobrevive a un /validar real", "/validar", { method: "POST", body: JSON.stringify({ personas: [{ cuil: "20363972609" }] }) }, aceptado);
  await esperar(2000);
  await paso("sigue vivo después de /validar", "/estado");
  await laCorridaSeExplica();
  await detenerYesperar();

  // Con `aceptado` y no con `vivo`: un 409 acá significaría que la corrida anterior dejó el turno
  // tomado, que es un Asistente que solo sirve una vez por arranque. Ya pasó.
  await paso("acepta una SEGUNDA corrida", "/registrar-obras-sociales", { method: "POST", body: JSON.stringify({ empresaCuit: "30710295839", dryRun: true }) }, aceptado);
  await esperar(2000);
  await paso("sigue vivo después de /registrar-obras-sociales", "/estado");
  await detenerYesperar();

  // Y que aguante. 10 segundos no prueban que sea eterno, pero descartan la muerte diferida por un
  // timer, un handle que se cierra o una promesa que revienta un rato después del arranque.
  console.log("  · esperando 10 s…");
  await esperar(10000);
  await paso("sigue vivo a los 15 s", "/estado");

  terminar(0, `\n✓ ${BIN} arranca, atiende y sigue vivo.`);
}

verificar();
