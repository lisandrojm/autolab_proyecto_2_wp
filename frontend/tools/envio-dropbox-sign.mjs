/**
 * EL MOTOR QUE OPERA LA WEB DE DROPBOX SIGN para enviar un documento a la firma. Lo carga el server
 * (`services/dropboxSignBot/corridaEnvio.ts`) con la página de Playwright ya logueada; acá no se
 * lanzan navegadores ni se tocan credenciales. Tiene su test de lista blanca de clicks
 * (`envio-dropbox-sign.test.mjs`): cada click está enumerado y el único irreversible, «Enviar para
 * firmar», va detrás del guard que manda el server y del modo seco.
 *
 * LA RECETA (validada en ~176 envíos con viewport 1457×812 y zoom «Ajustar al ancho»):
 *   manage → «Firmar documentos» → «Cargar» (input[type=file]) → Siguiente → firmante → Siguiente →
 *   editor: (última página si corresponde) arrastrar «Firma» al destino → ajustar el tamaño al de la
 *   línea → verificar «Firma de NOMBRE» → Siguiente → revisar: CC + título exacto → guard →
 *   «Enviar para firmar» → «Solicitud de firma enviada».
 *
 * DÓNDE VA LA FIRMA no lo decide el motor: recibe una `colocacion` YA RESUELTA por el server
 * (`compartido/reglasColocacionFirma.ts`, anclada al texto del PDF: el campo en puntos PDF, el mismo
 * que muestra la previsualización) y la `geometria` para pasar de puntos PDF a píxeles. Se mide la caja
 * de la página renderizada, se suelta «Firma» en el centro del campo, se intenta llevar el campo al
 * tamaño del rectángulo (mejor esfuerzo: si el editor no lo deja, queda el tamaño por defecto, centrado)
 * y se VERIFICA que haya exactamente un campo «Firma de NOMBRE» con su centro dentro del rectángulo
 * esperado; si falla, se deshace y se reintenta UNA vez; si vuelve a fallar → requiere_revision, no se
 * envía. No hay recetas de pantalla de respaldo: sin caja medible no se coloca nada.
 */

export const MANAGE_URL = "https://app.sign.dropbox.com/home/manage";
/** Dónde está el ítem «Firma» del panel de campos, en 1457×812. */
export const ORIGEN_FIRMA = { x: 69, y: 504 };
const ESPERA_EDITOR_MS = 9000;
const ESPERA_REVISAR_MS = 6000;
const ESPERA_RESULTADO_MS = 15000;
/** Cuánto puede diferir (px) el tamaño del campo del pedido para darlo por ajustado. */
const TOLERANCIA_TAMANO_PX = 8;

/**
 * LA LISTA BLANCA DE LO QUE SE APRIETA. Todo click no irreversible pasa por `apretar`, que sólo acepta
 * estas claves. Ninguna matchea /eliminar|borrar|cancelar plan|configuración de cuenta/.
 */
export const BOTONES = {
  firmar_documentos: { rol: ["link", "button"], nombre: /firmar documentos/i, descripcion: "abre el wizard de envío" },
  siguiente: { rol: ["button"], nombre: /^siguiente$/i, descripcion: "avanza un paso del wizard" },
  tab_documentos: { rol: ["tab", "button"], nombre: /^documentos$/i, descripcion: "miniaturas de páginas en el editor" },
  tab_campos: { rol: ["tab", "button"], nombre: /^campos$/i, descripcion: "panel de campos en el editor" },
  ultima_miniatura: { css: '[class*="thumbnail" i], [data-testid*="thumbnail" i], [data-qa*="thumbnail" i], [class*="page-preview" i]', ultimo: true, descripcion: "la última página del documento" },
  deshacer: { rol: ["button"], nombre: /^(deshacer|undo)$/i, descripcion: "deshace el último campo colocado" },
  rechazar_cookies: { rol: ["button"], nombre: /^\s*(rechazar|rechazar todo|rechazar todas|reject|reject all|decline|decline all)\s*$/i, descripcion: "cierra el aviso de cookies (lo que menos comparte)" },
  agregar_cc: { rol: ["button"], nombre: /agregar un destinatario en cc/i, descripcion: "abre el campo de CC en «Revisar y enviar»" },
};

/** El click que sí envía. Fuera de BOTONES a propósito: sólo lo aprieta `enviarParaFirmar`. */
export const IRREVERSIBLE = { rol: ["button"], nombre: /^enviar para firmar$/i };

/** El campo de firma colocado, tal como lo expone el DOM del editor. */
const SELECTOR_CAMPO = '[aria-label*="Firma de" i], [title*="Firma de" i]';

const texto = (page) => page.evaluate(() => document.body?.innerText || "").catch(() => "");

