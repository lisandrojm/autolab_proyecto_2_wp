#!/usr/bin/env node
/*
  ============================================================================
  Registrar obras sociales de una empleadora ante ARCA, en lote.
  ============================================================================

  Se conecta por CDP al Chrome dedicado que YA está abierto y logueado (el mismo
  de `npm run chrome-arca`) y opera la pantalla:

    Datos del Empleador → Obras Sociales
    .../MiSimplificacion/app/Contribuyente/Empleador/ObrasSociales.aspx

  ⚠ ESTE SCRIPT ESCRIBE EN EL ORGANISMO.

  Su hermano `validar-obras-sociales.mjs` solo LEE: carga un CUIL, mira qué obra
  social precompleta ARCA, y se va. Este da de alta registros a nombre de una
  empresa real. Por eso:

    - sin `--si` no escribe NADA: la corrida por defecto es un dry-run;
    - antes de escribir verifica que el CUIT en pantalla sea el pedido;
    - solo AGREGA. Nunca da de baja nada (ver LOS DOS BOTONES DE ESTA PANTALLA).

  POR QUÉ ES UN ARCHIVO APARTE Y NO UN COMANDO MÁS DE `validar-obras-sociales`

  Porque la protección más fuerte de aquel script es un test que escanea SU
  fuente y falla ante cualquier `.click()` que no pase por su lista blanca de
  «Agregar» y «Reiniciar» — la que garantiza que nunca se apriete «Aceptar» y se
  registren relaciones laborales de verdad. Meter acá adentro un click que SÍ
  escribe obligaría a aflojar ese escaneo, y el escaneo vale precisamente porque
  no admite excepciones.

  Separados, cada script tiene su propia lista blanca, total y verificada por su
  propio test: aquel no puede tocar nada de esta pantalla, y este no puede tocar
  nada de la de altas. Lo único que se repite son ~30 líneas de conexión CDP, que
  es un precio barato por dos garantías que no se pisan. Se comparte el enfoque y
  el perfil de Chrome, no el archivo.

  USO

    npm run chrome-arca                                          (una vez cada varios días)
    → clave fiscal → Simplificación Registral - Empleadores → elegí el CUIT
    → Datos del Empleador → Obras Sociales, y dejá esa pantalla abierta.

    npm run arca:registrar-obras-sociales -- --empleadora 30717068374
    npm run arca:registrar-obras-sociales -- --empleadora 30717068374 --si
    npm run arca:registrar-obras-sociales -- --empleadora 30717068374 --si --limite 5
*/
import { pathToFileURL } from "node:url";

const CDP_URL = process.env.WEPRODU_CDP_URL || "http://localhost:9222";

/** El dominio de Simplificación Registral. La pantalla concreta la decide `esPantallaObrasSociales`. */
const ARCA_RE = /serviciossegsoc\.afip\.gob\.ar/i;

/** La pantalla de login de ARCA. Se abre, no se completa: la clave la pone una persona. */
const AFIP_LOGIN_URL = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";

/*
  ===========================================================================
  LOS DOS BOTONES DE ESTA PANTALLA. UNO SE APRIETA Y EL OTRO NO EXISTE ACÁ.
  ===========================================================================

    btnAceptaAltaOS   ✅  registra la obra social que quedó cargada en el
                          autocompletar. Es lo único que este script aprieta.

    (baja por fila)   🔴  cada obra social ya registrada tiene, en su fila, su
                          propio `input[type=image]` que la DA DE BAJA.

  Los dos son `input[type=image]` y conviven en la misma pantalla. Buscar «un
  input[type=image]» y clickearlo sería exactamente el error que borra el padrón
  de la empleadora en vez de completarlo — y sin ruido: la pantalla queda igual
  de prolija, con menos filas.

  Por eso el botón se busca SIEMPRE por su id exacto, a través de `botonAlta()`,
  y no hay ninguna otra función en este archivo que dispare un control. El test
  escanea esta fuente y falla ante cualquier `.click()` que no pase por ahí.

  Este script NO da de baja. Si alguna vez hace falta, es otro comando, con su
  propia confirmación y su propia lista blanca — no un flag de este.
*/
export const SELECTORES = {
  /** El texto visible del autocompletar: recibe el `_text` del catálogo. */
  texto: '[id$="PredictOS_AutocompleteText"]',
  /** El valor real que viaja al servidor: recibe el RNOS de 6 dígitos. */
  valor: '[id$="PredictOS_AutocompleteValue"]',
  /** El ÚNICO botón que este script aprieta. */
  altaOS: '[id$="btnAceptaAltaOS"]',
};

