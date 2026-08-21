#!/usr/bin/env node
/*
  ============================================================================
  Validar obras sociales en ARCA, desde una terminal.
  ============================================================================

  Se conecta por CDP al Chrome que YA está abierto y logueado, y opera la
  pantalla «Registrar Nuevas Altas» como lo haría una persona: escribe un CUIL,
  aprieta Agregar, lee la obra social que el organismo precompleta, y sigue.

  POR QUÉ NO UNA EXTENSIÓN

  Esto reemplaza a un puente de Tampermonkey que funcionaba, pero cuyas fallas
  eran todas del MECANISMO y no del problema: el sandbox de la extensión,
  el permiso «Permitir secuencias de comandos del usuario» de Chrome, listeners
  en `window` que no veían los eventos de `document`, versiones que había que
  reinstalar a mano, copias duplicadas peleándose la misma cola, contenido mixto
  al traer la lógica desde WeProdu, deep-links a pantallas muertas de ARCA.
  Ninguna existe acá. Playwright espera las navegaciones solo, así que los
  postbacks de ASP.NET dejan de importar: no hace falta cola persistente, ni
  reanudación, ni handshake.

  QUÉ NO HACE, NUNCA

   - No pide ni guarda la clave fiscal. El login lo hace la persona, a mano.
   - No abre un Chrome propio: no tendría la sesión. Se cuelga del que ya está.
   - No aprieta «Aceptar» (ver el bloque de LOS DOS BOTONES, más abajo).

  USO

    1. Cerrar Chrome del todo.
    2. Abrirlo con el puerto de depuración:
         macOS  open -a "Google Chrome" --args --remote-debugging-port=9222
         Win    chrome.exe --remote-debugging-port=9222
    3. Entrar a AFIP con clave fiscal → Simplificación Registral → elegir la
       empleadora → Relaciones Laborales → Registrar Nuevas Altas.
    4. npm run validar-obras-sociales -- --cuils cuils.txt

  ENTRADA   un archivo con un CUIL por línea (o CSV: se toma la primera columna),
            o `--cuil` repetido.
  SALIDA    `CUIL,RNOS` por stdout, que es exactamente lo que espera la caja de
            «Constatar obras sociales» de WeProdu. Con `--out archivo.csv` además
            lo escribe a disco.

  Se eligió la salida CSV y no un PATCH a la API a propósito: ese pegado ya tiene
  del otro lado previsualización y validación contra las obras sociales que la
  empleadora tiene registradas ante ARCA, y es el único camino probado punta a
  punta. Escribir directo desde acá saltearía esas dos redes y obligaría a
  manejar un token de sesión en un script local.
*/
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CDP_URL = process.env.WEPRODU_CDP_URL || "http://localhost:9222";
const ALTAS_RE = /serviciossegsoc\.afip\.gob\.ar/i;

/*
  ===========================================================================
  LOS DOS BOTONES. SE LLAMAN DISTINTO Y UNO DE ELLOS NO SE TOCA.
  ===========================================================================

    Agregar    ✅  carga un CUIL en la grilla para poder leerlo. No registra nada.
    Reiniciar  ✅  vacía la grilla. Es lo contrario de Aceptar.
    Aceptar    🔴  CONFIRMA LAS ALTAS ANTE EL ORGANISMO. Irreversible.

  «Aceptar» está al lado de «Reiniciar» en la misma pantalla. Confundirlos es el
  peor error posible de este script: daría de alta relaciones laborales reales,
  masivas, a nombre de una empresa real, por fuera del TXT y sin que nadie lo
  pidiera. Por eso los botones se buscan SIEMPRE por su texto exacto y nunca por
  posición ni por índice, y no hay ninguna otra función que dispare un control.

  (El «Aceptar» del selector de CUIT es otro botón y sí es seguro: solo entra al
  servicio. Este script no pasa por esa pantalla.)
*/
export const ROTULOS_PERMITIDOS = ["Agregar", "Reiniciar"];

