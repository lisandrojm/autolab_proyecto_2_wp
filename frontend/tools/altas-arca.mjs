/**
 * ALTAS EN ARCA DESDE EL SERVIDOR — Carga Masiva (archivo de 130) y Altas Masivas (pegado de 85).
 *
 * ⚠ ESTE MOTOR ESCRIBE EN EL ORGANISMO, Y DOS DE SUS BOTONES NO SE DESHACEN:
 *
 *    «Enviar» de Carga Masiva (Button_envio)     presenta la novedad con todas sus altas.
 *    «Aceptar» de la grilla de Altas.aspx        registra las altas que haya en la grilla.
 *
 * Altas Masivas se presenta POR TANDAS (el pegado admite pocos registros): este motor presenta UNA
 * tanda por llamada y el servidor las encadena (`server/src/services/arca/tandasAltas.ts`).
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
import { readFile } from "node:fs/promises";
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
  // «Volver» del pegado: sale sin pegar nada. Se usa al leer el tope antes de armar las tandas.
  volver_del_pegado: { id: "btnvolver", pantalla: "archivo_altas" },
  // «Continuar» de Consultas: busca. No modifica nada en ARCA.
  consulta_continuar: { id: "btnContinuar", pantalla: "consulta" },
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
  // El FORMULARIO de Consultas (criterio por CUIL). Su resultado, sin el criterio, es «otra».
  if (/(^|\/)Consulta\.aspx/i.test(a) && tiene("rb1") && tiene("btnContinuar")) return "consulta";
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
      // Aparte, con su tipo: la corrida por tandas se corta sola si ARCA pregunta algo que nadie esperaba.
      onProgreso({ tipo: "dialogoInesperado", mensaje: msg });
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
 * El tope del pegado según la constante de siempre. El que manda es el MENOR entre este y el que
 * dice la pantalla («Ingrese el texto correspondiente a los registros (maximo 9 registros)»): si
 * ARCA lo baja, se respeta; si lo sube, no se estira sin que alguien lo decida.
 */
export const TOPE_PEGADO = 9;

