import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * El motor que opera la pantalla de ARCA vive en `frontend/tools/` y se importa en tiempo de ejecución.
 *
 * Es JavaScript plano fuera del `rootDir` del server, así que `tsc` ni lo mira: se resuelve con una
 * ruta calculada desde este archivo. La cuenta funciona igual en desarrollo y en producción porque
 * `src/services/arca/` y `dist/services/arca/` están a la misma profundidad — cuatro niveles bajo la
 * raíz del repo, que es lo que se despliega en el VPS.
 *
 * Está en un archivo propio porque ahora lo importan DOS servicios: la corrida de obras sociales y la
 * lectura de nombres de los CUIT que el padrón rechaza. Con la constante copiada en los dos, el día
 * que `frontend/tools/` se mueva uno de los dos queda apuntando a un archivo que no existe, y el
 * error aparece recién al usarlo.
 */
export const RAIZ_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const MOTOR = resolve(RAIZ_REPO, "frontend/tools/validar-obras-sociales.mjs");
