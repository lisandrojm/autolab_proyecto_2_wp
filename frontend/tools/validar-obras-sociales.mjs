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

/**
 * Cuánto se espera a que alguien se loguee, en minutos.
 *
 * Generoso a propósito: el login de ARCA tiene sus propios tiempos y quien lo corre puede estar
 * haciendo otra cosa. Lo que NO hay es reintento ciego — al vencerse, el script sale con un mensaje
 * que dice qué falta, no vuelve a probar solo.
 */
export const ESPERA_LOGIN_MIN_DEFAULT = 5;

/** La pantalla de login de ARCA. Se abre, no se completa: la clave la pone una persona. */
const AFIP_LOGIN_URL = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";

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
  const args = { empresa: "", cuils: [], archivo: "", dryRun: false, forzar: false, esperaMin: ESPERA_LOGIN_MIN_DEFAULT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--empresa" || a === "-e") args.empresa = argv[++i] || "";
    else if (a === "--dry-run" || a === "-n") args.dryRun = true;
    else if (a === "--forzar") args.forzar = true;
    else if (a === "--espera") args.esperaMin = Number(argv[++i]) || ESPERA_LOGIN_MIN_DEFAULT;
    // `--cuils`/`--cuil` siguen existiendo para acotar la corrida a mano (probar con dos personas,
    // reintentar las que fallaron). Sin ellos, los pendientes salen de la API.
    else if (a === "--cuils" || a === "-f") args.archivo = argv[++i] || "";
    else if (a === "--cuil") args.cuils.push(argv[++i] || "");
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

// ------------------------------------------------------------------------ API
/*
  La API de WeProdu, en las dos puntas: de dónde salen los pendientes y a dónde va el resultado.

  El token sale del entorno y nunca de un archivo del repo. Es el mismo JWT que usa el navegador:
  se saca de las DevTools de WeProdu (Application → Local Storage → `token`).
*/
const API = {
  url: (process.env.WEPRODU_API_URL || "http://localhost:7001/api/v1").replace(/\/$/, ""),
  token: process.env.WEPRODU_TOKEN || "",
  tenant: process.env.WEPRODU_TENANT || "",
};

async function api(ruta, opciones = {}) {
  if (!API.token) {
    throw new Error("Falta WEPRODU_TOKEN. Sacalo de las DevTools de WeProdu (Application → Local Storage → token) y exportalo:\n  export WEPRODU_TOKEN='...'\n  export WEPRODU_TENANT='<slug o id del tenant>'");
  }
  const res = await fetch(`${API.url}${ruta}`, {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API.token}`,
      ...(API.tenant ? { "X-Tenant-Id": API.tenant } : {}),
      ...(opciones.headers || {}),
    },
  });
  const texto = await res.text();
  let cuerpo;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = null;
  }
  if (!res.ok) throw new Error(cuerpo?.error || `${res.status} en ${ruta}`);
  return cuerpo;
}

/** Los pendientes de esa empleadora, con el mismo criterio que la grilla. */
export async function traerPendientes(empresa) {
  return api(`/contratos/obras-sociales/pendientes?empresa=${encodeURIComponent(empresa)}`);
}

/** Aplica el lote. Con `dryRun` calcula lo mismo y no escribe nada. */
export async function aplicarLote(empresa, items, { dryRun = false, forzar = false } = {}) {
  return api("/contratos/obras-sociales/constatar", {
    method: "POST",
    body: JSON.stringify({ empresa, origen: "script", items, dryRun, forzar }),
  });
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
const log = (...a) => console.error(...a); // stderr: stdout queda libre para pipear

/**
 * Espera a que haya "sesión de trabajo" en ARCA, sin tocar la clave de nadie.
 *
 * Abre el login en el perfil dedicado, dice qué falta, y sondea la pestaña hasta que aparezca la
 * pantalla de altas. Al vencerse el plazo NO reintenta: sale y explica. Un reintento ciego contra el
 * organismo no resuelve nada y encima puede endurecer sus defensas.
 */
async function esperarSesion(ctx, minutos) {
  const hasta = Date.now() + minutos * 60_000;
  let page = await buscarPaginaArca(ctx);
  if (!page) {
    page = await ctx.newPage();
    await page.goto(AFIP_LOGIN_URL).catch(() => {});
  }
  log(
    `\nFalta iniciar sesión en ARCA. Te abrí el login en esta ventana de Chrome.\n\n` +
      `  1. Entrá con tu clave fiscal.\n` +
      `  2. Simplificación Registral - Empleadores → elegí el CUIT de la empleadora.\n` +
      `     (Ese paso es el que inicia la «sesión de trabajo»: sin él, ARCA rechaza la pantalla de altas.)\n` +
      `  3. Relaciones Laborales → Registrar Nuevas Altas.\n\n` +
      `Espero hasta ${minutos} minuto(s) y sigo solo…`,
  );
  while (Date.now() < hasta) {
    const p = (await buscarPaginaArca(ctx)) || page;
    if ((await estadoPantalla(p).catch(() => "otra")) === "altas") {
      log("Sesión lista. Sigo.\n");
      return p;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

/**
 * ¿Y el login automático?
 *
 * No está, y no es un olvido. Tipear CUIT y clave en el formulario de ARCA obliga a apretar botones
 * que no son «Agregar» ni «Reiniciar», y eso rompe la única protección real que tiene este script: la
 * lista blanca de `boton()`, que es lo que garantiza que nunca se apriete «Aceptar» y se registren
 * altas de verdad. Hay un test que escanea esta fuente y falla ante cualquier `.click()` que no pase
 * por ahí; relajarlo para que entre un login sería cambiar la garantía más importante del proyecto
 * por ahorrar un login cada varios días.
 *
 * Porque eso es lo que compraría: con el perfil dedicado la sesión de ARCA sobrevive días, así que el
 * login no es "cada corrida", es "cada tanto". A cambio habría que poner la clave fiscal en juego —en
 * variables de entorno o en el keychain— y aun así abortar ante el segundo factor, que ARCA pide cada
 * vez más seguido. No compensa.
 *
 * Lo que sí hace el script es ESPERAR: abre el login, dice qué falta y sigue solo cuando la sesión
 * está lista (ver `esperarSesion`).
 */

/**
 * El trabajo, sin CLI alrededor./**
 * El trabajo, sin CLI alrededor.
 *
 * Separado a propósito: el día que esto se dispare de otra forma —un agente local escuchando un
 * pedido de WeProdu, un cron— se llama a esta función y no hay nada que reescribir.
 */
export async function validarObrasSociales({ empresa, cuils, dryRun = false, forzar = false, esperaMin = ESPERA_LOGIN_MIN_DEFAULT, cdpUrl = CDP_URL }) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    throw new Error("Falta la dependencia `playwright-core`.\n\nCorré `npm install` en frontend/ y volvé a intentar.");
  }

  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl);
  } catch {
    // Sin stack trace: el 100% de las veces es que Chrome no está en modo debug.
    throw new Error(
      `No pude conectarme a Chrome en ${cdpUrl}.\n\n` +
        "Levantá el perfil dedicado con:\n" +
        "  npm run chrome-arca\n\n" +
        "Es un Chrome aparte, con su propio perfil: no hace falta cerrar el que estás usando, y el puerto abierto solo alcanza a esa ventana.",
    );
  }

  try {
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error("Chrome respondió pero no tiene ninguna ventana abierta.");

    let page = await buscarPaginaArca(ctx);
    const estado = page ? await estadoPantalla(page) : "otra";
    if (estado !== "altas") {
      page = await esperarSesion(ctx, esperaMin);
      if (!page) {
        throw new Error(`Pasaron ${esperaMin} minuto(s) y la pantalla «Registrar Nuevas Altas» sigue sin estar lista.\n\nDejala abierta en esa ventana de Chrome y volvé a correr esto.`);
      }
    }

    log(`Validando ${cuils.length} CUIL en tandas de ${TOPE_ARCA}…`);

    /** cuil -> rnos ('' = ARCA no tiene afiliación: es una RESPUESTA, no un error). */
    const hechos = new Map();
    /** Los que ARCA no pudo resolver. NO se aplican: ver el filtro final. */
    const errores = new Set();
    let pendientes = [...cuils];
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
          // Emparejamiento dudoso: se frena. Seguir sería exportar obras sociales posiblemente
          // corridas, y del otro lado se guardan fijas, con candado.
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
      log(`  ${hechos.size}/${cuils.length} leídos${errores.size ? ` · ${errores.size} con error` : ""}`);
    }

    // Reinicio final: la pantalla de ARCA queda vacía. Filas cargadas son altas a medio hacer que
    // alguien puede confirmar por error más adelante.
    await reiniciarGrilla(page);

    const items = [...hechos.entries()].map(([cuil, rnos]) => ({ cuil, rnos }));
    const resultado = items.length ? await aplicarLote(empresa, items, { dryRun, forzar }) : { aplicadas: 0, rechazadas: [], dryRun };
    return { items, errores: [...errores], sinSesion, faltaron: cuils.length - hechos.size, resultado };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const args = parsearArgs(process.argv.slice(2));

  /*
    Sin `--empresa` NO se adivina. La validación de "esta obra social está entre las registradas" es
    por CUIT: correr contra la empleadora equivocada escribe datos que parecen bien y están mal, que
    es exactamente lo que este circuito existe para evitar.
  */
  if (!args.empresa) {
    log(
      "Falta --empresa <id>.\n\n" +
        "Es el id de la Empresa Contrato cuyos pendientes se van a validar. Sin eso no se puede correr:\n" +
        "la obra social se valida contra el CUIT de la empleadora, y usar el equivocado guarda un dato\n" +
        "que parece correcto y no lo es.\n\n" +
        "  npm run validar-obras-sociales -- --empresa <id>\n" +
        "  npm run validar-obras-sociales -- --empresa <id> --dry-run\n",
    );
    process.exit(1);
  }

  let cuils = args.cuils;
  if (cuils.length === 0) {
    try {
      const pendientes = await traerPendientes(args.empresa);
      cuils = pendientes.map((p) => conGuiones(p.cuil)).filter(Boolean);
      log(`${cuils.length} pendiente(s) de esa empleadora.`);
    } catch (e) {
      log(`\nNo pude traer los pendientes: ${e.message}\n`);
      process.exit(1);
    }
  }
  if (cuils.length === 0) {
    log("No hay nada pendiente para esa empleadora.");
    return;
  }

  let r;
  try {
    r = await validarObrasSociales({
      empresa: args.empresa,
      cuils,
      dryRun: args.dryRun,
      forzar: args.forzar,
      esperaMin: args.esperaMin,
    });
  } catch (e) {
    log(`\n${e.message}\n`);
    process.exit(1);
  }

  if (r.sinSesion) log(`\nSe cortó la sesión de ARCA. Quedaron ${r.faltaron} sin leer: volvé a entrar y corré esto de nuevo.`);
  if (r.errores.length) log(`\nARCA no devolvió fila para ${r.errores.length} CUIL (no se aplican):\n  ${r.errores.join("\n  ")}`);

  const { aplicadas = 0, rechazadas = [] } = r.resultado || {};
  if (args.dryRun) {
    log(`\n--dry-run: NO se escribió nada. Se aplicarían ${aplicadas}.`);
    for (const { cuil, rnos } of r.items) log(`  ${cuil},${rnos}`);
  } else {
    log(`\n${aplicadas} obra(s) social(es) aplicada(s).`);
  }
  if (rechazadas.length) {
    log(`\n${rechazadas.length} rechazada(s):`);
    for (const x of rechazadas) log(`  ${x.cuil}${x.rnos ? ` (${x.rnos})` : ""} — ${x.motivo}`);
  }
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