/**
 * Entre alta y alta.
 *
 * No es cortesía: es ASP.NET con `__VIEWSTATE`, y cada alta es un postback que reescribe la página
 * entera. Encimar el siguiente antes de que el anterior asiente manda un viewstate viejo, que el
 * servidor rechaza — y el rechazo se ve igual que un alta que no tomó.
 */
export const PAUSA_MS = 120;

/** Los RNOS del catálogo vienen sin ceros a la izquierda; el campo del formulario los quiere con 6. */
export const rellenarRnos = (v) => String(v ?? "").replace(/\D/g, "").padStart(6, "0").slice(-6);

export const soloDigitos = (s) => String(s || "").replace(/\D/g, "");
export const conGuionesCuit = (s) => {
  const d = soloDigitos(s);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : "";
};

// ---------------------------------------------------------------- argumentos
export function parsearArgs(argv) {
  const args = { empleadora: "", si: false, limite: 0, esperaMin: 5 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--empleadora" || a === "-e") args.empleadora = soloDigitos(argv[++i] || "");
    // El flag de escritura se llama `--si` y no `--yes` ni `-y` a propósito: se tipea entero, en el
    // idioma en que está el resto, y no se pega por costumbre de otro comando.
    else if (a === "--si") args.si = true;
    else if (a === "--limite" || a === "-l") args.limite = Math.max(0, Number(argv[++i]) || 0);
    else if (a === "--espera") args.esperaMin = Number(argv[++i]) || 5;
  }
  return args;
}

/**
 * Qué falta registrar: el catálogo menos lo que ya está.
 *
 * Puro y exportado porque es el corazón de la idempotencia. Correr esto dos veces tiene que dar la
 * segunda vez una lista vacía; si se cortó a la mitad, tiene que dar exactamente el resto. Se compara
 * por RNOS rellenado a 6, que es la forma en que la pantalla los escribe.
 */
export function calcularFaltantes(catalogo, registrados) {
  const ya = new Set(registrados.map(rellenarRnos));
  const vistos = new Set();
  const faltan = [];
  for (const os of catalogo) {
    const rnos = rellenarRnos(os._value);
    // El catálogo puede repetir una fila; registrarla dos veces gasta un postback y ensucia el conteo.
    if (!rnos || rnos === "000000" || ya.has(rnos) || vistos.has(rnos)) continue;
    vistos.add(rnos);
    faltan.push({ rnos, texto: String(os._text || "") });
  }
  return faltan;
}

// ------------------------------------------------------------------- páginas
const log = (...a) => console.error(...a);

async function textoPagina(page) {
  return (await page.evaluate(() => document.body?.innerText || "").catch(() => "")) || "";
}

/** ¿Se cayó la sesión de trabajo? ARCA lo dice en el texto, no en el status. */
export async function sinSesion(page) {
  return /sesi[oó]n ha finalizado|FinSession|no ha iniciado su sesi[oó]n|ingrese con su clave fiscal/i.test(await textoPagina(page));
}

/**
 * ¿Estamos parados en Obras Sociales?
 *
 * La prueba es que exista `l_OS`, la global con el catálogo. Es mejor prueba que la URL: si la
 * variable está, la pantalla cargó y sus controles también; si no está, cualquier cosa que hagamos
 * después es a ciegas.
 */
export async function esPantallaObrasSociales(page) {
  return page.evaluate(() => Array.isArray(window.l_OS) && window.l_OS.length > 0).catch(() => false);
}