/** El tope que dice la pantalla del pegado. `null` si no lo dice (la pantalla cambió). Puro. */
export function topeDelPegado(texto) {
  const m = String(texto || "").match(/m[aá]ximo\s+(\d{1,3})\s+registros?/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Qué registro rechazó el pegado, a partir del mensaje de ARCA. Devuelve su índice, o -1 si el
 * mensaje no lo dice. Puro.
 *
 * Solo dos formas de saberlo, las dos explícitas: el mensaje trae el CUIL de UN registro del lote, o
 * nombra «registro / línea / fila N». Sin eso no se elige ninguno: se rechaza la tanda entera con el
 * texto de ARCA, que es lo único que se sabe.
 */
export function registroRechazadoDelPegado(mensaje, registros) {
  const t = String(mensaje || "");
  const sinGuiones = t.replace(/(\d)[-.](?=\d)/g, "$1");
  const porCuil = registros.map((r, i) => (sinGuiones.includes(String(r).slice(0, 11)) ? i : -1)).filter((i) => i >= 0);
  if (porCuil.length === 1) return porCuil[0];
  const m = t.match(/(?:registro|l[ií]nea|fila|rengl[oó]n)\s*(?:n(?:ro)?[°º.]?\s*)?(\d{1,3})/i);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= registros.length ? n - 1 : -1;
}

/**
 * Si la pantalla de resultado de Relaciones Laborales → Consultas muestra el alta de esa persona.
 * Devuelve `true` o `null`: NUNCA `false`. Puro.
 *
 * Que no la veamos no prueba que no esté (la consulta puede tardar en mostrarla, o la pantalla puede
 * tener una forma que este lector no conoce), y con un «no está» alguien la volvería a presentar. Por
 * eso solo se afirma lo positivo: el texto trae el CUIL y la fecha de inicio del alta.
 *
 * ⚠ La pantalla de resultado todavía no se relevó con un fixture (el reconocimiento llegó hasta el
 * formulario). Cuando se releve, acá se suma leer la clave de alta (C.A.T.) si la consulta la trae.
 */
export function altaEnConsulta(texto, cuil, fechaInicio) {
  const t = String(texto || "");
  const c = soloDigitos(cuil);
  const f = soloDigitos(fechaInicio);
  if (c.length !== 11 || f.length !== 8) return null;
  const fecha = `${f.slice(0, 2)}/${f.slice(2, 4)}/${f.slice(4)}`;
  const tieneCuil = t.replace(/(\d)-(?=\d)/g, "$1").includes(c);
  return tieneCuil && t.includes(fecha) ? true : null;
}

/**
 * SACA DE LA GRILLA UNA FILA NUESTRA que ARCA rechazó, para que la tanda siguiente la encuentre vacía.
 *
 * Es el «Borrar» de ESA fila (`rptRegistrosAlta_ctlNN_RAR_Eliminar`), buscado por el CUIL de su
 * `RAR_lblCuil` y nunca por posición. Tira si el CUIL no es del lote: las filas que cargó otra persona
 * no se tocan, y «Reiniciar» —que las borra todas— sigue sin existir para este motor.
 */
async function quitarFila(page, cuil, delLote, estado) {
  if (!delLote.includes(cuil)) throw new Error("Esa fila no es de este lote: no se borra.");
  if ((await pantallaActual(page)) !== "altas") throw new Error("La pantalla ya no es Registrar Nuevas Altas: no se borra nada.");
  const idsCuil = await page.evaluate((c) => Array.from(document.querySelectorAll("[id*='rptRegistrosAlta_ctl'][id$='_RAR_lblCuil']")).filter((el) => (el.textContent || "").replace(/\D/g, "") === c).map((el) => el.id), cuil);
  if (idsCuil.length !== 1) throw new Error(`Esperaba UNA fila con ese CUIL en la grilla y hay ${idsCuil.length}.`);
  const btn = page.locator(`[id="${idsCuil[0].replace(/_RAR_lblCuil$/, "_RAR_Eliminar")}"]`);
  if ((await btn.count()) !== 1) throw new Error("No encuentro el «Borrar» de esa fila.");
  // Si ARCA pregunta «¿está seguro?», es la confirmación de este mismo borrado.
  estado.aceptarDialogo = true;
  await btn.click();
  const salio = await esperarEstado(async () => !(await cuilsEnGrilla(page)).includes(cuil), { que: "que la fila salga de la grilla", log });
  estado.aceptarDialogo = false;
  if (!salio) throw new Error("Apreté «Borrar» y la fila sigue en la grilla.");
}

/**
 * Lee de la pantalla del pegado cuántos registros admite ARCA, sin pegar nada, y vuelve.
 *
 * Se llama UNA vez, antes de partir la selección en tandas: el tamaño de la tanda sale de acá. Exige
 * lo mismo que una tanda —empleadora verificada, grilla vacía—, así una corrida que no va a poder
 * presentar se entera antes de empezar.
 */
export async function leerTopeAltasMasivas({ page, empresaCuit, onProgreso = () => {} }) {
  const estado = { aceptarDialogo: false, dialogos: [] };
  const soltar = manejarDialogos(page, estado, onProgreso);
  try {
    const base = await entrarComo(page, empresaCuit);
    await page.goto(`${base}/app/Contribuyente/RelacionLaboral/Altas.aspx`, { waitUntil: "domcontentloaded" });
    if (!(await esperarPantalla(page, ["altas"], "Registrar Nuevas Altas"))) throw new Error(`No llegué a Registrar Nuevas Altas (estoy en ${await pantallaActual(page)}).`);
    await verificarEmpleadora(page, empresaCuit, onProgreso);
    const previas = await cuilsEnGrilla(page);
    if (previas.length > 0) throw new Error(`La grilla de Registrar Nuevas Altas ya tiene ${previas.length} persona(s) cargada(s) sin confirmar. Su «Aceptar» las registraría junto con las nuestras: revisala en ARCA y dejala vacía antes de presentar.`);
    await apretar(page, "altas_masivas");
    if (!(await esperarPantalla(page, ["archivo_altas"], "Ingreso masivo de datos"))) throw new Error("ARCA no abrió «Ingreso masivo de datos».");
    const enPantalla = topeDelPegado((await leerPantalla(page)).texto);
    await apretar(page, "volver_del_pegado");
    await esperarPantalla(page, ["altas"], "volver a Registrar Nuevas Altas");
    return enPantalla;
  } finally {
    soltar();
  }
}

/**
 * ¿El texto trae esa fecha (dd/mm/aaaa)? Tolera cómo la escriba la grilla: con o sin ceros a la
 * izquierda, con barras o guiones, o como aaaa-mm-dd. Puro.
 */
export function fechaEnTexto(texto, fecha) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(fecha || ""));
  if (!m) return false;
  const [, d, mes, a] = m;
  const t = String(texto || "");
  const flexible = new RegExp(`(?<!\\d)0?${Number(d)}[/.-]0?${Number(mes)}[/.-]${a}(?!\\d)`);
  return flexible.test(t) || t.includes(`${a}-${mes}-${d}`) || t.includes(`${a}/${mes}/${d}`);
}

