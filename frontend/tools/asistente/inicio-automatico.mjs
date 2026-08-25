/**
 * Que el Asistente arranque solo al prender la computadora.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * El Asistente es un programa de consola: la ventana de Terminal ES el programa. Cerrarla lo mata —
 * macOS le manda SIGHUP y Node termina por default— así que había que dejar una ventana negra
 * abierta todo el día, y si se cerraba sin querer, el botón de validar dejaba de andar sin que nada
 * explicara por qué.
 *
 * Registrado en el inicio de sesión no hay ventana ni hay que acordarse de nada: ya está andando.
 *
 * NUNCA SE INSTALA SOLO. Se activa desde WeProdu, con un botón que dice qué hace, y se puede sacar
 * desde el mismo lugar. Un programa que se mete en el arranque sin preguntar es exactamente lo que
 * hace que la gente desconfíe de instalar cosas — y este ya viene con la desventaja de no estar
 * firmado.
 *
 * SE COPIA EL BINARIO a la carpeta de datos, y no se apunta a donde está. Quien lo bajó lo tiene en
 * Descargas, que es la carpeta que la gente vacía: apuntar ahí sería registrar en el arranque una
 * ruta que va a dejar de existir, y el síntoma sería «dejó de andar solo» sin ninguna pista.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CARPETA_DATOS } from "./seguridad.mjs";

/** Identificador del servicio. Con dominio invertido, como pide Apple. */
const ETIQUETA = "fun.autolab.weprodu.asistente";

/** Dónde queda la copia estable del binario, lejos de la carpeta de Descargas. */
const BINARIO_INSTALADO = join(CARPETA_DATOS, process.platform === "win32" ? "AsistenteWeProdu.exe" : "AsistenteWeProdu");

const plist = () => join(process.env.HOME || "", "Library", "LaunchAgents", `${ETIQUETA}.plist`);
const vbs = () => join(CARPETA_DATOS, "arrancar-asistente.vbs");

/**
 * ¿Se puede en este sistema?
 *
 * Solo macOS y Windows, que es donde corren los administrativos. En Linux hay tres gestores de
 * sesión distintos y ninguno mayoritario: hacerlo a medias sería peor que no ofrecerlo, porque el
 * botón diría que quedó activado y no arrancaría nada.
 */
export const soportaInicioAutomatico = () => process.platform === "darwin" || process.platform === "win32";