/*
  EL EDITOR VIVE EN UN IFRAME (26/10/2026, volcado real: «iframe.iframe 1457×674» dentro de
  «…prep-and-send-index__pageContent…», y aparte «iframe#ccpa-iframe 600×260», el banner de cookies).
  La hoja, el campo «Firma de …» y los botones del editor están ADENTRO: buscarlos en el documento
  raíz esperaba 120 s por algo que estaba listo. `frameDelEditor` elige el iframe grande (≥ 600 px de
  ancho), nunca el del banner, y devuelve su Frame. Las coordenadas que dan `boundingBox()` y las de
  `medirCajaDePagina` quedan en el sistema de la PÁGINA (se suma la caja del iframe), así el mouse
  sigue funcionando igual.
*/
const NO_ES_EDITOR = /ccpa|cookie|consent|onetrust|captcha|recaptcha/i;
async function frameDelEditor(page) {
  const iframes = await page.$$("iframe").catch(() => []);
  let mejor = null;
  for (const el of iframes) {
    const id = `${(await el.getAttribute("id").catch(() => "")) || ""} ${(await el.getAttribute("class").catch(() => "")) || ""} ${(await el.getAttribute("src").catch(() => "")) || ""}`;
    if (NO_ES_EDITOR.test(id)) continue;
    const b = await el.boundingBox().catch(() => null);
    if (!b || b.width < 600 || b.height < 300) continue;
    if (!mejor || b.width * b.height > mejor.area) mejor = { el, b, area: b.width * b.height };
  }
  if (!mejor) return null;
  const frame = await mejor.el.contentFrame().catch(() => null);
  if (!frame) return null;
  await frame.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
  return { frame, caja: { x: mejor.b.x, y: mejor.b.y, w: mejor.b.width, h: mejor.b.height } };
}

/** El texto de la página MÁS el del editor (los rótulos «Firma de …» están adentro del iframe). */
const textoConEditor = async (page) => {
  const ed = await frameDelEditor(page);
  const deEditor = ed ? await ed.frame.evaluate(() => document.body?.innerText || "").catch(() => "") : "";
  return `${await texto(page)}\n${deEditor}`;
};

/** Los iframes de la pantalla (para el diagnóstico): src, tamaño y si se ven. */
async function iframesDe(page) {
  return page
    .evaluate(() =>
      Array.from(document.querySelectorAll("iframe")).map((f) => {
        const r = f.getBoundingClientRect();
        const e = getComputedStyle(f);
        const visible = r.width > 0 && r.height > 0 && e.display !== "none" && e.visibility !== "hidden" && Number(e.opacity) > 0;
        return `iframe${f.id ? "#" + f.id : ""}${f.className ? "." + String(f.className).trim().split(/\s+/)[0] : ""} ${Math.round(r.width)}×${Math.round(r.height)} ${visible ? "visible" : "oculto"} src=${(f.getAttribute("src") || "(sin src)").split("?")[0].slice(0, 80)}`;
      }),
    )
    .catch(() => []);
}
const cortar = (señal, paso) => {
  if (señal?.cortada) throw Object.assign(new Error(`Detenida por pedido antes de ${paso}.`), { detenido: true });
};

/** Un elemento de la lista blanca, visible y único (o el último, para la miniatura). */
function ubicar(page, clave) {
  const def = BOTONES[clave];
  if (!def) throw new Error(`«${clave}» no está en la lista blanca de botones.`);
  if (def.css) {
    const todos = page.locator(def.css);
    return { loc: def.ultimo ? todos.last() : todos, def };
  }
  let loc = null;
  for (const rol of def.rol) {
    const l = page.getByRole(rol, { name: def.nombre });
    loc = loc ? loc.or(l) : l;
  }
  return { loc: loc.filter({ visible: true }), def };
}

/** Aprieta un botón de la lista blanca. ÚNICO click no irreversible del motor. */
async function apretar(page, clave, raiz = null) {
  let { loc, def } = raiz ? ubicar(raiz, clave) : ubicar(page, clave);
  let n = await loc.count();
  if (n === 0 && !raiz) {
    // Los botones del editor (pestañas, miniaturas, deshacer) están dentro del iframe.
    const ed = await frameDelEditor(page);
    if (ed) {
      ({ loc } = ubicar(ed.frame, clave));
      n = await loc.count();
    }
  }
  if (n === 0) throw new Error(`No encuentro «${clave}» (${def.descripcion}) en la pantalla.`);
  const btn = def.ultimo ? loc : loc.first();
  await btn.click();
}

