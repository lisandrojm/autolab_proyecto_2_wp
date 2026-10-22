import { resolve } from "node:path";
import { RAIZ_REPO } from "../arca/motor.js";

/**
 * El motor que opera la pantalla de Dropbox Sign vive en `frontend/tools/`, como los de ARCA: es
 * JavaScript plano fuera del `rootDir` del server, con su propio test de lista blanca de clicks
 * (`frontend/tools/envio-dropbox-sign.test.mjs`). Se importa en tiempo de ejecución.
 */
export const MOTOR_DROPBOX_SIGN = resolve(RAIZ_REPO, "frontend/tools/envio-dropbox-sign.mjs");
