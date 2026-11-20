/**
 * BAJA, MODIFICACIÓN Y ANULACIÓN DE UNA RELACIÓN LABORAL EN ARCA — Relaciones Laborales → Modificaciones y Bajas.
 *
 * ⚠ ESTE MOTOR ESCRIBE EN EL ORGANISMO. Tres cosas no se deshacen, y cada una vive en SU función, con UN click
 * y sin reintento:
 *
 *    «Confirmar» de RegistraBaja.aspx       registra la baja (fecha de fin + motivo).            `confirmarBaja`
 *    «Confirmar» de ModificaAlta.aspx       cambia datos ya informados de la relación.           `confirmarModificacion`
 *    el ícono «anular» del listado           anula el alta o la baja comunicada (ARCA confirma    `apretarIcono("anular")`
 *                                            con un diálogo; se acepta sólo el de ESE click).
 *
 * Son TRES operaciones distintas, con reglas y plazos distintos: ARCA lo dice en el propio listado, habilitando
 * o no cada ícono por relación (`disabled`, clase `ImgDisabled`, imagen `_off.gif`). Este motor NUNCA aprieta un
 * ícono deshabilitado: eso es un rechazo por regla de ARCA y se informa como tal (`clase: "regla_arca"`), sin
 * tocar nada. Lo que no es regla de ARCA —sesión caída, pantalla que no es, ARCA que no contesta— se informa
 * aparte (`clase: "navegacion"`) y se puede reintentar.
 *
 * RELEVADO EL 20/11/2026 con `server/src/scripts/reconocerModificacionesArca.ts` (fixtures 04 a 07 en
 * `server/src/services/arca/fixtures/`): la búsqueda por CUIL (`inputCuil_txtCuil` + `btnContinuar`), el listado
 * de tarjetas (`rptRelaciones_ctlNN_…`, con los íconos `img_modif`, `img_baja`, `img_anul`, y el paginador
 * `Paginado_rpt_ctlNN_lnkPaginas`), el formulario de baja (`RegistraBaja.aspx`: fecha de fin, motivo con
 * autocompletar sobre `window.l_SBV`, fecha de telegrama, Cancelar y Confirmar) y el de modificación
 * (`ModificaAlta.aspx`: los datos de la relación precargados, cada código en un autocompletar con su oculto
 * `*_AutocompleteValue`). Lo que pasa DESPUÉS de confirmar no se puede relevar sin confirmar de verdad: por eso
 * el resultado se LEE volviendo a buscar la relación en el listado (fecha de fin, C.B.T., datos), nunca
 * suponiéndolo. Y la anulación: el ícono estaba deshabilitado en la relación de prueba, así que lo que ARCA
 * muestra después de apretarlo no se vio; si aparece una pantalla desconocida, se guarda y no se toca nada más.
 *
 * Archivo propio, y no un agregado a `altas-arca.mjs`: la garantía de aquél son sus cinco clicks, verificados
 * por un escaneo que no admite excepciones. Éste tiene los suyos (`modificaciones-arca.test.mjs`). De aquél se
 * importa sólo lo que no aprieta nada: entrar con la empleadora, verificar su CUIT, leer la pantalla, los
 * diálogos, los textos en rojo y el motivo de un rechazo.
 *
 * No importa `playwright-core`: recibe la página ya abierta por el servidor (`navegador.ts`).
 */
import { esperarEstado, ESPERA_POSTBACK_MS } from "./arca-postback.mjs";
import { PREFIJO, POR_RELEVAR, htmlAnonimo, motivoDelRechazo, cuitsEnPantalla, textoNuevoDesde, isoDeFechaArca, entrarComo, verificarEmpleadora, manejarDialogos, leerPantalla, textosDeError, cortar, pantallaActual as pantallaDeAltas } from "./altas-arca.mjs";

const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
const log = (...a) => console.error(...a);

// ------------------------------------------------------------------ lo que se aprieta
/**
 * LA LISTA BLANCA de `apretar()`: botones por id EXACTO (sin el prefijo) y la pantalla en la que valen.
 * Ninguno escribe en ARCA: «Continuar» busca, «Volver» y «Cancelar» salen sin confirmar.
 */
export const BOTONES = {
  buscar: { id: "btnContinuar", pantalla: "modificaciones_busqueda" },
  volver_listado: { id: "btnVolver", pantalla: "modificaciones_listado" },
  cancelar_baja: { id: "btnCancelar", pantalla: "registra_baja" },
  cancelar_modificacion: { id: "btnCancelar", pantalla: "modifica_alta" },
};

/**
 * LOS TRES ÍCONOS de cada tarjeta del listado, por el sufijo de su id (`…rptRelaciones_ctlNN_img_baja`). Se buscan
 * en la tarjeta de LA relación (por su fecha de inicio), nunca por posición. `abre` es la pantalla que tiene que
 * aparecer después; la de la anulación no se relevó.
 */
export const ICONOS = {
  modificar: { sufijo: "_img_modif", abre: "modifica_alta", irreversible: false },
  baja: { sufijo: "_img_baja", abre: "registra_baja", irreversible: false },
  // ⚠ Anular actúa desde el ícono (ARCA pregunta con un diálogo y listo): apretarlo ES el paso que no se deshace.
  anular: { sufijo: "_img_anul", abre: POR_RELEVAR, irreversible: true },
};

/** Los dos «Confirmar». Fuera de `BOTONES` a propósito: `apretar()` no los alcanza. */
const CONFIRMAR_BAJA = { id: "btnConfirmar", pantalla: "registra_baja" };
const CONFIRMAR_MODIFICACION = { id: "btnConfirmar", pantalla: "modifica_alta" };

/** Los campos del formulario de baja (ids sin prefijo). El motivo es un autocompletar: texto visible + código oculto. */
export const CAMPOS_BAJA = {
  fechaFin: { tipo: "fecha", id: "InputFechaFin_txtFecha" },
  situacionBaja: { tipo: "autocompletar", id: "PredictCodeSitB", catalogo: "l_SBV" },
  fechaTelegrama: { tipo: "fecha", id: "InputFechaTelR_txtFecha" },
};

/**
 * Los campos del formulario de modificación que este motor sabe cambiar, con el catálogo que la pantalla publica
 * para cada autocompletar (de ahí sale el texto que acompaña al código). La obra social no tiene catálogo en la
 * página (lo busca por web service): se escribe el código y el texto que se le pase. Lo que no está acá no se toca.
 */
export const CAMPOS_MODIFICACION = {
  fechaInicio: { tipo: "fecha", id: "InputFechaInicio_txtFecha", enListado: "inicio" },
  fechaFin: { tipo: "fecha", id: "InputFechaFin_txtFecha", enListado: "fin" },
  obraSocial: { tipo: "autocompletar", id: "PredictCodeOS", catalogo: null, enListado: "obraSocial" },
  modalidadContrato: { tipo: "autocompletar", id: "PredictCodeModCont", catalogo: "l_MC", enListado: "modalidad" },
  situacionRevista: { tipo: "autocompletar", id: "PredictCodeSitRev", catalogo: "l_SR", enListado: "sitRevista" },
  sucursal: { tipo: "autocompletar", id: "PredictCodeSucursal", catalogo: "l_Dom", enListado: "sucursal" },
  actividad: { tipo: "autocompletar", id: "PredictCodeAct", catalogo: "l_ActDom", enListado: "actividad" },
  convenio: { tipo: "autocompletar", id: "PredictConvenio", catalogo: "l_CCT", enListado: "convenio" },
  categoria: { tipo: "autocompletar", id: "PredictCategoria", catalogo: "l_CatCCT", enListado: "categoria" },
  puesto: { tipo: "autocompletar", id: "PredictPuesto", catalogo: "l_PD", enListado: "puesto" },
  tipoServicio: { tipo: "autocompletar", id: "PredictTipoServicio", catalogo: "l_TS", enListado: "tipoServicio" },
  retribucion: { tipo: "importe", id: "InputRetribucion_txtRem", enListado: "retribucion" },
  modalidadLiquidacion: { tipo: "autocompletar", id: "PredictCodeMLiq", catalogo: "l_ML", enListado: "modLiq" },
};

