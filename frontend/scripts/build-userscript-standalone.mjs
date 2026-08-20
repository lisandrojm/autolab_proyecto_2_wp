/**
 * Regenera el userscript STANDALONE a partir de la lógica.
 *
 * El camino normal es la cáscara `weprodu-puente.user.js`, que trae la lógica por red. El standalone
 * existe para el otro camino, el que funciona sin nada más: copiar todo y pegarlo en el editor de
 * Tampermonkey. Sirve cuando `GM_xmlhttpRequest`/`new Function` están bloqueados, cuando el operador
 * no tiene acceso al origen, o para depurar sin depender de la red.
 *
 * Se GENERA en vez de mantenerse a mano porque son el mismo código: dos copias editadas por separado
 * divergen, y la que diverge en silencio es siempre la que el operador tiene instalada.
 *
 *   npm run build:userscript
 *
 * Correlo cuando cambies `puente-arca.js` Y quieras publicar el standalone. Para el día a día no
 * hace falta: la cáscara toma la lógica nueva con recargar la página.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'scripts');
const LOGICA = join(dir, 'puente-arca.js');
const SALIDA = join(dir, 'weprodu-obra-social.user.js');

const CABECERA = `// ==UserScript==
// @name         WeProdu — Puente ARCA (standalone)
// @namespace    weprodu
// @version      1.0.0
// @description  Versión autocontenida del puente WeProdu <-> ARCA, para pegar a mano en Tampermonkey. No trae nada por red. GENERADO: no editar acá, editar public/scripts/puente-arca.js y correr npm run build:userscript.
// @match        http://localhost:5173/*
// @match        https://autolab.fun/*
// @match        https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/*
// @match        https://auth.afip.gob.ar/*
// @match        https://portalcf.cloud.afip.gob.ar/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

/*
  ARCHIVO GENERADO — no lo edites acá.

  La fuente es \`public/scripts/puente-arca.js\`. Este archivo es esa misma lógica con la cabecera
  ==UserScript== adelante, para el camino de "copiar y pegar en Tampermonkey", que funciona sin
  \`GM_xmlhttpRequest\` y sin red.

  Sin cáscara no hay \`WEPRODU\`, así que la lógica reporta la versión 1.0.0 por defecto — la misma
  que la cáscara congelada. Es a propósito: la app compara esa versión contra la cáscara servida, y
  las dos formas de instalarlo tienen que dar el mismo resultado, sin avisos de desfasaje.

  Regenerar:  npm run build:userscript
*/

`;

const logica = readFileSync(LOGICA, 'utf8');
// Se saca el encabezado explicativo de la lógica: habla de la cáscara, que acá no existe.
const cuerpo = logica.slice(logica.indexOf('(function () {'));
writeFileSync(SALIDA, CABECERA + cuerpo);
console.log(`standalone regenerado: ${SALIDA} (${cuerpo.split('\n').length} líneas de lógica)`);