/**
 * De lo que hay en la pantalla de resultado de Consultas, cuál es la casilla de ESA relación y cuál
 * es la impresora. Puro.
 *
 * ⚠ La pantalla de resultado no está relevada con un fixture: no se conocen sus ids. Por eso no se
 * busca un id fijo sino que se EXIGE que haya una sola respuesta posible:
 *   · la casilla es la única cuya fila trae la fecha de inicio del alta (la «general» de arriba no
 *     tiene fecha en su fila);
 *   · la impresora es el único control clickeable que se nombra como tal (id, título, imagen).
 * Con cero o con más de uno no se elige: se devuelve qué había, y con eso se ajusta.
 */
export function elegirEnResultadoDeConsulta({ casillas = [], controles = [], fecha = "" }) {
  /*
    Cada relación es una TARJETA con varias fechas: «Fecha de Inicio», la del C.A.T. y «Fecha de Fin»
    (relevado de la pantalla real, 4/10/2026). La que identifica la relación es la de INICIO: si la
    tarjeta trae ese rótulo se compara solo esa, para que el fin o el envío de OTRA relación que caiga
    el mismo día no la confunda. Sin el rótulo (otra forma de pantalla) vale cualquier fecha.
  */
  const esDeEsaFecha = (fila) => {
    const inicio = /Fecha de Inicio:?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i.exec(String(fila || ""));
    return fechaEnTexto(inicio ? inicio[1] : fila, fecha);
  };
  const deLaRelacion = casillas.filter((c) => c.id && esDeEsaFecha(c.fila));
  if (deLaRelacion.length !== 1) {
    // Se dice QUÉ había en cada fila: es con lo que se ajusta el lector cuando la pantalla no es la esperada.
    const visto = casillas.map((c) => `[${String(c.fila || "").slice(0, 140) || "fila sin texto"}]`).join(" ");
    return { ok: false, motivo: deLaRelacion.length === 0 ? "sin_relacion" : "ambigua", detalle: `Esperaba UNA relación con inicio ${fecha} y hay ${deLaRelacion.length} (casillas en pantalla: ${casillas.length}).${visto ? ` Filas: ${visto}` : ""}` };
  }
  const nombrados = controles.filter((c) => c.id && /imprim|impres|print/i.test(String(c.pista || "")));
  // Si la imagen y su botón se nombran igual, vale el botón.
  const clickeables = nombrados.filter((c) => c.tag !== "img");
  const impresoras = clickeables.length > 0 ? clickeables : nombrados;
  if (impresoras.length !== 1) {
    return { ok: false, motivo: "sin_impresora", detalle: `Esperaba UN ícono de impresora y hay ${impresoras.length}: ${nombrados.map((c) => c.id).join(", ") || "ninguno se nombra como impresora"}.` };
  }
  return { ok: true, casilla: deLaRelacion[0].id, impresora: impresoras[0].id };
}

