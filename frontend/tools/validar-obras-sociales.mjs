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
  Ninguna existe acá: no hace falta cola persistente, ni reanudación, ni
  handshake.

  OJO CON LOS POSTBACKS. Acá decía que «Playwright espera las navegaciones solo,
  así que los postbacks de ASP.NET dejan de importar». Es FALSO y costó caro:
  esta pantalla no navega, hace postbacks AJAX —velo gris y spinner— así que no
  hay ninguna navegación que esperar y `waitForLoadState` resuelve al instante.
  Todo lo que sigue a un click se espera por ESTADO. Ver `arca-postback.mjs`.

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
import { esperarEstado as esperarEstadoDeArca, ESPERA_POSTBACK_MS } from "./arca-postback.mjs";

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

/** El selector de CUIT de Simplificación Registral, y la pantalla de altas. */
const INDEX_CONTRIBUYENTE_RE = /\/login\/IndexContribuyente\.aspx/i;
const ALTAS_ASPX_RE = /\/RelacionLaboral\/Altas\.aspx/i;

const SEL = {
  cuil: "#ctl00_ContentPlaceHolder1_InputCuil_txtCuil",
  obraSocial: 'input[id*="ExtendCodeOS_AutocompleteText"]',
  /**
   * La ✖ roja que saca UN bloque de la pantalla.
   *
   * Se busca por `title`/`alt` y NO por id: ASP.NET prefija los ids con todo el árbol de controles
   * (`ctl00_ContentPlaceHolder1_gv_ctl03_…`) y el índice cambia con cada fila, así que un id fijo
   * anda hoy y falla mañana. El tipo `image` es lo que ARCA usa para estos controles.
   *
   * NO ESTÁ CONFIRMADO CONTRA LA PÁGINA REAL: cuando se escribió esto no había sesión de ARCA a mano.
   * Por eso el que manda no es este selector sino la VERIFICACIÓN de que la pantalla quedó vacía
   * (`vaciarPantalla`): si la ✖ no aparece o no borra, se cae a «Reiniciar» y sigue. El selector es
   * el camino preferido, no una dependencia.
   */
  borrar: 'input[type=image][title*="limin" i], input[type=image][alt*="limin" i], input[type=image][title*="orrar" i], input[type=image][alt*="orrar" i], input[type=image][title*="uitar" i], input[type=image][alt*="uitar" i]',
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

/*
  ===========================================================================
  «ACEPTAR» — EL MISMO RÓTULO EN DOS PANTALLAS, Y UNA NO SE TOCA JAMÁS
  ===========================================================================

    IndexContribuyente.aspx   ✅  «Aceptar» entra al servicio con el CUIT elegido.
                                  No registra nada ante el organismo.
    Altas.aspx                🔴  «Aceptar» CONFIRMA LAS ALTAS. Irreversible.

  Por eso este click NO está en `ROTULOS_PERMITIDOS`, que es una lista de rótulos
  y acá el rótulo no alcanza para decidir: lo que distingue las dos pantallas es
  la URL. La guarda es por URL, es dura, y tira en vez de devolver `false` — un
  `false` lo puede ignorar quien llama; una excepción no.
*/
async function aceptarSelectorDeCuit(page, cuit) {
  if (!INDEX_CONTRIBUYENTE_RE.test(page.url())) {
    throw new Error(`Me pidieron apretar «Aceptar» en ${page.url()}. Solo se aprieta en el selector de CUIT: en la pantalla de altas ese botón registra las altas ante el organismo.`);
  }

  const digitos = soloDigitos(cuit);
  if (digitos.length !== 11) return false;

  /*
    El CUIT se elige por COINCIDENCIA EXACTA de los once dígitos, y si no hay exactamente una
    opción que coincida no se elige nada.

    Correr contra la empleadora equivocada escribe obras sociales que pasan todas las validaciones y
    están mal — y quedan bloqueadas, así que el error sobrevive hasta la rectificativa. Ante
    cualquier duda se deja la pantalla como está y espera la persona, que es lo que pasaba siempre
    hasta ahora: no se pierde nada, no se arriesga nada.
  */
  const opciones = await page.evaluate(() => {
    const sel = document.querySelector("select");
    return sel ? [...sel.options].map((o) => ({ value: o.value, texto: o.textContent || "" })) : [];
  });
  const coinciden = opciones.filter((o) => soloDigitos(`${o.value} ${o.texto}`).includes(digitos));
  if (coinciden.length !== 1) {
    log(`  (no elijo el CUIT solo: ${coinciden.length} opciones coinciden con ${conGuiones(cuit)})`);
    return false;
  }

  const [elegida] = coinciden;
  await page.selectOption("select", elegida.value);
  const btn = page.locator('input[type=submit][value="Aceptar"], input[type=button][value="Aceptar"]').first();
  if (!(await btn.count())) return false;

  // Se REVALIDA la URL pegado al click: entre leer las opciones y apretar hubo awaits, y este es el
  // único botón del proyecto donde equivocarse de pantalla es irreversible.
  if (!INDEX_CONTRIBUYENTE_RE.test(page.url())) throw new Error("La pantalla cambió mientras elegía el CUIT. No aprieto «Aceptar» a ciegas.");
  await btn.click();
  // Se espera un ESTADO —haber salido del selector— y no un evento de carga: es la misma regla que
  // en el resto del archivo, y acá además confirma que el «Aceptar» hizo lo que tenía que hacer.
  return esperarEstadoDeArca(async () => !INDEX_CONTRIBUYENTE_RE.test(page.url()), { que: "salir del selector de CUIT", log });
}

/**
 * Lleva la ventana de ARCA hasta «Registrar Nuevas Altas», sola.
 *
 * Es el «click en empresa, click en el menú, click en altas» que había que hacer a mano en cada
 * corrida. Lo único que NO se puede automatizar es la clave fiscal: no la pedimos ni la guardamos, y
 * eso no es una limitación técnica sino la decisión que hace que este programa sea seguro de correr.
 *
 * Best-effort: si algo no sale, devuelve null y el que llama cae a esperar a la persona — que es
 * exactamente lo que hacía antes. Automatizar esto no puede empeorar el camino que ya funcionaba.
 */
async function prepararAltas(ctx, empresaCuit) {
  const page = await buscarPaginaArca(ctx);
  if (!page) return null;
  if ((await estadoPantalla(page).catch(() => "otra")) === "altas") return page;

  try {
    if (INDEX_CONTRIBUYENTE_RE.test(page.url()) && empresaCuit) {
      if (!(await aceptarSelectorDeCuit(page, empresaCuit))) return null;
    }

    /*
      A la pantalla de altas se va por URL y no clickeando el menú.

      El menú es un desplegable con hover: hay que pasar por «Relaciones Laborales» y después acertar
      un ítem que se dibuja encima del contenido. La URL es un dato estable que ARCA ya expone en ese
      mismo link. Se arma desde la página ACTUAL —mismo host, mismo /app/— en vez de escribirla fija:
      el host y la capitalización de la ruta cambian entre las pantallas de ARCA.
    */
    const base = page.url().split("/app/")[0];
    if (!base || base === page.url()) return null;
    await page.goto(`${base}/app/Contribuyente/RelacionLaboral/Altas.aspx`).catch(() => {});

    return (await estadoPantalla(page).catch(() => "otra")) === "altas" ? page : null;
  } catch (e) {
    log(`  (no pude llegar solo a la pantalla de altas: ${e.message})`);
    return null;
  }
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

/**
 * Deja la grilla de ARCA vacía antes de una tanda.
 *
 * «REINICIAR» NO EXISTE EN LA PANTALLA VACÍA. ARCA lo dibuja recién cuando hay filas cargadas: con la
 * grilla limpia los únicos botones son «Agregar» y «Altas Masivas». Esto trataba su ausencia como un
 * fallo y abortaba la corrida entera ANTES de la primera persona — así que el script solo funcionaba
 * si alguien había dejado filas de antes, que es justo lo que venía a limpiar.
 *
 * Y como el aborto salía por un `break` sin registrar nada, la corrida terminaba «bien» con cero
 * hechas: la pantalla mostraba veinte filas en cola para siempre y parecía colgada.
 *
 * Así que la ausencia del botón ya no es un error POR SÍ SOLA. Lo que importa es el resultado —que
 * la grilla quede vacía—, no que se haya podido apretar algo. Si hay filas y el botón no está, eso sí
 * es un problema real y se dice con un error, no con un `false` que alguien tiene que interpretar.
 */
async function reiniciarGrilla(page) {
  const btn = await boton(page, "Reiniciar");
  if (!btn) {
    if ((await page.locator(SEL.obraSocial).count()) === 0) return; // ya está vacía: no hay nada que hacer
    throw new Error("La grilla de ARCA tiene filas cargadas y no encuentro el botón «Reiniciar» para vaciarla.\n\nVaciala a mano en esa ventana y volvé a intentar: cargar arriba de filas viejas mezclaría los resultados.");
  }
  await btn.click();
  await esperarEstadoDeArca(async () => (await bloquesAbiertos(page)) === 0, { que: "que «Reiniciar» vacíe la pantalla", log });
}

/**
 * Carga un CUIL y ESPERA A QUE EL BLOQUE APAREZCA.
 *
 * La espera es por resultado —hay un bloque más, o ARCA se quejó— y no por un evento de carga que en
 * esta pantalla no ocurre nunca (ver `esperarEstado`). Devuelve si apareció; el que llama decide qué
 * significa que no, porque puede ser el tope, un CUIL inválido o ARCA lento.
 */
async function agregarCuil(page, cuil) {
  const antes = await bloquesAbiertos(page);
  await page.fill(SEL.cuil, cuil);
  const btn = await boton(page, "Agregar");
  if (!btn) throw new Error("No encontré el botón «Agregar» en la pantalla.");
  await btn.click();
  return esperarEstadoDeArca(async () => (await bloquesAbiertos(page)) > antes || (await topeAlcanzado(page)), { que: `el bloque de ${cuil}`, log });
}

/** Cuántos bloques de empleado hay abiertos ahora mismo. Es el invariante de todo el ciclo. */
const bloquesAbiertos = (page) => page.locator(SEL.obraSocial).count();

/**
 * Saca UN bloque con la ✖ roja.
 *
 * ES UN POSTBACK DE ASP.NET: el control postea `name.x`/`name.y` y ARCA devuelve la página entera con
 * un `__VIEWSTATE` nuevo. Hay que esperar a que termine antes de escribir el CUIL siguiente — sobre
 * un VIEWSTATE viejo el `Agregar` se pierde sin decir nada, y ese silencio es el que veníamos
 * persiguiendo.
 *
 * LA ✖ NO ES «ACEPTAR», y esto no se deja librado al selector. Antes de apretar se lee el rótulo del
 * control y se exige que hable de eliminar; cualquier cosa que se parezca a confirmar el trámite
 * aborta. En esta pantalla «Aceptar» REGISTRA LAS ALTAS ANTE EL ORGANISMO (ver LOS DOS BOTONES) y un
 * selector que un día empiece a matchear el control equivocado tiene que chocar contra algo.
 */
async function borrarBloque(page) {
  const x = page.locator(SEL.borrar).first();
  if (!(await x.count())) return false;

  const rotulo = `${(await x.getAttribute("title")) || ""} ${(await x.getAttribute("alt")) || ""}`.trim();
  if (/aceptar|confirmar|registrar/i.test(rotulo)) {
    throw new Error(`El control de borrado dice «${rotulo}». No lo aprieto: en esta pantalla confirmar registra las altas ante el organismo.`);
  }
  if (!/limin|orrar|uitar/i.test(rotulo)) {
    throw new Error(`Encontré un control de borrado con un rótulo inesperado («${rotulo}»). No lo aprieto a ciegas.`);
  }

  const antes = await bloquesAbiertos(page);
  await x.click();
  await esperarEstadoDeArca(async () => (await bloquesAbiertos(page)) < antes, { que: "que el bloque desaparezca", log });
  return true;
}

/**
 * Deja la pantalla en CERO bloques, y lo comprueba.
 *
 * Lo que se garantiza es el RESULTADO, no el método. Primero la ✖ —que es la operación correcta, saca
 * un bloque sin tocar el resto— y si no alcanza, «Reiniciar», que limpia todo de una. Si después de
 * las dos siguen quedando bloques, se corta con un error: seguir cargando arriba de bloques viejos
 * mezcla los resultados, y de ahí sale una obra social guardada sobre la persona equivocada.
 *
 * Cada bloque que queda abierto es un alta a medio iniciar esperando que alguien apriete algo. No
 * dejamos ninguno: lo único que necesitábamos de ARCA —el número que precompleta— ya se leyó.
 */
async function vaciarPantalla(page) {
  if ((await bloquesAbiertos(page)) === 0) return;

  await borrarBloque(page).catch((e) => log(`  (la ✖ no se pudo usar: ${e.message})`));
  if ((await bloquesAbiertos(page)) === 0) return;

  await reiniciarGrilla(page);
  const quedan = await bloquesAbiertos(page);
  if (quedan > 0) {
    throw new Error(`No pude dejar la pantalla de ARCA vacía: quedan ${quedan} bloque(s) cargados.\n\nVaciala a mano en esa ventana y volvé a intentar: cargar arriba de bloques viejos mezclaría los resultados.`);
  }
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
async function esperarSesion(ctx, minutos, onProgreso, señal, empresaCuit) {
  const hasta = Date.now() + minutos * 60_000;
  let page = await buscarPaginaArca(ctx);
  if (!page) {
    /*
      Se REUSA la pestaña de login si ya hay una, en vez de abrir otra.

      Abrir siempre una nueva dejaba una pestaña de AFIP por cada intento fallido: tres intentos, tres
      logins idénticos en el Chrome de la persona. Además de ser basura, confunde — con cuatro
      pestañas iguales no se sabe en cuál hay que entrar, que es exactamente lo que el script le está
      pidiendo que haga.
    */
    page = ctx.pages().find((p) => /auth\.afip\.gob\.ar/i.test(p.url())) || (await ctx.newPage());
    await page.goto(AFIP_LOGIN_URL).catch(() => {});
  }
  log(
    `\nFalta iniciar sesión en ARCA. Te abrí el login en esta ventana de Chrome.\n\n` +
      `  1. Entrá con tu clave fiscal.\n` +
      `  2. Entrá a «Simplificación Registral - Empleadores».\n\n` +
      `Del CUIT de la empleadora y del menú me encargo yo.\n\n` +
      `Espero hasta ${minutos} minuto(s) y sigo solo…`,
  );
  /*
    Este bucle puede durar CINCO MINUTOS, y hasta acá no lo contaba nadie.

    El `log()` de arriba va a stderr: sirve en una terminal y no existe para quien abrió el ejecutable
    desde WeProdu. Desde la pantalla se veía «0 de 20», veinte filas «en cola» y nada moviéndose
    durante minutos — indistinguible de un cuelgue. Y la causa era simple y resoluble: la persona
    estaba en otra pantalla de ARCA.

    Por eso el aviso se emite ANTES de la primera espera y en cada vuelta: lo que la pantalla necesita
    no es un porcentaje, es la frase «te estoy esperando a vos, y esto es lo que falta».
  */
  while (Date.now() < hasta) {
    /*
      «Detener» tiene que detener TAMBIÉN acá.

      Esta espera puede durar cinco minutos, y era el único tramo de la corrida que no miraba la
      señal: el botón se apretaba, la pantalla decía que había parado, y el motor seguía dando
      vueltas — con la corrida marcada como en curso, así que la siguiente contestaba «Ya hay una
      corrida en curso» hasta que se cumpliera el plazo. Un botón que no hace nada durante justo el
      tramo más largo.
    */
    if (señal?.cortada) return null;
    onProgreso?.({ tipo: "esperando", que: "pantalla-altas", restanMs: hasta - Date.now() });

    /*
      En cada vuelta se INTENTA LLEGAR SOLO otra vez.

      Es lo que hace que la persona tenga que hacer una sola cosa: poner la clave fiscal. Apenas
      entra, en la vuelta siguiente esto elige el CUIT y navega a la pantalla de altas — sin que
      tenga que acordarse de «Simplificación Registral → la empresa → Relaciones Laborales →
      Registrar Nuevas Altas», que es el tramo donde se equivoca todo el mundo.
    */
    const listo = await prepararAltas(ctx, empresaCuit);
    if (listo) {
      log("Sesión lista. Sigo.\n");
      onProgreso?.({ tipo: "listo" });
      return listo;
    }

    const p = (await buscarPaginaArca(ctx)) || page;
    if ((await estadoPantalla(p).catch(() => "otra")) === "altas") {
      log("Sesión lista. Sigo.\n");
      onProgreso?.({ tipo: "listo" });
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
/**
 * `soloLeer` y `onProgreso` existen para el Asistente WeProdu.
 *
 * `soloLeer`: devuelve lo que ARCA contestó y NO lo aplica. El asistente corre en la máquina del
 * administrativo y no tiene —ni tiene por qué tener— credenciales de WeProdu: lee de ARCA, le pasa
 * el resultado al navegador, y es el navegador, con la sesión de la persona, el que guarda. Una
 * credencial menos viviendo en un servicio local es una credencial menos que robar.
 *
 * `onProgreso`: se llama al empezar cada CUIL y al cerrar cada tanda, para que la pantalla pueda
 * llenarse fila por fila. La granularidad REAL es por tanda de 10 —la grilla se lee una vez, al
 * final— así que el aviso de "consultando" es por CUIL y el resultado llega de a diez.
 */
export async function validarObrasSociales({ empresa, empresaCuit = "", cuils, dryRun = false, forzar = false, esperaMin = ESPERA_LOGIN_MIN_DEFAULT, cdpUrl = CDP_URL, soloLeer = false, onProgreso, señal }) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    throw new Error("Falta la dependencia `playwright-core`.\n\nCorré `npm install` en frontend/ y volvé a intentar.");
  }

  // Antes del primer CUIL hay una conexión CDP y una búsqueda de pestañas. Sin este evento, la
  // pantalla se queda en «en cola» sin saber si el Asistente siquiera arrancó.
  onProgreso?.({ tipo: "conectando" });

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

  // Fuera del `try` para que el `finally` pueda dejar la pantalla vacía pase lo que pase.
  let page = null;

  try {
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error("Chrome respondió pero no tiene ninguna ventana abierta.");

    // Partir el tramo ciego en dos: hasta acá el problema es de conexión; de acá en adelante, de la
    // pantalla de ARCA. Sin este evento, un reporte que dice «saltó de conectando a fin» no permite
    // saber de qué lado mirar.
    onProgreso?.({ tipo: "conectado" });

    /*
      PRIMERO SE INTENTA LLEGAR SOLO. Ver `prepararAltas`.

      Con la sesión de clave fiscal ya abierta —que dura días en el perfil dedicado— esto elige el
      CUIT de la empleadora y va a la pantalla de altas sin que nadie toque nada. Recién si no se
      puede, se le pide a la persona, que es lo que pasaba siempre.
    */
    page = await prepararAltas(ctx, empresaCuit);
    if (!page) {
      page = await esperarSesion(ctx, esperaMin, onProgreso, señal, empresaCuit);
      if (!page) {
        // Cortado a mano: no es un error, es lo que se pidió. Se vuelve vacío y sin ruido.
        if (señal?.cortada) return { items: [], errores: [], sinSesion: true, faltaron: cuils.length };
        throw new Error(`Pasaron ${esperaMin} minuto(s) y la pantalla «Registrar Nuevas Altas» sigue sin estar lista.\n\nDejala abierta en esa ventana de Chrome y volvé a correr esto.`);
      }
    }

    log(`Validando ${cuils.length} CUIL, de a uno…`);

    /** cuil -> rnos ('' = ARCA no tiene afiliación: es una RESPUESTA, no un error). */
    const hechos = new Map();
    /** Los que ARCA no pudo resolver. NO se aplican: ver el filtro final. */
    const errores = new Set();
    let sinSesion = false;

    /*
      LA PANTALLA ARRANCA VACÍA, siempre.

      Si quedaron bloques de una corrida anterior —se cortó la sesión, se apretó Detener, se cerró el
      Chrome— el primer `Agregar` choca contra el tope de 10 de ARCA y falla EN SILENCIO: pinta un
      cartel rojo y no pasa nada. Sin esta limpieza, la corrida siguiente arranca condenada.
    */
    await vaciarPantalla(page);

    /*
      UNA PERSONA A LA VEZ. Nunca más de un bloque abierto.

      Antes se cargaban de a diez y se leía la grilla entera al final. Dos problemas, y el segundo es
      el grave: ARCA no admite más de 10 relaciones laborales cargadas a la vez —así que la corrida
      se topaba sola— y, sobre todo, cada bloque abierto es UN ALTA A MEDIO INICIAR esperando que
      alguien apriete algo. Diez altas en pantalla es un riesgo sin ninguna contrapartida: lo único
      que se necesita de ARCA es leer el número que precompleta, y una vez leído el bloque no sirve.

      De a uno además hace el progreso real —cada fila cambia de estado cuando le toca, no todas
      juntas al final— y saca el tope: la corrida puede ser de 20, de 50 o de 200.
    */
    for (const cuil of cuils) {
      // Cortar desde afuera se trata como una sesión que se cae: se frena, lo pendiente queda
      // pendiente, y nunca se marca a nadie como "sin obra social" por haber parado.
      if (señal?.cortada) { sinSesion = true; break; }
      if ((await estadoPantalla(page)) !== "altas") {
        // Sesión caída a mitad de camino: se FRENA. Lo pendiente queda pendiente — jamás se lo marca
        // como vacío, porque vacío significa "ARCA dijo que no tiene obra social" y se guarda validado.
        sinSesion = true;
        break;
      }

      onProgreso?.({ tipo: "consultando", cuil });
      const aparecio = await agregarCuil(page, cuil);

      /*
        Si el bloque no llegó a aparecer NO se lee la pantalla.

        Leerla igual devolvería «no está» —que es cierto en ese instante— y lo reportaría como si
        ARCA hubiera rechazado el CUIL. Son cosas distintas: una es un problema de esa persona, la
        otra es que no esperamos lo suficiente. Confundirlas fue lo que llenó la tabla de rojo con
        ARCA funcionando perfecto.
      */
      if (!aparecio && !(await topeAlcanzado(page))) {
        errores.add(cuil);
        onProgreso?.({ tipo: "error", cuil, motivo: `ARCA no respondió a tiempo (${Math.round(ESPERA_POSTBACK_MS / 1000)} s). Puede estar lento: reintentá esta persona.`, hechas: hechos.size, total: cuils.length });
        await vaciarPantalla(page);
        continue;
      }

      const { filas, ambiguas } = await leerFilas(page);

      /*
        EL EMPAREJAMIENTO SE HACE SOBRE LOS DÍGITOS, no sobre el string.

        Acá estaba la causa de que el Asistente no validara NUNCA a nadie. La pantalla de ARCA
        muestra los CUIL con guiones —`23-22702067-9`— y `leerFilas` los devuelve tal cual. La CLI
        normaliza su entrada con guiones, así que `cuil in filas` le daba bien. El Asistente los manda
        pelados —`23227020679`, ver `servidor.mjs`— y esa comparación era falsa siempre, para todas
        las personas, desde el primer día.

        El síntoma no se parecía a la causa: cada persona salía como «ARCA no abrió el bloque», que
        suena a un problema del organismo o de esa persona en particular. ARCA contestaba perfecto.
      */
      const porDigitos = new Map(Object.entries(filas).map(([k, v]) => [soloDigitos(k), v]));
      const cuilDigitos = soloDigitos(cuil);

      if (ambiguas > 0) {
        // Emparejamiento dudoso: se frena. Seguir sería exportar obras sociales posiblemente
        // corridas, y del otro lado se guardan fijas, con candado.
        log(`Frené: no pude emparejar ${ambiguas} bloque(s) con su CUIL. La estructura de la pantalla cambió.`);
        break;
      }

      /*
        SE EMITE ANTES DE BORRAR, a propósito.

        Si el borrado falla, el dato de esta persona ya está guardado y no hay que volver a ARCA por
        ella. Al revés —borrar y después emitir— un fallo al borrar tiraría una consulta que ya
        había salido bien.
      */
      if (porDigitos.has(cuilDigitos)) {
        // `hechos` se indexa con el CUIL COMO VINO: los eventos y los items salen en el mismo formato
        // en que el que llama los mandó, y del otro lado se emparejan sin traducir nada.
        const rnos = porDigitos.get(cuilDigitos);
        hechos.set(cuil, rnos);
        // Del mismo lugar que `hechos`: `filas[cuil]` era la búsqueda cruda que fallaba con los CUIL
        // pelados, y habría mandado `rnos: undefined` — que del otro lado se lee como «no tiene obra
        // social declarada». Un dato inventado sobre alguien, que es lo peor que puede salir de acá.
        onProgreso?.({ tipo: "resultado", cuil, rnos, hechas: hechos.size, total: cuils.length });
      } else {
        /*
          El bloque no apareció. ESTO SÍ ES UN ERROR de esta persona, y hay que verificarlo: cuando
          ARCA rechaza por el tope, `Agregar` no hace nada y sin este chequeo se daría a la persona
          por procesada sin haber leído nada — la forma exacta de `faltaron: N` sin errores.
        */
        const motivo = (await topeAlcanzado(page)) ? "ARCA rechazó por el tope de 10: quedaron bloques de antes en la pantalla." : "ARCA abrió un bloque pero no para este CUIL.";
        errores.add(cuil);
        onProgreso?.({ tipo: "error", cuil, motivo, hechas: hechos.size, total: cuils.length });
      }

      // Y la pantalla vuelve a cero antes del siguiente. Se verifica, no se supone.
      await vaciarPantalla(page);
    }

    const items = [...hechos.entries()].map(([cuil, rnos]) => ({ cuil, rnos }));
    // Con `soloLeer` la función termina acá: quien guarda es el navegador, con la sesión de la persona.
    const resultado = soloLeer ? { aplicadas: 0, rechazadas: [], dryRun: true, soloLeer: true } : items.length ? await aplicarLote(empresa, items, { dryRun, forzar }) : { aplicadas: 0, rechazadas: [], dryRun };
    return { items, errores: [...errores], sinSesion, faltaron: cuils.length - hechos.size, resultado };
  } finally {
    /*
      LA PANTALLA QUEDA VACÍA SIEMPRE: fin normal, «Detener», o error.

      Está en el `finally` y no al final del camino feliz porque los otros dos son justamente los que
      dejaban bloques colgados — y un bloque abierto es un alta a medio iniciar que alguien puede
      confirmar por error más adelante. Es también lo que hacía que la corrida siguiente arrancara
      condenada: diez bloques viejos y el primer `Agregar` rebotando contra el tope.

      El error de limpieza se anota pero NO se propaga: si veníamos con una excepción, esa es la que
      tiene que llegar arriba. Taparla con «no pude vaciar la pantalla» perdería el motivo real.
    */
    if (page) await vaciarPantalla(page).catch((e) => log(`No pude dejar la pantalla de ARCA vacía: ${e.message}`));
    await browser.close().catch(() => {});
  }
}

export async function main() {
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
