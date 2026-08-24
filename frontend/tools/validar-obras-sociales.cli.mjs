/**
 * Entry de línea de comandos de la validación de obras sociales contra ARCA.
 *
 * POR QUÉ ESTO ES UN ARCHIVO APARTE
 *
 * Antes el arranque vivía al final de `validar-obras-sociales.mjs` detrás de la guarda clásica:
 *
 *     if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
 *
 * Esa guarda dice «¿soy YO el archivo que se ejecutó?», y deja de significar eso en cuanto varios
 * módulos se bundlean en uno solo: ahí los tres —servidor, validar, registrar— comparten un único
 * `__filename`, así que la pregunta da que sí para los tres. En el ejecutable del Asistente eso se
 * veía como un bug de otro planeta: al apretar «Validar», el Asistente inicializaba este módulo, la
 * guarda se disparaba, la CLI no encontraba `--empresa`, llamaba a `process.exit(1)` y MATABA AL
 * SERVIDOR en medio del request. WeProdu mostraba «conectado» y un segundo después «no detectado».
 *
 * Con el arranque acá afuera eso no puede volver a pasar, y no porque la condición esté mejor
 * escrita: importar el módulo ya no ejecuta nada. La CLI corre si y solo si alguien corre ESTE
 * archivo. Es una propiedad de la estructura, no de una condición que hay que mantener cierta.
 *
 *     node tools/validar-obras-sociales.cli.mjs
 */
import { main } from "./validar-obras-sociales.mjs";

main().catch((e) => {
  console.error(`\nError inesperado: ${e?.message || e}`);
  process.exit(1);
});