/**
 * EL ÍCONO DE IMPRESORA DE CONSULTAS: baja la constancia en PDF. No modifica nada en ARCA.
 *
 * Tiene su función, con sus guardas, por lo mismo que los demás clicks: solo en el RESULTADO de
 * Consultas (nunca en la grilla de altas, donde un click equivocado registra), y sobre un control
 * único. Devuelve la descarga.
 */
async function imprimirConstancia(page, id) {
  const { accion } = await leerPantalla(page);
  if (!/(^|\/)Consulta[^/]*\.aspx/i.test(String(accion).split("?")[0])) throw new Error("La pantalla ya no es la de Consultas: no se aprieta la impresora.");
  if ((await pantallaActual(page)) === "altas") throw new Error("Estoy en Registrar Nuevas Altas: acá no se aprieta nada.");
  const btn = page.locator(`[id="${id}"]`);
  if ((await btn.count()) !== 1) throw new Error("No encuentro un único ícono de impresora.");
  const espera = page.waitForEvent("download", { timeout: 45_000 });
  espera.catch(() => {});
  await btn.click();
  return espera;
}

/**
 * Deja la sesión parada en Registrar Nuevas Altas, recién elegida la empleadora. Solo navega.
 *
 * HACE FALTA ANTES DE IR A CONSULTAS. La pantalla en blanco que queda después del selector de CUIT no
 * aguanta ir derecho a `Consulta.aspx`: la pestaña se cae («Page crashed»), reproducido el 4/10/2026
 * en el VPS y en local. Pasando primero por Registrar Nuevas Altas —el recorrido que ya hacían las
 * altas y el reconocimiento— carga bien.
 */
export async function entrarARelacionesLaborales({ page }) {
  await page.goto(`${page.url().split("/app/")[0]}/app/Contribuyente/RelacionLaboral/Altas.aspx`, { waitUntil: "domcontentloaded" });
  if (!(await esperarPantalla(page, ["altas"], "Registrar Nuevas Altas"))) throw new Error(`No llegué a Registrar Nuevas Altas (estoy en ${await pantallaActual(page)}).`);
}

/** Abre Consultas y busca por CUIL. Deja la pantalla en el resultado. */
async function buscarEnConsultas(page, cuil) {
  await page.goto(`${page.url().split("/app/")[0]}/app/Contribuyente/RelacionLaboral/Consulta.aspx`, { waitUntil: "domcontentloaded" });
  if (!(await esperarPantalla(page, ["consulta"], "Consultas de Relaciones Laborales"))) throw new Error(`No llegué a Consultas (estoy en ${await pantallaActual(page)}).`);
  const radio = page.locator(`[id="${PREFIJO}rb1"]`);
  const campo = page.locator(`[id="${PREFIJO}inputCuil_txtCuil"]`);
  if ((await radio.count()) !== 1 || (await campo.count()) !== 1) throw new Error("La pantalla de Consultas no tiene el criterio por CUIL donde se esperaba.");
  await radio.check();
  await campo.fill(cuil);
  await apretar(page, "consulta_continuar");
  // El resultado reemplaza al formulario: se espera a que el criterio por CUIL deje de estar.
  await esperarEstado(async () => (await pantallaActual(page)) !== "consulta", { ms: 15_000, que: "el resultado de la consulta", log });
}

