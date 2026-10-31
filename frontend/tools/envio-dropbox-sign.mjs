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

/** Qué versión del motor corre: aparece en el log de cada corrida. Se actualiza con cada cambio del motor. */
export const VERSION_MOTOR = "2026-10-26 f · borradores: total por la paginación con el filtro Borrador + limpieza con lista blanca propia · campo por data-testid=field-signature + data-signer · verificación por porcentaje · img fill = escala por eje";

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
export async function paginasDelDocumento(page, proporcion, total = 0) {
  /*
    PRIMERO DENTRO DEL EDITOR (26/10/2026, 15:17). Con la ventana agrandada, el IFRAME pasó a medir
    1457×2058 —casi la proporción A4 (1,412 contra 1,415)— y, buscando primero en la página raíz, se lo
    tomó por la hoja: escala 2,449 en vez de 1,575 y el drop 163 px a la derecha. Ahora se busca en el
    editor y recién si no hay editor en la raíz; y en ningún lado vale como página un iframe ni algo
    que contenga uno.
  */
  const ed = await frameDelEditor(page);
  if (ed) {
    const adentro = await paginasEn(ed.frame, proporcion, geometriaConocida, total);
    if (adentro.paginas.length) {
      const mover = (c) => ({ ...c, x: ed.caja.x + c.x, y: ed.caja.y + c.y, ...(c.marco ? { marco: { ...c.marco, x: ed.caja.x + c.marco.x, y: ed.caja.y + c.marco.y } } : {}) });
      return { ...adentro, paginas: adentro.paginas.map(mover), iframe: ed.caja };
    }
  }
  return { ...(await paginasEn(page, proporcion, geometriaConocida, total)), iframe: ed ? ed.caja : null };
}

/*
  LA GEOMETRÍA CONOCIDA (26/10 16:39). Con la ventana alta el editor agrega relleno debajo de las páginas
  (contenedor 937×3369 = 2 × 1326 + 73 + ~644 de relleno) y ya no se puede partir por su alto. El zoom
  depende sólo del ANCHO, que no cambia al agrandar el alto: lo medido con la ventana chica (alto de
  página, separación y dónde arranca la primera dentro del contenedor) vale después. Se guarda por
  documento y se usa cuando el contenedor tiene el mismo ancho.
*/
let geometriaConocida = null;

async function paginasEn(raiz, proporcion, pista = null, total = 0) {
  return raiz
    .evaluate(({ prop, pista, total }) => {
      /*
        LAS PÁGINAS DEL EDITOR SON ELEMENTOS `…__page--…` (17:31: «div.page--2PT5O 907×1174»). Su caja es
        Letter (0,773) aunque el PDF sea A4 (0,707): Dropbox Sign dibuja la hoja ENCAJADA adentro, con
        márgenes. Lo que se devuelve es el rectángulo del CONTENIDO: el de la imagen/canvas interior si
        hay (respetando object-fit), y si no el PDF encajado y centrado en la caja. Así pdfAPantalla
        mapea puntos PDF sobre lo que de verdad se ve.
      */
      const contenidoDe = (marco, el) => {
        const encajar = (caja, ratio) => {
          if (!ratio) return caja;
          if (caja.h / caja.w > ratio) {
            const h = caja.w * ratio;
            return { x: caja.x, y: caja.y + (caja.h - h) / 2, w: caja.w, h };
          }
          const w = caja.h / ratio;
          return { x: caja.x + (caja.w - w) / 2, y: caja.y, w, h: caja.h };
        };
        const medios = Array.from(el.querySelectorAll("img, canvas, svg")).map((m) => ({ m, r: m.getBoundingClientRect() })).filter(({ r }) => r.width >= marco.w * 0.5 && r.height >= marco.h * 0.5).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
        if (medios[0]) {
          const { m, r } = medios[0];
          const caja = { x: r.left, y: r.top, w: r.width, h: r.height };
          const natW = m.tagName === "IMG" ? m.naturalWidth : m.tagName === "CANVAS" ? m.width : 0;
          const natH = m.tagName === "IMG" ? m.naturalHeight : m.tagName === "CANVAS" ? m.height : 0;
          const nat = natW ? natH / natW : null;
          const fit = getComputedStyle(m).objectFit || "fill";
          const contiene = nat && (fit === "contain" || fit === "scale-down");
          /*
            `fill` (26/10 17:49): la imagen ocupa la caja entera y el editor guarda la posición del campo en
            PORCENTAJES DE ESA CAJA (left/top/width/height): la caja completa es la página, con escala
            distinta en cada eje. `contain`: la hoja va encajada con márgenes.
          */
          return { ...(contiene ? encajar(caja, nat) : caja), via: `${m.tagName.toLowerCase()} interior (${fit}${natW ? `, natural ${natW}×${natH}` : ""})`, anisotropica: !contiene };
        }
        return { ...encajar(marco, prop), via: "PDF encajado en la caja" };
      };
      const porElemento = [];
      for (const el of document.querySelectorAll('[class*="page--" i], [class*="__page_" i]')) {
        const r = el.getBoundingClientRect();
        if (r.width < 300 || r.height < 300) continue;
        const marco = { x: r.left, y: r.top, w: r.width, h: r.height };
        if (porElemento.some((u) => Math.abs(u.marco.x - marco.x) < 3 && Math.abs(u.marco.y - marco.y) < 3)) continue;
        const c = contenidoDe(marco, el);
        porElemento.push({ x: c.x, y: c.y, w: c.w, h: c.h, marco, via: c.via, anisotropica: !!c.anisotropica });
      }
      if (porElemento.length) return { paginas: porElemento.sort((a, b) => a.y - b.y), origen: "elementos-pagina" };
      const visible = (el, r) => {
        const e = getComputedStyle(el);
        return e.visibility !== "hidden" && e.display !== "none" && Number(e.opacity) > 0 && r.width >= 300 && r.width <= window.innerWidth;
      };
      const exactas = [];
      let contenedor = null;
      let conPista = null;
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
          // Con la geometría conocida: mismo ancho → mismas páginas, aunque sobre relleno abajo.
          if (pista && Math.abs(r.width - pista.w) < 2 && (!conPista || r.width * r.height > conPista.w * conPista.h)) conPista = { x: r.left, y: r.top, w: r.width, h: r.height };
        }
      }
      // Sin cajas repetidas: una página y su canvas/imagen interior miden lo mismo.
      const unicas = [];
      for (const c of exactas.sort((a, b) => a.y - b.y || b.w * b.h - a.w * a.h)) {
        if (!unicas.some((u) => Math.abs(u.x - c.x) < 3 && Math.abs(u.y - c.y) < 3 && Math.abs(u.w - c.w) < 3)) unicas.push(c);
      }
      if (unicas.length) return { paginas: unicas, origen: "paginas" };
      if (contenedor && (!total || contenedor.n === total)) {
        const paginas = Array.from({ length: contenedor.n }, (_, i) => ({ x: contenedor.x, y: contenedor.y + i * (contenedor.hp + contenedor.gap), w: contenedor.w, h: contenedor.hp }));
        return { paginas, origen: "contenedor", contenedor: { x: contenedor.x, y: contenedor.y, w: contenedor.w, h: contenedor.h, n: contenedor.n, hp: contenedor.hp, gap: contenedor.gap } };
      }
      if (conPista) {
        const n = total || Math.max(1, Math.floor((conPista.h - pista.off + pista.gap) / (pista.hp + pista.gap)));
        const paginas = Array.from({ length: n }, (_, i) => ({ x: conPista.x, y: conPista.y + pista.off + i * (pista.hp + pista.gap), w: conPista.w, h: pista.hp }));
        return { paginas, origen: "pista", contenedor: { x: conPista.x, y: conPista.y, w: conPista.w, h: conPista.h, n } };
      }
      return { paginas: [], origen: "nada" };
    }, { prop: proporcion, pista, total })
    .catch(() => ({ paginas: [], origen: "nada" }));
}