/** El catálogo, leído de la página. Nunca hardcodeado: las 494 de hoy pueden ser otras mañana. */
async function leerCatalogo(page) {
  return page.evaluate(() => (window.l_OS || []).map((o) => ({ _value: String(o._value ?? ""), _text: String(o._text ?? "") })));
}

/**
 * Las que la empleadora YA tiene registradas.
 *
 * Se toma la tabla con MÁS filas que empiecen con un RNOS, no la suma ni la primera. El HTML de esta
 * pantalla tiene tablas anidadas: contar ingenuamente devolvía 3 cuando había 75 — la tabla externa
 * tiene tres filas de layout y las de verdad viven adentro de una de ellas. Sumar tampoco sirve,
 * porque las filas internas se cuentan también desde afuera.
 */
async function leerRegistrados(page) {
  return page.evaluate(() => {
    const RE = /^\s*(\d{6})\s*-/;
    let mejor = [];
    for (const tabla of document.querySelectorAll("table")) {
      const codigos = [];
      for (const fila of tabla.rows || []) {
        const celda = fila.cells && fila.cells[0];
        const m = celda && RE.exec(celda.textContent || "");
        if (m) codigos.push(m[1]);
      }
      if (codigos.length > mejor.length) mejor = codigos;
    }
    return mejor;
  });
}

/**
 * El CUIT que la pantalla dice estar operando.
 *
 * Devuelve TODOS los de 11 dígitos que aparecen en el texto, no "el" CUIT: dónde lo pinta ARCA
 * cambia entre pantallas y versiones, y elegir uno por posición es adivinar. La verificación de
 * arriba pregunta si el pedido está entre ellos, que es una pregunta que se puede contestar bien.
 *
 * No hay riesgo de confundirlo con un RNOS: los RNOS son de 6 dígitos.
 */
