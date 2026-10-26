import { resolve } from "node:path";
import { RAIZ_REPO } from "../arca/motor.js";

/**
 * El motor que opera la pantalla de Dropbox Sign vive en `frontend/tools/`, como los de ARCA: es
 * JavaScript plano fuera del `rootDir` del server, con su propio test de lista blanca de clicks
 * (`frontend/tools/envio-dropbox-sign.test.mjs`). Se importa en tiempo de ejecución.
 */
export const MOTOR_DROPBOX_SIGN = resolve(RAIZ_REPO, "frontend/tools/envio-dropbox-sign.mjs");

/**
 * EL MOTOR ACTUAL DEL DISCO, NO EL DE LA CACHÉ (26/10/2026). `import()` guarda el módulo mientras el
 * proceso vive: después de un `git pull` sin reinicio efectivo seguía corriendo el motor viejo («el
 * commit tarda una ronda en llegar»). Se importa con la huella del archivo en la URL, así cada corrida
 * usa lo que hay en disco, y se devuelve la huella para anotarla en el log de la corrida.
 */
export async function cargarMotor(): Promise<{ motor: any; version: string }> {
  const { createHash } = await import("node:crypto");
  const { readFileSync, statSync } = await import("node:fs");
  const { pathToFileURL } = await import("node:url");
  const contenido = readFileSync(MOTOR_DROPBOX_SIGN);
  const huella = createHash("sha1").update(contenido).digest("hex").slice(0, 10);
  const modificado = statSync(MOTOR_DROPBOX_SIGN).mtime.toISOString().replace("T", " ").slice(0, 16);
  const motor = await import(`${pathToFileURL(MOTOR_DROPBOX_SIGN).href}?v=${huella}`);
  return { motor, version: `huella ${huella}, archivo del ${modificado} UTC` };
}
