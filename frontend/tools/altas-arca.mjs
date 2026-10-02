/**
 * ALTAS EN ARCA DESDE EL SERVIDOR — Carga Masiva (archivo de 130) y Altas Masivas (pegado de 85).
 *
 * ⚠ ESTE MOTOR ESCRIBE EN EL ORGANISMO, Y DOS DE SUS BOTONES NO SE DESHACEN:
 *
 *    «Enviar» de Carga Masiva (Button_envio)     presenta la novedad con todas sus altas.
 *    «Aceptar» de la grilla de Altas.aspx        registra las altas que haya en la grilla.
 *
 * Cada uno vive en SU función (`enviarNovedad`, `aceptarGrilla`), con UN click, sin reintento. Si
 * después del click no se puede leer qué pasó, el resultado es «indeterminado» y se resuelve LEYENDO
 * (el listado de novedades, Relaciones Laborales → Consultas), nunca volviendo a apretar.
 *
 * Archivo propio, y no un agregado a `validar-obras-sociales.mjs`: la garantía de aquel es que NUNCA
 * aprieta «Aceptar», y la verifica un test que escanea su fuente sin excepciones. Este necesita
 * apretarlo; tiene su propia lista blanca y su propio escaneo (`altas-arca.test.mjs`).
 *
 * LAS PANTALLAS SE RECONOCEN POR EL FORMULARIO, NO POR LA URL. El sitio usa `Server.Transfer`: la
 * barra queda una pantalla atrás (se ve `Altas.aspx` con el formulario de `ArchivoAltas.aspx`). Lo
 * que dice dónde se está es el `action` de `form#aspnetForm` y los controles presentes.
 *
 * LOS BOTONES SE BUSCAN POR ID EXACTO Y ATADOS A SU PANTALLA. `boton(page, clave)` mira primero en
 * qué pantalla está y tira si no es la del botón: el mismo `btnAceptar` existe en el pegado (pasa el
 * texto a la grilla) y en la grilla (registra), y lo único que los distingue es la pantalla.
 *
 * Lo que todavía NO se relevó en ARCA (el `input type=file` y el botón «Cargar» de Carga Masiva) está
 * marcado `POR_RELEVAR`: apretarlo tira un error que lo dice. No se adivinan selectores contra un
 * organismo; se miran con `server/src/scripts/reconocerAltasArca.ts`.
 *
 * No importa `playwright-core`: recibe la página ya abierta por el servidor (`navegador.ts`), así no
 * depende de `frontend/node_modules`, que no está en el VPS.
 */
import { esperarEstado } from "./arca-postback.mjs";
import { aceptarSelectorDeCuit } from "./validar-obras-sociales.mjs";

export const PREFIJO = "ctl00_ContentPlaceHolder1_";

/** Lo que significa que un control todavía no se relevó en la pantalla real. */
export const POR_RELEVAR = null;

/**
 * LA LISTA BLANCA: los botones que este motor puede apretar con `apretar()`, por id EXACTO (sin el
 * prefijo) y la pantalla en la que valen. Los dos irreversibles NO están acá: tienen su función.
 */
export const BOTONES = {
  nuevo: { id: "listaNovedades_ctl00_Button_nuevo", pantalla: "carga_masiva_listado" },
  archivo_nuevo: { id: "rel_new", pantalla: "carga_masiva_principal", sufijo: true },
  cargar: { id: POR_RELEVAR, pantalla: "carga_masiva_rel_abm" },
  volver_a_novedad: { id: "Button3", pantalla: "carga_masiva_rel_abm" },
  altas_masivas: { id: "btnArchivoAltas", pantalla: "altas" },
  aceptar_pegado: { id: "btnAceptar", pantalla: "archivo_altas" },
};

/** Los dos que presentan altas. Fuera de `BOTONES` a propósito: `apretar()` no los alcanza. */
const ENVIAR = { id: "Button_envio", pantalla: "carga_masiva_principal" };
const ACEPTAR_GRILLA = { id: "btnAceptar", pantalla: "altas" };

