/**
 * CONSULTA DE RELACIONES LABORALES EN ARCA DESDE EL SERVIDOR — SÓLO LEE.
 *
 * Para una empleadora, va a Relaciones Laborales → Consultas, pide «Fecha de ingreso de movimientos»
 * → «Mes determinado» para un mes, y baja el TXT de `ArchivoConsultaRel.aspx` de TODAS las páginas
 * del resultado (ARCA pagina de a 30). Devuelve los bytes de cada página; quién los lee es
 * `server/src/compartido/arca/relacionesLaboralesTxt.ts`.
 *
 * No aprieta nada que escriba en el organismo: el único botón es «Continuar» de Consultas (busca) y
 * los números del paginador. No importa `playwright-core`: recibe la página ya abierta por el
 * servidor (`navegador.ts`), igual que `altas-arca.mjs`.
 *
 * LO QUE NO ESTÁ RELEVADO EN UN FIXTURE: la pantalla de RESULTADO de Consultas (el fixture
 * `03-Consulta.json` sólo tiene el formulario). Por eso los controles se eligen por lo que dicen y no
 * por su id: el radio cuyo rótulo dice «Mes determinado», el link cuyo `href` apunta a
 * `ArchivoConsultaRel`, el paginador por sus `Page$N`. Cuando algo no aparece, se devuelve
 * `{ resultado: "pantalla_desconocida", html }` con el HTML anonimizado para ajustar el motor
 * mirando la pantalla real, en vez de adivinar.
 *
 * El formato del período (`InputPeriodo_txtPeriodo`) tampoco está confirmado: se manda «MM/AAAA»
 * si el campo admite 7 caracteres y «MMAAAA» si admite 6.
 */
import { esperarEstado } from "./arca-postback.mjs";
import { aceptarSelectorDeCuit } from "./validar-obras-sociales.mjs";
import { PREFIJO, pantallaActual, entrarARelacionesLaborales, htmlAnonimo } from "./altas-arca.mjs";

const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
const log = (...a) => console.error(...a);
const INDEX_CONTRIBUYENTE_RE = /\/login\/IndexContribuyente\.aspx/i;
const RUTA_TXT = "/app/Contribuyente/RelacionLaboral/ArchivoConsultaRel.aspx";

// ------------------------------------------------------------------ puro
/**
 * Qué devolvió ARCA después de «Continuar». Puro: recibe lo leído de la pantalla.
 *  - sin_datos: «No se encontraron datos para la busqueda» (ErrorPage.aspx). Cero movimientos; no es error.
 *  - sin_sesion: la sesión se cayó.
 *  - listado: hay resultado (se ve el link al TXT o filas con CUIL).
 *  - error_arca: ErrorPage sin el texto de «sin datos».
 *  - desconocido: ninguna de las anteriores.
 */
export function resultadoDeConsulta({ accion = "", url = "", texto = "", hrefs = [], cuils = 0 } = {}) {
  if (/No se encontraron datos/i.test(texto)) return "sin_datos";
  if (/sesi[oó]n ha finalizado|FinSession|no ha iniciado su sesi[oó]n|ingrese con su clave fiscal/i.test(texto) || /FinSession\.aspx/i.test(`${accion} ${url}`)) return "sin_sesion";
  if (hrefs.some((h) => /ArchivoConsultaRel/i.test(h)) || cuils > 0) return "listado";
  if (/ErrorPage\.aspx/i.test(`${accion} ${url}`) || /Ha ocurrido un error/i.test(texto)) return "error_arca";
  return "desconocido";
}

/** "2026-10" → lo que se escribe en el campo de período, según cuántos caracteres admite. */
export function textoPeriodo(mes, maxLargo) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ""));
  if (!m) throw new Error(`El mes tiene que ser YYYY-MM y vino «${mes}».`);
  return Number(maxLargo) === 6 ? `${m[2]}${m[1]}` : `${m[2]}/${m[1]}`;
}

