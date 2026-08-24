/**
 * Que el Asistente no pueda morirse sin dejar rastro.
 *
 * EL CASO REAL que motivó esto: al apretar «Validar», un `process.exit(1)` que venía de un módulo
 * importado mataba al servidor en medio del request. Desde WeProdu se veía «Asistente conectado» y un
 * segundo después «Asistente no detectado» — dos estados normales de la app, ninguno que dijera «el
 * proceso murió». La causa estaba impresa en la consola, pero el usuario que hizo doble click en
 * Finder no tiene consola donde mirar; y el que la tiene, ve la ventana cerrarse.
 *
 * Un servicio de fondo que se cae en silencio es indistinguible de uno que nunca arrancó. Estas dos
 * cosas rompen esa ambigüedad: los errores no tumban el proceso, y lo que sí lo tumba queda escrito.
 */
import { appendFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { CARPETA_DATOS } from "./seguridad.mjs";

/**
 * Una carpeta donde el usuario pueda ENCONTRAR el archivo.
 *
 * Con el binario empaquetado es la carpeta del ejecutable: quien lo bajó a Descargas y le hizo doble
 * click va a mirar ahí y en ningún otro lado. Con `node servidor.mjs` es la carpeta de datos.
 * Si la primera no deja escribir —una descarga en solo lectura, un .dmg montado— cae a la segunda.
 */
export function escribirAlLado(nombre, contenido, { agregar = false } = {}) {
  const carpetas = process.pkg ? [dirname(process.execPath), CARPETA_DATOS] : [CARPETA_DATOS];
  for (const carpeta of carpetas) {
    const destino = join(carpeta, nombre);
    try {
      (agregar ? appendFileSync : writeFileSync)(destino, contenido, "utf8");
      try {
        chmodSync(destino, 0o600);
      } catch {
        /* Windows no tiene permisos POSIX */
      }
      return destino;
    } catch {
      /* probamos la siguiente */
    }
  }
  return "";
}

const ARCHIVO_CAIDAS = "asistente-errores.txt";

/**
 * Errores que NO tienen que matar al proceso.
 *
 * Una promesa rechazada dentro de una corrida de Playwright, un socket que se cae, un error en un
 * handler: nada de eso es motivo para que el servicio entero desaparezca y el usuario se quede sin
 * poder validar. Se anota y se sigue.
 *
 * Ojo con la tentación de meter acá también `process.exit`: si un día algo tiene que terminar el
 * proceso, que sea una decisión explícita y con un mensaje, no un efecto secundario de un import.
 */
export function noMorirEnSilencio({ fecha = () => new Date().toISOString() } = {}) {
  const anotar = (clase, e) => {
    const detalle = e?.stack || e?.message || String(e);
    const linea = `\n[${fecha()}] ${clase}\n${detalle}\n`;
    console.error(`\n  ⚠ ${clase}: ${e?.message || e}\n  El Asistente sigue funcionando. Quedó anotado en ${ARCHIVO_CAIDAS}.\n`);
    escribirAlLado(ARCHIVO_CAIDAS, linea, { agregar: true });
  };

  process.on("uncaughtException", (e) => anotar("Error no capturado", e));
  process.on("unhandledRejection", (e) => anotar("Promesa rechazada sin manejar", e));

  /*
    Y si a pesar de todo el proceso termina, que quede dicho POR QUÉ y con un código.

    `exit` es lo último que corre y solo admite operaciones sincrónicas —por eso `appendFileSync`—.
    Un cierre con código 0 es el usuario cerrando la ventana y no se anota: llenar el archivo de
    salidas normales es la forma más rápida de que nadie lo lea cuando importe.
  */
  process.on("exit", (codigo) => {
    if (!codigo) return;
    escribirAlLado(ARCHIVO_CAIDAS, `\n[${fecha()}] El Asistente terminó con código ${codigo}.\n`, { agregar: true });
  });
}