/** Escribe en un input por `name`; si React no tomó el valor, lo empuja con el setter nativo. */
async function escribir(page, name, valor) {
  const input = page.locator(`input[name="${name}"]`);
  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.fill("");
  await input.fill(valor);
  const leido = await input.inputValue().catch(() => "");
  if (leido !== valor) {
    await input.evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, valor);
  }
  return input.inputValue();
}

async function esperarTexto(page, re, ms, descripcion) {
  const desde = Date.now();
  while (Date.now() - desde < ms) {
    if (re.test(await texto(page))) return true;
    await page.waitForTimeout(500);
  }
  throw new Error(`No apareció ${descripcion} (${re}).`);
}

/** Un arrastre con el mouse, en pasos, de un punto a otro. */
async function arrastrar(page, desde, hasta, pasos = 12) {
  await page.mouse.move(desde.x, desde.y);
  await page.mouse.down();
  for (let i = 1; i <= pasos; i++) {
    await page.mouse.move(desde.x + ((hasta.x - desde.x) * i) / pasos, desde.y + ((hasta.y - desde.y) * i) / pasos);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(800);
}

/** Arrastre del campo «Firma» desde el panel hasta un punto de pantalla. Sin DOM estable para el drop. */
async function arrastrarFirma(page, destino) {
  await arrastrar(page, ORIGEN_FIRMA, destino);
}

/**
 * La caja (px) de la página del documento que está a la vista en el editor: el elemento visible más
 * grande con forma de hoja (más alto que ancho, > 300 px de ancho) entre canvas/imágenes/contenedores
 * de página. Si el editor cambia y no se encuentra, devuelve null y el documento queda en revisión.
 */
export async function medirCajaDePagina(page, proporcion = null) {
  const enRaiz = await medirEn(page, proporcion);
  if (enRaiz) return enRaiz;
  const ed = await frameDelEditor(page);
  if (!ed) return null;
  const adentro = await medirEn(ed.frame, proporcion);
  return adentro ? { x: ed.caja.x + adentro.x, y: ed.caja.y + adentro.y, w: adentro.w, h: adentro.h } : null;
}

async function medirEn(raiz, proporcion) {
  return raiz
    .evaluate((prop) => {
      /*
        POR LA PROPORCIÓN DE LA HOJA, NO POR NOMBRES DE CLASES (26/10/2026). El editor de Dropbox Sign
        cambia su HTML y los selectores por clase dejaron de encontrar la hoja («El editor no terminó de
        preparar el documento en 120 s» con el documento ya dibujado). Se recorre TODO elemento visible
        de 300 px o más de ancho y se elige el más grande cuya relación alto/ancho sea la del PDF
        (±6 %): canvas, img, svg, un div con la imagen de fondo… da igual cómo lo dibuje. Sin la
        proporción (o si nada la cumple) queda el criterio anterior: forma de hoja vertical.
      */
      const visible = (el, r) => {
        const e = getComputedStyle(el);
        return e.visibility !== "hidden" && e.display !== "none" && Number(e.opacity) > 0 && r.width >= 300 && r.height >= 300 && r.width <= window.innerWidth;
      };
      let porProporcion = null;
      let porForma = null;
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width < 300 || r.height < 300) continue;
        if (!visible(el, r)) continue;
        const area = r.width * r.height;
        const caja = { x: r.left, y: r.top, w: r.width, h: r.height, area };
        if (prop && Math.abs(r.height / r.width - prop) / prop <= 0.06) {
          if (!porProporcion || area > porProporcion.area) porProporcion = caja;
        } else if (/^(CANVAS|IMG)$/.test(el.tagName) || /page/i.test(`${el.className} ${el.getAttribute("data-testid") || ""}`)) {
          if (r.height > r.width && (!porForma || area > porForma.area)) porForma = caja;
        }
      }
      const mejor = porProporcion || porForma;
      return mejor ? { x: mejor.x, y: mejor.y, w: mejor.w, h: mejor.h } : null;
    }, proporcion)
    .catch(() => null);
}