/** ARCA no admite más de 10 relaciones laborales cargadas a la vez. */
export const TOPE_ARCA = 10;

const SEL = {
  cuil: "#ctl00_ContentPlaceHolder1_InputCuil_txtCuil",
  obraSocial: 'input[id*="ExtendCodeOS_AutocompleteText"]',
};

export const soloDigitos = (s) => String(s || "").replace(/\D/g, "");
export const conGuiones = (s) => {
  const d = soloDigitos(s);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : "";
};

// ---------------------------------------------------------------- argumentos
export function parsearArgs(argv) {
  const args = { cuils: [], out: "", archivo: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cuils" || a === "-f") args.archivo = argv[++i] || "";
    else if (a === "--cuil") args.cuils.push(argv[++i] || "");
    else if (a === "--out" || a === "-o") args.out = argv[++i] || "";
    else if (!a.startsWith("-") && !args.archivo) args.archivo = a;
  }
  if (args.archivo) {
    // Un CUIL por línea, o un CSV del que se toma la primera columna.
    for (const linea of readFileSync(args.archivo, "utf8").split(/\r?\n/)) {
      const primera = linea.split(/[,;\t]/)[0];
      if (conGuiones(primera)) args.cuils.push(primera);
    }
  }
  // Deduplicado conservando el orden: repetir un CUIL desperdicia un lugar de la tanda de 10.
  args.cuils = [...new Set(args.cuils.map(conGuiones).filter(Boolean))];
  return args;
}

// ------------------------------------------------------------------- páginas
/**
 * Busca la pestaña de ARCA entre las que el operador ya tiene abiertas.
 *
 * NO abre una nueva si no la encuentra: una pestaña nueva en ARCA sin la "sesión de trabajo" (la que
 * se crea al elegir el CUIT) cae en FinSession y no sirve para nada. Es preferible decir qué falta.
 */
async function buscarPaginaArca(ctx) {
  for (const p of ctx.pages()) {
    if (ALTAS_RE.test(p.url())) return p;
  }
  return null;
}

/** El botón, por su rótulo EXACTO y solo si está en la lista blanca. Ver LOS DOS BOTONES. */
export async function boton(page, rotulo) {
  if (!ROTULOS_PERMITIDOS.includes(rotulo)) {
    throw new Error(`Este script no aprieta «${rotulo}». Solo ${ROTULOS_PERMITIDOS.join(" y ")}.`);
  }
  const b = page.locator(`input[type=submit][value="${rotulo}"], input[type=button][value="${rotulo}"]`).first();
  return (await b.count()) ? b : null;
}

async function textoPagina(page) {
  return (await page.evaluate(() => document.body?.innerText || "")) || "";
}

/** Sin el campo de CUIL no estamos en la pantalla de altas; el texto dice si además se cayó la sesión. */
export async function estadoPantalla(page) {
  if (await page.locator(SEL.cuil).count()) return "altas";
  const txt = await textoPagina(page);
  if (/sesi[oó]n ha finalizado|no ha iniciado su sesi[oó]n|ingrese con su clave fiscal/i.test(txt)) return "sin_sesion";
  return "otra";
}

/**
 * ¿ARCA acaba de rechazar por el tope de 10?
 *
 * Se chequea aunque el script ya trabaje de a 10: el contador se desincroniza si el operador tenía
 * filas cargadas antes de arrancar. Cuando aparece, el CUIL en curso NO es un error —no se lo pudo ni
 * intentar— así que se reencola para la tanda siguiente.
 */
async function topeAlcanzado(page) {
  return /no es posible ingresar mas de 10 relaciones laborales/i.test(await textoPagina(page));
}

/**
 * Lee la grilla: qué obra social le corresponde a cada CUIL cargado.
 *
 * El emparejamiento fila↔CUIL se hace subiendo desde el input de obra social hasta el ancestro que
 * contenga EXACTAMENTE UN CUIL. Si se pasa de tamaño y llega al tbody, su texto tiene todos los de la
 * grilla y el primero es el de otra persona: cada input se emparejaría con el mismo y las obras
 * sociales quedarían corridas, con todas las filas viéndose bien. Dos o más = ambiguo, no se adivina.
 */