export async function cuitsEnPantalla(page) {
  const txt = await textoPagina(page);
  const encontrados = txt.match(/(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g) || [];
  return [...new Set(encontrados.map((c) => c.replace(/\D/g, "")))];
}

/**
 * El botón de alta, por su id exacto. Es el único control que este script toca.
 *
 * Existe como función y no como un `page.click(...)` suelto para que la garantía sea verificable: el
 * test escanea la fuente y exige que todo `.click()` salga de acá. Ver LOS DOS BOTONES DE ESTA
 * PANTALLA — el de al lado da de baja.
 */
export async function botonAlta(page) {
  const b = page.locator(SELECTORES.altaOS).first();
  return (await b.count()) ? b : null;
}

/**
 * Registra UNA obra social y confirma que entró.
 *
 * La confirmación es por CONTEO y no por el mensaje de la pantalla: ARCA no siempre avisa que algo
 * falló, y un alta que no tomó se ve igual que una que sí. Si el conteo no sube, es fallida.
 */
async function registrarUna(page, os, antes) {
  await page.fill(SELECTORES.texto, os.texto);
  // El oculto se escribe DESPUÉS del visible, y por `evaluate` y no por `fill`: `fill` no opera sobre
  // un input oculto, y el autocompletar pisa el valor cuando cambia el texto. Este orden es el que
  // deja el par (texto, valor) coherente en el momento del submit.
  await page.evaluate(
    ({ sel, valor }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error("No encontré el campo oculto del autocompletar de obra social.");
      el.value = valor;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { sel: SELECTORES.valor, valor: os.rnos },
  );

  const btn = await botonAlta(page);
  if (!btn) throw new Error('No encontré el botón «Registrar obra social» en la pantalla. ¿Seguís en Datos del Empleador → Obras Sociales?');
  await btn.click();
  await page.waitForLoadState("load").catch(() => {});

  if (await sinSesion(page)) return { estado: "sin_sesion" };
  const ahora = (await leerRegistrados(page)).length;
  return { estado: ahora > antes ? "ok" : "falla", ahora };
}

/** Busca la pestaña de ARCA entre las que ya están abiertas. No abre ninguna: sin sesión de trabajo, no sirve. */
async function buscarPaginaArca(ctx) {
  for (const p of ctx.pages()) {
    if (ARCA_RE.test(p.url()) && (await esPantallaObrasSociales(p))) return p;
  }
  for (const p of ctx.pages()) {
    if (ARCA_RE.test(p.url())) return p;
  }
  return null;
}

/** Espera a que alguien deje abierta la pantalla correcta. No toca la clave de nadie. */
async function esperarPantalla(ctx, minutos) {
  const hasta = Date.now() + minutos * 60_000;
  let page = await buscarPaginaArca(ctx);
  if (!page) {
    page = await ctx.newPage();
    await page.goto(AFIP_LOGIN_URL).catch(() => {});
  }
  log(
    `\nFalta la pantalla de Obras Sociales. Te dejé el login abierto en esa ventana de Chrome.\n\n` +
      `  1. Entrá con tu clave fiscal.\n` +
      `  2. Simplificación Registral - Empleadores → elegí el CUIT de la empleadora.\n` +
      `  3. Datos del Empleador → Obras Sociales.\n\n` +
      `Espero hasta ${minutos} minuto(s) y sigo solo…`,
  );
  while (Date.now() < hasta) {
    const p = (await buscarPaginaArca(ctx)) || page;
    if (await esPantallaObrasSociales(p)) {
      log("Pantalla lista. Sigo.\n");
      return p;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

// ------------------------------------------------------------------ el trabajo
/**
 * El trabajo, sin CLI alrededor. Separado igual que en `validar-obras-sociales`: el día que esto se
 * dispare de otra forma se llama a esta función y no hay nada que reescribir.
 *
 * `escribir: false` (el default) hace el cálculo completo y no aprieta ningún botón.
 */
export async function registrarObrasSociales({ empleadora, escribir = false, limite = 0, esperaMin = 5, cdpUrl = CDP_URL, onPaso }) {
  const cuit = soloDigitos(empleadora);
  if (cuit.length !== 11) throw new Error(`«${empleadora}» no es un CUIT de 11 dígitos.`);

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
    if (!page || !(await esPantallaObrasSociales(page))) {
      page = await esperarPantalla(ctx, esperaMin);
      if (!page) {
        throw new Error(`Pasaron ${esperaMin} minuto(s) y la pantalla «Datos del Empleador → Obras Sociales» sigue sin estar lista.\n\nDejala abierta en esa ventana de Chrome y volvé a correr esto.`);
      }
    }

    /*
      LA VERIFICACIÓN QUE VA ANTES DE TODO.

      Registrar bajo la empleadora equivocada le agrega a una empresa real obras sociales que no le
      corresponden, y no avisa: la pantalla queda prolija y el error recién aparece cuando alguien
      audita el padrón. No hay flag para saltear esto.

      Se exige que el CUIT pedido ESTÉ en la pantalla, no que "el" CUIT de la pantalla coincida: si
      no lo podemos confirmar, no seguimos. Es la dirección segura de la duda.
    */
    const enPantalla = await cuitsEnPantalla(page);
    if (!enPantalla.includes(cuit)) {
      throw new Error(
        `La pantalla no está operando el CUIT ${conGuionesCuit(cuit)}.\n\n` +
          (enPantalla.length ? `Encontré en pantalla: ${enPantalla.map(conGuionesCuit).join(", ")}\n\n` : "No encontré ningún CUIT en la pantalla.\n\n") +
          "Volvé a Simplificación Registral - Empleadores, elegí el CUIT correcto y entrá de nuevo a\n" +
          "Datos del Empleador → Obras Sociales. No se escribió nada.",
      );
    }

    const catalogo = await leerCatalogo(page);
    const registradosAntes = await leerRegistrados(page);
    let faltantes = calcularFaltantes(catalogo, registradosAntes);
    const totalFaltantes = faltantes.length;
    if (limite > 0) faltantes = faltantes.slice(0, limite);

    const base = {
      cuit,
      catalogo: catalogo.length,
      registradasAntes: registradosAntes.length,
      faltantes: totalFaltantes,
      aRegistrar: faltantes.length,
    };

    if (!escribir) return { ...base, dryRun: true, registradas: 0, fallidas: [], cortadoPorSesion: false, totalAhora: registradosAntes.length };

    let cuenta = registradosAntes.length;
    let registradas = 0;
    const fallidas = [];
    let cortadoPorSesion = false;

    for (const os of faltantes) {
      const r = await registrarUna(page, os, cuenta);
      if (r.estado === "sin_sesion") {
        // Sesión caída: se FRENA y no se reintenta. Un reintento ciego contra el organismo no
        // resuelve nada. Lo que quedó registrado, quedó: el script es idempotente y retoma solo.
        cortadoPorSesion = true;
        break;
      }
      if (r.estado === "ok") {
        cuenta = r.ahora;
        registradas++;
      } else {
        // No subió el conteo: esa obra social no entró. Se anota y se SIGUE — abortar por una dejaría
        // sin registrar las 300 que sí iban a andar.
        fallidas.push(os);
      }
      onPaso?.({ os, estado: r.estado, registradas, fallidas: fallidas.length, total: faltantes.length });
      await new Promise((r) => setTimeout(r, PAUSA_MS));
    }

    return { ...base, dryRun: false, registradas, fallidas, cortadoPorSesion, totalAhora: cuenta };
  } finally {
    await browser.close().catch(() => {});
  }
}

// --------------------------------------------------------------------- CLI
async function main() {
  const args = parsearArgs(process.argv.slice(2));

  if (args.empleadora.length !== 11) {
    log(
      "Falta --empleadora <cuit>.\n\n" +
        "Es el CUIT de la empleadora cuyo padrón de obras sociales se va a completar. Sin eso no se\n" +
        "puede correr: esto ESCRIBE en ARCA, y hacerlo bajo el CUIT equivocado le agrega a una empresa\n" +
        "real obras sociales que no le corresponden, sin ningún aviso.\n\n" +
        "  npm run arca:registrar-obras-sociales -- --empleadora 30717068374        (dry-run)\n" +
        "  npm run arca:registrar-obras-sociales -- --empleadora 30717068374 --si   (escribe)\n",
    );
    process.exit(1);
  }

  let r;
  try {
    r = await registrarObrasSociales({
      empleadora: args.empleadora,
      escribir: args.si,
      limite: args.limite,
      esperaMin: args.esperaMin,
      onPaso: ({ registradas, fallidas, total }) => {
        if ((registradas + fallidas) % 25 === 0 || registradas + fallidas === total) log(`  ${registradas + fallidas}/${total} · ${registradas} ok${fallidas ? ` · ${fallidas} fallidas` : ""}`);
      },
    });
  } catch (e) {
    log(`\n${e.message}\n`);
    process.exit(1);
  }

  const cuit = conGuionesCuit(r.cuit);

  if (r.dryRun) {
    log(`\n${cuit}`);
    log(`registradas: ${r.registradasAntes} · catálogo: ${r.catalogo} · se van a registrar: ${r.aRegistrar}${r.aRegistrar < r.faltantes ? ` (de ${r.faltantes} que faltan, por --limite)` : ""}`);
    if (r.aRegistrar === 0) log("Ya están todas las del catálogo. No hay nada que hacer.");
    else log("Confirmá con --si para ejecutar.");
    return;
  }

  if (r.cortadoPorSesion) {
    log(`\nSe cortó la sesión de ARCA. Quedaron ${r.aRegistrar - r.registradas - r.fallidas.length} sin registrar.`);
    log("Volvé a entrar y corré esto de nuevo: retoma donde quedó, no duplica nada.");
  }

  if (r.fallidas.length) {
    log(`\n${r.fallidas.length} no entraron (el conteo no subió después del alta):`);
    for (const f of r.fallidas) log(`  ${f.rnos} — ${f.texto}`);
    log("Volvé a correr el comando: las que sí entraron se saltean solas.");
  }

  log(`\nregistradas ${r.registradas} · fallidas ${r.fallidas.length} · total ahora ${r.totalAhora} de ${r.catalogo}`);
}

/* Solo corre cuando se lo invoca directo: importarlo desde un test no puede abrir una sesión. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    log(`\nError inesperado: ${e?.message || e}`);
    process.exit(1);
  });
}