/** Los elementos grandes visibles (para el diagnóstico cuando la hoja no aparece). */
async function elementosGrandes(page) {
  return page
    .evaluate(() =>
      Array.from(document.querySelectorAll("body *"))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ el, r }) => r.width >= 250 && r.height >= 250 && getComputedStyle(el).display !== "none")
        .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
        .slice(0, 6)
        .map(({ el, r }) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} ${Math.round(r.width)}×${Math.round(r.height)}`),
    )
    .catch(() => []);
}

/** Cuánto se espera a que el editor termine «Preparando documentos…» y muestre la hoja (26/10/2026). */
const ESPERA_PREPARANDO_MS = 120_000;

/**
 * ESPERA A QUE EL EDITOR TENGA LA HOJA DIBUJADA (26/10/2026). Con el PDF todavía subiendo, «Insertar
 * campos» muestra «Preparando documentos…» y no hay hoja que medir: antes se esperaban 2,5 s fijos y
 * los 10 documentos de una corrida quedaron «No se pudo medir la página renderizada en el editor»
 * (captura real del 26/10). Ahora se espera a que el cartel se vaya Y la hoja se pueda medir.
 */
async function esperarEditorListo(page, onProgreso, proporcion = null, esLimite = null) {
  const desde = Date.now();
  let avisado = false;
  let preparando = false;
  while (Date.now() - desde < ESPERA_PREPARANDO_MS) {
    const t = await texto(page);
    // El límite de la cuenta puede aparecer acá en vez de en «Revisar y enviar»: es un freno, no un timeout.
    if (typeof esLimite === "function" && esLimite(t)) throw Object.assign(new Error("limite_cuenta: Dropbox Sign frenó la cuenta mientras preparaba el documento."), { limite: true });
    preparando = /preparando documentos|preparing documents/i.test(t);
    if (!preparando) {
      const caja = await medirCajaDePagina(page, proporcion);
      if (caja) {
        await page.waitForTimeout(800);
        return caja;
      }
    } else if (!avisado) {
      onProgreso("El editor está «Preparando documentos…»: se espera a que muestre la hoja.");
      avisado = true;
    }
    await page.waitForTimeout(1000);
  }
  // Con captura y con lo que había en pantalla: es lo que hace falta para ver por qué no apareció la hoja.
  const grandes = await elementosGrandes(page);
  const ed = await frameDelEditor(page);
  const grandesEditor = ed ? await elementosGrandes(ed.frame) : [];
  const iframes = await iframesDe(page);
  const captura = await page.screenshot({ fullPage: false }).catch(() => undefined);
  throw Object.assign(
    new Error(
      preparando
        ? `editor_no_prepara: el editor siguió «Preparando documentos…» ${ESPERA_PREPARANDO_MS / 1000} s: Dropbox Sign no terminó de procesar el PDF.`
        : `hoja_no_encontrada: el editor terminó de preparar (ya no dice «Preparando documentos…») pero el bot no reconoce la hoja (${ESPERA_PREPARANDO_MS / 1000} s): es un problema del bot, no del documento. En pantalla: ${grandes.join(" · ") || "ningún elemento grande"}. Dentro del editor: ${ed ? grandesEditor.join(" · ") || "ningún elemento grande" : "no se encontró el iframe del editor"}. Iframes: ${iframes.join(" · ") || "ninguno"}.`,
    ),
    { captura },
  );
}

/**
 * EL AVISO DE COOKIES (26/10/2026): aparece abajo a la izquierda y tapa parte del editor. Se cierra con
 * «Rechazar» (lo que menos comparte); si no está ese botón, con la cruz del aviso. Si no hay aviso, nada.
 */
async function cerrarAvisoDeCookies(page) {
  // Por la lista blanca, como todo click (ver `BOTONES.rechazar_cookies`). Sin aviso, no hace nada.
  const { loc } = ubicar(page, "rechazar_cookies");
  if (await loc.count().catch(() => 0)) {
    await apretar(page, "rechazar_cookies").catch(() => {});
    await page.waitForTimeout(500);
  }
  // El banner CCPA es OTRO iframe (`#ccpa-iframe`, 600×260, clase «_banner-visible_»): se entra y se rechaza ahí.
  const el = await page.$('iframe#ccpa-iframe, iframe[id*="ccpa" i], iframe[class*="ccpa" i]').catch(() => null);
  const frame = el ? await el.contentFrame().catch(() => null) : null;
  if (frame) {
    const { loc: enBanner } = ubicar(frame, "rechazar_cookies");
    if (await enBanner.count().catch(() => 0)) {
      await apretar(page, "rechazar_cookies", frame).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
}

/** Mueve el visor hasta que el punto de pantalla quede a la vista (la caja de la página cambia con el scroll). */
/** Scrollea `dy` px el contenedor que de verdad scrollea (el más alto con overflow), dentro de `raiz`. Devuelve cuánto se movió. */
async function scrollearEn(raiz, dy) {
  return raiz
    .evaluate((delta) => {
      const candidatos = [document.scrollingElement, ...Array.from(document.querySelectorAll("body *")).filter((el) => {
        const e = getComputedStyle(el);
        return /(auto|scroll|overlay)/.test(e.overflowY) && el.scrollHeight > el.clientHeight + 5;
      })].filter(Boolean);
      const el = candidatos.sort((a, b) => b.clientHeight - a.clientHeight).find((x) => x.scrollHeight > x.clientHeight + 5);
      if (!el) return 0;
      const antes = el.scrollTop;
      el.scrollTop = antes + delta;
      return el.scrollTop - antes;
    }, dy)
    .catch(() => 0);
}

/** La caja de la hoja, medida dos veces a 300 ms: el editor la redimensiona al terminar de dibujar. */
async function medirEstable(page, proporcion) {
  let previa = await medirCajaDePagina(page, proporcion);
  for (let i = 0; i < 5 && previa; i++) {
    await page.waitForTimeout(300);
    const ahora = await medirCajaDePagina(page, proporcion);
    if (!ahora) return previa;
    if (Math.abs(ahora.w - previa.w) < 1 && Math.abs(ahora.h - previa.h) < 1 && Math.abs(ahora.y - previa.y) < 1) return ahora;
    previa = ahora;
  }
  return previa;
}

/**
 * TRAE EL LUGAR DE LA FIRMA A LA VISTA (26/10/2026). Antes se scrolleaba con la rueda del mouse y, si
 * el editor (dentro de un iframe) no se movía, a los 4 intentos salía «No se pudo medir la página
 * renderizada» con la hoja ya encontrada. Ahora: medición estable; el área visible es la del IFRAME
 * del editor (no la ventana entera); se scrollea el contenedor que realmente scrollea, dentro del
 * editor o de la página, y la rueda queda de respaldo. Devuelve `{ caja, destino, escala }` o
 * `{ error }` con los números (anchoPx, anchoPt, escala, dónde quedó el punto) para el log.
 */
export async function traerALaVista(page, colocacion, geometria, onProgreso = () => {}) {
  const prop = colocacion.tamanoPagina ? colocacion.tamanoPagina.alto / colocacion.tamanoPagina.ancho : null;
  const alto = page.viewportSize()?.height || 812;
  let caja = await medirEstable(page, prop);
  if (!caja) return { error: "no se encontró la hoja en el editor (ni en la página ni dentro del iframe)" };
  const anchoPt = colocacion.tamanoPagina.ancho;
  let ultimo = null;
  for (let i = 0; i < 6 && caja; i++) {
    const ed = await frameDelEditor(page);
    const arriba = Math.max(ed ? ed.caja.y : 0, 0) + 40;
    const abajo = Math.min(ed ? ed.caja.y + ed.caja.h : alto, alto) - 40;
    const d = geometria.pdfAPantalla(colocacion.puntoPdf, colocacion.tamanoPagina, caja);
    const escala = caja.w / anchoPt;
    ultimo = { d, escala };
    if (i === 0) onProgreso(`Hoja medida: ${Math.round(caja.w)}×${Math.round(caja.h)} px en (${Math.round(caja.x)}, ${Math.round(caja.y)}); anchoPx ${Math.round(caja.w)}, anchoPt ${Math.round(anchoPt)}, escala ${escala.toFixed(3)} px/pt.`);
    if (d.y > arriba && d.y < abajo && d.x > 0 && d.x < (page.viewportSize()?.width || 1457)) return { caja, destino: d, escala };
    const dy = Math.round(d.y - (arriba + abajo) / 2);
    let movio = ed ? await scrollearEn(ed.frame, dy) : 0;
    if (Math.abs(movio) < 2) movio = await scrollearEn(page, dy);
    if (Math.abs(movio) < 2) {
      await page.mouse.move(caja.x + caja.w / 2, Math.min(Math.max(arriba + 20, 150), abajo - 20));
      await page.mouse.wheel(0, dy);
    }
    await page.waitForTimeout(600);
    caja = await medirEstable(page, prop);
  }
  return {
    error: ultimo
      ? `el lugar de la firma no se pudo traer a la vista (quedó en y=${Math.round(ultimo.d.y)} px; escala ${ultimo.escala.toFixed(3)} px/pt, anchoPx ${caja ? Math.round(caja.w) : "?"}, anchoPt ${Math.round(anchoPt)})`
      : "la hoja dejó de medirse mientras se scrolleaba",
  };
}

/** La caja (px) del campo de firma colocado, si el DOM lo expone. */
async function cajaDelCampo(page) {
  const loc = await locCampo(page);
  const b = await loc.boundingBox({ timeout: 1500 }).catch(() => null);
  return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
}

/** Dónde quedó el campo de firma colocado (centro, px), si el DOM lo expone. */
async function centroDelCampo(page) {
  const b = await cajaDelCampo(page);
  return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
}

/** Cuántos campos «Firma de NOMBRE» hay colocados. */
async function camposDeFirma(page, nombre) {
  const re = new RegExp(`firma de ${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  const t = await textoConEditor(page);
  const enTexto = (t.match(new RegExp(re.source, "gi")) || []).length;
  const ed = await frameDelEditor(page);
  const enAria = (await page.locator(SELECTOR_CAMPO).count().catch(() => 0)) + (ed ? await ed.frame.locator(SELECTOR_CAMPO).count().catch(() => 0) : 0);
  return Math.max(enTexto, enAria);
}

/** El locator del campo de firma colocado: en la página o dentro del editor. */
async function locCampo(page) {
  if (await page.locator(SELECTOR_CAMPO).count().catch(() => 0)) return page.locator(SELECTOR_CAMPO).first();
  const ed = await frameDelEditor(page);
  return ed ? ed.frame.locator(SELECTOR_CAMPO).first() : page.locator(SELECTOR_CAMPO).first();
}

/** El rectángulo del campo (puntos PDF) pasado a píxeles de pantalla, con la caja de la página. */
function campoEnPantalla(colocacion, geometria, caja) {
  const a = geometria.pdfAPantalla({ x: colocacion.campo.x, y: colocacion.campo.y }, colocacion.tamanoPagina, caja);
  const b = geometria.pdfAPantalla({ x: colocacion.campo.x + colocacion.campo.w, y: colocacion.campo.y + colocacion.campo.h }, colocacion.tamanoPagina, caja);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/**
 * Lleva el campo recién colocado al rectángulo pedido (px): primero el TAMAÑO, arrastrando el manijón
 * de redimensionar (o, si el DOM no lo expone, la esquina inferior derecha del campo), después la
 * POSICIÓN, arrastrando el campo por su centro. Mejor esfuerzo: si el editor no lo deja, el campo
 * queda con su tamaño por defecto y centrado; se informa y la verificación de después decide.
 */
async function ajustarCampo(page, objetivo, onProgreso) {
  let caja = await cajaDelCampo(page);
  if (!caja) return { ajustado: false, motivo: "el DOM no expone el campo" };
  const campo = await locCampo(page);
  const manijon = campo.locator('[class*="resize" i], [class*="handle" i], [data-qa*="resize" i], [data-testid*="resize" i]');
  let desde;
  if ((await manijon.count().catch(() => 0)) > 0) {
    const mb = await manijon.last().boundingBox({ timeout: 1000 }).catch(() => null);
    if (mb) desde = { x: mb.x + mb.width / 2, y: mb.y + mb.height / 2 };
  }
  if (!desde) desde = { x: caja.x + caja.w - 2, y: caja.y + caja.h - 2 };
  await arrastrar(page, desde, { x: caja.x + objetivo.w, y: caja.y + objetivo.h }, 8);
  caja = (await cajaDelCampo(page)) || caja;
  // La posición: el centro del campo al centro del rectángulo.
  const centro = { x: caja.x + caja.w / 2, y: caja.y + caja.h / 2 };
  const meta = { x: objetivo.x + objetivo.w / 2, y: objetivo.y + objetivo.h / 2 };
  if (Math.hypot(meta.x - centro.x, meta.y - centro.y) > 3) await arrastrar(page, centro, meta, 8);
  caja = (await cajaDelCampo(page)) || caja;
  const ajustado = Math.abs(caja.w - objetivo.w) <= TOLERANCIA_TAMANO_PX && Math.abs(caja.h - objetivo.h) <= TOLERANCIA_TAMANO_PX;
  onProgreso(ajustado ? `Campo ajustado a ${Math.round(caja.w)}×${Math.round(caja.h)} px (pedido ${Math.round(objetivo.w)}×${Math.round(objetivo.h)}).` : `El editor no dejó redimensionar: el campo queda en ${Math.round(caja.w)}×${Math.round(caja.h)} px (pedido ${Math.round(objetivo.w)}×${Math.round(objetivo.h)}), centrado en el rectángulo.`);
  return { ajustado, caja };
}

/** Vuelve al listado sin enviar (descarta el wizard). Los diálogos «¿salir sin guardar?» se aceptan. */
async function salirSinEnviar(page) {
  page.once("dialog", (d) => d.accept().catch(() => {}));
  await page.goto(MANAGE_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1500);
}

/** Cuenta los borradores del listado. No los borra: eliminar desde el menú ⋯ es frágil; se informa. */
export async function revisarBorradores({ page, onProgreso = () => {} }) {
  await page.goto(MANAGE_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2000);
  const t = await texto(page);
  const encontrados = (t.match(/\bBorrador\b/gi) || []).length;
  if (encontrados) onProgreso(`${encontrados} borrador(es) en el listado de Dropbox Sign.`);
  return { encontrados };
}

/** EL ÚNICO CLICK IRREVERSIBLE: «Enviar para firmar». Una vez, sin reintentos. */
async function enviarParaFirmar(page) {
  const btn = page.getByRole("button", { name: IRREVERSIBLE.nombre }).filter({ visible: true }).first();
  if ((await btn.count()) === 0) throw new Error("No encuentro el botón «Enviar para firmar».");
  await btn.click();
}

/**
 * Envía UN documento. Devuelve `{ resultado: "enviado"|"limite"|"error"|"seco"|"requiere_revision", detalle, captura? }`.
 * `guard(datos)` lo manda el server (`reglas.guardDeEnvio`) y decide si se aprieta el irreversible.
 */
export async function enviarDocumento({ page, rutaPdf, archivo, firmante, cc, colocacion, geometria, enSeco = true, señal = { cortada: false }, onProgreso = () => {}, antesDelIrreversible = () => {}, guard, esLimite }) {
  if (!colocacion) return { resultado: "requiere_revision", detalle: "Tipo de documento sin regla de colocación: no se envía." };
  if (!colocacion.campo || !colocacion.puntoPdf || !colocacion.tamanoPagina) return { resultado: "requiere_revision", detalle: "La colocación llegó sin el campo resuelto (sin ancla): no se envía." };
  if (colocacion.pagina === "otra") return { resultado: "requiere_revision", detalle: `El ancla está en la página ${colocacion.paginaIndex + 1}, una del medio: el motor sólo navega a la primera o a la última. No se envía.` };
  if (typeof guard !== "function" || typeof esLimite !== "function") throw new Error("Faltan el guard y el detector de límite del server.");
  if (!geometria || typeof geometria.pdfAPantalla !== "function" || typeof geometria.pantallaAPdf !== "function") throw new Error("Falta la geometría (pdfAPantalla/pantallaAPdf) del server.");
  const captura = async () => page.screenshot({ fullPage: false }).catch(() => undefined);
  try {
    cortar(señal, "abrir el wizard");
    await page.goto(MANAGE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await cerrarAvisoDeCookies(page);
    onProgreso("Abriendo «Firmar documentos»…");
    await apretar(page, "firmar_documentos");
    await esperarTexto(page, /seleccionar documentos|cargar/i, ESPERA_EDITOR_MS, "el paso «Seleccionar documentos»");

    // Cargar: el input de archivo (aunque esté oculto) toma el PDF con su nombre exacto.
    onProgreso("Cargando el PDF…");
    const input = page.locator('input[type="file"]');
    await input.first().setInputFiles(rutaPdf);
    const base = archivo.replace(/\.pdf$/i, "").slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await esperarTexto(page, new RegExp(base, "i"), ESPERA_EDITOR_MS, "el documento en «Documentos seleccionados»");
    await apretar(page, "siguiente");

    onProgreso(`Firmante: ${firmante.nombre} (${firmante.email})`);
    const nombreLeido = await escribir(page, "recipients.0.name", firmante.nombre);
    const emailLeido = await escribir(page, "recipients.0.email", firmante.email);
    if (nombreLeido !== firmante.nombre || emailLeido.toLowerCase() !== firmante.email.toLowerCase()) throw new Error("El formulario de firmantes no tomó el nombre o el email.");
    await apretar(page, "siguiente");

    onProgreso("Esperando el editor de campos…");
    await esperarTexto(page, /insertar campos|campos/i, ESPERA_EDITOR_MS, "el editor «Insertar campos»");
    await cerrarAvisoDeCookies(page);
    const proporcion = colocacion.tamanoPagina ? colocacion.tamanoPagina.alto / colocacion.tamanoPagina.ancho : null;
    await esperarEditorListo(page, onProgreso, proporcion, esLimite);
    await cerrarAvisoDeCookies(page);
    if (colocacion.pagina === "ultima") {
      await apretar(page, "tab_documentos");
      await page.waitForTimeout(800);
      const { loc } = ubicar(page, "ultima_miniatura");
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await apretar(page, "ultima_miniatura");
      await page.waitForTimeout(800);
      await apretar(page, "tab_campos");
      await page.waitForTimeout(600);
    }

    // Arrastrar «Firma» al centro del campo, ajustar el tamaño y VERIFICAR: exactamente un campo, a
    // nombre del firmante y con su centro dentro del rectángulo esperado. Un reintento con deshacer.
    onProgreso(`Colocación: ${colocacion.nota}`);
    let colocado = false;
    let motivoFalla = "";
    for (let intento = 1; intento <= 2 && !colocado; intento++) {
      const vista0 = await traerALaVista(page, colocacion, geometria, onProgreso);
      const vista = vista0 && !vista0.error ? vista0 : null;
      if (!vista) {
        motivoFalla = `No se pudo ubicar el lugar de la firma en el editor: ${vista0?.error || "sin detalle"}.`;
        break;
      }
      const destino = vista.destino;
      onProgreso(`Colocando la firma en (${Math.round(destino.x)}, ${Math.round(destino.y)}) px — ${colocacion.descripcion}`);
      await arrastrarFirma(page, destino);
      let n = await camposDeFirma(page, firmante.nombre);
      if (n === 1) {
        const objetivo = campoEnPantalla(colocacion, geometria, (await medirCajaDePagina(page, colocacion.tamanoPagina ? colocacion.tamanoPagina.alto / colocacion.tamanoPagina.ancho : null)) || vista.caja);
        await ajustarCampo(page, objetivo, onProgreso).catch((e) => onProgreso(`No se pudo ajustar el campo: ${e?.message || e}`));
        n = await camposDeFirma(page, firmante.nombre);
      }
      if (n !== 1) motivoFalla = `Se esperaba 1 campo de firma y hay ${n}.`;
      else {
        const centro = await centroDelCampo(page);
        const cajaAhora = (await medirCajaDePagina(page, colocacion.tamanoPagina ? colocacion.tamanoPagina.alto / colocacion.tamanoPagina.ancho : null)) || vista.caja;
        if (!centro) {
          onProgreso("El campo quedó colocado pero el DOM no expone dónde: se acepta por conteo.");
          colocado = true;
        } else {
          const enPdf = geometria.pantallaAPdf(centro, colocacion.tamanoPagina, cajaAhora);
          const r = colocacion.rectEsperado;
          const adentro = enPdf.x >= r.x && enPdf.x <= r.x + r.w && enPdf.y >= r.y && enPdf.y <= r.y + r.h;
          if (adentro) {
            onProgreso(`Campo verificado en (${Math.round(enPdf.x)}, ${Math.round(enPdf.y)}) pt, dentro del rectángulo esperado.`);
            colocado = true;
          } else motivoFalla = `El campo quedó en (${Math.round(enPdf.x)}, ${Math.round(enPdf.y)}) pt, fuera del rectángulo esperado.`;
        }
      }
      if (!colocado && intento === 1) {
        onProgreso(`${motivoFalla} Se deshace y se reintenta.`);
        if (n > 0) await apretar(page, "deshacer").catch(() => {});
        await page.waitForTimeout(600);
      }
    }
    if (!colocado) {
      const img = await captura();
      await salirSinEnviar(page);
      return { resultado: "requiere_revision", detalle: `No se pudo verificar un único campo «Firma de ${firmante.nombre}» en el lugar esperado (${motivoFalla}): no se envió.`, captura: img };
    }
    await apretar(page, "siguiente");

    onProgreso("«Revisar y enviar»: CC y título…");
    await esperarTexto(page, /revisar y enviar|enviar para firmar/i, ESPERA_REVISAR_MS, "la pantalla «Revisar y enviar»");
    await page.waitForTimeout(1500);
    await apretar(page, "agregar_cc");
    const ccLeido = await escribir(page, "ccRecipients.0.email", cc);
    const tituloLeido = await escribir(page, "document.title", archivo);
    await page.waitForTimeout(500);
    const textoRevision = await texto(page);

    const veredicto = guard({ titulo: tituloLeido, cc: ccLeido, textoPagina: textoRevision });
    if (!veredicto.ok) {
      const img = await captura();
      await salirSinEnviar(page);
      return { resultado: "requiere_revision", detalle: veredicto.motivo, captura: img };
    }
    if (enSeco) {
      await salirSinEnviar(page);
      return { resultado: "seco", detalle: "[SECO] listo para enviar: título, CC y firmante verificados; no se apretó «Enviar para firmar»." };
    }
    cortar(señal, "apretar «Enviar para firmar»");
    antesDelIrreversible();
    await enviarParaFirmar(page);

    const desde = Date.now();
    while (Date.now() - desde < ESPERA_RESULTADO_MS) {
      await page.waitForTimeout(1000);
      const t = await texto(page);
      if (esLimite(t)) return { resultado: "limite", detalle: "Dropbox Sign: «Debido a la seguridad de la cuenta, no puedes enviar más solicitudes de firma hasta mañana». Quedó un borrador.", captura: await captura() };
      if (/solicitud de firma enviada/i.test(t) || /\/home\/manage/.test(page.url())) return { resultado: "enviado", detalle: "Solicitud de firma enviada." };
    }
    return { resultado: "error", detalle: `Sin confirmación a los ${ESPERA_RESULTADO_MS / 1000} s de apretar «Enviar para firmar»: revisar en Dropbox Sign si salió.`, captura: await captura() };
  } catch (e) {
    if (e?.detenido) throw e;
    const img = e?.captura || (await captura());
    if (e?.limite) {
      await salirSinEnviar(page).catch(() => {});
      return { resultado: "limite", detalle: e.message, captura: img };
    }
    await salirSinEnviar(page).catch(() => {});
    return { resultado: "error", detalle: e?.message || String(e), captura: img };
  }
}