/** La caja (px, coordenadas de la página) de la página `indice` del documento (base 0). */
export async function medirCajaDePagina(page, proporcion = null, indice = 0, total = 0) {
  const { paginas } = await paginasDelDocumento(page, proporcion, total);
  return paginas[indice] || null;
}

/**
 * LA ESTRUCTURA DE LAS PÁGINAS para el log: los hijos (dos niveles) de `…__pageContainer…` (o, si no, de
 * `…__dropTarget…` / `…__document…`) con tag, clase, tamaño y origen. Es lo que falta para ver cómo
 * dibuja las páginas este editor.
 */
async function estructuraDePaginas(raiz) {
  return raiz
    .evaluate(() => {
      const base = document.querySelector('[class*="pageContainer" i]') || document.querySelector('[class*="dropTarget" i]') || document.querySelector('[class*="__document" i]');
      if (!base) return "no hay pageContainer / dropTarget / document";
      const desc = (el) => {
        const r = el.getBoundingClientRect();
        const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 1).join(".").replace(/^src-[^_]*?(__)/, "…$1") : "";
        return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} ${Math.round(r.width)}×${Math.round(r.height)} en (${Math.round(r.left)}, ${Math.round(r.top)})`;
      };
      const filas = [`${desc(base)}:`];
      for (const h of Array.from(base.children).slice(0, 8)) {
        filas.push(`  ${desc(h)}`);
        for (const n of Array.from(h.children).slice(0, 4)) filas.push(`    ${desc(n)}`);
      }
      return filas.join(" | ");
    })
    .catch(() => "no se pudo leer");
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
  let listoDesde = null;
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
      // Ya terminó de preparar: si en 10 s no aparece la hoja, no va a aparecer (antes se esperaban 120 s).
      if (listoDesde === null) listoDesde = Date.now();
      if (Date.now() - listoDesde > 10_000) break;
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
  const estructura = ed ? await estructuraDePaginas(ed.frame) : "sin editor";
  const iframes = await iframesDe(page);
  const captura = await page.screenshot({ fullPage: false }).catch(() => undefined);
  throw Object.assign(
    new Error(
      preparando
        ? `editor_no_prepara: el editor siguió «Preparando documentos…» ${ESPERA_PREPARANDO_MS / 1000} s: Dropbox Sign no terminó de procesar el PDF.`
        : `hoja_no_encontrada: el editor terminó de preparar (ya no dice «Preparando documentos…») pero el bot no reconoce la hoja (10 s después de terminar): es un problema del bot, no del documento. Estructura de páginas: ${estructura}. En pantalla: ${grandes.join(" · ") || "ningún elemento grande"}. Dentro del editor: ${ed ? grandesEditor.join(" · ") || "ningún elemento grande" : "no se encontró el iframe del editor"}. Iframes: ${iframes.join(" · ") || "ninguno"}.`,
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
          const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
          return { i, desc: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""}`, scrollTop: Math.round(el.scrollTop), scrollHeight: Math.round(el.scrollHeight), clientHeight: Math.round(el.clientHeight) };
        })
        .sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight)),
    )
    .catch(() => []);
}

/**
 * Mueve `dy` px, por propiedad, el contenedor que está en el puesto `k` de `scrollersEn` (mismo filtro
 * y mismo orden, recalculados acá: antes se lo marcaba con un atributo y, si React re-renderizaba el
 * nodo, la marca se perdía y no se movía nada). Devuelve scrollTop antes y después.
 */