/**
 * Baja de ARCA la constancia del trabajador de UNA relación: Consultas → por CUIL → tildar la
 * relación que empieza en `fechaInicio` (ddmmaaaa) → impresora. SOLO LEE.
 *
 * Devuelve `{ resultado: "descargada", pdf }`, o `{ resultado: "sin_relacion" | "ambigua" |
 * "sin_impresora", detalle }` si la pantalla no dejó una sola respuesta posible. Qué constancia
 * entrega ARCA (alta o baja) no se decide acá: el PDF se valida después, igual que el subido a mano.
 */
export async function descargarConstanciaDeAlta({ page, cuil, fechaInicio, onProgreso = () => {} }) {
  const c = soloDigitos(cuil);
  const f = soloDigitos(fechaInicio);
  if (c.length !== 11 || f.length !== 8) throw new Error("La descarga necesita el CUIL (11 dígitos) y la fecha de inicio (ddmmaaaa).");
  const fecha = `${f.slice(0, 2)}/${f.slice(2, 4)}/${f.slice(4)}`;
  const estado = { aceptarDialogo: false, dialogos: [] };
  const soltar = manejarDialogos(page, estado, onProgreso);
  try {
    await buscarEnConsultas(page, c);
    // El resultado se dibuja por partes: se espera a que aparezcan las casillas antes de leer. Si no
    // aparecen (la persona no tiene relaciones con esta empleadora) se sigue, y se informa.
    await esperarEstado(async () => (await page.locator("input[type=checkbox]").count()) > 0, { ms: 8_000, que: "las relaciones del resultado", log });
    const enPantalla = await page.evaluate(() => {
      const visible = (el) => el.offsetParent !== null;
      const txt = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
      const CON_FECHA = /\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{2}-\d{2}/;
      /*
        LA FILA DE UNA CASILLA es el contenedor más chico que la rodea, trae una fecha y no tiene otra
        casilla adentro. No alcanza con el `tr` más cercano: la casilla puede estar en una tabla
        chica anidada, con las fechas en la celda de al lado. Y no se sube más allá de donde aparece
        otra casilla: eso ya es la grilla entera (es lo que le pasa a la casilla «general» de arriba,
        que por eso queda sin fila).
      */
      const filaDe = (el) => {
        let nodo = el.parentElement;
        for (let nivel = 0; nodo && nivel < 10; nivel++, nodo = nodo.parentElement) {
          if (nodo.querySelectorAll("input[type=checkbox]").length > 1) return "";
          const t = txt(nodo);
          if (CON_FECHA.test(t)) return t.slice(0, 400);
        }
        return "";
      };
      return {
        casillas: Array.from(document.querySelectorAll("input[type=checkbox]")).filter(visible).map((el) => ({ id: el.id, fila: filaDe(el) })),
        controles: Array.from(document.querySelectorAll("input[type=image], input[type=submit], input[type=button], button, a, img"))
          .filter(visible)
          .map((el) => ({ id: el.id, tag: el.tagName.toLowerCase(), pista: [el.id, el.getAttribute("src"), el.getAttribute("title"), el.getAttribute("alt"), el.value, el.getAttribute("onclick"), el.getAttribute("href")].filter(Boolean).join(" ") })),
      };
    });
    const eleccion = elegirEnResultadoDeConsulta({ ...enPantalla, fecha });
    if (!eleccion.ok) return { resultado: eleccion.motivo, detalle: eleccion.detalle, html: await htmlAnonimo(page) };
    const casilla = page.locator(`[id="${eleccion.casilla}"]`);
    if ((await casilla.count()) !== 1) return { resultado: "sin_relacion", detalle: "La casilla de la relación dejó de estar en pantalla.", html: await htmlAnonimo(page) };
    await casilla.check();
    const descarga = await imprimirConstancia(page, eleccion.impresora);
    const ruta = await descarga.path();
    if (!ruta) return { resultado: "sin_impresora", detalle: "ARCA no entregó ningún archivo al apretar la impresora." };
    return { resultado: "descargada", pdf: await readFile(ruta) };
  } finally {
    soltar();
  }
}