/** Los números de página que ofrece un paginador de ASP.NET, a partir de los `href` de sus links. */
export function paginasDelPaginador(hrefs) {
  const out = new Set();
  for (const h of hrefs) {
    const m = /Page\$(\d+)/.exec(String(h || ""));
    if (m) out.add(Number(m[1]));
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * El control «Siguiente» de un paginador que no muestra números: un link con `Page$Next`, o un botón o
 * link que diga «Siguiente», «>» o «»». Devuelve su índice en `controles`, o -1. Puro.
 */
export function indiceDeSiguiente(controles) {
  const dice = (s) => /^(siguiente|sig\.?|next|>|»|>>|›)$/i.test(String(s || "").replace(/\s+/g, " ").trim());
  return controles.findIndex((c) => !c.disabled && (/Page\$Next/i.test(`${c.href || ""} ${c.onclick || ""}`) || dice(c.texto) || dice(c.value) || dice(c.title)));
}

/** Cuántas filas de relación (CUIL al principio) trae un TXT. Para sospechar de un paginador no visto. */
export function filasDelTxt(buf) {
  return (Buffer.from(buf).toString("latin1").match(/^\d{11} /gm) || []).length;
}

// ------------------------------------------------------------------ pantalla
async function leerResultado(page) {
  const leido = await page
    .evaluate(() => ({
      accion: document.querySelector("form#aspnetForm")?.getAttribute("action") || "",
      texto: (document.body?.innerText || "").slice(0, 6000),
      hrefs: [...document.querySelectorAll("a[href], [onclick]")].map((a) => `${a.getAttribute("href") || ""} ${a.getAttribute("onclick") || ""}`),
      cuils: ((document.body?.innerText || "").match(/(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g) || []).length,
    }))
    .catch(() => ({ accion: "", texto: "", hrefs: [], cuils: 0 }));
  return { ...leido, url: page.url() };
}

/**
 * Elige la empleadora en el selector de CUIT, en la misma sesión. Si la página no está en el
 * selector, vuelve a él (es lo que hace `prepararAltas` en el motor de obras sociales para cambiar
 * de empleadora sin abrir otra sesión). Devuelve la URL base (`…/MiSimplificacion`).
 */
export async function entrarComoEmpleadora(page, empresaCuit) {
  const cuit = soloDigitos(empresaCuit);
  if (cuit.length !== 11) throw new Error("La empleadora no tiene un CUIT de 11 dígitos.");
  if (!INDEX_CONTRIBUYENTE_RE.test(page.url())) {
    const base = page.url().split("/app/")[0];
    if (!base || base === page.url()) throw new Error(`No sé volver al selector de CUIT desde ${page.url()}.`);
    await page.goto(`${base}/app/login/IndexContribuyente.aspx`, { waitUntil: "domcontentloaded" });
    if ((await pantallaActual(page)) === "sin_sesion") throw new Error("sin_sesion");
  }
  if (!(await aceptarSelectorDeCuit(page, cuit))) throw new Error(`No pude elegir la empleadora ${cuit} en el selector de ARCA (¿el usuario delegado la tiene?).`);
  await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1500).catch(() => {});
  return page.url().split("/app/")[0];
}

/** El radio cuyo rótulo (el texto de su celda) dice eso. `null` si no hay uno solo. */
async function radioQueDice(page, patron) {
  const radios = await page.evaluate(() =>
    [...document.querySelectorAll("input[type=radio]")].map((r) => {
      // El rótulo es el texto más cercano: la celda del radio, o la de al lado si la suya está vacía.
      const celda = r.closest("td") || r.parentElement;
      let texto = (celda?.innerText || "").replace(/\s+/g, " ").trim();
      if (!texto && celda?.nextElementSibling) texto = (celda.nextElementSibling.innerText || "").replace(/\s+/g, " ").trim();
      if (!texto) texto = (r.closest("tr")?.innerText || "").replace(/\s+/g, " ").trim();
      return { id: r.id, texto };
    }),
  );
  const coinciden = radios.filter((r) => patron.test(r.texto));
  if (coinciden.length !== 1) {
    log(`  (radios de Consultas: ${radios.map((r) => `${r.id.replace(PREFIJO, "")}=«${r.texto.slice(0, 40)}»`).join(" | ")})`);
    return null;
  }
  return coinciden[0].id;
}

async function marcar(page, id) {
  const radio = page.locator(`[id="${id}"]`);
  if ((await radio.count()) !== 1) return false;
  if (await radio.isChecked().catch(() => false)) return true;
  await radio.check();
  // Puede disparar un postback que redibuja el formulario: se espera a que el radio quede marcado.
  return esperarEstado(async () => page.locator(`[id="${id}"]`).isChecked(), { ms: 10_000, que: `marcar ${id}`, log });
}

/** Baja el TXT del resultado tal como está la grilla ahora (una página). `null` si no se pudo. */
async function bajarTxt(page, base) {
  // 1) El link directo del resultado, con la sesión de la página.
  const url = await page.evaluate(() => {
    const a = [...document.querySelectorAll("a[href]")].find((x) => /ArchivoConsultaRel/i.test(x.getAttribute("href") || ""));
    return a ? a.href : null;
  });
  const intentar = async (u) => {
    const r = await page.request.get(u).catch(() => null);
    if (!r || !r.ok()) return null;
    const cuerpo = Buffer.from(await r.body());
    // Un TXT de verdad empieza por el encabezado; una página de error es HTML.
    return /^\s*CUIL\s/.test(cuerpo.subarray(0, 64).toString("latin1")) ? cuerpo : null;
  };
  if (url) {
    const b = await intentar(url);
    if (b) return b;
  }
  // 2) La URL conocida de la página, por convención del sitio.
  return intentar(`${base}${RUTA_TXT}`);
}

async function hrefsDePaginador(page) {
  return page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") || "")).catch(() => []);
}

async function paginaActual(page) {
  // En el paginador de un GridView la página actual es un <span> (no link) en la misma fila que los Page$N.
  return page
    .evaluate(() => {
      const fila = [...document.querySelectorAll("tr")].find((tr) => [...tr.querySelectorAll("a[href]")].some((a) => /Page\$/.test(a.getAttribute("href") || "")));
      if (!fila) return null;
      const span = [...fila.querySelectorAll("span")].find((s) => /^\d+$/.test((s.textContent || "").trim()));
      return span ? Number(span.textContent.trim()) : null;
    })
    .catch(() => null);
}

/** Va a la página N del paginador (postback). `false` si no hay link para esa página o no llegó. */
async function irAPagina(page, n) {
  const link = page.locator(`a[href*="Page$${n}'"], a[href*="Page$${n}"]`).first();
  if (!(await link.count())) return false;
  await link.click();
  return esperarEstado(async () => (await paginaActual(page)) === n, { ms: 20_000, que: `la página ${n} del resultado`, log });
}

/** Los controles clickeables de la pantalla, con lo que dicen: para encontrar un «Siguiente». */
async function controlesDePantalla(page) {
  return page
    .evaluate(() =>
      [...document.querySelectorAll("a, input[type=submit], input[type=button], input[type=image], button")]
        .filter((el) => el.offsetParent !== null)
        .map((el, i) => ({ i, href: el.getAttribute("href") || "", onclick: el.getAttribute("onclick") || "", texto: el.textContent || "", value: el.getAttribute("value") || "", title: `${el.getAttribute("title") || ""} ${el.getAttribute("alt") || ""}`, disabled: !!el.disabled, id: el.id || "" })),
    )
    .catch(() => []);
}

/** La «firma» del listado en pantalla: los CUIL en el orden en que aparecen. Cambia cuando cambia la página. */
async function firmaDelListado(page) {
  const txt = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  return (txt.match(/(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g) || []).join(",");
}

/** Aprieta «Siguiente» y espera a que el listado cambie. `false` si no hay «Siguiente» o no cambió (última página). */
async function irASiguiente(page) {
  const controles = await controlesDePantalla(page);
  const i = indiceDeSiguiente(controles);
  if (i < 0) return false;
  const antes = await firmaDelListado(page);
  const c = controles[i];
  const objetivo = c.id ? page.locator(`[id="${c.id}"]`).first() : page.locator("a, input[type=submit], input[type=button], input[type=image], button").nth(c.i);
  if (!(await objetivo.count())) return false;
  await objetivo.click();
  return esperarEstado(async () => (await firmaDelListado(page)) !== antes, { ms: 20_000, que: "la página siguiente del resultado", log });
}

// ------------------------------------------------------------------ la consulta
/**
 * Consulta los movimientos de UN mes de UNA empleadora y baja el TXT de todas sus páginas.
 *
 *   { resultado: "ok", paginas: Buffer[], cantidadPaginas }
 *   { resultado: "sin_datos" }                       cero movimientos ese mes
 *   { resultado: "sin_sesion" }                      la sesión de ARCA se cayó: hay que abrir otra
 *   { resultado: "pantalla_desconocida", detalle, html }
 *
 * `page` tiene que estar YA con la empleadora elegida (ver `entrarComoEmpleadora`).
 */
export async function consultarMovimientosDelMes({ page, mes, onProgreso = () => {} }) {
  const base = page.url().split("/app/")[0];
  const desconocida = async (detalle) => ({ resultado: "pantalla_desconocida", detalle, html: await htmlAnonimo(page) });

  // Hay que pasar por Altas.aspx antes de Consulta.aspx: ir derecho desde el selector hace crashear la pestaña.
  await entrarARelacionesLaborales({ page });
  await page.goto(`${base}/app/Contribuyente/RelacionLaboral/Consulta.aspx`, { waitUntil: "domcontentloaded" });
  if (!(await esperarEstado(async () => (await pantallaActual(page)) === "consulta", { que: "el formulario de Consultas", log }))) {
    const p = await pantallaActual(page);
    if (p === "sin_sesion") return { resultado: "sin_sesion" };
    return desconocida(`No llegué al formulario de Consultas (estoy en ${p}).`);
  }
  onProgreso({ tipo: "pantalla", que: `Consultas · ${mes}` });

  // El criterio: «Fecha de ingreso de movimientos» y, adentro, «Mes determinado».
  const ingreso = await radioQueDice(page, /ingreso de movimientos/i);
  if (ingreso && !(await marcar(page, ingreso))) return desconocida("No pude marcar «Fecha de ingreso de movimientos».");
  const mesDeterminado = await radioQueDice(page, /mes determinado/i);
  if (!mesDeterminado) return desconocida("No encuentro el radio «Mes determinado» en Consultas.");
  if (!(await marcar(page, mesDeterminado))) return desconocida("No pude marcar «Mes determinado».");

  const periodo = page.locator(`[id="${PREFIJO}InputPeriodo_txtPeriodo"]`);
  if ((await periodo.count()) !== 1) return desconocida("No encuentro el campo del período (InputPeriodo_txtPeriodo).");
  const maxLargo = await periodo.getAttribute("maxlength").catch(() => null);
  await periodo.fill(textoPeriodo(mes, maxLargo));

  const continuar = page.locator(`[id="${PREFIJO}btnContinuar"]`);
  if ((await continuar.count()) !== 1) return desconocida("No encuentro «Continuar» en Consultas.");
  await continuar.click();
  // El resultado reemplaza al formulario (o ARCA manda a ErrorPage con «No se encontraron datos»).
  await esperarEstado(async () => (await pantallaActual(page)) !== "consulta", { ms: 30_000, que: "el resultado de la consulta", log });
  await page.waitForTimeout(500).catch(() => {});

  const leido = await leerResultado(page);
  const r = resultadoDeConsulta(leido);
  if (r === "sin_datos") return { resultado: "sin_datos" };
  if (r === "sin_sesion") return { resultado: "sin_sesion" };
  if (r !== "listado") return desconocida(`Después de «Continuar» la pantalla no es un listado (${r}).`);

  const paginas = [];
  const primera = await bajarTxt(page, base);
  if (!primera) return desconocida("Hay listado pero no pude bajar el TXT (ArchivoConsultaRel.aspx).");
  paginas.push(primera);
  onProgreso({ tipo: "pagina", mes, numero: 1 });

  // Las demás páginas: el paginador muestra una ventana de números; se avanza de a una y se vuelve a mirar.
  let paginador = "ninguno";
  let vistas = new Set([1]);
  for (;;) {
    const disponibles = paginasDelPaginador(await hrefsDePaginador(page)).filter((n) => !vistas.has(n));
    if (disponibles.length === 0) break;
    paginador = "numeros";
    const n = disponibles[0];
    if (!(await irAPagina(page, n))) return { ...(await desconocida(`No pude pasar a la página ${n} del resultado.`)), paginasParciales: paginas };
    const b = await bajarTxt(page, base);
    if (!b) return { ...(await desconocida(`No pude bajar el TXT de la página ${n}.`)), paginasParciales: paginas };
    paginas.push(b);
    vistas.add(n);
    onProgreso({ tipo: "pagina", mes, numero: n });
    if (vistas.size > 500) return desconocida("El paginador no termina nunca: más de 500 páginas.");
  }
  // Sin números: un paginador de «Siguiente» (Page$Next o un botón que lo diga). Se avanza hasta que el listado no cambie.
  if (paginador === "ninguno") {
    for (let n = 2; n <= 500; n++) {
      if (!(await irASiguiente(page))) break;
      paginador = "siguiente";
      const b = await bajarTxt(page, base);
      if (!b) return { ...(await desconocida(`No pude bajar el TXT de la página ${n}.`)), paginasParciales: paginas };
      // El mismo TXT que la página anterior = ARCA no avanzó: se terminó.
      if (Buffer.compare(b, paginas[paginas.length - 1]) === 0) break;
      paginas.push(b);
      onProgreso({ tipo: "pagina", mes, numero: n });
    }
  }
  // Una sola página «redonda» (múltiplo de 30) y ningún paginador a la vista: puede haber más páginas que
  // no supe ver. Se devuelve la pantalla para guardarla y mirarla, sin frenar la lectura.
  const sospechoso = paginador === "ninguno" && paginas.length === 1 && filasDelTxt(paginas[0]) > 0 && filasDelTxt(paginas[0]) % 30 === 0;
  return { resultado: "ok", paginas, cantidadPaginas: paginas.length, paginador, ...(sospechoso ? { htmlDiagnostico: await htmlAnonimo(page) } : {}) };
}
