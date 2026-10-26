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
  await arrastrar(page, await origenFirma(page), destino);
}

/**
 * La caja (px) de la página del documento que está a la vista en el editor: el elemento visible más
 * grande con forma de hoja (más alto que ancho, > 300 px de ancho) entre canvas/imágenes/contenedores
 * de página. Si el editor cambia y no se encuentra, devuelve null y el documento queda en revisión.
 */
/**
 * LAS PÁGINAS DEL DOCUMENTO EN EL EDITOR, UNA POR UNA (26/10/2026). Antes se tomaba «el elemento más
 * grande con forma de hoja» y, cuando ninguno tenía la proporción exacta, el de respaldo era el
 * CONTENEDOR de las dos páginas (937×2725 px en la corrida de las 12:59): la firma de la página 1 caía
 * en y 1584, adentro de la 2. Ahora:
 *  · páginas = elementos visibles con la proporción del PDF (±1,5 %), sin repetir cajas anidadas,
 *    ordenadas de arriba hacia abajo; cada una con SU caja;
 *  · si no hay elementos por página pero sí un contenedor cuyo alto son N páginas, se lo parte en N
 *    con el gap que se deduce de su propio alto (`hoja_medida_es_contenedor` en el log);
 *  · el alto de cada página se valida: |altoPx / escala − altoPt| ≤ 2 pt.
 * Devuelve las cajas en coordenadas de la PÁGINA (se suma la caja del iframe del editor).
 */
export async function paginasDelDocumento(page, proporcion) {
  /*
    PRIMERO DENTRO DEL EDITOR (26/10/2026, 15:17). Con la ventana agrandada, el IFRAME pasó a medir
    1457×2058 —casi la proporción A4 (1,412 contra 1,415)— y, buscando primero en la página raíz, se lo
    tomó por la hoja: escala 2,449 en vez de 1,575 y el drop 163 px a la derecha. Ahora se busca en el
    editor y recién si no hay editor en la raíz; y en ningún lado vale como página un iframe ni algo
    que contenga uno.
  */
  const ed = await frameDelEditor(page);
  if (ed) {
    const adentro = await paginasEn(ed.frame, proporcion);
    if (adentro.paginas.length) {
      const mover = (c) => ({ ...c, x: ed.caja.x + c.x, y: ed.caja.y + c.y });
      return { ...adentro, paginas: adentro.paginas.map(mover), iframe: ed.caja };
    }
  }
  return { ...(await paginasEn(page, proporcion)), iframe: ed ? ed.caja : null };
}

async function paginasEn(raiz, proporcion) {
  return raiz
    .evaluate((prop) => {
      const visible = (el, r) => {
        const e = getComputedStyle(el);
        return e.visibility !== "hidden" && e.display !== "none" && Number(e.opacity) > 0 && r.width >= 300 && r.width <= window.innerWidth;
      };
      const exactas = [];
      let contenedor = null;
      for (const el of document.querySelectorAll("body *")) {
        if (el.tagName === "IFRAME" || el.querySelector("iframe")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 300 || r.height < 300 || !visible(el, r)) continue;
        // Una página nunca ocupa todo el ancho de su documento (el editor la muestra con márgenes): un
        // elemento de ancho completo con proporción A4 es la ventana/iframe agrandado, no la hoja.
        if (r.width >= window.innerWidth - 10) continue;
        const ratio = r.height / r.width;
        if (prop && Math.abs(ratio - prop) / prop <= 0.015) exactas.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        else if (prop && ratio > prop * 1.5) {
          // Candidato a contenedor de varias páginas: alto ≈ N páginas + gaps.
          const n = Math.round(ratio / prop);
          const hp = r.width * prop;
          const gap = n > 1 ? (r.height - n * hp) / (n - 1) : 0;
          if (n >= 2 && gap >= 0 && gap < hp * 0.2 && (!contenedor || r.width * r.height > contenedor.w * contenedor.h)) contenedor = { x: r.left, y: r.top, w: r.width, h: r.height, n, hp, gap };
        }
      }
      // Sin cajas repetidas: una página y su canvas/imagen interior miden lo mismo.
      const unicas = [];
      for (const c of exactas.sort((a, b) => a.y - b.y || b.w * b.h - a.w * a.h)) {
        if (!unicas.some((u) => Math.abs(u.x - c.x) < 3 && Math.abs(u.y - c.y) < 3 && Math.abs(u.w - c.w) < 3)) unicas.push(c);
      }
      if (unicas.length) return { paginas: unicas, origen: "paginas" };
      if (contenedor) {
        const paginas = Array.from({ length: contenedor.n }, (_, i) => ({ x: contenedor.x, y: contenedor.y + i * (contenedor.hp + contenedor.gap), w: contenedor.w, h: contenedor.hp }));
        return { paginas, origen: "contenedor", contenedor: { w: contenedor.w, h: contenedor.h, n: contenedor.n } };
      }
      return { paginas: [], origen: "nada" };
    }, proporcion)
    .catch(() => ({ paginas: [], origen: "nada" }));
}