/**
 * Relaciones Laborales → Consultas, por CUIL. SOLO LEE: es una búsqueda.
 *
 * Es cómo se resuelve una tanda incierta sin volver a presentarla. Devuelve `{ encontrada, html }`
 * con `encontrada` en `true` o `null` (ver `altaEnConsulta`: nunca `false`).
 */
export async function consultarAltaPorCuil({ page, cuil, fechaInicio }) {
  const c = soloDigitos(cuil);
  if (c.length !== 11) throw new Error("La consulta necesita un CUIL de 11 dígitos.");
  await buscarEnConsultas(page, c);
  const texto = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  return { encontrada: altaEnConsulta(texto, c, fechaInicio), html: await htmlAnonimo(page) };
}

/**
 * Relaciones Laborales → Registrar Nuevas Altas → Altas Masivas: pegar → Aceptar → grilla → Aceptar.
 * UNA TANDA por llamada; quien arma las tandas es el servidor (`tandasAltas.ts`).
 *
 * EN SECO SE CORTA ANTES DEL «ACEPTAR» DEL PEGADO, no antes del de la grilla. La grilla queda
 * guardada en ARCA entre sesiones: dejarla cargada «para probar» deja altas a medio dar que
 * cualquiera puede confirmar después, y la próxima corrida real la encontraría ocupada.
 *
 * QUÉ PASA CON UNA FILA QUE ARCA NO QUIERE:
 *   · la rechaza al pegar y dice cuál → se saca ese registro del texto y se pega el resto;
 *   · la rechaza al pegar y no dice cuál → la tanda entera vuelve «rechazada» con el texto de ARCA
 *     (no se presentó nada);
 *   · no la pasa a la grilla → rechazada, y se registran las que sí pasaron;
 *   · la marca con error después del «Aceptar» → rechazada con su motivo, y se saca de la grilla.
 *     Si además TODAS siguen en la grilla, ese error bloqueó la tanda: las demás vuelven «devuelta»
 *     (no registradas) y se sacan también, para que el servidor las presente en otra tanda.
 *
 * `yaAdentro`: la sesión ya eligió la empleadora en esta corrida (lo hizo `leerTopeAltasMasivas`).
 *
 * `antesDeAceptar(cuils)` se espera justo antes del click que no se deshace: ahí el servidor deja
 * escrito en cada contrato que se está presentando, para que un corte no deje altas sin rastro.
 *
 * Devuelve `{ resultado, porPersona }` con `resultado` en `aceptada` | `rechazada` | `seco` |
 * `indeterminado`, y cada persona en `alta` | `rechazada` | `devuelta` | `indeterminado`.
 */