async function moverScroller(raiz, k, dy) {
  return raiz
    .evaluate(
      ({ k, dy }) => {
        const lista = [document.scrollingElement, ...document.querySelectorAll("body *")].filter((el) => el && el.scrollHeight - el.clientHeight > 20).sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight));
        const el = lista[k];
        if (!el) return { antes: 0, despues: 0 };
        const antes = el.scrollTop;
        el.scrollTop = antes + dy;
        return { antes: Math.round(antes), despues: Math.round(el.scrollTop) };
      },
      { k, dy },
    )
    .catch(() => ({ antes: 0, despues: 0 }));
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
async function medirEstable(page, proporcion, indice = 0, total = 0) {
  let previa = await medirCajaDePagina(page, proporcion, indice, total);
  for (let i = 0; i < 5 && previa; i++) {
    await page.waitForTimeout(300);
    const ahora = await medirCajaDePagina(page, proporcion, indice, total);
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
  const doc = await paginasDelDocumento(page, prop, Number(colocacion.totalPaginas) || 0);
  if (doc.origen === "contenedor" && doc.contenedor) geometriaConocida = { w: doc.contenedor.w, hp: doc.contenedor.hp, gap: doc.contenedor.gap, off: 0 };
  else if (doc.origen === "paginas" && doc.paginas.length) geometriaConocida = null; // hay elementos por página: no hace falta
  if (doc.origen === "pista") onProgreso(`Páginas por la geometría medida antes (mismo ancho ${Math.round(doc.contenedor.w)} px; el contenedor mide ${Math.round(doc.contenedor.h)} de alto con relleno).`);
  const edEstr = await frameDelEditor(page);
  onProgreso(`Estructura de páginas: ${await estructuraDePaginas(edEstr ? edEstr.frame : page)}`);
  if (doc.origen === "contenedor") onProgreso(`hoja_medida_es_contenedor: no hay elementos por página; el contenedor ${Math.round(doc.contenedor.w)}×${Math.round(doc.contenedor.h)} px son ${doc.contenedor.n} páginas y se parte en ${doc.contenedor.n}.`);
  onProgreso(`Tamaño de página del PDF: ${Math.round(anchoPt)}×${Math.round(altoPt)} pt (${Math.abs(anchoPt - 595) < 3 && Math.abs(altoPt - 842) < 3 ? "A4" : Math.abs(anchoPt - 612) < 3 && Math.abs(altoPt - 792) < 3 ? "Letter" : "otro"}); páginas tomadas de: ${doc.origen === "elementos-pagina" ? "los elementos «page--» del editor" : doc.origen === "paginas" ? "elementos con la proporción del PDF" : doc.origen === "contenedor" ? "el contenedor partido por su alto (último recurso)" : doc.origen === "pista" ? "la geometría medida antes" : "nada"}.`);
  doc.paginas.forEach((pg, k) => onProgreso(`página ${k + 1}/${doc.paginas.length}: ${pg.marco ? `caja ${Math.round(pg.marco.w)}×${Math.round(pg.marco.h)} en (${Math.round(pg.marco.x)}, ${Math.round(pg.marco.y)}) (proporción ${(pg.marco.w / pg.marco.h).toFixed(3)}); contenido ` : ""}${Math.round(pg.w)}×${Math.round(pg.h)} px en (${Math.round(pg.x)}, ${Math.round(pg.y)})${pg.via ? ` por ${pg.via}` : ""}; escala ${(pg.w / anchoPt).toFixed(3)} × ${(pg.h / altoPt).toFixed(3)} px/pt.`));
  if (doc.paginas.length && indice >= doc.paginas.length) return { error: `paginas_no_coinciden: la colocación es en la página ${indice + 1} pero el editor muestra ${doc.paginas.length}` };
  const total = Number(colocacion.totalPaginas) || 0;
  if (total && doc.paginas.length && doc.paginas.length !== total) return { error: `paginas_no_coinciden: el PDF tiene ${total} página(s) y en el editor se midieron ${doc.paginas.length}: ${doc.paginas.map((pg) => `${Math.round(pg.w)}×${Math.round(pg.h)} en (${Math.round(pg.x)}, ${Math.round(pg.y)})`).join(" · ")}` };
  const esIframe = (c) => doc.iframe && Math.abs(c.w - doc.iframe.w) < 2 && Math.abs(c.x - doc.iframe.x) < 2;
  if (doc.paginas.some(esIframe)) return { error: `hoja_medida_es_iframe: la página medida tiene el ancho y el origen del iframe del editor (${Math.round(doc.iframe.w)} px en x ${Math.round(doc.iframe.x)}): no es la hoja` };
  let caja = await medirEstable(page, prop, indice, total);
  if (!caja) return { error: "no se encontró la hoja en el editor (ni en la página ni dentro del iframe)" };
  // La escala tiene que cerrar en los DOS ejes contra el tamaño real del PDF (±1 %).
  if (caja.anisotropica) onProgreso(`La imagen de la página está en «fill»: se usa la escala de cada eje (${(caja.w / anchoPt).toFixed(3)} en x, ${(caja.h / altoPt).toFixed(3)} en y), igual que los porcentajes con que el editor guarda el campo.`);
  else if (Math.abs(caja.w / anchoPt - caja.h / altoPt) / (caja.w / anchoPt) > 0.01) return { error: `escala_no_cierra: el contenido medido (${Math.round(caja.w)}×${Math.round(caja.h)} px, proporción ${(caja.w / caja.h).toFixed(3)}) no corresponde a una página de ${Math.round(anchoPt)}×${Math.round(altoPt)} pt (proporción ${(anchoPt / altoPt).toFixed(3)}): escala ${(caja.w / anchoPt).toFixed(3)} en x y ${(caja.h / altoPt).toFixed(3)} en y` };
  if (!caja.anisotropica && Math.abs(caja.h / (caja.w / anchoPt) - altoPt) > 2) return { error: `hoja_medida_es_contenedor: la caja medida (${Math.round(caja.w)}×${Math.round(caja.h)} px) no es una página: ${(caja.h / (caja.w * (altoPt / anchoPt))).toFixed(2)} páginas de alto` };
  let ultimo = null;
  let scrolleado = 0;
  let estadoScroll = "sin scroll";
  let scrollerLogueado = false;
  let scrollExplicado = false;
  let scrollProbado = false;
  let agrandados = 0;
  for (let i = 0; i < 6 && caja; i++) {
    const ed = await frameDelEditor(page);
    onProgreso(`intento ${i + 1}: ventana ${page.viewportSize()?.height || "?"} px de alto, frame ${ed ? `${Math.round(ed.caja.h)} px en y ${Math.round(ed.caja.y)}` : "sin iframe"}, hoja ${Math.round(caja.w)}×${Math.round(caja.h)} en (${Math.round(caja.x)}, ${Math.round(caja.y)}).`);
    const arriba = Math.max(ed ? ed.caja.y : 0, 0) + 40;
    const altoAhora = page.viewportSize()?.height || alto;
    const abajo = Math.min(ed ? ed.caja.y + ed.caja.h : altoAhora, altoAhora) - 40;
    if (ed && Math.abs(caja.w - ed.caja.w) < 2 && Math.abs(caja.x - ed.caja.x) < 2) return { error: `hoja_medida_es_iframe: se midió el iframe del editor (${Math.round(caja.w)}×${Math.round(caja.h)} en (${Math.round(caja.x)}, ${Math.round(caja.y)})), no la hoja` };
    if (i > 0 && ventanaAgrandada) {
      const docAhora = await paginasDelDocumento(page, prop, total);
      if (docAhora.origen === "pista") onProgreso(`(ventana agrandada) páginas por la geometría medida antes: el contenedor ahora mide ${Math.round(docAhora.contenedor.w)}×${Math.round(docAhora.contenedor.h)} (con relleno).`);
      docAhora.paginas.forEach((pg, k) => onProgreso(`(ventana agrandada) página ${k + 1}/${docAhora.paginas.length}: ${Math.round(pg.w)}×${Math.round(pg.h)} px en (${Math.round(pg.x)}, ${Math.round(pg.y)}); escala ${(pg.w / anchoPt).toFixed(3)} px/pt.`));
      if (total && docAhora.paginas.length !== total) return { error: `paginas_no_coinciden: después de agrandar la ventana se midieron ${docAhora.paginas.length} página(s) y el PDF tiene ${total}` };
    }
    const d = geometria.pdfAPantalla(colocacion.puntoPdf, colocacion.tamanoPagina, caja);
    const escala = caja.w / anchoPt;
    ultimo = { d, escala, arriba, abajo, frameTop: ed ? ed.caja.y : 0, frameAlto: ed ? ed.caja.h : alto, anchoPx: caja.w, ventana: page.viewportSize()?.height || alto };
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
      const c = await medirCajaDePagina(page, prop, indice, total);
      return c && Math.abs(c.y - yAntes) >= 2 ? c : null;
    };
    let movida = null;
    let r = { movio: 0, estado: "" };
    // UNA sola pasada de scroll (16:21: la hoja no scrollea por ningún contenedor; sólo el panel izquierdo
    // acepta moverse): si no sirvió la primera vez, directo al agrandado, sin gastar vueltas.
    const probarScroll = !scrollProbado;
    scrollProbado = true;
    for (const [raiz, donde] of probarScroll ? [[ed?.frame, "editor"], [page, "página"]] : []) {
      if (!raiz || movida) continue;
      const sc = await scrollersEn(raiz);
      if (!scrollerLogueado && sc.length) {
        scrollerLogueado = true;
        onProgreso(`Contenedores con recorrido en ${donde}: ${sc.slice(0, 4).map((x) => `${x.desc} (scrollTop ${x.scrollTop}, scrollHeight ${x.scrollHeight}, clientHeight ${x.clientHeight})`).join(" · ")}`);
      }
      const resultados = [];
      for (const [k, x] of sc.entries()) {
        const { antes, despues } = await moverScroller(raiz, k, dy);
        const m = despues - antes;
        if (Math.abs(m) < 2) {
          resultados.push(`${x.desc}: scrollTop ${antes}→${despues} (no aceptó el cambio)`);
          continue;
        }
        const c = await seMovio();
        if (c) {
          movida = c;
          r = { movio: m, estado: `por propiedad: ${x.desc} en ${donde} (scrollTop ${antes}→${despues} de ${x.scrollHeight - x.clientHeight})` };
          break;
        }
        // Se movió el contenedor pero la hoja no (o el editor lo devolvió): se deja como estaba.
        const ahora = await moverScroller(raiz, k, -m);
        resultados.push(`${x.desc}: scrollTop ${antes}→${despues} pero la hoja no se movió${ahora.antes !== despues ? ` (el editor lo devolvió a ${ahora.antes})` : ""}`);
      }
      if (!movida && resultados.length && !scrollExplicado) {
        scrollExplicado = true;
        onProgreso(`Scroll por propiedad en ${donde}, sin efecto: ${resultados.slice(0, 4).join(" · ")}`);
      }
    }
    if (!movida && ed && probarScroll) {
      await ed.frame.locator("body").press(dy > 0 ? "PageDown" : "PageUp").catch(() => {});
      movida = await seMovio();
      if (movida) r = { movio: NaN, estado: `tecla ${dy > 0 ? "AvPág" : "RePág"} en el editor` };
    }
    if (!movida && probarScroll) {
      await page.mouse.move(enPagina.x, enPagina.y);
      await page.mouse.wheel(0, dy);
      movida = await seMovio();
      if (movida) r = { movio: NaN, estado: "rueda del mouse sobre la hoja" };
    }
    /*
      HASTA QUE ENTRE, NO UNA SOLA VEZ (29/10/2026). Con el tope en 4000 px y un único agrandado, un
      contrato de 6 páginas con la firma en la última (y 6459 del frame, que medía 3862) quedaba afuera y
      la corrida se cortaba con «nada movió la hoja». El editor se estira con la ventana: se agranda lo
      que falte para que el punto entre (más margen), hasta 3 veces y hasta ALTO_MAX_VENTANA.
    */
    const vpAhora = page.viewportSize() || { width: 1457, height: 812 };
    if (!movida && agrandados < 3 && vpAhora.height < ALTO_MAX_VENTANA) {
      const vp = vpAhora;
      const falta = Math.max(d.y - abajo, 0);
      const nuevoAlto = Math.min(ALTO_MAX_VENTANA, Math.round(Math.max(vp.height + falta + 600, vp.height + Math.max(dy, 0) * 2 + 400)));
      const altoFrameAntes = ed ? ed.caja.h : vp.height;
      await page.setViewportSize({ width: vp.width, height: nuevoAlto });
      agrandados++;
      // El tamaño ORIGINAL, para restaurar al final: no el de un agrandado anterior.
      if (!ventanaAgrandada) ventanaAgrandada = { ...vp };
      r = { movio: NaN, estado: `ventana agrandada de ${vp.height} a ${nuevoAlto} px de alto para que la página entre sin scrollear` };
      onProgreso(`Ningún scroll movió la hoja: ${r.estado}.`);
      /*
        EL RELAYOUT TARDA (26/10 15:54): se leía el frame con 674 px después de agrandar a 2058. Se espera
        a que el iframe cambie de alto Y se estabilice (dos lecturas iguales a 300 ms), hasta 4 s; después
        se re-miden frame y páginas, y esta vuelta no cuenta como intento.
      */
      const desde = Date.now();
      let previo = null;
      let estable = null;
      while (Date.now() - desde < 4000) {
        await page.waitForTimeout(300);
        const e = await frameDelEditor(page);
        const h = e ? e.caja.h : page.viewportSize()?.height || 0;
        if (Math.abs(h - altoFrameAntes) >= 20 && previo !== null && Math.abs(h - previo) < 1) {
          estable = h;
          break;
        }
        previo = h;
      }
      if (estable === null) onProgreso(`resize_sin_efecto: en 4 s el editor siguió midiendo ${Math.round(previo ?? altoFrameAntes)} px de alto (antes ${Math.round(altoFrameAntes)}).`);
      else onProgreso(`El editor se estiró: de ${Math.round(altoFrameAntes)} a ${Math.round(estable)} px de alto.`);
      // Re-medir la hoja con la geometría nueva; el editor puede tardar en redibujarla (hasta 3 s).
      caja = null;
      for (const desdeHoja = Date.now(); !caja && Date.now() - desdeHoja < 3000; ) {
        caja = await medirEstable(page, prop, indice, total);
        if (!caja) await page.waitForTimeout(400);
      }
      estadoScroll = r.estado;
      if (!caja) {
        const ed2 = await frameDelEditor(page);
        const grandes = ed2 ? await elementosGrandes(ed2.frame) : await elementosGrandes(page);
        return { error: `hoja_perdida_tras_estirar: después de agrandar la ventana (${page.viewportSize()?.height} px) y de que el editor se estirara (${ed2 ? Math.round(ed2.caja.h) : "?"} px), no se volvió a encontrar la hoja. Dentro del editor: ${grandes.join(" · ") || "ningún elemento grande"}` };
      }
      i--; // la vuelta del agrandado no cuenta como intento: la que sigue mide con la geometría nueva
      continue;
    } else if (!movida) r = { movio: 0, estado: `nada movió la hoja (propiedad, AvPág, rueda y ventana agrandada ${agrandados} vez/veces hasta ${page.viewportSize()?.height || "?"} px${(page.viewportSize()?.height || 0) >= ALTO_MAX_VENTANA ? ", el máximo" : ""})` };
    if (Number.isFinite(r.movio)) scrolleado += Math.abs(r.movio);
    estadoScroll = r.estado;
    await page.waitForTimeout(600);
    caja = await medirEstable(page, prop, indice, total);
  }
  return {
    error: ultimo
      ? `el lugar de la firma no quedó a la vista: re-medido, está en y ${Math.round(ultimo.d.y - ultimo.frameTop)} px del frame (alto del frame ${Math.round(ultimo.frameAlto)}; visible entre ${Math.round(ultimo.arriba - ultimo.frameTop)} y ${Math.round(ultimo.abajo - ultimo.frameTop)}); se scrollearon ${Math.round(scrolleado)} px; último scroll: ${estadoScroll}; escala ${ultimo.escala.toFixed(3)} px/pt, anchoPx ${Math.round(ultimo.anchoPx)}, anchoPt ${Math.round(anchoPt)}; ventana ${Math.round(ultimo.ventana)} px de alto`
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
/** Alto de ventana con el que se trabaja en el editor: la página 1 de una A4 (~1326 px a escala 1,575) entra entera. */
const ALTO_EDITOR = 2100;
/** Hasta dónde se agranda la ventana para que entre la página de la firma: ~10 páginas A4 a la escala del editor. */
const ALTO_MAX_VENTANA = 16000;
async function asegurarVentanaAlta(page, onProgreso = () => {}) {
  const vp = page.viewportSize() || { width: 1457, height: 812 };
  if (vp.height >= ALTO_EDITOR) return;
  await page.setViewportSize({ width: vp.width, height: ALTO_EDITOR });
  await page.waitForTimeout(500);
  onProgreso(`Ventana del navegador en ${vp.width}×${ALTO_EDITOR} (antes ${vp.height} de alto) para que la hoja entre sin scrollear; queda así para toda la tanda.`);
}

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
          /*
            POR SU NATURALEZA PRIMERO (17:49): el editor marca el campo con data-testid="field-signature"
            (y el firmante con data-signer). Si hay alguno NUEVO, son ésos y nada más; los tooltips
            («dig-Tooltip») nunca cuentan.
          */
          const porTestid = Array.from(document.querySelectorAll('[data-testid="field-signature"]:not([data-bot-visto]), [data-qa-ref="field-signature"]:not([data-bot-visto])')).filter((el, i, arr) => arr.indexOf(el) === i && !el.closest('[class*="Tooltip"]'));
          if (porTestid.length) {
            porTestid[0].setAttribute("data-bot-campo", "1");
            return porTestid.map((el) => {
              const r = el.getBoundingClientRect();
              const st = el.style;
              const num = (v) => (v === "" ? null : parseFloat(v));
              return { x: r.left + off.x, y: r.top + off.y, w: r.width, h: r.height, html: el.outerHTML.replace(/\s+/g, " ").slice(0, 600), envoltorio: "", firmante: el.getAttribute("data-signer") || "", pct: { left: num(st.left), top: num(st.top), width: num(st.width), height: num(st.height) } };
            });
          }
          const nuevos = Array.from(document.querySelectorAll("body *:not([data-bot-visto])")).filter((el) => {
            if (el.closest('[class*="Tooltip"]') || /tooltip/i.test(String(el.className || ""))) return false;
            const r = el.getBoundingClientRect();
            const e = getComputedStyle(el);
            return r.width >= 20 && r.height >= 10 && r.width <= 600 && r.height <= 300 && e.display !== "none" && e.visibility !== "hidden" && dentro(r);
          });
          const exteriores = nuevos.filter((el) => !nuevos.some((otro) => otro !== el && otro.contains(el)));
          // Un campo con su envoltorio/solapa (17:31: 144×36 dentro de 182×52) cuenta UNA vez: se agrupan
          // por caja (una contiene a la otra, ±3 px) y de cada grupo queda la INTERNA, que es el recuadro.
          const caja = (el) => el.getBoundingClientRect();
          const contiene = (a, b) => a.left - 3 <= b.left && a.top - 3 <= b.top && a.right + 3 >= b.right && a.bottom + 3 >= b.bottom;
          // Un grupo por campo: los exteriores que no quedan geométricamente dentro de otro exterior.
          const grupos = exteriores.filter((el) => !exteriores.some((otro) => otro !== el && contiene(caja(otro), caja(el)) && !contiene(caja(el), caja(otro))));
          // Dentro de cada grupo, el RECUADRO: el mayor elemento nuevo contenido (DOM o geometría) de al
          // menos 40×20 px y más chico que el grupo; la solapa del rótulo (≈16 px de alto) no califica.
          const recuadroDe = (g) => {
            const rg = caja(g);
            const adentro = nuevos.filter((el) => el !== g && (g.contains(el) || contiene(rg, caja(el)))).filter((el) => {
              const r = caja(el);
              return r.width >= 40 && r.height >= 20 && r.width * r.height < rg.width * rg.height - 4;
            });
            return adentro.sort((a, b) => caja(b).width * caja(b).height - caja(a).width * caja(a).height)[0] || g;
          };
          const internos = grupos.map(recuadroDe);
          const envoltorios = grupos;
          // Primero los que parecen campo de firma; si ninguno, todo lo nuevo exterior.
          const pareceFirma = (el) => /firma|signature|signer|field/i.test(`${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${el.className || ""} ${el.getAttribute("data-testid") || ""} ${Object.keys(el.dataset || {}).join(" ")} ${(el.textContent || "").slice(0, 40)}`);
          const elegidos = internos.some(pareceFirma) ? internos.filter(pareceFirma) : internos;
          if (elegidos[0]) elegidos[0].setAttribute("data-bot-campo", "1");
          return elegidos.map((el) => {
            const r = el.getBoundingClientRect();
            const env = envoltorios.find((e) => e !== el && contiene(caja(e), r));
            return { x: r.left + off.x, y: r.top + off.y, w: r.width, h: r.height, html: el.outerHTML.replace(/\s+/g, " ").slice(0, 600), envoltorio: env ? env.outerHTML.replace(/\s+/g, " ").slice(0, 600) : "" };
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
let ultimosCampos = [];
async function camposDeFirma(page, nombre, onProgreso = () => {}) {
  const { campos } = await camposNuevos(page);
  ultimosCampos = campos;
  if (campos.length && !htmlLogueado) {
    htmlLogueado = true;
    campos.slice(0, 2).forEach((c, k) => onProgreso(`HTML del campo colocado${campos.length > 1 ? ` (${k + 1}/${campos.length})` : ""}: ${c.html}${c.envoltorio ? ` · ENVOLTORIO: ${c.envoltorio}` : ""}`));
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

/*
  LOS BORRADORES (26/10/2026). Cada documento que el wizard carga y no se envía —corrida en seco, campo
  que no se verificó, límite— deja un BORRADOR en Dropbox Sign. Eran ~194 (el texto del listado sólo
  mostraba los 17 de la primera página): se cuentan por el total de la paginación con el filtro
  «Estado → Borrador» aplicado.

  BORRAR ES PERMANENTE (no hay papelera), así que la limpieza tiene su PROPIA lista blanca (`LIMPIEZA`,
  fuera de `BOTONES`) y su propio click (`apretarEnLimpieza`), y cada click destructivo va detrás de
  verificaciones que, si fallan, CORTAN la limpieza entera:
    · el filtro Borrador aplicado: aparece «Restablecer filtros» y ninguna fila dice otro estado;
    · la fila dice «Borrador» y ningún otro estado (nunca un Firmado);
    · el título COMPLETO sale del DOM (atributo title/aria-label o texto sin «…») y es EXACTAMENTE el
      nombre de un archivo del bot (con o sin «.pdf»); truncado o desconocido → se saltea;
    · el ítem del menú dice exactamente «Eliminar para ti» (nunca «Eliminar para todos»);
    · el modal se titula «Eliminar para ti» y avisa «No podrás recuperar…»; recién ahí, «Eliminar».
  Después de cada borrado el total tiene que bajar en uno; si no baja 3 veces, se corta. Tope por corrida.
  `enSeco` (el default) no aprieta nada destructivo: sólo filtra, pagina y lista candidatos y salteados.
*/
export const LIMPIEZA = {
  filtro_estado: { rol: ["button", "combobox"], nombre: /^\s*estado\s*[▾▼⌄]?\s*$/i, descripcion: "abre el filtro «Estado» del listado" },
  opcion_borrador: { rol: ["option", "menuitem", "menuitemcheckbox", "menuitemradio", "checkbox", "radio"], nombre: /^\s*borrador\s*$/i, descripcion: "la opción «Borrador» del filtro" },
  pagina_siguiente: { rol: ["button", "link"], nombre: /^\s*(p[aá]gina siguiente|siguiente p[aá]gina|next page|next|›|»|>)\s*$/i, descripcion: "la página siguiente del listado" },
  menu_fila: { css: 'button[aria-haspopup], [role="button"][aria-haspopup], button[aria-label*="más" i], button[aria-label*="opciones" i], button[aria-label*="acciones" i], button[aria-label*="more" i]', descripcion: "el «⋯» de la fila" },
  eliminar_para_ti: { rol: ["menuitem", "button", "option"], nombre: /^\s*eliminar para ti\s*$/i, descripcion: "«Eliminar para ti» del menú de la fila", destructivo: true },
  confirmar_eliminar: { rol: ["button"], nombre: /^\s*eliminar\s*$/i, descripcion: "«Eliminar» del modal «Eliminar para ti»", destructivo: true },
};
const TOPE_LIMPIEZA = 250;
const PAGINAS_MAXIMAS = 30;
const OTRO_ESTADO = /\b(firmado|firmada|completado|completada|enviado|enviada|esperando|pendiente|cancelado|cancelada|rechazado|rechazada|declinado|vencido)\b/i;

/** Un elemento de la lista blanca de la limpieza dentro de `raiz` (la página, la fila, el menú, el modal). */
function ubicarEnLimpieza(raiz, clave) {
  const def = LIMPIEZA[clave];
  if (!def) throw new Error(`«${clave}» no está en la lista blanca de la limpieza.`);
  if (def.css) return { loc: raiz.locator(def.css).filter({ visible: true }), def };
  let loc = null;
  for (const rol of def.rol) {
    const l = raiz.getByRole(rol, { name: def.nombre, exact: false });
    loc = loc ? loc.or(l) : l;
  }
  return { loc: loc.filter({ visible: true }), def };
}

/** El click de la limpieza: exige que el elemento sea ÚNICO en `raiz` (nunca «el primero de varios»). */
async function apretarEnLimpieza(raiz, clave) {
  const { loc, def } = ubicarEnLimpieza(raiz, clave);
  const n = await loc.count();
  if (n !== 1) throw Object.assign(new Error(`«${def.descripcion}»: se esperaba exactamente 1 y hay ${n}.`), { corta: true });
  const btn = loc.first();
  await btn.click();
}

const normalizarTitulo = (s) => String(s || "").replace(/\s+/g, " ").trim();
const TRUNCADO = /…|\.\.\./;

/** «Mostrando 17 de 194 resultados» → { mostrados: 17, total: 194 }. */
export function totalDelListado(t) {
  const m = String(t || "").match(/mostrando\s+(\d+)(?:\s*[-–a]\s*(\d+))?\s+de\s+(\d+)\s+resultados?/i);
  if (!m) return null;
  return { mostrados: Number(m[2] || m[1]), total: Number(m[3]) };
}

/** ¿El título leído del DOM es el de un archivo del bot? Exacto, con o sin «.pdf». */
export function tituloDelBot(titulo, titulos) {
  const t = normalizarTitulo(titulo);
  if (!t || TRUNCADO.test(t)) return null;
  for (const a of titulos) {
    const n = normalizarTitulo(a);
    if (t === n || t === n.replace(/\.pdf$/i, "") || `${t}.pdf` === n) return a;
  }
  return null;
}

/**
 * Las filas del listado que dicen «Borrador»: las marca con `data-weprodu-borrador=i` (para ubicarlas
 * después sin depender del texto) y devuelve, por fila, los candidatos a título que hay en el DOM.
 */
async function filasBorrador(page) {
  return page
    .evaluate(() => {
      document.querySelectorAll("[data-weprodu-borrador]").forEach((e) => e.removeAttribute("data-weprodu-borrador"));
      const hojas = Array.from(document.querySelectorAll("body *")).filter((el) => el.children.length === 0 && /^\s*borrador\s*$/i.test(el.textContent || "") && !el.closest('[role="menu"], [role="listbox"], [role="dialog"], [role="option"], [role="menuitemcheckbox"], [role="menuitemradio"]'));
      // La fila: el ancestro MÁS ALTO que contiene un único rótulo de estado (el suyo). Subir «hasta que
      // tenga un botón y texto» se pasaba a la tabla entera cuando la fila tenía poco texto.
      const ESTADO = /^\s*(borrador|firmado|firmada|completado|enviado|esperando.*|pendiente|cancelado|rechazado|declinado|vencido)\s*$/i;
      const estados = (el) => Array.from(el.querySelectorAll("*")).filter((x) => x.children.length === 0 && ESTADO.test(x.textContent || "")).length;
      const filas = [];
      for (const h of hojas) {
        let n = h;
        while (n.parentElement && n.parentElement !== document.body && estados(n.parentElement) === 1) n = n.parentElement;
        if (!n.querySelector("button, [role='button']") || filas.includes(n)) continue;
        filas.push(n);
      }
      return filas.map((f, i) => {
        f.setAttribute("data-weprodu-borrador", String(i));
        const attrs = [];
        for (const el of [f, ...f.querySelectorAll("*")]) {
          for (const a of ["title", "aria-label", "data-title", "data-tooltip", "data-original-title"]) {
            const v = el.getAttribute(a);
            if (v && v.trim().length > 3) attrs.push(v.trim());
          }
        }
        const textos = Array.from(f.querySelectorAll("*"))
          .filter((el) => el.children.length === 0)
          .map((el) => (el.textContent || "").trim())
          .filter((s) => s.length > 3);
        return { indice: i, attrs, textos, texto: (f.innerText || f.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300) };
      });
    })
    .catch(() => []);
}

/** Decide qué hacer con una fila: candidato (título del bot) o salteado con el motivo. */
export function clasificarFila(fila, titulos) {
  const sinBorrador = fila.texto.replace(/\bborrador\b/gi, "");
  if (OTRO_ESTADO.test(sinBorrador)) return { salteado: true, motivo: `la fila dice otro estado («${sinBorrador.match(OTRO_ESTADO)[0]}»): no se toca`, texto: fila.texto };
  for (const v of [...fila.attrs, ...fila.textos]) {
    const archivo = tituloDelBot(v, titulos);
    if (archivo) return { salteado: false, titulo: normalizarTitulo(v), archivo, texto: fila.texto };
  }
  const truncado = [...fila.textos].find((s) => TRUNCADO.test(s));
  return { salteado: true, motivo: truncado ? `título truncado en pantalla («${truncado}») y sin el completo en el DOM` : "el título no coincide con ningún archivo del bot", texto: fila.texto };
}

/** Aplica «Estado → Borrador» y verifica que quedó aplicado. Devuelve el total, o lanza (corta). */
async function filtrarBorradores(page, onProgreso) {
  await page.goto(MANAGE_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  await cerrarAvisoDeCookies(page);
  await apretarEnLimpieza(page, "filtro_estado");
  await page.waitForTimeout(800);
  try {
    await apretarEnLimpieza(page, "opcion_borrador");
  } catch (e) {
    const html = await page
      .evaluate(() => Array.from(document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], [class*="popover" i], [class*="dropdown" i]')).map((el) => el.outerHTML.replace(/\s+/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, "<svg/>").slice(0, 800)).join(" ‖ "))
      .catch(() => "");
    onProgreso(`No se encontró una única opción «Borrador» en el filtro. Lo que hay abierto: ${html || "(nada)"}`);
    throw e;
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(2000);
  const t = await texto(page);
  if (!/restablecer filtros/i.test(t)) throw Object.assign(new Error("El filtro «Borrador» no quedó aplicado (no aparece «Restablecer filtros»): no se sigue."), { corta: true });
  const tot = totalDelListado(t);
  return tot;
}

/** Cuenta los borradores: total de la paginación con el filtro aplicado. Sólo filtra: no borra nada. */
export async function revisarBorradores({ page, onProgreso = () => {} }) {
  try {
    const tot = await filtrarBorradores(page, onProgreso);
    const encontrados = tot ? tot.total : (await filasBorrador(page)).length;
    if (encontrados) onProgreso(`${encontrados} borrador(es) en Dropbox Sign${tot ? ` (según «Mostrando ${tot.mostrados} de ${tot.total} resultados»)` : ""}.`);
    return { encontrados };
  } catch (e) {
    // Sin el filtro, el conteo de la primera página (como antes), avisando que es parcial.
    await page.goto(MANAGE_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2000);
    const t = await texto(page);
    const encontrados = (t.match(/\bBorrador\b/gi) || []).length;
    onProgreso(`No se pudo filtrar por «Borrador» (${e?.message || e}): ${encontrados} en la primera página del listado, puede haber más.`);
    return { encontrados, parcial: true };
  }
}

/**
 * Revisa (enSeco) o limpia los borradores cuyo título es exactamente un archivo del bot.
 * `titulos`: los nombres de archivo del bot. `soloTitulos` (opcional): sólo éstos (los confirmados en
 * el panel, o los que dejó la corrida). Devuelve { total, candidatos, salteados, borrados, cortada? }.
 */
export async function limpiarBorradores({ page, titulos, soloTitulos = null, enSeco = true, tope = TOPE_LIMPIEZA, onProgreso = () => {} }) {
  const permitidos = soloTitulos ? new Set(soloTitulos.map(normalizarTitulo)) : null;
  const elegible = (c) => !c.salteado && (!permitidos || permitidos.has(normalizarTitulo(c.archivo)) || permitidos.has(c.titulo));
  const candidatos = [];
  const salteados = [];
  const borrados = [];
  const tope0 = Math.max(0, Math.min(TOPE_LIMPIEZA, Number(tope) || 0));
  let tot = await filtrarBorradores(page, onProgreso);
  const totalInicial = tot?.total ?? null;
  onProgreso(`Borradores en Dropbox Sign: ${totalInicial ?? "?"}${enSeco ? " · revisión EN SECO: no se borra nada" : ` · se borran hasta ${tope0}`}.`);

  const leerPagina = async () => {
    const filas = await filasBorrador(page);
    return filas.map((f) => ({ ...f, ...clasificarFila(f, titulos) }));
  };
  const siguientePagina = async () => {
    const { loc } = ubicarEnLimpieza(page, "pagina_siguiente");
    if ((await loc.count()) !== 1 || !(await loc.first().isEnabled().catch(() => false))) return false;
    const antes = (await filasBorrador(page)).map((f) => f.texto).join("|");
    await apretarEnLimpieza(page, "pagina_siguiente");
    await page.waitForTimeout(2000);
    const despues = (await filasBorrador(page)).map((f) => f.texto).join("|");
    return despues !== antes;
  };

  if (enSeco) {
    const vistos = new Set();
    for (let p = 1; p <= PAGINAS_MAXIMAS; p++) {
      for (const f of await leerPagina()) {
        if (vistos.has(f.texto)) continue;
        vistos.add(f.texto);
        if (elegible(f)) candidatos.push({ titulo: f.titulo, archivo: f.archivo });
        else salteados.push({ texto: f.texto, motivo: f.salteado ? f.motivo : "no está entre los confirmados" });
      }
      if (!(await siguientePagina())) break;
    }
    onProgreso(`En seco: ${candidatos.length} borrador(es) del bot para eliminar, ${salteados.length} salteado(s).`);
    return { total: totalInicial, candidatos, salteados, borrados };
  }

  // REAL: siempre desde la página 1 (al borrar, el listado se corre); si en la página no queda ningún
  // candidato, se pasa a la siguiente. Cada borrado se verifica con el total.
  let fallos = 0;
  let cortada = null;
  const yaSalteados = new Set();
  let vueltas = 0;
  while (borrados.length < tope0 && vueltas++ < tope0 + PAGINAS_MAXIMAS * 2) {
    const filas = await leerPagina();
    for (const f of filas) if (!elegible(f) && !yaSalteados.has(f.texto)) (yaSalteados.add(f.texto), salteados.push({ texto: f.texto, motivo: f.salteado ? f.motivo : "no está entre los confirmados" }));
    const c = filas.find(elegible);
    if (!c) {
      if (!(await siguientePagina())) break;
      continue;
    }
    try {
      const fila = page.locator(`[data-weprodu-borrador="${c.indice}"]`);
      if ((await fila.count()) !== 1) throw Object.assign(new Error("la fila marcada no es única"), { corta: true });
      const textoFila = normalizarTitulo(await fila.innerText());
      if (!/\bborrador\b/i.test(textoFila) || OTRO_ESTADO.test(textoFila.replace(/\bborrador\b/gi, ""))) throw Object.assign(new Error(`la fila ya no dice sólo «Borrador» («${textoFila.slice(0, 120)}»)`), { corta: true });
      await apretarEnLimpieza(fila, "menu_fila");
      await page.waitForTimeout(700);
      const menu = page.locator('[role="menu"]').filter({ visible: true });
      const raizMenu = (await menu.count()) === 1 ? menu : page;
      const textoMenu = await raizMenu.innerText().catch(() => "");
      if (!/cambiar nombre|ver informaci[oó]n/i.test(textoMenu)) throw Object.assign(new Error(`el menú abierto no es el de la fila (no tiene «Cambiar nombre» ni «Ver información»): «${normalizarTitulo(textoMenu).slice(0, 160)}»`), { corta: true });
      await apretarEnLimpieza(raizMenu, "eliminar_para_ti");
      await page.waitForTimeout(800);
      const modal = page.locator('[role="dialog"], [role="alertdialog"]').filter({ visible: true }).filter({ hasText: /eliminar para ti/i });
      if ((await modal.count()) !== 1) throw Object.assign(new Error("no apareció un único modal «Eliminar para ti»"), { corta: true });
      const textoModal = await modal.innerText();
      if (!/no podr[aá]s recuperar/i.test(textoModal) || /eliminar para todos/i.test(textoModal)) throw Object.assign(new Error(`el modal no es el esperado: «${normalizarTitulo(textoModal).slice(0, 200)}»`), { corta: true });
      await apretarEnLimpieza(modal, "confirmar_eliminar");
      await page.waitForTimeout(2500);
      const ahora = totalDelListado(await texto(page));
      const bajo = tot && ahora ? ahora.total === tot.total - 1 : !(await leerPagina()).some((f) => f.titulo === c.titulo);
      if (bajo) {
        borrados.push({ titulo: c.titulo, archivo: c.archivo });
        onProgreso(`Eliminado el borrador «${c.titulo}»${ahora ? ` (quedan ${ahora.total})` : ""}.`);
        fallos = 0;
      } else {
        fallos++;
        onProgreso(`Después de eliminar «${c.titulo}» el total no bajó (${tot?.total ?? "?"} → ${ahora?.total ?? "?"}). Falla ${fallos} de 3.`);
        if (fallos >= 3) {
          cortada = "el total no bajó tres veces seguidas";
          break;
        }
        // Se vuelve a la página 1 con el filtro, por si el listado quedó en otro estado.
        await page.keyboard.press("Escape").catch(() => {});
      }
      tot = ahora || tot;
      if (!bajo || !ahora) tot = (await filtrarBorradores(page, onProgreso)) || tot;
    } catch (e) {
      await page.keyboard.press("Escape").catch(() => {});
      cortada = e?.message || String(e);
      onProgreso(`Limpieza cortada: ${cortada}. No se borra nada más.`);
      break;
    }
  }
  if (!cortada && borrados.length >= tope0 && tope0 > 0) onProgreso(`Se llegó al tope de ${tope0} borrados por corrida.`);
  onProgreso(`Limpieza: ${borrados.length} borrador(es) eliminado(s), ${salteados.length} salteado(s)${cortada ? `, cortada (${cortada})` : ""}.`);
  return { total: totalInicial, candidatos: borrados, salteados, borrados, cortada };
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
  // Página del medio (31/10/2026): sin rechazo. `traerALaVista` lleva a la vista la hoja `paginaIndex`
  // (scroll o ventana más alta) y la verificación del campo se hace contra esa misma hoja.
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

    // LA VENTANA ALTA, DE ENTRADA (26/10 16:21): la hoja del editor no scrollea por ningún contenedor;
    // con la ventana en ALTO_EDITOR la página 1 entra entera y no hay scroll que pelear.
    // (La ventana alta de entrada se sacó el 26/10 16:39: con 2100 el contenedor de páginas trae relleno y,
    // sin una medición previa, no se lo puede partir. Se mide con la ventana normal y se agranda sólo si
    // hace falta, con la geometría ya conocida.)
    geometriaConocida = null;
    htmlLogueado = false; // el HTML del campo se vuelca una vez POR DOCUMENTO
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
        /*
          DIAGNÓSTICO, SÓLO EN SECO (26/10/2026): aunque no se pueda llegar al lugar de la firma, se suelta
          un campo de PRUEBA en el centro visible de la hoja, se loguea su HTML (para fijar el selector) y
          se deshace. No se envía nada: es una corrida en seco y el documento sale igual sin enviarse.
        */
        if (enSeco && !htmlLogueado) {
          const hoja = await medirCajaDePagina(page, colocacion.tamanoPagina.alto / colocacion.tamanoPagina.ancho, 0);
          const ed = await frameDelEditor(page);
          if (!hoja) onProgreso(`(diagnóstico en seco) No se pudo soltar el campo de prueba: no se encuentra la hoja. Dentro del editor: ${ed ? (await elementosGrandes(ed.frame)).join(" · ") || "ningún elemento grande" : "sin iframe"}.`);
          if (hoja) {
            const altoVisible = Math.min(ed ? ed.caja.y + ed.caja.h : 812, page.viewportSize()?.height || 812);
            const y = Math.max(hoja.y + 60, Math.min(hoja.y + hoja.h / 2, altoVisible - 80));
            const prueba = { x: hoja.x + hoja.w / 2, y };
            hojaDelCampo = hoja;
            await marcarDom(page);
            onProgreso(`(diagnóstico en seco) Se suelta un campo de prueba en (${Math.round(prueba.x)}, ${Math.round(prueba.y)}) para ver su HTML; después se deshace.`);
            await arrastrarFirma(page, prueba);
            const n = await camposDeFirma(page, firmante.nombre, onProgreso);
            if (n === 0) onProgreso(`(diagnóstico en seco) Tampoco apareció un campo en el centro de la hoja; bajo el puntero: ${await queHayEn(page, prueba)}.`);
            else await apretar(page, "deshacer").catch(() => onProgreso("(diagnóstico en seco) No se encontró «Deshacer»: el campo de prueba queda en el borrador, que no se envía."));
          }
        }
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
      else if (ultimosCampos[0]?.pct && Number.isFinite(ultimosCampos[0].pct.left) && Number.isFinite(ultimosCampos[0].pct.top)) {
        /*
          VERIFICACIÓN POR PORCENTAJE (17:49): el editor guarda el campo en % de la página (left/top/width/
          height del style). Se compara el CENTRO con el del campo pedido en el PDF (y desde arriba), con
          ±1 % de tolerancia: exacto, no depende del render, del zoom ni de que el campo esté a la vista.
        */
        const { pct, firmante: signer } = ultimosCampos[0];
        const tp = colocacion.tamanoPagina;
        const cx = pct.left + (pct.width || 0) / 2;
        const cy = pct.top + (pct.height || 0) / 2;
        const ex = ((colocacion.campo.x + colocacion.campo.w / 2) / tp.ancho) * 100;
        const ey = ((colocacion.campo.y + colocacion.campo.h / 2) / tp.alto) * 100;
        const dx = Math.abs(cx - ex);
        const dyp = Math.abs(cy - ey);
        const detallePct = `centro (${cx.toFixed(2)} %, ${cy.toFixed(2)} %) contra lo pedido (${ex.toFixed(2)} %, ${ey.toFixed(2)} %); ancho ${pct.width?.toFixed(2)} % (pedido ${((colocacion.campo.w / tp.ancho) * 100).toFixed(2)} %)${signer ? `; firmante ${signer}` : ""}`;
        if (dx <= 1 && dyp <= 1) {
          onProgreso(`Campo verificado por porcentaje: ${detallePct}.`);
          colocado = true;
        } else motivoFalla = `El campo quedó fuera de lo pedido: ${detallePct} (tolerancia ±1 %).`;
      } else {
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
    /*
      LA CAPTURA DE LA COLOCACIÓN (sólo en seco, 26/10/2026): un recorte alrededor del campo colocado, para
      mirar con los ojos si quedó sobre la celda del rótulo y no en el renglón de abajo. Queda en el log
      de la corrida («Ver qué vio el navegador»).
    */
    let capturaColocacion;
    if (enSeco && colocado) {
      const c = await cajaDelCampo(page);
      if (c) {
        const vp = page.viewportSize() || { width: 1457, height: 812 };
        const x = Math.max(0, c.x - 350);
        const y = Math.max(0, c.y - 220);
        capturaColocacion = await page.screenshot({ clip: { x, y, width: Math.min(vp.width - x, c.w + 700), height: Math.min(vp.height - y, c.h + 440) } }).catch(() => undefined);
        if (capturaColocacion) onProgreso("Captura de la colocación guardada (seco): se ve en Logs → «Ver qué vio el navegador».");
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
      return { resultado: "seco", captura: capturaColocacion, detalle: "[SECO] listo para enviar: título, CC y firmante verificados; no se apretó «Enviar para firmar»." };
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
export const _paraPruebas = { traerALaVista, marcarDom, arrastrarFirma, camposDeFirma, cajaDelCampo, setHoja: (c) => (hojaDelCampo = c), ultimos: () => ultimosCampos };