// ------------------------------------------------------------------ pantallas (puro)
/**
 * En qué pantalla de Modificaciones y Bajas se está, por el `action` del formulario y los ids presentes. Puro:
 * se testea contra los fixtures 04 a 07. El sitio usa Server.Transfer, así que la URL no sirve; el `action` sí
 * (`RegistraBaja.aspx?idx=0&NP=1` adentro de la URL de Modificaciones).
 */
export function pantallaModificaciones({ accion = "", ids = [], texto = "" } = {}) {
  const tiene = (sufijo) => ids.some((id) => id === PREFIJO + sufijo || id.endsWith("_" + sufijo));
  const a = String(accion).split("?")[0];
  if (/sesi[oó]n ha finalizado|FinSession|no ha iniciado su sesi[oó]n|ingrese con su clave fiscal/i.test(texto) || /FinSession\.aspx/i.test(a)) return "sin_sesion";
  if (/IndexContribuyente\.aspx/i.test(a)) return "selector_cuit";
  if (/RegistraBaja\.aspx/i.test(a) && tiene("InputFechaFin_txtFecha") && tiene("PredictCodeSitB_AutocompleteText")) return "registra_baja";
  if (/ModificaAlta\.aspx/i.test(a) && tiene("InputFechaInicio_txtFecha") && tiene("btnConfirmar")) return "modifica_alta";
  if (/Modificaciones\.aspx/i.test(a) && tiene("inputCuil_txtCuil") && tiene("btnContinuar")) return "modificaciones_busqueda";
  if (/Modificaciones\.aspx/i.test(a) && (ids.some((id) => /rptRelaciones_ctl\d+_/.test(id)) || tiene("btnVolver"))) return "modificaciones_listado";
  // Cero resultados: ARCA manda a ErrorPage con «No se encontraron datos» (como en Consultas).
  if (/No se encontraron datos/i.test(texto)) return "sin_datos";
  return "otra";
}

export async function pantallaActual(page) {
  return pantallaModificaciones(await leerPantalla(page));
}

async function esperarPantalla(page, pantallas, que, ms) {
  return esperarEstado(async () => pantallas.includes(await pantallaActual(page)), { que, log, ms });
}

const textoDelBody = (page) => page.evaluate(() => document.body?.innerText || "").catch(() => "");