export async function altasMasivas({ page, empresaCuit, texto, cuils, enSeco = true, tope = TOPE_PEGADO, yaAdentro = false, onProgreso = () => {}, antesDeAceptar = async () => {}, señal = { cortada: false } }) {
  const estado = { aceptarDialogo: false, dialogos: [] };
  const soltar = manejarDialogos(page, estado, onProgreso);
  const pedidos = [...new Set((cuils || []).map(soloDigitos))];
  const limite = Math.min(Number(tope) || TOPE_PEGADO, TOPE_PEGADO);
  try {
    if (pedidos.length === 0 || pedidos.length > limite) throw new Error(`Altas Masivas admite de 1 a ${limite} registros por tanda y esta tiene ${pedidos.length}.`);
    // POR EL SELECTOR SE ENTRA UNA SOLA VEZ POR SESIÓN. Volver a `IndexContribuyente.aspx` estando
    // adentro no muestra el selector: ARCA cierra la sesión (`FinSession.aspx`). En una corrida por
    // tandas ya entró `leerTopeAltasMasivas`, así que las tandas van directo a la pantalla de altas.
    // La garantía de la empleadora no cambia: `verificarEmpleadora` la mira en pantalla en CADA tanda.
    const base = yaAdentro ? page.url().split("/app/")[0] : await entrarComo(page, empresaCuit);
    cortar(señal, "abrir Registrar Nuevas Altas");
    await page.goto(`${base}/app/Contribuyente/RelacionLaboral/Altas.aspx`, { waitUntil: "domcontentloaded" });
    if (!(await esperarPantalla(page, ["altas"], "Registrar Nuevas Altas"))) throw new Error(`No llegué a Registrar Nuevas Altas (estoy en ${await pantallaActual(page)}).`);
    await verificarEmpleadora(page, empresaCuit, onProgreso);
    onProgreso({ tipo: "pantalla", que: "altas" });

    // LA GRILLA TIENE QUE ESTAR VACÍA: su «Aceptar» registra TODO lo que haya, también lo que cargó
    // otra persona. No se toca «Reiniciar»: esas filas no son nuestras.
    const previas = await cuilsEnGrilla(page);
    if (previas.length > 0) throw new Error(`La grilla de Registrar Nuevas Altas ya tiene ${previas.length} persona(s) cargada(s) sin confirmar. Su «Aceptar» las registraría junto con las nuestras: revisala en ARCA y dejala vacía antes de presentar.`);
    onProgreso({ tipo: "grillaVacia" });

    cortar(señal, "abrir Altas Masivas");
    await apretar(page, "altas_masivas");
    if (!(await esperarPantalla(page, ["archivo_altas"], "Ingreso masivo de datos"))) throw new Error("ARCA no abrió «Ingreso masivo de datos».");
    // El tope se vuelve a leer en CADA tanda: es lo que la pantalla dice ahora, no lo que dijo antes.
    const enPantalla = topeDelPegado((await leerPantalla(page)).texto);
    if (enPantalla === null) throw new Error("La pantalla del pegado no dice cuántos registros admite: cambió, y no se pega sin saberlo.");
    if (pedidos.length > enPantalla) throw new Error(`ARCA admite ahora ${enPantalla} registros por pegado y la tanda tiene ${pedidos.length}. No se pegó nada.`);
    const area = page.locator(`[id="${PREFIJO}txtRegistrosAltas"]`);
    if ((await area.count()) !== 1) throw new Error("No encuentro el cuadro de texto de Altas Masivas.");
    await area.fill(texto);
    onProgreso({ tipo: "pegado", registros: pedidos.length });

    if (enSeco) {
      onProgreso({ tipo: "seco" });
      return { resultado: "seco" };
    }

    cortar(señal, "pasar el texto a la grilla");
    // El pegado se repite solo para SACAR un registro que ARCA rechazó y dijo cuál: cada vuelta lleva
    // un registro menos, así que termina. Pegar no presenta nada; el que no se repite es el Aceptar de la grilla.
    const rechazadas = [];
    let registros = String(texto).split("\n").filter(Boolean);
    for (;;) {
      await apretar(page, "aceptar_pegado");
      await esperarPantalla(page, ["altas", "archivo_altas"], "resultado del pegado");
      if ((await pantallaActual(page)) !== "archivo_altas") break;
      const msg = ((await leerPantalla(page)).texto.split("\n").find((l) => /error|inv[aá]lid|incorrect|debe/i.test(l)) || "ARCA no aceptó el texto pegado.").trim();
      const i = registroRechazadoDelPegado(msg, registros);
      const fuera = i >= 0 ? [registros[i]] : registros;
      for (const r of fuera) rechazadas.push({ cuil: r.slice(0, 11), estado: "rechazada", motivo: msg });
      registros = i >= 0 ? registros.filter((_, j) => j !== i) : [];
      if (registros.length === 0) {
        for (const p of rechazadas) onProgreso({ tipo: "persona", ...p });
        return { resultado: "rechazada", porPersona: rechazadas, textoArca: msg, dialogos: estado.dialogos };
      }
      await area.fill(registros.join("\n"));
    }

    const quedan = registros.map((r) => r.slice(0, 11));
    const enGrilla = await cuilsEnGrilla(page);
    const sobran = enGrilla.filter((c) => !pedidos.includes(c));
    onProgreso({ tipo: "grillaCargada", cuils: enGrilla });
    if (sobran.length > 0) {
      throw new Error(`La grilla tiene ${sobran.length} persona(s) que no son de esta tanda. No se confirmó nada: las filas quedaron en la grilla de ARCA SIN registrar. Entrá a Registrar Nuevas Altas y revisala.`);
    }
    // Lo que el pegado no pasó a la grilla, ARCA no lo quiso: rechazada, y se sigue con las que pasaron.
    const pantallaPegado = (await leerPantalla(page)).texto.split("\n");
    for (const c of quedan.filter((x) => !enGrilla.includes(x))) {
      rechazadas.push({ cuil: c, estado: "rechazada", motivo: (pantallaPegado.find((l) => soloDigitos(l).includes(c)) || "ARCA no pasó este registro a la grilla.").trim() });
    }
    const aPresentar = quedan.filter((c) => enGrilla.includes(c));
    if (aPresentar.length === 0) {
      for (const p of rechazadas) onProgreso({ tipo: "persona", ...p });
      return { resultado: "rechazada", porPersona: rechazadas, dialogos: estado.dialogos };
    }

    cortar(señal, "registrar las altas");
    onProgreso({ tipo: "irreversible", que: "aceptar" });
    await antesDeAceptar(aPresentar);
    // ⚠ Desde acá no hay vuelta atrás ni reintento.
    await aceptarGrilla(page, estado);
    await esperarEstado(async () => (await cuilsEnGrilla(page)).length === 0 || (await pantallaActual(page)) !== "altas", { que: "después de Aceptar", log });

    const html = await htmlAnonimo(page);
    const { texto: textoFinal } = await leerPantalla(page);
    const grillaDespues = await cuilsEnGrilla(page).catch(() => null);
    // Resultado por persona: rechazada si su CUIL aparece en una línea de error, alta si la grilla
    // quedó vacía y no hay errores. Cualquier otra cosa no se adivina.
    const lineas = textoFinal.split("\n");
    const errorDe = (cuil) => lineas.find((l) => soloDigitos(l).includes(cuil) && /error|rechaz|no se|inv[aá]lid/i.test(l));
    // Bloqueada: ARCA marcó un error y NINGUNA fila salió de la grilla, o sea que no registró ninguna.
    const bloqueada = !!grillaDespues && aPresentar.every((c) => grillaDespues.includes(c)) && aPresentar.some((c) => errorDe(c));
    const presentadas = aPresentar.map((cuil) => {
      const conCuil = errorDe(cuil);
      if (conCuil) return { cuil, estado: "rechazada", motivo: conCuil.trim() };
      if (bloqueada) return { cuil, estado: "devuelta" };
      if (grillaDespues && grillaDespues.length === 0 && !/error/i.test(textoFinal)) return { cuil, estado: "alta" };
      return { cuil, estado: "indeterminado" };
    });
    // Las nuestras que ARCA rechazó o devolvió se sacan de la grilla, de a una y por su CUIL. Si no se
    // puede, queda dicho: la próxima tanda va a encontrar la grilla ocupada y no va a presentar.
    for (const p of presentadas) {
      if ((p.estado !== "rechazada" && p.estado !== "devuelta") || !grillaDespues?.includes(p.cuil)) continue;
      await quitarFila(page, p.cuil, pedidos, estado).catch((e) => onProgreso({ tipo: "pantalla", que: `no pude sacar una fila rechazada de la grilla (${e?.message || e})` }));
    }
    const porPersona = [...rechazadas, ...presentadas];
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