export async function leerFilas(page) {
  return page.evaluate((selOS) => {
    const RE_CUIL = /\d{2}-\d{8}-\d/g;
    const cuilDeLaFila = (input) => {
      let node = input;
      for (let up = 0; up < 8 && node.parentElement; up++) {
        node = node.parentElement;
        const todos = (node.textContent || "").match(RE_CUIL) || [];
        if (todos.length === 1) return todos[0];
        if (todos.length > 1) return null;
      }
      return null;
    };
    const out = {};
    let ambiguas = 0;
    let total = 0;
    for (const input of document.querySelectorAll(selOS)) {
      total++;
      const cuil = cuilDeLaFila(input);
      if (!cuil) {
        ambiguas++;
        continue;
      }
      // El código real vive en el input oculto `_AutocompleteValue`; el visible trae la descripción.
      const oculto = document.getElementById(input.id.replace("_AutocompleteText", "_AutocompleteValue"));
      let code = oculto && oculto.value ? oculto.value.replace(/\D/g, "") : "";
      if (!code) code = (input.value || "").replace(/\D/g, "");
      out[cuil] = code;
    }
    return { filas: out, ambiguas, total };
  }, SEL.obraSocial);
}

async function reiniciarGrilla(page) {
  const btn = await boton(page, "Reiniciar");
  if (!btn) return false;
  await btn.click();
  await page.waitForLoadState("load").catch(() => {});
  return true;
}

/** Carga un CUIL y espera el postback. */
async function agregarCuil(page, cuil) {
  await page.fill(SEL.cuil, cuil);
  const btn = await boton(page, "Agregar");
  if (!btn) throw new Error("No encontré el botón «Agregar» en la pantalla.");
  await btn.click();
  await page.waitForLoadState("load").catch(() => {});
}

// --------------------------------------------------------------------- salida
const log = (...a) => console.error(...a); // stderr: stdout es SOLO el CSV, para poder pipear