const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
const log = (...a) => console.error(...a);

// ------------------------------------------------------------------ pantallas (puro)
/**
 * En qué pantalla se está, a partir del `action` del formulario y de los ids presentes.
 *
 * Puro y exportado: se testea contra los fixtures que guarda el reconocimiento. Pide las DOS cosas
 * cuando puede —action y un control propio— porque cualquiera sola ya engañó una vez.
 */
export function pantallaAltas({ accion = "", ids = [], texto = "" } = {}) {
  const tiene = (sufijo) => ids.some((id) => id === PREFIJO + sufijo || id.endsWith("_" + sufijo));
  const a = String(accion).split("?")[0];
  if (/sesi[oó]n ha finalizado|FinSession|no ha iniciado su sesi[oó]n|ingrese con su clave fiscal/i.test(texto) || /FinSession\.aspx/i.test(a)) return "sin_sesion";
  if (/IndexContribuyente\.aspx/i.test(a)) return "selector_cuit";
  if (/ArchivoAltas\.aspx/i.test(a) && tiene("txtRegistrosAltas")) return "archivo_altas";
  if (/(^|\/)Altas\.aspx/i.test(a) && tiene("btnArchivoAltas")) return "altas";
  if (/CargaMasiva_rel_abm\.aspx/i.test(a)) return "carga_masiva_rel_abm";
  if (/CargaMasiva_principal\.aspx/i.test(a) && tiene("lblEstado")) return "carga_masiva_principal";
  if (/(^|\/)CargaMasiva\.aspx/i.test(a) && ids.some((id) => /listaNovedades_ctl\d+_/.test(id))) return "carga_masiva_listado";
  return "otra";
}

async function leerPantalla(page) {
  return page
    .evaluate(() => ({
      accion: document.querySelector("form#aspnetForm")?.getAttribute("action") || "",
      ids: Array.from(document.querySelectorAll("[id^='ctl00_']")).map((e) => e.id),
      texto: (document.body?.innerText || "").slice(0, 4000),
    }))
    .catch(() => ({ accion: "", ids: [], texto: "" }));
}

export async function pantallaActual(page) {
  return pantallaAltas(await leerPantalla(page));
}

/** Espera a estar en alguna de esas pantallas. `false` si no llegó (no tira: quien llama decide). */
async function esperarPantalla(page, pantallas, que) {
  return esperarEstado(async () => pantallas.includes(await pantallaActual(page)), { que, log });
}

async function textoDe(page, sufijo) {
  return page.evaluate((id) => (document.getElementById(id)?.textContent || "").trim(), PREFIJO + sufijo).catch(() => "");
}

// ------------------------------------------------------------------ botones
/**
 * El botón, por id exacto y SOLO si la pantalla actual es la suya. Tira en cualquier otro caso.
 */
export async function boton(page, clave) {
  const def = BOTONES[clave];
  if (!def) throw new Error(`Este motor no aprieta «${clave}». Solo: ${Object.keys(BOTONES).join(", ")}.`);
  if (def.id === POR_RELEVAR) throw new Error(`El botón «${clave}» todavía no se relevó en ARCA: hay que correr el reconocimiento (server/src/scripts/reconocerAltasArca.ts) antes de automatizarlo.`);
  const ahora = await pantallaActual(page);
  if (ahora !== def.pantalla) throw new Error(`Iba a apretar «${clave}» en ${def.pantalla} y la pantalla es ${ahora}. No aprieto a ciegas.`);
  const selector = def.sufijo ? `[id$="_${def.id}"]` : `[id="${PREFIJO}${def.id}"]`;
  const b = page.locator(selector);
  const n = await b.count();
  if (n !== 1) throw new Error(`Esperaba UN «${clave}» en ${def.pantalla} y hay ${n}.`);
  return b;
}