/** La caja (px, coordenadas de la página) de la página `indice` del documento (base 0). */
export async function medirCajaDePagina(page, proporcion = null, indice = 0) {
  const { paginas } = await paginasDelDocumento(page, proporcion);
  return paginas[indice] || null;
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
/**
 * Scrollea `dy` px el contenedor que de verdad mueve la hoja: los ANCESTROS del elemento que está bajo
 * `punto` (coordenadas de `raiz`), del más cercano al más lejano, y el documento al final. Antes se
 * movía «el contenedor más alto» de la página: dio 290 px y después nada se movía (26/10 13:27).
 * Devuelve cuánto se movió y el estado del que se movió (scrollTop / scrollHeight / clientHeight).
 */
async function scrollearEn(raiz, dy, punto) {
  return raiz
    .evaluate(
      ({ delta, punto }) => {
        const scrolleables = [];
        let n = punto ? document.elementFromPoint(punto.x, punto.y) : null;
        for (; n; n = n.parentElement) if (n.scrollHeight > n.clientHeight + 5) scrolleables.push(n);
        if (document.scrollingElement) scrolleables.push(document.scrollingElement);
        for (const el of scrolleables) {
          const antes = el.scrollTop;
          el.scrollTop = antes + delta;
          const movio = el.scrollTop - antes;
          if (Math.abs(movio) >= 2) return { movio, estado: `scrollTop ${Math.round(el.scrollTop)} de ${Math.round(el.scrollHeight - el.clientHeight)} (scrollHeight ${Math.round(el.scrollHeight)}, clientHeight ${Math.round(el.clientHeight)})` };
        }
        return { movio: 0, estado: `ningún contenedor se movió (${scrolleables.length} candidatos)` };
      },
      { delta: dy, punto },
    )
    .catch(() => ({ movio: 0, estado: "no se pudo scrollear" }));
}

/** Todos los contenedores con recorrido (> 20 px) de `raiz`, del de más recorrido al de menos, con su descripción. */
async function scrollersEn(raiz) {
  return raiz
    .evaluate(() =>
      [document.scrollingElement, ...document.querySelectorAll("body *")]
        .filter((el) => el && el.scrollHeight - el.clientHeight > 20)
        .map((el, i) => {
          el.setAttribute("data-bot-scroller", String(i));
          const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
          return { i, desc: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""}`, scrollTop: Math.round(el.scrollTop), scrollHeight: Math.round(el.scrollHeight), clientHeight: Math.round(el.clientHeight) };
        })
        .sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight)),
    )
    .catch(() => []);
}

/** Mueve `dy` px el scroller marcado `i` por propiedad. Devuelve cuánto cambió su scrollTop. */
async function moverScroller(raiz, i, dy) {
  return raiz
    .evaluate(
      ({ i, dy }) => {
        const el = document.querySelector(`[data-bot-scroller="${i}"]`) || (i === 0 ? document.scrollingElement : null);
        if (!el) return 0;
        const antes = el.scrollTop;
        el.scrollTop = antes + dy;
        return el.scrollTop - antes;
      },
      { i, dy },
    )
    .catch(() => 0);
}

/**
 * DÓNDE EMPIEZA EL ARRASTRE: el ítem «Firma» del panel de campos, buscado en pantalla (en el editor o
 * en la página: el elemento chico, a la izquierda, cuyo texto es «Firma»). Si no aparece, la
 * coordenada validada en 1457×812. Hace falta buscarlo porque, si la ventana se agranda para que la
 * hoja entre entera, el panel se mueve.
 */
async function origenFirma(page) {
  const buscar = (raiz, off) =>
    raiz
      .evaluate(() => {
        const c = Array.from(document.querySelectorAll("body *")).find((el) => {
          const r = el.getBoundingClientRect();
          return /^\s*firma\s*$/i.test(el.textContent || "") && r.width > 20 && r.width < 320 && r.height > 10 && r.height < 80 && r.left < 400 && el.children.length <= 3;
        });
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })
      .then((p) => (p ? { x: p.x + off.x, y: p.y + off.y } : null))
      .catch(() => null);
  const ed = await frameDelEditor(page);
  return (ed && (await buscar(ed.frame, { x: ed.caja.x, y: ed.caja.y }))) || (await buscar(page, { x: 0, y: 0 })) || { ...ORIGEN_FIRMA };
}

/** La caja de la hoja, medida dos veces a 300 ms: el editor la redimensiona al terminar de dibujar. */
async function medirEstable(page, proporcion, indice = 0) {
  let previa = await medirCajaDePagina(page, proporcion, indice);
  for (let i = 0; i < 5 && previa; i++) {
    await page.waitForTimeout(300);
    const ahora = await medirCajaDePagina(page, proporcion, indice);
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
  const indice = Number(colocacion.paginaIndex) || 0;
  const anchoPt = colocacion.tamanoPagina.ancho;
  const altoPt = colocacion.tamanoPagina.alto;
  // Una vez: todas las páginas con su tamaño y origen, y el chequeo del alto.
  const doc = await paginasDelDocumento(page, prop);
  if (doc.origen === "contenedor") onProgreso(`hoja_medida_es_contenedor: no hay elementos por página; el contenedor ${Math.round(doc.contenedor.w)}×${Math.round(doc.contenedor.h)} px son ${doc.contenedor.n} páginas y se parte en ${doc.contenedor.n}.`);
  doc.paginas.forEach((pg, k) => onProgreso(`página ${k + 1}/${doc.paginas.length}: ${Math.round(pg.w)}×${Math.round(pg.h)} px en (${Math.round(pg.x)}, ${Math.round(pg.y)}); alto ${(pg.h / (pg.w / anchoPt)).toFixed(1)} pt (debe ser ${Math.round(altoPt)}).`));
  if (doc.paginas.length && indice >= doc.paginas.length) return { error: `paginas_no_coinciden: la colocación es en la página ${indice + 1} pero el editor muestra ${doc.paginas.length}` };
  const total = Number(colocacion.totalPaginas) || 0;
  if (total && doc.paginas.length && doc.paginas.length !== total) return { error: `paginas_no_coinciden: el PDF tiene ${total} página(s) y en el editor se midieron ${doc.paginas.length}: ${doc.paginas.map((pg) => `${Math.round(pg.w)}×${Math.round(pg.h)} en (${Math.round(pg.x)}, ${Math.round(pg.y)})`).join(" · ")}` };
  const esIframe = (c) => doc.iframe && Math.abs(c.w - doc.iframe.w) < 2 && Math.abs(c.x - doc.iframe.x) < 2;
  if (doc.paginas.some(esIframe)) return { error: `hoja_medida_es_iframe: la página medida tiene el ancho y el origen del iframe del editor (${Math.round(doc.iframe.w)} px en x ${Math.round(doc.iframe.x)}): no es la hoja` };
  let caja = await medirEstable(page, prop, indice);
  if (!caja) return { error: "no se encontró la hoja en el editor (ni en la página ni dentro del iframe)" };
  if (Math.abs(caja.h / (caja.w / anchoPt) - altoPt) > 2) return { error: `hoja_medida_es_contenedor: la caja medida (${Math.round(caja.w)}×${Math.round(caja.h)} px) no es una página: ${(caja.h / (caja.w * (altoPt / anchoPt))).toFixed(2)} páginas de alto` };
  let ultimo = null;
  let scrolleado = 0;
  let estadoScroll = "sin scroll";
  let scrollerLogueado = false;
  for (let i = 0; i < 6 && caja; i++) {
    const ed = await frameDelEditor(page);
    const arriba = Math.max(ed ? ed.caja.y : 0, 0) + 40;
    const altoAhora = page.viewportSize()?.height || alto;
    const abajo = Math.min(ed ? ed.caja.y + ed.caja.h : altoAhora, altoAhora) - 40;
    if (ed && Math.abs(caja.w - ed.caja.w) < 2 && Math.abs(caja.x - ed.caja.x) < 2) return { error: `hoja_medida_es_iframe: se midió el iframe del editor (${Math.round(caja.w)}×${Math.round(caja.h)} en (${Math.round(caja.x)}, ${Math.round(caja.y)})), no la hoja` };
    if (i > 0 && ventanaAgrandada) {
      const docAhora = await paginasDelDocumento(page, prop);
      docAhora.paginas.forEach((pg, k) => onProgreso(`(ventana agrandada) página ${k + 1}/${docAhora.paginas.length}: ${Math.round(pg.w)}×${Math.round(pg.h)} px en (${Math.round(pg.x)}, ${Math.round(pg.y)}); escala ${(pg.w / anchoPt).toFixed(3)} px/pt.`));
      if (total && docAhora.paginas.length !== total) return { error: `paginas_no_coinciden: después de agrandar la ventana se midieron ${docAhora.paginas.length} página(s) y el PDF tiene ${total}` };
    }
    const d = geometria.pdfAPantalla(colocacion.puntoPdf, colocacion.tamanoPagina, caja);
    const escala = caja.w / anchoPt;
    ultimo = { d, escala, arriba, abajo, frameTop: ed ? ed.caja.y : 0, frameAlto: ed ? ed.caja.h : alto };
    if (i === 0) onProgreso(`Hoja medida: ${Math.round(caja.w)}×${Math.round(caja.h)} px en (${Math.round(caja.x)}, ${Math.round(caja.y)}); anchoPx ${Math.round(caja.w)}, anchoPt ${Math.round(anchoPt)}, escala ${escala.toFixed(3)} px/pt.`);
    // Éxito = el punto, medido AHORA, está dentro de lo visible del frame (y de la ventana), con margen.
    if (d.y > arriba && d.y < abajo && d.x > 0 && d.x < (page.viewportSize()?.width || 1457)) return { caja, destino: d, escala };
    // Lo que falta para dejar el punto en el medio de lo visible, sobre la medición ACTUAL de la página destino.
    const dy = Math.round(d.y - (arriba + abajo) / 2);
    /*
      CÓMO SE MUEVE (26/10/2026, «se scrollearon 0 px · rueda del mouse»). En orden, y cada uno se da
      por bueno sólo si la hoja RE-MEDIDA se movió: (1) por propiedad, cada contenedor con recorrido
      del editor (del de más recorrido al de menos) y después los de la página; (2) AvPág / RePág con
      el editor enfocado; (3) la rueda sobre la hoja; (4) agrandar la ventana del navegador para que
      la página entera entre sin scrollear (la medición y el origen del arrastre se recalculan solos).
    */
    const visibleY = Math.min(Math.max(caja.y + 20, arriba), abajo);
    const enPagina = { x: caja.x + caja.w / 2, y: visibleY };
    const yAntes = caja.y;
    const seMovio = async () => {
      await page.waitForTimeout(350);
      const c = await medirCajaDePagina(page, prop, indice);
      return c && Math.abs(c.y - yAntes) >= 2 ? c : null;
    };
    let movida = null;
    let r = { movio: 0, estado: "" };
    for (const [raiz, donde] of [[ed?.frame, "editor"], [page, "página"]]) {
      if (!raiz || movida) continue;
      const sc = await scrollersEn(raiz);
      if (!scrollerLogueado && sc.length) {
        scrollerLogueado = true;
        onProgreso(`Contenedores con recorrido en ${donde}: ${sc.slice(0, 4).map((x) => `${x.desc} (scrollTop ${x.scrollTop}, scrollHeight ${x.scrollHeight}, clientHeight ${x.clientHeight})`).join(" · ")}`);
      }
      for (const x of sc) {
        const m = await moverScroller(raiz, x.i, dy);
        if (Math.abs(m) < 2) continue;
        const c = await seMovio();
        if (c) {
          movida = c;
          r = { movio: m, estado: `por propiedad: ${x.desc} en ${donde} (scrollTop ${x.scrollTop + Math.round(m)} de ${x.scrollHeight - x.clientHeight})` };
          break;
        }
        await moverScroller(raiz, x.i, -m); // no movió la hoja: se deja como estaba
      }
    }
    if (!movida && ed) {
      await ed.frame.locator("body").press(dy > 0 ? "PageDown" : "PageUp").catch(() => {});
      movida = await seMovio();
      if (movida) r = { movio: NaN, estado: `tecla ${dy > 0 ? "AvPág" : "RePág"} en el editor` };
    }
    if (!movida) {
      await page.mouse.move(enPagina.x, enPagina.y);
      await page.mouse.wheel(0, dy);
      movida = await seMovio();
      if (movida) r = { movio: NaN, estado: "rueda del mouse sobre la hoja" };
    }
    if (!movida && !ventanaAgrandada) {
      const vp = page.viewportSize() || { width: 1457, height: 812 };
      const nuevoAlto = Math.min(4000, Math.round(vp.height + Math.max(dy, 0) * 2 + 400));
      await page.setViewportSize({ width: vp.width, height: nuevoAlto });
      ventanaAgrandada = { ...vp };
      await page.waitForTimeout(900);
      r = { movio: NaN, estado: `ventana agrandada de ${vp.height} a ${nuevoAlto} px de alto para que la página entre sin scrollear` };
      onProgreso(`Ningún scroll movió la hoja: ${r.estado}.`);
    } else if (!movida) r = { movio: 0, estado: "nada movió la hoja (propiedad, AvPág, rueda y ventana agrandada)" };
    if (Number.isFinite(r.movio)) scrolleado += Math.abs(r.movio);
    estadoScroll = r.estado;
    await page.waitForTimeout(600);
    caja = await medirEstable(page, prop, indice);
  }
  return {
    error: ultimo
      ? `el lugar de la firma no quedó a la vista: re-medido, está en y ${Math.round(ultimo.d.y - ultimo.frameTop)} px del frame (alto del frame ${Math.round(ultimo.frameAlto)}; visible entre ${Math.round(ultimo.arriba - ultimo.frameTop)} y ${Math.round(ultimo.abajo - ultimo.frameTop)}); se scrollearon ${Math.round(scrolleado)} px; último scroll: ${estadoScroll}; escala ${ultimo.escala.toFixed(3)} px/pt, anchoPx ${caja ? Math.round(caja.w) : "?"}, anchoPt ${Math.round(anchoPt)}`
      : "la hoja dejó de medirse mientras se scrolleaba",
  };
}

/** La caja (px) del campo de firma colocado, si el DOM lo expone. */

/** Dónde quedó el campo de firma colocado (centro, px), si el DOM lo expone. */
async function centroDelCampo(page) {
  const b = await cajaDelCampo(page);
  return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
}

/** Cuántos campos «Firma de NOMBRE» hay colocados. */
/*
  EL CAMPO COLOCADO SE IDENTIFICA POR LO QUE APARECE, NO POR SU RÓTULO (26/10/2026). El editor lo
  rotula «Firma» o «Firma empleado», no «Firma de NOMBRE»: buscarlo por ese texto no lo encontraba
  nunca. Antes de soltarlo se marca todo el DOM (`marcarDom`); después, el campo es lo NUEVO que quedó
  SOBRE LA HOJA (el elemento exterior, entre 20×10 y 600×300 px). Con un solo firmante en la solicitud,
  todo campo de firma es de él. El HTML del campo se loguea una vez para poder elegir un selector fijo.
*/
let hojaDelCampo = null;
/** Si se agrandó la ventana para que la hoja entrara: el tamaño original, para restaurarlo. */
let ventanaAgrandada = null;
async function restaurarVentana(page) {
  if (!ventanaAgrandada) return;
  await page.setViewportSize(ventanaAgrandada).catch(() => {});
  ventanaAgrandada = null;
  await page.waitForTimeout(500);
}
let htmlLogueado = false;

async function marcarDom(page) {
  const marcar = (raiz) => raiz.evaluate(() => document.querySelectorAll("*").forEach((e) => e.setAttribute("data-bot-visto", "1"))).catch(() => {});
  await marcar(page);
  const ed = await frameDelEditor(page);
  if (ed) await marcar(ed.frame);
}

/** Los elementos nuevos sobre la hoja (coordenadas de la página), el exterior de cada grupo. Marca el primero con `data-bot-campo`. */
async function camposNuevos(page) {
  const buscar = (raiz, off) =>
    raiz
      .evaluate(
        ({ hoja, off }) => {
          document.querySelectorAll("[data-bot-campo]").forEach((e) => e.removeAttribute("data-bot-campo"));
          const dentro = (r) => {
            if (!hoja) return true;
            const cx = r.left + off.x + r.width / 2;
            const cy = r.top + off.y + r.height / 2;
            return cx >= hoja.x && cx <= hoja.x + hoja.w && cy >= hoja.y && cy <= hoja.y + hoja.h;
          };
          const nuevos = Array.from(document.querySelectorAll("body *:not([data-bot-visto])")).filter((el) => {
            const r = el.getBoundingClientRect();
            const e = getComputedStyle(el);
            return r.width >= 20 && r.height >= 10 && r.width <= 600 && r.height <= 300 && e.display !== "none" && e.visibility !== "hidden" && dentro(r);
          });
          const exteriores = nuevos.filter((el) => !nuevos.some((otro) => otro !== el && otro.contains(el)));
          // Primero los que parecen campo de firma; si ninguno, todo lo nuevo exterior.
          const pareceFirma = (el) => /firma|signature|signer|field/i.test(`${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${el.className || ""} ${el.getAttribute("data-testid") || ""} ${Object.keys(el.dataset || {}).join(" ")} ${(el.textContent || "").slice(0, 40)}`);
          const elegidos = exteriores.some(pareceFirma) ? exteriores.filter(pareceFirma) : exteriores;
          if (elegidos[0]) elegidos[0].setAttribute("data-bot-campo", "1");
          return elegidos.map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.left + off.x, y: r.top + off.y, w: r.width, h: r.height, html: el.outerHTML.replace(/\s+/g, " ").slice(0, 500) };
          });
        },
        { hoja: hojaDelCampo, off },
      )
      .catch(() => []);
  const ed = await frameDelEditor(page);
  const enEditor = ed ? await buscar(ed.frame, { x: ed.caja.x, y: ed.caja.y }) : [];
  return enEditor.length ? { campos: enEditor, raiz: ed.frame } : { campos: await buscar(page, { x: 0, y: 0 }), raiz: page };
}

/** Cuántos campos de firma se colocaron (lo nuevo sobre la hoja). `nombre` queda para el log. */
async function camposDeFirma(page, nombre, onProgreso = () => {}) {
  const { campos } = await camposNuevos(page);
  if (campos.length && !htmlLogueado) {
    htmlLogueado = true;
    onProgreso(`HTML del campo colocado (una vez, para fijar el selector): ${campos[0].html}`);
  }
  if (campos.length > 1) onProgreso(`Aparecieron ${campos.length} elementos nuevos sobre la hoja: ${campos.map((c) => `${Math.round(c.w)}×${Math.round(c.h)} en (${Math.round(c.x)}, ${Math.round(c.y)})`).join(" · ")} (firmante ${nombre}).`);
  return campos.length;
}

/** Qué elemento hay bajo un punto de la página (dentro del iframe del editor si cae ahí), para el log. */
async function queHayEn(page, punto) {
  const describir = (raiz, p) =>
    raiz
      .evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return "nada";
        const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
        return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""} «${(el.textContent || "").trim().slice(0, 30)}»`;
      }, p)
      .catch(() => "?");
  const ed = await frameDelEditor(page);
  if (ed && punto.x >= ed.caja.x && punto.x <= ed.caja.x + ed.caja.w && punto.y >= ed.caja.y && punto.y <= ed.caja.y + ed.caja.h) return `(editor) ${await describir(ed.frame, { x: punto.x - ed.caja.x, y: punto.y - ed.caja.y })}`;
  return describir(page, punto);
}

/** El locator del campo colocado (marcado por `camposNuevos`). */
async function locCampo(page) {
  const { raiz } = await camposNuevos(page);
  return raiz.locator('[data-bot-campo="1"]').first();
}

async function cajaDelCampo(page) {
  const { campos } = await camposNuevos(page);
  return campos[0] ? { x: campos[0].x, y: campos[0].y, w: campos[0].w, h: campos[0].h } : null;
}
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
      hojaDelCampo = vista.caja;
      const c0 = vista.caja;
      if (!(destino.x >= c0.x && destino.x <= c0.x + c0.w && destino.y >= c0.y && destino.y <= c0.y + c0.h)) {
        motivoFalla = `El punto de soltado (${Math.round(destino.x)}, ${Math.round(destino.y)}) no cae sobre la página medida (${Math.round(c0.w)}×${Math.round(c0.h)} en (${Math.round(c0.x)}, ${Math.round(c0.y)})): no se arrastra.`;
        break;
      }
      await marcarDom(page);
      onProgreso(`Colocando la firma en (${Math.round(destino.x)}, ${Math.round(destino.y)}) px — ${colocacion.descripcion}`);
      await arrastrarFirma(page, destino);
      let n = await camposDeFirma(page, firmante.nombre, onProgreso);
      const propPag = colocacion.tamanoPagina.alto / colocacion.tamanoPagina.ancho;
      if (n === 1) {
        const objetivo = campoEnPantalla(colocacion, geometria, (await medirCajaDePagina(page, propPag, Number(colocacion.paginaIndex) || 0)) || vista.caja);
        await ajustarCampo(page, objetivo, onProgreso).catch((e) => onProgreso(`No se pudo ajustar el campo: ${e?.message || e}`));
        n = await camposDeFirma(page, firmante.nombre, onProgreso);
      }
      if (n !== 1) motivoFalla = n === 0 ? `No apareció ningún campo nuevo sobre la hoja después de soltar «Firma» en (${Math.round(destino.x)}, ${Math.round(destino.y)}); página ${Math.round(vista.caja.w)}×${Math.round(vista.caja.h)} en (${Math.round(vista.caja.x)}, ${Math.round(vista.caja.y)}); bajo el puntero: ${await queHayEn(page, destino)}; el arrastre salió de ${await origenFirma(page).then((o) => `(${Math.round(o.x)}, ${Math.round(o.y)})`)}.` : `Aparecieron ${n} campos nuevos sobre la hoja; tiene que ser exactamente 1.`;
      else {
        const centro = await centroDelCampo(page);
        const cajaAhora = (await medirCajaDePagina(page, propPag, Number(colocacion.paginaIndex) || 0)) || vista.caja;
        if (!centro) {
          onProgreso("AVISO: no se pudo verificar la posición; se validó la estructura (exactamente 1 campo nuevo sobre la página esperada, firmante único).");
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
    // La ventana vuelve a su tamaño (si se agrandó para que entrara la hoja) antes de seguir o de salir.
    await restaurarVentana(page);
    if (!colocado) {
      const img = await captura();
      await salirSinEnviar(page);
      return { resultado: "requiere_revision", detalle: `No se pudo verificar un único campo de firma de ${firmante.nombre} en el lugar esperado (${motivoFalla}): no se envió.`, captura: img };
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
    await restaurarVentana(page).catch(() => {});
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

/** Sólo para pruebas de la geometría y del reconocimiento del campo (no son parte del flujo). */
export const _paraPruebas = { traerALaVista, marcarDom, arrastrarFirma, camposDeFirma, cajaDelCampo, setHoja: (c) => (hojaDelCampo = c) };