// ------------------------------------------------------------------ lectores (puro)
/** "aaaa-mm-dd" → "dd/mm/aaaa", que es como escribe y lee fechas ARCA. "" si no es una fecha ISO. */
export function fechaArca(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Un importe para el campo de retribución de ARCA: coma decimal, dos decimales, sin separador de miles. */
export function importeArca(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "";
  return v.toFixed(2).replace(".", ",");
}

const ROTULOS = ["Empleado", "Obra Social", "Mod. Contrato", "Sucursal", "Actividad", "Convenio", "Categoria", "Puesto", "Tipo Servicio", "Retr. pactada", "Mod. Liq", "Trab. agrop.", "Fecha de Inicio", "C.A.T.", "C.B.T.", "Formulario", "Fecha de Fin", "Sit.Revista", "Lic. COVID", "Fecha Suspension"];
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SIGUIENTE_ROTULO = `(?=\\s*(?:${ROTULOS.map(escapar).join("|")})[^:]{0,60}:|$)`;

/** El valor que sigue a un rótulo en el texto de una tarjeta, hasta el rótulo siguiente. "" si no está. */
function valorDe(texto, rotulo) {
  const re = new RegExp(`${escapar(rotulo)}:?\\s*(.*?)${SIGUIENTE_ROTULO}`, "i");
  const m = re.exec(texto);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

/** «022 - A TIEMPO COMPLETO…» → código «022». Si no empieza con un código, el texto entero. */
const codigoDe = (v) => {
  const m = /^([0-9][0-9/.]*)\s*(?:-|$)/.exec(String(v || "").trim());
  return m ? m[1] : String(v || "").trim();
};

/**
 * LA RELACIÓN QUE DESCRIBE UNA TARJETA del listado, leída de su texto. Puro (fixture 05). Las fechas salen en
 * ISO; la C.A.T. y la C.B.T. son los 20 dígitos de la clave (lo que sigue es la fecha y hora de emisión).
 * Una tarjeta sin «Fecha de Inicio» legible devuelve `inicio: ""` y quien llama no la cuenta.
 */
export function relacionDeTarjeta(texto) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const clave = (v) => (/^(\d{10,})/.exec(String(v || "").trim()) || [])[1] || "";
  return {
    inicio: isoDeFechaArca(valorDe(t, "Fecha de Inicio")),
    fin: isoDeFechaArca(valorDe(t, "Fecha de Fin")),
    cat: clave(valorDe(t, "C.A.T.")),
    cbt: clave(valorDe(t, "C.B.T.")),
    sitRevista: codigoDe(valorDe(t, "Sit.Revista")),
    sitRevistaTexto: valorDe(t, "Sit.Revista"),
    obraSocial: codigoDe(valorDe(t, "Obra Social")),
    modalidad: codigoDe(valorDe(t, "Mod. Contrato")),
    sucursal: codigoDe(valorDe(t, "Sucursal")),
    actividad: codigoDe(valorDe(t, "Actividad")),
    convenio: codigoDe(valorDe(t, "Convenio")),
    categoria: codigoDe(valorDe(t, "Categoria")),
    puesto: codigoDe(valorDe(t, "Puesto")),
    tipoServicio: codigoDe(valorDe(t, "Tipo Servicio")),
    retribucion: valorDe(t, "Retr. pactada"),
    modLiq: codigoDe(valorDe(t, "Mod. Liq")),
  };
}

/** Un ícono de la tarjeta: su id y si ARCA lo habilita. `null` si la tarjeta no lo tiene. */
const iconoDe = (controles, sufijo) => {
  const c = (controles || []).find((x) => String(x.id || "").endsWith(sufijo));
  return c ? { id: c.id, habilitado: !c.deshabilitado } : null;
};

/** Las relaciones del listado, con sus íconos. `filas` = lo que lee `filasDelListado` (texto + controles por tarjeta). Puro. */
export function relacionesDelListado(filas = []) {
  const out = [];
  for (const f of filas) {
    const r = relacionDeTarjeta(f.texto);
    if (!r.inicio) continue;
    out.push({ ...r, iconos: { modificar: iconoDe(f.controles, ICONOS.modificar.sufijo), baja: iconoDe(f.controles, ICONOS.baja.sufijo), anular: iconoDe(f.controles, ICONOS.anular.sufijo) } });
  }
  return out;
}

/**
 * CUÁL ES LA RELACIÓN DEL CONTRATO entre las del listado: la que empieza en `fechaInicio` (ISO). Si hay varias con
 * ese inicio, desempata la que termina en `fechaFin`; si siguen siendo varias y son iguales en fin y C.A.T., la
 * primera; si de verdad difieren, no se adivina (`ambigua`). Puro.
 */
export function elegirRelacion(relaciones = [], { fechaInicio = "", fechaFin = "" } = {}) {
  const inicio = String(fechaInicio || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return { ok: false, motivo: "sin_fecha", detalle: "Hace falta la fecha de inicio del contrato (aaaa-mm-dd) para encontrar la relación." };
  const candidatas = relaciones.filter((r) => r.inicio === inicio);
  if (candidatas.length === 0) {
    const otras = relaciones.map((r) => `inicio ${fechaArca(r.inicio)}${r.fin ? `, fin ${fechaArca(r.fin)}` : ", sin fin"}`);
    return { ok: false, motivo: "sin_relacion", detalle: `ARCA no muestra ninguna relación que empiece el ${fechaArca(inicio)}.${otras.length ? ` Muestra: ${otras.slice(0, 8).join(" · ")}${otras.length > 8 ? "…" : ""}.` : ""}` };
  }
  if (candidatas.length === 1) return { ok: true, relacion: candidatas[0] };
  const fin = String(fechaFin || "").slice(0, 10);
  const conEseFin = fin ? candidatas.filter((r) => r.fin === fin) : [];
  if (conEseFin.length === 1) return { ok: true, relacion: conEseFin[0] };
  const iguales = candidatas.every((r) => r.fin === candidatas[0].fin && r.cat === candidatas[0].cat);
  if (iguales) return { ok: true, relacion: candidatas[0] };
  return {
    ok: false,
    motivo: "ambigua",
    detalle: `ARCA muestra ${candidatas.length} relaciones que empiezan el ${fechaArca(inicio)} y no son iguales: ${candidatas.map((r, i) => `(${i + 1}) ${r.fin ? `fin ${fechaArca(r.fin)}` : "sin fin"}${r.cat ? `, C.A.T. ${r.cat}` : ""}`).join(" · ")}. Hay que ver en ARCA cuál corresponde al contrato.`,
  };
}

/** Lo que una pantalla de ARCA muestre como comprobante, si lo muestra: C.B.T., C.A.T. o un número de transacción. Puro. */
export function acuseEnTexto(texto) {
  const t = String(texto || "").replace(/\s+/g, " ");
  const out = {};
  const cbt = /C\.?\s*B\.?\s*T\.?\s*:?\s*(\d{10,})|Clave de Baja[^0-9]{0,40}(\d{10,})/i.exec(t);
  if (cbt) out.cbt = cbt[1] || cbt[2];
  const cat = /C\.?\s*A\.?\s*T\.?\s*:?\s*(\d{10,})|Clave de Alta[^0-9]{0,40}(\d{10,})/i.exec(t);
  if (cat) out.cat = cat[1] || cat[2];
  const tr = /Transacci[oó]n[^0-9]{0,30}(\d{4,})/i.exec(t);
  if (tr) out.nroTransaccion = tr[1];
  return out;
}

/** Los números de página del paginador propio de ARCA («Paginas: [-1] 1 2»), de los textos de sus links. Puro. */
export function paginasDelPaginador(textos = []) {
  const out = new Set();
  for (const t of textos) {
    const s = String(t || "").replace(/\s+/g, " ").trim();
    if (/^\d{1,4}$/.test(s)) out.add(Number(s));
  }
  return [...out].sort((a, b) => a - b);
}

// ------------------------------------------------------------------ lecturas de pantalla
/**
 * Las tarjetas del listado: el texto entero de cada una (la fecha de inicio va en la columna derecha, que en el
 * texto viene al final) y sus controles con lo que los identifica y si ARCA los deshabilitó.
 */
async function filasDelListado(page) {
  return page
    .evaluate(() =>
      Array.from(document.querySelectorAll("[id*='rptRelaciones_ctl'][id$='_imgEmpleado']")).map((img) => {
        const tarjeta = img.closest(".RegistroCATConsulta") || img.closest("tr") || img.parentElement;
        return {
          texto: (tarjeta?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 6000),
          controles: Array.from(tarjeta?.querySelectorAll("input[type=image], a, img, button") || []).map((el) => ({
            id: el.id || "",
            title: el.getAttribute("title") || "",
            deshabilitado: el.disabled === true || /ImgDisabled/.test(el.className || "") || /_off\.gif$/i.test(el.getAttribute("src") || ""),
          })),
        };
      }),
    )
    .catch(() => []);
}

/** Los links del paginador («Paginas: [-1] 1 2»): sus textos, con `data-weprodu-pag` para apretarlos después. */
async function linksDelPaginador(page) {
  return page
    .evaluate(() =>
      Array.from(document.querySelectorAll("[id*='Paginado_rpt_'][id$='_lnkPaginas']")).map((a, i) => {
        a.setAttribute("data-weprodu-pag", String(i));
        return (a.textContent || "").replace(/\s+/g, " ").trim();
      }),
    )
    .catch(() => []);
}

/** La «firma» del listado: los inicios de las tarjetas en orden. Cambia cuando cambia la página. */
async function firmaDelListado(page) {
  const filas = await filasDelListado(page);
  return filas.map((f) => relacionDeTarjeta(f.texto).inicio).join(",");
}

// ------------------------------------------------------------------ los clicks
/** El botón, por id exacto y SOLO si la pantalla actual es la suya. Tira en cualquier otro caso. */
export async function boton(page, clave) {
  const def = BOTONES[clave];
  if (!def) throw new Error(`Este motor no aprieta «${clave}». Solo: ${Object.keys(BOTONES).join(", ")}.`);
  const ahora = await pantallaActual(page);
  if (ahora !== def.pantalla) throw new Error(`Iba a apretar «${clave}» en ${def.pantalla} y la pantalla es ${ahora}. No aprieto a ciegas.`);
  const b = page.locator(`[id="${PREFIJO}${def.id}"]`);
  const n = await b.count();
  if (n !== 1) throw new Error(`Esperaba UN «${clave}» en ${def.pantalla} y hay ${n}.`);
  return b;
}

async function apretar(page, clave) {
  const btn = await boton(page, clave);
  await btn.click();
}

/**
 * EL ÍCONO DE UNA RELACIÓN, en el listado, por el id que trajo SU tarjeta. Tira si la pantalla no es el listado, si
 * el id no es del ícono pedido, si ARCA lo tiene deshabilitado, o si no hay exactamente uno.
 *
 * Para «anular» es el click que no se deshace: exige `estado.irreversible === true` (lo pone `anularRelacion`
 * después de avisar y de dejar el rastro en el contrato) y acepta el diálogo que abra ESTE click, porque es la
 * confirmación de esta misma acción. Los otros dos abren un formulario y no escriben nada.
 */
export async function apretarIcono(page, clave, relacion, estado) {
  const def = ICONOS[clave];
  if (!def) throw new Error(`No existe el ícono «${clave}». Solo: ${Object.keys(ICONOS).join(", ")}.`);
  const icono = relacion?.iconos?.[clave];
  if (!icono?.id || !String(icono.id).endsWith(def.sufijo)) throw new Error(`La tarjeta no trae el ícono «${clave}» (${icono?.id || "sin id"}).`);
  if (!icono.habilitado) throw Object.assign(new Error(`ARCA tiene deshabilitado «${clave}» para esta relación.`), { reglaArca: true });
  if ((await pantallaActual(page)) !== "modificaciones_listado") throw new Error(`Iba a apretar «${clave}» en el listado y la pantalla es otra. No aprieto a ciegas.`);
  if (def.irreversible && estado?.irreversible !== true) throw new Error(`«${clave}» no se deshace: sólo se aprieta desde su operación, después de avisar.`);
  const btn = page.locator(`[id="${icono.id}"]`);
  if ((await btn.count()) !== 1) throw new Error(`No encuentro un único ícono «${clave}» con ese id en el listado.`);
  if (await btn.isDisabled().catch(() => false)) throw Object.assign(new Error(`ARCA tiene deshabilitado «${clave}» para esta relación.`), { reglaArca: true });
  if (def.irreversible) estado.aceptarDialogo = true;
  await btn.click();
}

/** Va a la página N del paginador del listado. Sólo links cuyo texto es ese número; espera a que el listado cambie. */
async function irAPaginaDelListado(page, n) {
  if ((await pantallaActual(page)) !== "modificaciones_listado") throw new Error("El paginador se usa sólo en el listado.");
  const textos = await linksDelPaginador(page);
  const i = textos.findIndex((t) => t === String(n));
  if (i < 0) return false;
  const btn = page.locator(`[data-weprodu-pag="${i}"]`);
  if ((await btn.count()) !== 1) return false;
  const antes = await firmaDelListado(page);
  await btn.click();
  return esperarEstado(async () => (await firmaDelListado(page)) !== antes, { ms: 20_000, que: `la página ${n} del listado`, log });
}

/** Un botón irreversible, con la misma doble guarda (pantalla + id exacto único). */
async function botonIrreversible(page, def) {
  const ahora = await pantallaActual(page);
  if (ahora !== def.pantalla) throw new Error(`La pantalla cambió (${ahora}) justo antes de confirmar. No se apretó nada.`);
  const b = page.locator(`[id="${PREFIJO}${def.id}"]`);
  if ((await b.count()) !== 1) throw new Error(`No encuentro un único «${def.id}» en ${def.pantalla}. No se apretó nada.`);
  return b;
}

/** ⚠ REGISTRA LA BAJA. Un click, sin reintento. El `confirm()` que abra este click es la confirmación de esta acción. */
async function confirmarBaja(page, estado) {
  const btn = await botonIrreversible(page, CONFIRMAR_BAJA);
  estado.aceptarDialogo = true;
  await btn.click();
}

/** ⚠ CONFIRMA LA MODIFICACIÓN. Un click, sin reintento. */
async function confirmarModificacion(page, estado) {
  const btn = await botonIrreversible(page, CONFIRMAR_MODIFICACION);
  estado.aceptarDialogo = true;
  await btn.click();
}

// ------------------------------------------------------------------ los formularios
async function completarFecha(page, idBase, fechaDdMmAaaa) {
  const campo = page.locator(`[id="${PREFIJO}${idBase}"]`);
  if ((await campo.count()) !== 1) throw new Error(`No encuentro el campo de fecha ${idBase}.`);
  await campo.fill(fechaDdMmAaaa);
}

async function completarTexto(page, idBase, valor) {
  const campo = page.locator(`[id="${PREFIJO}${idBase}"]`);
  if ((await campo.count()) !== 1) throw new Error(`No encuentro el campo ${idBase}.`);
  await campo.fill(String(valor));
}

/** El texto con que la pantalla nombra un código de un catálogo `window.l_*`, o null si el código no está. */
async function textoDelCatalogo(page, catalogo, codigo) {
  if (!catalogo) return null;
  return page
    .evaluate(
      ([cat, cod]) => {
        const lista = window[cat];
        const e = Array.isArray(lista) ? lista.find((x) => String(x?._value) === String(cod)) : null;
        return e ? String(e._text || "").trim() : null;
      },
      [catalogo, String(codigo)],
    )
    .catch(() => null);
}

/**
 * UN AUTOCOMPLETAR DE ARCA (AjaxControlToolkit): el texto visible `*_AutocompleteText` y el oculto `*_AutocompleteValue`,
 * que es el que lee el servidor. Se escribe «código - DESCRIPCIÓN» en el visible (como lo deja la pantalla al
 * precargar) y el código en el oculto. El código tiene que estar en el catálogo que publica la pantalla; si el
 * campo no tiene catálogo local (obra social), vale el texto que se pase.
 */
async function completarAutocompletar(page, def, codigo, textoDado = "") {
  const texto = def.catalogo ? await textoDelCatalogo(page, def.catalogo, codigo) : textoDado || "";
  if (def.catalogo && texto === null) throw Object.assign(new Error(`El código «${codigo}» no está en el catálogo ${def.catalogo} que publica la pantalla de ARCA.`), { reglaArca: true });
  const visible = page.locator(`[id="${PREFIJO}${def.id}_AutocompleteText"]`);
  const oculto = page.locator(`[id="${PREFIJO}${def.id}_AutocompleteValue"]`);
  if ((await visible.count()) !== 1 || (await oculto.count()) !== 1) throw new Error(`El autocompletar ${def.id} no tiene su texto y su valor oculto.`);
  await visible.fill(`${codigo} - ${String(texto || "").toUpperCase()}`.trim());
  await oculto.evaluate((el, v) => {
    el.value = v;
  }, String(codigo));
  // Si el toolkit abrió la lista de sugerencias, se cierra sacando el foco: no se elige nada de ella.
  await visible.evaluate((el) => el.blur()).catch(() => {});
}

/** Lo que el formulario tiene escrito ahora: cada campo con su texto y, en los autocompletar, su código oculto. */
async function valoresDelFormulario(page, campos) {
  const defs = Object.entries(campos).map(([clave, d]) => ({ clave, ...d }));
  return page.evaluate(
    ([prefijo, lista]) => {
      const out = {};
      for (const d of lista) {
        if (d.tipo === "autocompletar") {
          out[d.clave] = { texto: document.getElementById(`${prefijo}${d.id}_AutocompleteText`)?.value || "", codigo: document.getElementById(`${prefijo}${d.id}_AutocompleteValue`)?.value || "" };
        } else {
          out[d.clave] = { texto: document.getElementById(`${prefijo}${d.id}`)?.value || "" };
        }
      }
      return out;
    },
    [PREFIJO, defs],
  );
}

/** La evidencia de lo que devolvió ARCA después de un click: va al log y a los errores. */
async function evidencia(page, { estado, dialogosAntes, textoAntes }) {
  const textoDespues = await textoDelBody(page);
  return {
    html: await htmlAnonimo(page),
    dialogos: (estado?.dialogos || []).slice(dialogosAntes || 0),
    enRojo: await textosDeError(page).catch(() => []),
    textoNuevo: textoNuevoDesde(textoAntes, textoDespues),
  };
}

/** Un error de navegación con la pantalla adjunta, para que el log diga dónde quedó. */
const falloDeNavegacion = async (page, mensaje) => Object.assign(new Error(mensaje), { clase: "navegacion", html: await htmlAnonimo(page) });

// ------------------------------------------------------------------ leer la relación (sólo lee)
/**
 * Busca las relaciones del CUIL con la empleadora y elige la del contrato (por su fecha de inicio, ISO). SOLO LEE.
 * Deja la página en la página del listado donde está la relación, lista para apretar su ícono.
 *
 *   { resultado: "ok", relacion, relaciones, html }
 *   { resultado: "sin_relacion" | "ambigua" | "sin_datos", detalle, relaciones, html }
 *   { resultado: "sin_sesion" }
 *
 * `yaAdentro`: la empleadora ya se eligió en esta sesión (volver al selector la cierra, ver `altasMasivas`).
 */
export async function leerRelacion({ page, empresaCuit, cuil, fechaInicio, fechaFin = "", yaAdentro = false, onProgreso = () => {} }) {
  const c = soloDigitos(cuil);
  if (c.length !== 11) throw new Error("La lectura necesita un CUIL de 11 dígitos.");
  const base = yaAdentro ? page.url().split("/app/")[0] : await entrarComo(page, empresaCuit);
  // Por Registrar Nuevas Altas primero: desde el selector, ir derecho a otra pantalla tira la pestaña (visto en Consultas).
  if (!yaAdentro) {
    await page.goto(`${base}/app/Contribuyente/RelacionLaboral/Altas.aspx`, { waitUntil: "domcontentloaded" });
    if (!(await esperarEstado(async () => (await pantallaDeAltas(page)) === "altas", { que: "Registrar Nuevas Altas", log }))) {
      if ((await pantallaActual(page)) === "sin_sesion") return { resultado: "sin_sesion" };
      throw await falloDeNavegacion(page, `No llegué a Registrar Nuevas Altas (estoy en ${await pantallaDeAltas(page)}).`);
    }
  }
  await page.goto(`${base}/app/Contribuyente/RelacionLaboral/Modificaciones.aspx`, { waitUntil: "domcontentloaded" });
  if (!(await esperarPantalla(page, ["modificaciones_busqueda"], "la búsqueda de Modificaciones y Bajas"))) {
    const p = await pantallaActual(page);
    if (p === "sin_sesion") return { resultado: "sin_sesion" };
    throw await falloDeNavegacion(page, `No llegué a la búsqueda de Modificaciones y Bajas (estoy en ${p}).`);
  }
  // El CUIT de la empleadora en pantalla ANTES de tocar nada: tira si no está.
  await verificarEmpleadora(page, empresaCuit, onProgreso);
  onProgreso({ tipo: "pantalla", que: "modificaciones_busqueda" });

  const radio = page.locator(`[id="${PREFIJO}rb1"]`);
  const campo = page.locator(`[id="${PREFIJO}inputCuil_txtCuil"]`);
  if ((await radio.count()) !== 1 || (await campo.count()) !== 1) throw await falloDeNavegacion(page, "La búsqueda de Modificaciones no tiene el criterio por CUIL donde se esperaba.");
  if (!(await radio.isChecked().catch(() => false))) await radio.check();
  await campo.fill(c);
  await apretar(page, "buscar");
  await esperarEstado(async () => (await pantallaActual(page)) !== "modificaciones_busqueda", { ms: 30_000, que: "el resultado de la búsqueda", log });
  await page.waitForTimeout(500).catch(() => {});
  let pantalla = await pantallaActual(page);
  if (pantalla === "sin_sesion") return { resultado: "sin_sesion" };
  if (pantalla === "sin_datos") return { resultado: "sin_datos", detalle: "ARCA no tiene relaciones de este CUIL con la empleadora elegida.", relaciones: [], html: await htmlAnonimo(page) };
  if (pantalla !== "modificaciones_listado") throw await falloDeNavegacion(page, `Después de buscar, la pantalla no es el listado de Modificaciones (${pantalla}).`);
  onProgreso({ tipo: "pantalla", que: "modificaciones_listado" });

  // Página por página hasta encontrar la relación (lo más nuevo sale primero; una persona puede tener decenas).
  const vistas = new Set([1]);
  let relaciones = relacionesDelListado(await filasDelListado(page));
  let eleccion = elegirRelacion(relaciones, { fechaInicio, fechaFin });
  for (let vueltas = 0; !eleccion.ok && eleccion.motivo === "sin_relacion" && vueltas < 50; vueltas++) {
    const n = paginasDelPaginador(await linksDelPaginador(page)).find((x) => !vistas.has(x));
    if (n === undefined) break;
    vistas.add(n);
    onProgreso({ tipo: "pagina", numero: n });
    if (!(await irAPaginaDelListado(page, n))) break;
    const deEsta = relacionesDelListado(await filasDelListado(page));
    relaciones = [...relaciones, ...deEsta];
    eleccion = elegirRelacion(deEsta, { fechaInicio, fechaFin });
  }
  if (!eleccion.ok) return { resultado: eleccion.motivo, detalle: eleccion.detalle, relaciones, html: await htmlAnonimo(page) };
  return { resultado: "ok", relacion: eleccion.relacion, relaciones, html: await htmlAnonimo(page) };
}

/** Un resultado de lectura que no es «ok», convertido en el resultado de una operación: ARCA no tiene (o no muestra) la relación. */
function fallidaPorLectura(lectura) {
  if (lectura.resultado === "sin_sesion") return { resultado: "fallida", clase: "navegacion", motivo: "La sesión de ARCA se cayó antes de operar.", relaciones: [] };
  return { resultado: "fallida", clase: "regla_arca", motivo: lectura.detalle || `ARCA no muestra la relación (${lectura.resultado}).`, relaciones: lectura.relaciones || [], html: lectura.html };
}

/** Qué pasó después de un «Confirmar»: espera a que la pantalla deje el formulario, aparezca un diálogo o cambie el texto. */
async function esperarRespuesta(page, formulario, { estado, dialogosAntes, textoAntes }) {
  const hayDialogo = () => (estado?.dialogos?.length || 0) > (dialogosAntes || 0);
  const cambio = await esperarEstado(async () => (await pantallaActual(page)) !== formulario || hayDialogo() || (await textoDelBody(page)) !== textoAntes, { ms: ESPERA_POSTBACK_MS, que: "que ARCA conteste el Confirmar", log });
  if (cambio) await esperarEstado(async () => ["modificaciones_listado", "modificaciones_busqueda", "sin_datos", "sin_sesion", formulario].includes(await pantallaActual(page)), { ms: ESPERA_POSTBACK_MS, que: "que la pantalla se asiente después de confirmar", log });
  return { cambio, pantalla: await pantallaActual(page) };
}

// ------------------------------------------------------------------ BAJA
/**
 * Relaciones Laborales → Modificaciones y Bajas → ícono «Registrar baja» → fecha de fin + motivo (+ telegrama) → Confirmar.
 *
 * Devuelve `{ resultado, clase?, motivo?, relacion, payload, acuse?, html… }` con `resultado` en
 * `presentada` | `rechazada` | `fallida` | `indeterminado` | `seco` | `ya_hecha`.
 *   · `ya_hecha`: la relación ya tiene esa misma fecha de fin en ARCA (no se toca nada).
 *   · `fallida` con `clase: "regla_arca"`: ARCA no habilita la baja para esa relación, o no la muestra.
 *   · `rechazada`: se confirmó y ARCA se quedó en el formulario con un mensaje (el motivo literal).
 *   · `presentada`: después de confirmar, el listado muestra la relación con esa fecha de fin (y su C.B.T. si la publica).
 *   · `indeterminado`: se confirmó y no se pudo leer el resultado. NO se reintenta: se mira en ARCA.
 * EN SECO se completa el formulario, se informa lo escrito y se aprieta «Cancelar»: nada queda en ARCA.
 * `antesDeConfirmar(valores)` se espera justo antes del click que no se deshace: ahí el servidor deja el rastro.
 */
export async function registrarBaja({ page, empresaCuit, cuil, fechaInicio, fechaFin, situacionBaja, fechaTelegrama = "", enSeco = true, yaAdentro = false, onProgreso = () => {}, antesDeConfirmar = async () => {}, señal = { cortada: false } }) {
  const estado = { aceptarDialogo: false, dialogos: [], irreversible: false };
  const soltar = manejarDialogos(page, estado, onProgreso);
  try {
    if (!fechaArca(fechaFin)) throw new Error("La baja necesita la fecha de fin (aaaa-mm-dd).");
    if (!String(situacionBaja || "").trim()) throw new Error("La baja necesita el motivo (código de situación de baja).");
    const lectura = await leerRelacion({ page, empresaCuit, cuil, fechaInicio, fechaFin, yaAdentro, onProgreso });
    if (lectura.resultado !== "ok") return fallidaPorLectura(lectura);
    const relacion = lectura.relacion;
    onProgreso({ tipo: "relacion", relacion });
    if (relacion.fin === fechaFin && relacion.cbt) return { resultado: "ya_hecha", relacion, acuse: { cbt: relacion.cbt }, motivo: `ARCA ya tiene la baja al ${fechaArca(fechaFin)} (C.B.T. ${relacion.cbt}).`, html: lectura.html };
    if (!relacion.iconos.baja?.habilitado) {
      const porque = relacion.fin ? `la relación ya tiene fecha de fin ${fechaArca(relacion.fin)}${relacion.cbt ? ` (C.B.T. ${relacion.cbt})` : ""}` : "ARCA no ofrece la baja para esta relación";
      return { resultado: "fallida", clase: "regla_arca", motivo: `ARCA tiene deshabilitado «Registrar baja»: ${porque}.`, relacion, html: lectura.html };
    }

    cortar(señal, "abrir el formulario de baja");
    await apretarIcono(page, "baja", relacion, estado);
    if (!(await esperarPantalla(page, ["registra_baja"], "el formulario de baja"))) throw await falloDeNavegacion(page, `ARCA no abrió el formulario de baja (estoy en ${await pantallaActual(page)}).`);
    const { texto } = await leerPantalla(page);
    if (!texto.includes(fechaArca(fechaInicio))) throw await falloDeNavegacion(page, `El formulario de baja no muestra la fecha de inicio ${fechaArca(fechaInicio)} de la relación. No se escribió nada.`);
    if (!(await cuitsEnPantalla(page)).includes(soloDigitos(cuil))) throw await falloDeNavegacion(page, "El formulario de baja no muestra el CUIL de la persona. No se escribió nada.");
    onProgreso({ tipo: "pantalla", que: "registra_baja" });

    await completarFecha(page, CAMPOS_BAJA.fechaFin.id, fechaArca(fechaFin));
    await completarAutocompletar(page, CAMPOS_BAJA.situacionBaja, situacionBaja);
    if (fechaTelegrama) await completarFecha(page, CAMPOS_BAJA.fechaTelegrama.id, fechaArca(fechaTelegrama));
    const valores = await valoresDelFormulario(page, CAMPOS_BAJA);
    const payload = { fechaFin: valores.fechaFin.texto, situacionBaja: valores.situacionBaja.codigo, situacionBajaTexto: valores.situacionBaja.texto, fechaTelegrama: valores.fechaTelegrama.texto };
    if (payload.fechaFin !== fechaArca(fechaFin) || payload.situacionBaja !== String(situacionBaja) || (fechaTelegrama && payload.fechaTelegrama !== fechaArca(fechaTelegrama))) {
      throw await falloDeNavegacion(page, `El formulario no quedó con lo pedido (fin «${payload.fechaFin}», motivo «${payload.situacionBaja}», telegrama «${payload.fechaTelegrama}»). No se confirmó nada.`);
    }
    onProgreso({ tipo: "formulario", valores: payload });

    if (enSeco) {
      await apretar(page, "cancelar_baja");
      await esperarPantalla(page, ["modificaciones_listado", "modificaciones_busqueda"], "volver del formulario de baja");
      onProgreso({ tipo: "seco" });
      return { resultado: "seco", relacion, payload, html: lectura.html };
    }

    cortar(señal, "confirmar la baja");
    onProgreso({ tipo: "irreversible", que: "confirmar_baja" });
    await antesDeConfirmar(payload);
    const dialogosAntes = estado.dialogos.length;
    const textoAntes = await textoDelBody(page);
    const rojosAntes = await textosDeError(page);
    // ⚠ Desde acá no hay vuelta atrás ni reintento.
    await confirmarBaja(page, estado);
    const { cambio, pantalla } = await esperarRespuesta(page, "registra_baja", { estado, dialogosAntes, textoAntes });
    const ev = await evidencia(page, { estado, dialogosAntes, textoAntes });
    if (pantalla === "registra_baja") {
      if (!cambio) return { resultado: "indeterminado", motivo: `ARCA no contestó el «Confirmar» en ${Math.round(ESPERA_POSTBACK_MS / 1000)} s: no se sabe si tomó la baja. Mirá la relación en ARCA antes de volver a intentar.`, relacion, payload, ...ev };
      const msg = motivoDelRechazo({ dialogos: ev.dialogos, enRojo: ev.enRojo, texto: await textoDelBody(page), antes: [...rojosAntes, ...textoAntes.split("\n")] });
      onProgreso({ tipo: "rechazo", motivo: msg });
      return { resultado: "rechazada", clase: "regla_arca", motivo: msg, relacion, payload, ...ev };
    }
    // Salió del formulario: el resultado se LEE del listado, nunca se supone.
    const releida = await leerRelacion({ page, empresaCuit, cuil, fechaInicio, fechaFin, yaAdentro: true, onProgreso }).catch(() => null);
    const r = releida?.resultado === "ok" ? releida.relacion : null;
    if (r && r.fin === fechaFin) {
      const acuse = { ...acuseEnTexto(ev.textoNuevo), ...(r.cbt ? { cbt: r.cbt } : {}) };
      onProgreso({ tipo: "acuse", acuse });
      return { resultado: "presentada", relacion: r, payload, acuse, leidoDe: "listado", ...ev };
    }
    return { resultado: "indeterminado", motivo: `Se confirmó la baja y el listado ${r ? `muestra la relación ${r.fin ? `con fin ${fechaArca(r.fin)}` : "sin fecha de fin"}` : "no volvió a mostrar la relación"}. Mirala en ARCA antes de hacer nada: NO la vuelvas a mandar desde acá.`, relacion: r || relacion, payload, acuse: acuseEnTexto(ev.textoNuevo), ...ev };
  } finally {
    soltar();
  }
}

// ------------------------------------------------------------------ MODIFICACIÓN
/**
 * Relaciones Laborales → Modificaciones y Bajas → ícono «Modificar Registro» → cambiar los campos pedidos → Confirmar.
 *
 * `cambios`: `{ campo: valor }` con los campos de `CAMPOS_MODIFICACION` (fechas en ISO, importes en número, el resto
 * códigos de ARCA; `obraSocialTexto` acompaña al código de obra social, que no tiene catálogo en la página). Lo que
 * no está en `cambios` no se toca: el formulario viene precargado con lo que ARCA tiene.
 *
 * Mismos resultados que la baja. `ya_hecha` si el formulario ya muestra exactamente lo pedido en todos los campos.
 * La confirmación se da por `presentada` cuando el listado, releído, muestra los valores nuevos en los campos que
 * se pueden comparar (fechas, códigos, retribución); si alguno no se puede leer del listado, `indeterminado`.
 */
export async function modificarRelacion({ page, empresaCuit, cuil, fechaInicio, fechaFin = "", cambios = {}, enSeco = true, yaAdentro = false, onProgreso = () => {}, antesDeConfirmar = async () => {}, señal = { cortada: false } }) {
  const estado = { aceptarDialogo: false, dialogos: [], irreversible: false };
  const soltar = manejarDialogos(page, estado, onProgreso);
  try {
    const pedidos = Object.entries(cambios || {}).filter(([k, v]) => CAMPOS_MODIFICACION[k] && v !== undefined && v !== null && String(v) !== "");
    if (pedidos.length === 0) throw new Error(`La modificación necesita al menos un campo de: ${Object.keys(CAMPOS_MODIFICACION).join(", ")}.`);
    const lectura = await leerRelacion({ page, empresaCuit, cuil, fechaInicio, fechaFin, yaAdentro, onProgreso });
    if (lectura.resultado !== "ok") return fallidaPorLectura(lectura);
    const relacion = lectura.relacion;
    onProgreso({ tipo: "relacion", relacion });
    if (!relacion.iconos.modificar?.habilitado) {
      return { resultado: "fallida", clase: "regla_arca", motivo: `ARCA tiene deshabilitado «Modificar Registro» para esta relación${relacion.fin ? ` (tiene fecha de fin ${fechaArca(relacion.fin)}${relacion.cbt ? `, C.B.T. ${relacion.cbt}` : ""})` : ""}.`, relacion, html: lectura.html };
    }

    cortar(señal, "abrir el formulario de modificación");
    await apretarIcono(page, "modificar", relacion, estado);
    if (!(await esperarPantalla(page, ["modifica_alta"], "el formulario de modificación", 40_000))) throw await falloDeNavegacion(page, `ARCA no abrió el formulario de modificación (estoy en ${await pantallaActual(page)}).`);
    // Los valores se cargan con la pantalla: se espera a que la fecha de inicio esté escrita.
    await esperarEstado(async () => (await valoresDelFormulario(page, { fechaInicio: CAMPOS_MODIFICACION.fechaInicio })).fechaInicio.texto !== "", { ms: 15_000, que: "los datos precargados del formulario", log });
    if (!(await cuitsEnPantalla(page)).includes(soloDigitos(cuil))) throw await falloDeNavegacion(page, "El formulario de modificación no muestra el CUIL de la persona. No se escribió nada.");
    const antes = await valoresDelFormulario(page, CAMPOS_MODIFICACION);
    if (antes.fechaInicio.texto !== fechaArca(fechaInicio)) throw await falloDeNavegacion(page, `El formulario trae inicio «${antes.fechaInicio.texto}» y la relación del contrato empieza el ${fechaArca(fechaInicio)}. No se escribió nada.`);
    onProgreso({ tipo: "pantalla", que: "modifica_alta" });

    // Lo que se escribe en cada campo, y con qué se compara después.
    const esperado = {};
    for (const [campo, valor] of pedidos) {
      const def = CAMPOS_MODIFICACION[campo];
      if (def.tipo === "fecha") {
        const f = fechaArca(valor);
        if (!f) throw new Error(`${campo}: la fecha tiene que venir como aaaa-mm-dd.`);
        esperado[campo] = f;
      } else if (def.tipo === "importe") {
        const imp = importeArca(valor);
        if (!imp) throw new Error(`${campo}: el importe no es un número válido.`);
        esperado[campo] = imp;
      } else esperado[campo] = String(valor).trim();
    }
    // Lo que ya está igual no es un cambio.
    const yaIgual = (campo) => (CAMPOS_MODIFICACION[campo].tipo === "autocompletar" ? antes[campo].codigo === esperado[campo] : antes[campo].texto === esperado[campo]);
    const efectivos = pedidos.filter(([campo]) => !yaIgual(campo));
    if (efectivos.length === 0) return { resultado: "ya_hecha", relacion, motivo: "ARCA ya tiene exactamente esos valores: no hay nada que modificar.", antes: resumen(antes), payload: {}, html: lectura.html };

    for (const [campo] of efectivos) {
      const def = CAMPOS_MODIFICACION[campo];
      if (def.tipo === "fecha") await completarFecha(page, def.id, esperado[campo]);
      else if (def.tipo === "importe") await completarTexto(page, def.id, esperado[campo]);
      else await completarAutocompletar(page, def, esperado[campo], campo === "obraSocial" ? String(cambios.obraSocialTexto || "") : "");
    }
    const despues = await valoresDelFormulario(page, CAMPOS_MODIFICACION);
    for (const [campo] of efectivos) {
      const quedo = CAMPOS_MODIFICACION[campo].tipo === "autocompletar" ? despues[campo].codigo : despues[campo].texto;
      if (quedo !== esperado[campo]) throw await falloDeNavegacion(page, `El campo ${campo} no quedó con «${esperado[campo]}» (quedó «${quedo}»). No se confirmó nada.`);
    }
    const listaCambios = efectivos.map(([campo]) => ({ campo, antes: CAMPOS_MODIFICACION[campo].tipo === "autocompletar" ? antes[campo].codigo : antes[campo].texto, despues: esperado[campo] }));
    const payload = Object.fromEntries(listaCambios.map((c) => [c.campo, c.despues]));
    onProgreso({ tipo: "formulario", valores: payload, cambios: listaCambios });

    if (enSeco) {
      await apretar(page, "cancelar_modificacion");
      await esperarPantalla(page, ["modificaciones_listado", "modificaciones_busqueda"], "volver del formulario de modificación");
      onProgreso({ tipo: "seco" });
      return { resultado: "seco", relacion, payload, cambios: listaCambios, antes: resumen(antes), html: lectura.html };
    }

    cortar(señal, "confirmar la modificación");
    onProgreso({ tipo: "irreversible", que: "confirmar_modificacion" });
    await antesDeConfirmar(payload);
    const dialogosAntes = estado.dialogos.length;
    const textoAntes = await textoDelBody(page);
    const rojosAntes = await textosDeError(page);
    // ⚠ Desde acá no hay vuelta atrás ni reintento.
    await confirmarModificacion(page, estado);
    const { cambio, pantalla } = await esperarRespuesta(page, "modifica_alta", { estado, dialogosAntes, textoAntes });
    const ev = await evidencia(page, { estado, dialogosAntes, textoAntes });
    if (pantalla === "modifica_alta") {
      if (!cambio) return { resultado: "indeterminado", motivo: `ARCA no contestó el «Confirmar» en ${Math.round(ESPERA_POSTBACK_MS / 1000)} s: no se sabe si tomó los cambios. Mirá la relación en ARCA antes de volver a intentar.`, relacion, payload, cambios: listaCambios, ...ev };
      const msg = motivoDelRechazo({ dialogos: ev.dialogos, enRojo: ev.enRojo, texto: await textoDelBody(page), antes: [...rojosAntes, ...textoAntes.split("\n")] });
      onProgreso({ tipo: "rechazo", motivo: msg });
      return { resultado: "rechazada", clase: "regla_arca", motivo: msg, relacion, payload, cambios: listaCambios, ...ev };
    }
    // Se relee el listado con el inicio NUEVO si cambió, y se comparan los campos que el listado muestra.
    const inicioNuevo = cambios.fechaInicio ? String(cambios.fechaInicio).slice(0, 10) : fechaInicio;
    const finNuevo = cambios.fechaFin ? String(cambios.fechaFin).slice(0, 10) : fechaFin;
    const releida = await leerRelacion({ page, empresaCuit, cuil, fechaInicio: inicioNuevo, fechaFin: finNuevo, yaAdentro: true, onProgreso }).catch(() => null);
    const r = releida?.resultado === "ok" ? releida.relacion : null;
    const coincide = (campo) => {
      const def = CAMPOS_MODIFICACION[campo];
      const enListado = r?.[def.enListado];
      if (enListado === undefined || enListado === "") return null;
      if (def.tipo === "fecha") return enListado === String(cambios[campo]).slice(0, 10);
      if (def.tipo === "importe") return String(enListado).replace(/\./g, "") === esperado[campo].replace(/\./g, "");
      return String(enListado) === esperado[campo];
    };
    const verificados = listaCambios.map((c) => ({ campo: c.campo, ok: coincide(c.campo) }));
    if (r && verificados.every((v) => v.ok === true)) {
      onProgreso({ tipo: "acuse", acuse: { cat: r.cat } });
      return { resultado: "presentada", relacion: r, payload, cambios: listaCambios, acuse: { ...acuseEnTexto(ev.textoNuevo), ...(r.cat ? { cat: r.cat } : {}) }, leidoDe: "listado", ...ev };
    }
    const noVistos = verificados.filter((v) => v.ok !== true).map((v) => v.campo);
    return { resultado: "indeterminado", motivo: `Se confirmó la modificación y el listado ${r ? `no refleja todavía: ${noVistos.join(", ")}` : "no volvió a mostrar la relación"}. Mirala en ARCA antes de hacer nada: NO la vuelvas a mandar desde acá.`, relacion: r || relacion, payload, cambios: listaCambios, acuse: acuseEnTexto(ev.textoNuevo), ...ev };
  } finally {
    soltar();
  }
}

/** Los valores del formulario como `{ campo: "código" | "texto" }`, para mostrarlos. */
function resumen(valores) {
  return Object.fromEntries(Object.entries(valores || {}).map(([k, v]) => [k, v?.codigo || v?.texto || ""]));
}

// ------------------------------------------------------------------ ANULACIÓN
/**
 * Relaciones Laborales → Modificaciones y Bajas → ícono «anular» de la relación. ARCA decide qué anula (el alta, o
 * la baja si la relación ya la tiene) y lo habilita o no por relación: `que` dice qué espera quien llama, y se
 * comprueba contra lo que la tarjeta muestra ANTES (una relación sin fin sólo puede anular el alta; con fin, la baja).
 *
 * ⚠ EL ÍCONO ES EL PASO QUE NO SE DESHACE. Apretarlo dispara la anulación con una confirmación del navegador, que
 * se acepta porque es la confirmación de esta misma acción. Si en vez de eso ARCA abre una pantalla que este
 * motor no conoce (no se pudo relevar: el ícono estaba deshabilitado en la relación de prueba), NO se toca nada
 * más, se guarda la pantalla y el resultado queda `indeterminado` con `pantallaDesconocida: true`.
 * EN SECO no se aprieta el ícono: sólo se informa si ARCA lo habilita.
 */
export async function anularRelacion({ page, empresaCuit, cuil, fechaInicio, fechaFin = "", que, enSeco = true, yaAdentro = false, onProgreso = () => {}, antesDeConfirmar = async () => {}, señal = { cortada: false } }) {
  const estado = { aceptarDialogo: false, dialogos: [], irreversible: false };
  const soltar = manejarDialogos(page, estado, onProgreso);
  try {
    if (que !== "alta" && que !== "baja") throw new Error("La anulación necesita saber qué se anula: «alta» o «baja».");
    const lectura = await leerRelacion({ page, empresaCuit, cuil, fechaInicio, fechaFin, yaAdentro, onProgreso });
    if (lectura.resultado !== "ok") return fallidaPorLectura(lectura);
    const relacion = lectura.relacion;
    onProgreso({ tipo: "relacion", relacion });
    const payload = { que };
    if (que === "baja" && !relacion.fin) return { resultado: "fallida", clase: "regla_arca", motivo: "La relación no tiene fecha de fin en ARCA: no hay una baja que anular.", relacion, payload, html: lectura.html };
    if (que === "alta" && relacion.fin && relacion.cbt) return { resultado: "fallida", clase: "regla_arca", motivo: `La relación ya tiene la baja registrada (fin ${fechaArca(relacion.fin)}, C.B.T. ${relacion.cbt}): lo que ARCA anularía es la baja, no el alta.`, relacion, payload, html: lectura.html };
    if (!relacion.iconos.anular?.habilitado) {
      return { resultado: "fallida", clase: "regla_arca", motivo: `ARCA tiene deshabilitada la anulación para esta relación (inicio ${fechaArca(relacion.inicio)}${relacion.fin ? `, fin ${fechaArca(relacion.fin)}` : ""}): fuera de plazo o no corresponde.`, relacion, payload, html: lectura.html };
    }
    if (enSeco) {
      onProgreso({ tipo: "seco" });
      return { resultado: "seco", relacion, payload, motivo: "ARCA habilita la anulación para esta relación. En seco no se aprieta el ícono: anular se confirma al apretarlo.", html: lectura.html };
    }

    cortar(señal, "anular");
    onProgreso({ tipo: "irreversible", que: `anular_${que}` });
    await antesDeConfirmar(payload);
    const dialogosAntes = estado.dialogos.length;
    const textoAntes = await textoDelBody(page);
    estado.irreversible = true;
    // ⚠ Desde acá no hay vuelta atrás ni reintento.
    await apretarIcono(page, "anular", relacion, estado);
    const hayDialogo = () => estado.dialogos.length > dialogosAntes;
    await esperarEstado(async () => (await pantallaActual(page)) !== "modificaciones_listado" || hayDialogo() || (await textoDelBody(page)) !== textoAntes, { ms: ESPERA_POSTBACK_MS, que: "que ARCA conteste el ícono de anular", log });
    await page.waitForTimeout(1500).catch(() => {});
    const ev = await evidencia(page, { estado, dialogosAntes, textoAntes });
    const pantalla = await pantallaActual(page);
    if (!["modificaciones_listado", "modificaciones_busqueda", "sin_datos"].includes(pantalla)) {
      return { resultado: "indeterminado", pantallaDesconocida: true, motivo: `Después del ícono de anular, ARCA mostró una pantalla que este motor no conoce (${pantalla}). No se tocó nada más: hay que relevarla con la pantalla guardada en el registro y mirar la relación en ARCA.`, relacion, payload, ...ev };
    }
    // Se relee el listado: anulada el alta, la relación ya no está; anulada la baja, vuelve sin fin.
    const releida = await leerRelacion({ page, empresaCuit, cuil, fechaInicio, fechaFin: "", yaAdentro: true, onProgreso }).catch(() => null);
    if (que === "alta" && releida && (releida.resultado === "sin_relacion" || releida.resultado === "sin_datos")) {
      onProgreso({ tipo: "acuse", acuse: acuseEnTexto(ev.textoNuevo) });
      return { resultado: "presentada", relacion, payload, acuse: acuseEnTexto(ev.textoNuevo), leidoDe: "listado", ...ev };
    }
    const r = releida?.resultado === "ok" ? releida.relacion : null;
    if (que === "baja" && r && !r.fin) {
      onProgreso({ tipo: "acuse", acuse: acuseEnTexto(ev.textoNuevo) });
      return { resultado: "presentada", relacion: r, payload, acuse: acuseEnTexto(ev.textoNuevo), leidoDe: "listado", ...ev };
    }
    if (r && ((que === "alta" && r.inicio === relacion.inicio && !r.fin) || (que === "baja" && r.fin === relacion.fin))) {
      const msg = motivoDelRechazo({ dialogos: ev.dialogos, enRojo: ev.enRojo, texto: await textoDelBody(page), antes: textoAntes.split("\n") });
      // La relación quedó igual: ARCA no la anuló. Si dijo por qué, ése es el motivo.
      return { resultado: "rechazada", clase: "regla_arca", motivo: ev.dialogos.length || ev.enRojo.length ? msg : "Se apretó anular y la relación quedó igual en el listado; ARCA no mostró el motivo.", relacion: r, payload, ...ev };
    }
    return { resultado: "indeterminado", motivo: "Se apretó anular y el listado no permite confirmar qué pasó. Mirá la relación en ARCA antes de hacer nada.", relacion: r || relacion, payload, ...ev };
  } finally {
    soltar();
  }
}