async function apretar(page, clave) {
  const btn = await boton(page, clave);
  await btn.click();
}

/** Un botón irreversible, con la misma doble guarda (pantalla + id exacto único). */
async function botonIrreversible(page, def) {
  const ahora = await pantallaActual(page);
  if (ahora !== def.pantalla) throw new Error(`La pantalla cambió (${ahora}) justo antes de presentar. No se apretó nada.`);
  const b = page.locator(`[id="${PREFIJO}${def.id}"]`);
  if ((await b.count()) !== 1) throw new Error(`No encuentro un único «${def.id}» en ${def.pantalla}. No se apretó nada.`);
  return b;
}

/**
 * ⚠ PRESENTA LA NOVEDAD DE CARGA MASIVA. Un click, sin reintento.
 *
 * Si ARCA abre un `confirm()` acá, se acepta: es la confirmación de esta misma acción, que ya se
 * decidió. En cualquier otro momento los diálogos se rechazan (ver `manejarDialogos`).
 */
async function enviarNovedad(page, estado) {
  const btn = await botonIrreversible(page, ENVIAR);
  estado.aceptarDialogo = true;
  await btn.click();
}

/** ⚠ REGISTRA LAS ALTAS DE LA GRILLA. Un click, sin reintento. Ver `enviarNovedad`. */
async function aceptarGrilla(page, estado) {
  const btn = await botonIrreversible(page, ACEPTAR_GRILLA);
  estado.aceptarDialogo = true;
  await btn.click();
}

/**
 * Los diálogos del navegador: se RECHAZAN, salvo el que dispare el click irreversible. Un `confirm()`
 * inesperado aceptado por default podría confirmar algo que nadie pidió.
 */
function manejarDialogos(page, estado, onProgreso) {
  const h = async (d) => {
    const msg = d.message();
    estado.dialogos.push(msg);
    if (estado.aceptarDialogo) {
      estado.aceptarDialogo = false;
      await d.accept().catch(() => {});
    } else {
      onProgreso({ tipo: "pantalla", que: `ARCA preguntó «${msg}» y se respondió que no` });
      await d.dismiss().catch(() => {});
    }
  };
  page.on("dialog", h);
  return () => page.off("dialog", h);
}