async function main() {
  const args = parsearArgs(process.argv.slice(2));
  if (args.cuils.length === 0) {
    log("Faltan los CUIL. Ejemplo:\n  npm run validar-obras-sociales -- --cuils cuils.txt\n  npm run validar-obras-sociales -- --cuil 27-40073687-7 --cuil 20-36397260-9");
    process.exit(1);
  }

  /*
    Import perezoso: Playwright solo hace falta para hablar con el navegador. Arriba del archivo
    obligaría a tenerlo instalado para importar cualquier función de acá —los tests, por ejemplo— y
    convertiría una dependencia faltante en un stack trace en vez de una instrucción.
  */
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    log("Falta la dependencia `playwright-core`.\n\nCorré `npm install` en frontend/ y volvé a intentar.\n");
    process.exit(1);
  }

  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch {
    // Sin stack trace: el 100% de las veces es que Chrome no está en modo debug.
    log(
      `No pude conectarme a Chrome en ${CDP_URL}.\n\n` +
        "Cerrá Chrome del todo y volvé a abrirlo con el puerto de depuración:\n" +
        '  macOS  open -a "Google Chrome" --args --remote-debugging-port=9222\n' +
        "  Win    chrome.exe --remote-debugging-port=9222\n",
    );
    process.exit(1);
  }

  const ctx = browser.contexts()[0];
  const page = ctx && (await buscarPaginaArca(ctx));
  if (!page) {
    log(
      "Chrome está en modo depuración, pero no encontré ninguna pestaña de ARCA.\n\n" +
        "Entrá con clave fiscal → Simplificación Registral → elegí la empleadora →\n" +
        "Relaciones Laborales → Registrar Nuevas Altas, y volvé a correr esto.\n",
    );
    await browser.close();
    process.exit(1);
  }

  const estado = await estadoPantalla(page);
  if (estado !== "altas") {
    log(
      estado === "sin_sesion"
        ? "La sesión de ARCA no está activa (o falta elegir el CUIT de la empleadora).\n\nVolvé a entrar y dejá abierta la pantalla «Registrar Nuevas Altas».\n"
        : `La pestaña de ARCA no está en «Registrar Nuevas Altas».\n\nEstá en: ${page.url()}\n`,
    );
    await browser.close();
    process.exit(1);
  }

  log(`Validando ${args.cuils.length} CUIL en tandas de ${TOPE_ARCA}…`);

  /** cuil -> rnos ('' = ARCA no tiene afiliación: es una RESPUESTA, no un error). */
  const hechos = new Map();
  /** Los que ARCA no pudo resolver. NO se emiten: ver el filtro final. */
  const errores = new Set();
  let pendientes = [...args.cuils];
  let sinSesion = false;

  while (pendientes.length > 0 && !sinSesion) {
    if (!(await reiniciarGrilla(page))) {
      log("No encontré el botón «Reiniciar»: no puedo vaciar la grilla para la tanda siguiente.");
      break;
    }

    const tanda = pendientes.slice(0, TOPE_ARCA);
    const reencolar = [];

    for (const cuil of tanda) {
      if ((await estadoPantalla(page)) !== "altas") {
        // Sesión caída a mitad de camino: se FRENA. Lo pendiente queda pendiente — jamás se lo marca
        // como vacío, porque vacío significa "ARCA dijo que no tiene obra social" y se guarda validado.
        sinSesion = true;
        break;
      }
      await agregarCuil(page, cuil);
      if (await topeAlcanzado(page)) {
        reencolar.push(cuil); // no se lo pudo ni intentar
        break;
      }
    }

    if (!sinSesion) {
      const { filas, ambiguas } = await leerFilas(page);
      if (ambiguas > 0) {
        // Emparejamiento dudoso: se frena. Seguir sería exportar obras sociales posiblemente corridas,
        // y del otro lado se guardan fijas, con candado.
        log(`Frené: no pude emparejar ${ambiguas} fila(s) con su CUIL. La estructura de la grilla cambió.`);
        break;
      }
      for (const cuil of tanda) {
        if (reencolar.includes(cuil)) continue;
        if (cuil in filas) hechos.set(cuil, filas[cuil]);
        // La fila no apareció con la sesión viva y sin tope: es un error DE ESE CUIL (inválido, con
        // relación activa, un popup). Se reporta aparte y no se aplica.
        else errores.add(cuil);
      }
    }

    pendientes = [...reencolar, ...pendientes.slice(tanda.length)];
    log(`  ${hechos.size}/${args.cuils.length} validados${errores.size ? ` · ${errores.size} con error` : ""}`);
  }

  // Reinicio final: la pantalla de ARCA queda vacía. Filas cargadas son altas a medio hacer que
  // alguien puede confirmar por error más adelante.
  await reiniciarGrilla(page);
  await browser.close();

  if (sinSesion) {
    log(`\nSe cortó la sesión de ARCA. Quedaron ${args.cuils.length - hechos.size} sin validar: volvé a entrar y corré esto de nuevo con los que faltan.`);
  }
  if (errores.size) {
    log(`\nARCA no devolvió fila para ${errores.size} CUIL (no se emiten):\n  ${[...errores].join("\n  ")}`);
  }

  const csv = [...hechos.entries()].map(([cuil, rnos]) => `${cuil},${rnos}`).join("\n");
  if (args.out) {
    writeFileSync(args.out, csv + "\n");
    log(`\n${hechos.size} validados → ${args.out}`);
  }
  log(`\nPegá esto en WeProdu → Contratos → «Constatar obras sociales»:\n`);
  process.stdout.write(csv + "\n");
}

/*
  Solo corre cuando se lo invoca directo. Importarlo desde un test no puede disparar una sesión de
  Playwright contra el Chrome de nadie.
*/
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    log(`\nError inesperado: ${e?.message || e}`);
    process.exit(1);
  });
}