/** ¿Está activado ahora mismo? Se mira el artefacto real, no una preferencia guardada aparte. */
export function inicioAutomaticoActivo() {
  if (process.platform === "darwin") return existsSync(plist());
  if (process.platform === "win32") {
    try {
      execFileSync("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", ETIQUETA], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Deja el binario en un lugar estable y devuelve esa ruta.
 *
 * Si el que está corriendo YA es la copia instalada, no se copia nada: sería copiarse arriba de sí
 * mismo mientras corre. Y si es uno recién bajado, se pisa la copia vieja — que es justamente cómo
 * se actualiza el que arranca solo.
 */
function instalarBinario() {
  mkdirSync(CARPETA_DATOS, { recursive: true });
  if (process.execPath !== BINARIO_INSTALADO) {
    copyFileSync(process.execPath, BINARIO_INSTALADO);
    try {
      chmodSync(BINARIO_INSTALADO, 0o755);
    } catch {
      /* Windows no tiene permisos POSIX */
    }
  }
  return BINARIO_INSTALADO;
}

/**
 * Deja todo instalado, PERO NO ARRANCA EL SERVICIO.
 *
 * Separado del arranque a propósito: quien pide esto es el Asistente que está corriendo AHORA, y es
 * el que tiene tomado el puerto. Si el servicio arrancara acá, chocaría con él —el puerto es fijo, no
 * se cae a otro— y se apagaría. Después, al cerrar la ventana, no quedaría nadie.
 *
 * El relevo lo ordena `servidor.mjs`: contesta, suelta el puerto, y recién ahí llama a
 * `arrancarServicio()`. Ver el endpoint `/inicio-automatico`.
 */
export function activarInicioAutomatico() {
  if (!soportaInicioAutomatico()) throw new Error("El arranque automático solo está disponible en Mac y Windows.");
  if (!process.pkg) throw new Error("Esto solo se puede activar desde el Asistente descargado, no corriéndolo con `node servidor.mjs`.");

  const binario = instalarBinario();

  if (process.platform === "darwin") {
    /*
      `KeepAlive` con `SuccessfulExit: false`: si el proceso se cae, launchd lo vuelve a levantar; si
      termina bien —porque alguien lo cerró a propósito— se queda cerrado. Reiniciar algo que la
      persona apagó es la clase de terquedad que hace que después se desinstale todo.

      La salida va a un archivo porque sin Terminal no hay dónde mirar: es el mismo motivo por el que
      existe `diagnostico.mjs`.
    */
    const destino = plist();
    mkdirSync(join(process.env.HOME || "", "Library", "LaunchAgents"), { recursive: true });
    writeFileSync(
      destino,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${ETIQUETA}</string>
  <key>ProgramArguments</key><array><string>${binario}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>${join(CARPETA_DATOS, "asistente.log")}</string>
  <key>StandardErrorPath</key><string>${join(CARPETA_DATOS, "asistente.log")}</string>
</dict>
</plist>
`,
      "utf8",
    );
    return { activo: true, binario, arrancaYa: true };
  }

  /*
    Windows: entrada en `Run` del usuario (no de la máquina: no pide permisos de administrador).

    Va a través de un `.vbs` porque apuntar el .exe directo deja una ventana de consola abierta en
    cada arranque, que es exactamente lo que se está tratando de sacar. `WindowStyle 0` la esconde.

    NO ESTÁ PROBADO EN WINDOWS: se escribió desde una Mac. La rama de macOS sí se probó.
  */
  writeFileSync(vbs(), `CreateObject("Wscript.Shell").Run """${binario}""", 0, False\r\n`, "utf8");
  execFileSync("reg", ["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", ETIQUETA, "/t", "REG_SZ", "/d", `wscript.exe "${vbs()}"`, "/f"], { stdio: "ignore" });
  /*
    `arrancaYa: false`: en Windows la entrada de `Run` recién corre en el próximo inicio de sesión. No
    hay equivalente de `launchctl load`, así que este proceso NO se aparta — si se fuera, no quedaría
    nadie andando hasta el próximo login. Sigue corriendo en su ventana hasta que se reinicie.
  */
  return { activo: true, binario, arrancaYa: false };
}

/**
 * Arranca el servicio ya, sin esperar al próximo login.
 *
 * Se llama DESPUÉS de que el proceso actual soltó el puerto. Solo macOS: ver `arrancaYa` arriba.
 */
export function arrancarServicio() {
  if (process.platform !== "darwin") return false;
  try {
    execFileSync("launchctl", ["load", "-w", plist()], { stdio: "ignore" });
    return true;
  } catch {
    // Ya cargado, o launchctl se quejó de algo que no impide que arranque en el próximo login.
    return false;
  }
}

/**
 * Lo saca del arranque. NO borra la copia del binario ni el emparejamiento.
 *
 * Sacar del inicio es «no arranques solo», no «desinstalate»: borrar además la copia obligaría a
 * volver a descargar todo para reactivarlo, y nadie pidió eso.
 */
export function desactivarInicioAutomatico() {
  if (process.platform === "darwin") {
    /*
      EL ORDEN ES AL REVÉS DE LO QUE PARECE, y equivocarse no se nota hasta el próximo login.

      Dar de baja el servicio APAGA el proceso, y el proceso es este mismo. Si se hiciera primero,
      esta función no llegaría nunca a borrar el plist: quedaría en disco y el Asistente volvería a
      arrancar solo en el próximo inicio de sesión, después de que la persona pidió que no lo hiciera.
      Pasó exactamente eso. Primero se borra el archivo; morir después ya no rompe nada.

      Y se da de baja por ETIQUETA (`bootout`) y no por ruta (`unload`), justamente porque para
      entonces el archivo ya no está y `unload` necesita leerlo.
    */
    rmSync(plist(), { force: true });
    try {
      execFileSync("launchctl", ["bootout", `gui/${process.getuid()}/${ETIQUETA}`], { stdio: "ignore" });
    } catch {
      /* no estaba cargado: el plist borrado alcanza para que no vuelva en el próximo login */
    }
    return { activo: false };
  }
  if (process.platform === "win32") {
    try {
      execFileSync("reg", ["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", ETIQUETA, "/f"], { stdio: "ignore" });
    } catch {
      /* no estaba */
    }
    rmSync(vbs(), { force: true });
    return { activo: false };
  }
  return { activo: false };
}