// ------------------------------------------------------------------ lecturas
/** Todos los CUIT/CUIL de 11 dígitos del texto de la pantalla (ver `registrar-obras-sociales.mjs`). */
export async function cuitsEnPantalla(page) {
  const txt = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  return [...new Set((txt.match(/(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g) || []).map((c) => c.replace(/\D/g, "")))];
}

/** Los CUIL que hay en la grilla de Altas.aspx (`rptRegistrosAlta_ctlNN_…`). */
export async function cuilsEnGrilla(page) {
  return page.evaluate(() => {
    const out = new Set();
    for (const el of document.querySelectorAll("[id*='rptRegistrosAlta_ctl']")) {
      const t = `${el.value || ""} ${el.textContent || ""}`;
      for (const m of t.match(/(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g) || []) out.add(m.replace(/\D/g, ""));
    }
    return [...out];
  });
}

/** La fila del listado de novedades con ese código: estado, fecha de presentación, transacción. */
export async function leerNovedadEnListado(page, codigo) {
  return page.evaluate((cod) => {
    for (const tr of document.querySelectorAll("tr")) {
      const celdas = [...tr.cells].map((c) => (c.textContent || "").trim());
      if (celdas[0] === cod) return { codigo: celdas[0], fechaCreacion: celdas[1] || "", fechaPresentacion: celdas[2] || "", nroTransaccion: celdas[3] || "", estado: celdas[4] || "" };
    }
    return null;
  }, String(codigo || "").trim());
}

/**
 * La tabla «Archivo a cargar» de la novedad: Descripción / Informado / Estado / Registros.
 * Devuelve la fila de relaciones laborales, o null si no la encuentra.
 */
async function leerArchivoDeNovedad(page) {
  return page.evaluate(() => {
    for (const tr of document.querySelectorAll("tr")) {
      const celdas = [...tr.cells].map((c) => (c.textContent || "").trim());
      if (celdas.length >= 4 && /SI|NO/.test(celdas[1] || "") && /relaci/i.test(celdas[0] || "")) return { descripcion: celdas[0], informado: celdas[1], estado: celdas[2], registros: Number(String(celdas[3]).replace(/\D/g, "")) || 0 };
    }
    return null;
  });
}

/** El HTML de la pantalla, anonimizado (CUIL/CUIT y VIEWSTATE fuera). Va al log de la corrida. */
export async function htmlAnonimo(page) {
  return page
    .evaluate(() => {
      const copia = document.documentElement.cloneNode(true);
      for (const id of ["__VIEWSTATE", "__EVENTVALIDATION"]) copia.querySelector(`#${id}`)?.setAttribute("value", "");
      const w = document.createTreeWalker(copia, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) w.currentNode.nodeValue = (w.currentNode.nodeValue || "").replace(/(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g, "XXXXXXXXXXX");
      for (const el of copia.querySelectorAll("input[value]")) el.setAttribute("value", (el.getAttribute("value") || "").replace(/(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g, "XXXXXXXXXXX"));
      return copia.outerHTML.slice(0, 200_000);
    })
    .catch(() => "");
}

// ------------------------------------------------------------------ guardas comunes
/**
 * Entra con la empleadora del lote: SIEMPRE por el selector de CUIT, aunque la página ya esté adentro
 * (podría estar con otra empleadora). No verifica todavía: la pantalla a la que lleva el selector no
 * muestra el CUIT; el encabezado «Empleador / CUIT» aparece en las de Relaciones Laborales. La
 * verificación la hace `verificarEmpleadora`, ya en la pantalla de trabajo y antes de escribir.
 */
async function entrarComo(page, empresaCuit) {
  const cuit = soloDigitos(empresaCuit);
  if (cuit.length !== 11) throw new Error("La empleadora no tiene un CUIT de 11 dígitos. No se escribió nada.");
  if ((await pantallaActual(page)) !== "selector_cuit") {
    await page.goto(`${page.url().split("/app/")[0]}/app/login/IndexContribuyente.aspx`, { waitUntil: "domcontentloaded" });
  }
  const ok = await aceptarSelectorDeCuit(page, cuit);
  if (!ok) throw new Error(`No pude elegir la empleadora ${cuit} en el selector de ARCA (¿el usuario delegado la tiene?). No se escribió nada.`);
  return page.url().split("/app/")[0];
}

/**
 * VERIFICA en pantalla que la empleadora es la del lote, antes de cualquier escritura: un TXT subido
 * bajo otra empresa ARCA lo acepta sin avisar. Espera unos segundos a que el encabezado lo muestre, y
 * TIRA si no está (nunca devuelve false).
 */
async function verificarEmpleadora(page, empresaCuit, onProgreso) {
  const cuit = soloDigitos(empresaCuit);
  await esperarEstado(async () => (await cuitsEnPantalla(page)).includes(cuit), { ms: 10_000, que: "el CUIT de la empleadora en pantalla", log });
  const enPantalla = await cuitsEnPantalla(page);
  if (!enPantalla.includes(cuit)) throw new Error(`La pantalla de ARCA no muestra el CUIT ${cuit} de la empleadora del lote (muestra ${enPantalla.length ? enPantalla.length + " otro(s)" : "ninguno"}). No se escribió nada.`);
  onProgreso({ tipo: "empleadoraVerificada", cuit });
}

const cortar = (señal, paso) => {
  if (señal?.cortada) throw Object.assign(new Error(`Detenido antes de ${paso}. No se presentó nada.`), { detenido: true });
};

// ------------------------------------------------------------------ CARGA MASIVA
/**
 * Relaciones Laborales → Carga Masiva: novedad nueva → archivo → validación → Enviar.
 *
 * Devuelve `{ resultado, codigoNovedad, estado?, fechaPresentacion?, nroTransaccion?, html? }` con
 * `resultado` en `enviada` | `seco` | `indeterminado`. Cualquier problema ANTES de enviar tira.
 */
export async function cargaMasiva({ page, empresaCuit, txt, registros, enSeco = true, onProgreso = () => {}, señal = { cortada: false } }) {
  const estado = { aceptarDialogo: false, dialogos: [] };
  const soltar = manejarDialogos(page, estado, onProgreso);
  try {
    const base = await entrarComo(page, empresaCuit);
    cortar(señal, "abrir Carga Masiva");
    await page.goto(`${base}/app/Contribuyente/RelacionLaboral/CargaMasiva.aspx`, { waitUntil: "domcontentloaded" });
    if (!(await esperarPantalla(page, ["carga_masiva_listado"], "listado de novedades"))) throw new Error(`No llegué al listado de novedades de Carga Masiva (estoy en ${await pantallaActual(page)}).`);
    await verificarEmpleadora(page, empresaCuit, onProgreso);
    onProgreso({ tipo: "pantalla", que: "carga_masiva" });

    cortar(señal, "crear la novedad");
    await apretar(page, "nuevo");
    if (!(await esperarPantalla(page, ["carga_masiva_principal"], "novedad nueva"))) throw new Error("ARCA no abrió la novedad nueva.");
    const codigoNovedad = await textoDe(page, "lblTitle");
    onProgreso({ tipo: "novedadCreada", codigo: codigoNovedad });

    cortar(señal, "cargar el archivo");
    await apretar(page, "archivo_nuevo");
    if (!(await esperarPantalla(page, ["carga_masiva_rel_abm"], "pantalla del archivo"))) throw new Error("ARCA no abrió la pantalla para cargar el archivo.");
    const inputs = page.locator("input[type=file]");
    if ((await inputs.count()) !== 1) throw new Error(`Esperaba un único campo de archivo y hay ${await inputs.count()}.`);
    // latin-1, sin BOM, LF: los mismos bytes que `downloadTxt`.
    await inputs.setInputFiles({ name: `altas_${soloDigitos(empresaCuit)}.txt`, mimeType: "text/plain", buffer: Buffer.from(txt, "latin1") });
    await apretar(page, "cargar");
    await esperarPantalla(page, ["carga_masiva_principal", "carga_masiva_rel_abm"], "resultado de la carga");
    onProgreso({ tipo: "archivoCargado" });
    if ((await pantallaActual(page)) === "carga_masiva_rel_abm") {
      await apretar(page, "volver_a_novedad");
      await esperarPantalla(page, ["carga_masiva_principal"], "volver a la novedad");
    }

    const fila = await leerArchivoDeNovedad(page);
    const errores = await textoDe(page, "lblErrors");
    const estadoNovedad = await textoDe(page, "lblEstado");
    const valido = !!fila && /v[aá]lido/i.test(fila.estado) && !/inv[aá]lido/i.test(fila.estado) && fila.registros === registros && !errores;
    onProgreso({ tipo: "validacion", estado: fila?.estado || estadoNovedad || "", errores, registrosLeidos: fila?.registros ?? 0, enviados: registros });
    if (!valido) {
      throw Object.assign(new Error(`ARCA no dio el archivo por válido${errores ? `: ${errores}` : fila ? ` (estado «${fila.estado}», ${fila.registros} de ${registros} registros)` : ""}. La novedad ${codigoNovedad} quedó SIN enviar.`), { textoArca: errores || fila?.estado || "", codigoNovedad });
    }

    if (enSeco) {
      onProgreso({ tipo: "seco", codigoNovedad });
      return { resultado: "seco", codigoNovedad };
    }

    cortar(señal, "enviar");
    onProgreso({ tipo: "irreversible", que: "enviar" });
    // ⚠ Desde acá no hay vuelta atrás ni reintento.
    await enviarNovedad(page, estado);
    await esperarEstado(async () => (await pantallaActual(page)) !== "carga_masiva_principal" || !(await page.locator(`[id="${PREFIJO}${ENVIAR.id}"]`).isVisible().catch(() => false)), { que: "después de Enviar", log });
    const html = await htmlAnonimo(page);

    // El resultado se LEE del listado, que es donde ARCA deja Estado, Fecha de Presentación y Nro.
    await page.goto(`${base}/app/Contribuyente/RelacionLaboral/CargaMasiva.aspx`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await esperarPantalla(page, ["carga_masiva_listado"], "listado después de enviar");
    const enListado = await leerNovedadEnListado(page, codigoNovedad).catch(() => null);
    if (enListado && enListado.fechaPresentacion) {
      onProgreso({ tipo: "enviada", estado: enListado.estado, fechaPresentacion: enListado.fechaPresentacion, nroTransaccion: enListado.nroTransaccion });
      return { resultado: "enviada", codigoNovedad, ...enListado, html, dialogos: estado.dialogos };
    }
    onProgreso({ tipo: "indeterminado", comoVerificar: `Buscá la novedad ${codigoNovedad} en Relaciones Laborales → Carga Masiva: si tiene Fecha de Presentación, se envió. NO la vuelvas a enviar desde acá.` });
    return { resultado: "indeterminado", codigoNovedad, html, dialogos: estado.dialogos };
  } finally {
    soltar();
  }
}

// ------------------------------------------------------------------ ALTAS MASIVAS
/**
 * Relaciones Laborales → Registrar Nuevas Altas → Altas Masivas: pegar → Aceptar → grilla → Aceptar.
 *
 * EN SECO SE CORTA ANTES DEL «ACEPTAR» DEL PEGADO, no antes del de la grilla. La grilla queda
 * guardada en ARCA entre sesiones: dejarla cargada «para probar» deja altas a medio dar que
 * cualquiera puede confirmar después, y la próxima corrida real la encontraría ocupada. El paso del
 * pegado a la grilla se verifica con el reconocimiento, con alguien mirando.
 */
export async function altasMasivas({ page, empresaCuit, texto, cuils, enSeco = true, onProgreso = () => {}, señal = { cortada: false } }) {
  const estado = { aceptarDialogo: false, dialogos: [] };
  const soltar = manejarDialogos(page, estado, onProgreso);
  const pedidos = [...new Set((cuils || []).map(soloDigitos))];
  try {
    if (pedidos.length === 0 || pedidos.length > 9) throw new Error(`Altas Masivas admite de 1 a 9 registros y el lote tiene ${pedidos.length}.`);
    const base = await entrarComo(page, empresaCuit);
    cortar(señal, "abrir Registrar Nuevas Altas");
    await page.goto(`${base}/app/Contribuyente/RelacionLaboral/Altas.aspx`, { waitUntil: "domcontentloaded" });
    if (!(await esperarPantalla(page, ["altas"], "Registrar Nuevas Altas"))) throw new Error(`No llegué a Registrar Nuevas Altas (estoy en ${await pantallaActual(page)}).`);
    await verificarEmpleadora(page, empresaCuit, onProgreso);
    onProgreso({ tipo: "pantalla", que: "altas" });

    // LA GRILLA TIENE QUE ESTAR VACÍA: su «Aceptar» registra TODO lo que haya, también lo que cargó
    // otra persona. No se toca «Reiniciar»: esas filas no son nuestras.
    const previas = await cuilsEnGrilla(page);
    if (previas.length > 0) throw new Error(`La grilla de Registrar Nuevas Altas ya tiene ${previas.length} persona(s) cargada(s) sin confirmar. Su «Aceptar» las registraría junto con las nuestras: revisala en ARCA y dejala vacía antes de volver a correr. No se escribió nada.`);
    onProgreso({ tipo: "grillaVacia" });

    cortar(señal, "abrir Altas Masivas");
    await apretar(page, "altas_masivas");
    if (!(await esperarPantalla(page, ["archivo_altas"], "Ingreso masivo de datos"))) throw new Error("ARCA no abrió «Ingreso masivo de datos».");
    const area = page.locator(`[id="${PREFIJO}txtRegistrosAltas"]`);
    if ((await area.count()) !== 1) throw new Error("No encuentro el cuadro de texto de Altas Masivas.");
    await area.fill(texto);
    onProgreso({ tipo: "pegado", registros: pedidos.length });

    if (enSeco) {
      onProgreso({ tipo: "seco" });
      return { resultado: "seco" };
    }

    cortar(señal, "pasar el texto a la grilla");
    await apretar(page, "aceptar_pegado");
    await esperarPantalla(page, ["altas", "archivo_altas"], "resultado del pegado");
    if ((await pantallaActual(page)) === "archivo_altas") {
      const msg = (await leerPantalla(page)).texto.split("\n").find((l) => /error|inv[aá]lid|incorrect|debe/i.test(l)) || "ARCA no aceptó el texto pegado.";
      throw Object.assign(new Error(`ARCA rechazó el texto: ${msg.trim()}`), { textoArca: msg.trim() });
    }
    const enGrilla = await cuilsEnGrilla(page);
    const sobran = enGrilla.filter((c) => !pedidos.includes(c));
    const faltan = pedidos.filter((c) => !enGrilla.includes(c));
    onProgreso({ tipo: "grillaCargada", cuils: enGrilla });
    if (sobran.length > 0 || faltan.length > 0) {
      throw new Error(`La grilla no tiene exactamente las ${pedidos.length} personas del lote (${faltan.length} faltan, ${sobran.length} sobran). No se confirmó nada: las filas quedaron en la grilla de ARCA SIN registrar; revisalas allá.`);
    }

    cortar(señal, "registrar las altas");
    onProgreso({ tipo: "irreversible", que: "aceptar" });
    // ⚠ Desde acá no hay vuelta atrás ni reintento.
    await aceptarGrilla(page, estado);
    await esperarEstado(async () => (await cuilsEnGrilla(page)).length === 0 || (await pantallaActual(page)) !== "altas", { que: "después de Aceptar", log });
    const html = await htmlAnonimo(page);
    const { texto: textoFinal } = await leerPantalla(page);
    const grillaDespues = await cuilsEnGrilla(page).catch(() => pedidos);

    // Resultado por persona: rechazada si su CUIL aparece en una línea de error, alta si la grilla
    // quedó vacía y no hay errores. Cualquier otra cosa no se adivina.
    const lineas = textoFinal.split("\n");
    const porPersona = pedidos.map((cuil) => {
      const conCuil = lineas.find((l) => soloDigitos(l).includes(cuil) && /error|rechaz|no se|inv[aá]lid/i.test(l));
      if (conCuil) return { cuil, estado: "rechazada", motivo: conCuil.trim() };
      if (grillaDespues.length === 0 && !/error/i.test(textoFinal)) return { cuil, estado: "alta" };
      return { cuil, estado: "indeterminado" };
    });
    for (const p of porPersona) onProgreso({ tipo: "persona", ...p });
    if (porPersona.some((p) => p.estado === "indeterminado")) {
      onProgreso({ tipo: "indeterminado", comoVerificar: "Revisá en ARCA → Relaciones Laborales → Consultas si las altas figuran. NO las vuelvas a presentar desde acá." });
      return { resultado: "indeterminado", porPersona, html, dialogos: estado.dialogos };
    }
    return { resultado: "aceptada", porPersona, html, dialogos: estado.dialogos };
  } finally {
    soltar();
  }
}
