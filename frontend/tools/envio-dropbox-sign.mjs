/**
 * EL MOTOR QUE OPERA LA WEB DE DROPBOX SIGN para enviar un documento a la firma. Lo carga el server
 * (`services/dropboxSignBot/corridaEnvio.ts`) con la página de Playwright ya logueada; acá no se
 * lanzan navegadores ni se tocan credenciales. Tiene su test de lista blanca de clicks
 * (`envio-dropbox-sign.test.mjs`): cada click está enumerado y el único irreversible, «Enviar para
 * firmar», va detrás del guard que manda el server y del modo seco.
 *
 * LA RECETA (validada en ~176 envíos con viewport 1457×812 y zoom «Ajustar al ancho»):
 *   manage → «Firmar documentos» → «Cargar» (input[type=file]) → Siguiente → firmante → Siguiente →
 *   editor: (última página si corresponde) arrastrar «Firma» al destino → verificar «Firma de NOMBRE» →
 *   Siguiente → revisar: CC + título exacto → guard → «Enviar para firmar» → «Solicitud de firma enviada».
 *
 * DÓNDE SE SUELTA LA FIRMA no lo decide el motor: recibe una `colocacion` YA RESUELTA por el server
 * (`compartido/reglasColocacionFirma.ts`, anclada al texto del PDF) y la `geometria` para pasar de
 * puntos PDF a píxeles. Estrategia: 1) ANCLA: se mide la caja de la página renderizada y se convierte el
 * punto; 2) FALLBACK: la receta de pantalla (scroll + coordenadas validadas en 1457×812) si no hay
 * ancla o la página no se puede medir (queda en el log); 3) se VERIFICA que haya exactamente un campo
 * «Firma de NOMBRE» y, cuando se puede medir, que caiga dentro del rectángulo esperado; si falla, se
 * deshace y se reintenta UNA vez; si vuelve a fallar → requiere_revision, no se envía.
 */

export const MANAGE_URL = "https://app.sign.dropbox.com/home/manage";
/** Dónde está el ítem «Firma» del panel de campos, en 1457×812. */
export const ORIGEN_FIRMA = { x: 69, y: 504 };
const ESPERA_EDITOR_MS = 9000;
const ESPERA_REVISAR_MS = 6000;
const ESPERA_RESULTADO_MS = 15000;

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
  agregar_cc: { rol: ["button"], nombre: /agregar un destinatario en cc/i, descripcion: "abre el campo de CC en «Revisar y enviar»" },
};

/** El click que sí envía. Fuera de BOTONES a propósito: sólo lo aprieta `enviarParaFirmar`. */
export const IRREVERSIBLE = { rol: ["button"], nombre: /^enviar para firmar$/i };

const texto = (page) => page.evaluate(() => document.body?.innerText || "").catch(() => "");
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
async function apretar(page, clave) {
  const { loc, def } = ubicar(page, clave);
  const n = await loc.count();
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

/** Arrastre del campo «Firma» desde el panel hasta un punto de pantalla. Sin DOM estable para el drop. */
async function arrastrarFirma(page, destino) {
  await page.mouse.move(ORIGEN_FIRMA.x, ORIGEN_FIRMA.y);
  await page.mouse.down();
  const pasos = 12;
  for (let i = 1; i <= pasos; i++) {
    await page.mouse.move(ORIGEN_FIRMA.x + ((destino.x - ORIGEN_FIRMA.x) * i) / pasos, ORIGEN_FIRMA.y + ((destino.y - ORIGEN_FIRMA.y) * i) / pasos);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(800);
}

/** Rueda del visor según la receta de pantalla del fallback. */
async function scrollDelFallback(page, scroll) {
  if (!scroll) return;
  await page.mouse.move(scroll.enX, scroll.enY);
  await page.mouse.wheel(0, scroll.ticks * 100 * (scroll.direccion === "abajo" ? 1 : -1));
  await page.waitForTimeout(800);
}

/**
 * La caja (px) de la página del documento que está a la vista en el editor: el elemento visible más
 * grande con forma de hoja (más alto que ancho, > 300 px de ancho) entre canvas/imágenes/contenedores
 * de página. Si el editor cambia y no se encuentra, devuelve null y se usa la receta de pantalla.
 */
async function medirCajaDePagina(page) {
  return page
    .evaluate(() => {
      const candidatos = Array.from(document.querySelectorAll('canvas, img, [class*="page" i], [data-testid*="page" i]'));
      let mejor = null;
      for (const el of candidatos) {
        const r = el.getBoundingClientRect();
        if (r.width < 300 || r.height <= r.width || r.width > window.innerWidth) continue;
        const estilo = getComputedStyle(el);
        if (estilo.visibility === "hidden" || estilo.display === "none") continue;
        const area = r.width * r.height;
        if (!mejor || area > mejor.area) mejor = { x: r.left, y: r.top, w: r.width, h: r.height, area };
      }
      return mejor ? { x: mejor.x, y: mejor.y, w: mejor.w, h: mejor.h } : null;
    })
    .catch(() => null);
}

/** Mueve el visor hasta que el punto de pantalla quede a la vista (la caja de la página cambia con el scroll). */
async function traerALaVista(page, colocacion, geometria) {
  let caja = await medirCajaDePagina(page);
  for (let i = 0; i < 4 && caja; i++) {
    const d = geometria.pdfAPantalla(colocacion.puntoPdf, colocacion.tamanoPagina, caja);
    const alto = page.viewportSize()?.height || 812;
    if (d.y > 120 && d.y < alto - 80) return { caja, destino: d };
    await page.mouse.move(caja.x + caja.w / 2, Math.min(Math.max(caja.y + 50, 150), alto - 100));
    await page.mouse.wheel(0, d.y - alto / 2);
    await page.waitForTimeout(700);
    caja = await medirCajaDePagina(page);
  }
  return null;
}

/** Dónde quedó el campo de firma colocado (centro, px), si el DOM lo expone. */
async function centroDelCampo(page) {
  const loc = page.locator(`[aria-label*="Firma de" i], [title*="Firma de" i]`).first();
  const b = await loc.boundingBox({ timeout: 1500 }).catch(() => null);
  return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
}

/** Cuántos campos «Firma de NOMBRE» hay colocados. */
async function camposDeFirma(page, nombre) {
  const re = new RegExp(`firma de ${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  const t = await texto(page);
  const enTexto = (t.match(new RegExp(re.source, "gi")) || []).length;
  const enAria = await page.locator(`[aria-label*="Firma de" i], [title*="Firma de" i]`).count().catch(() => 0);
  return Math.max(enTexto, enAria);
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
  if (typeof guard !== "function" || typeof esLimite !== "function") throw new Error("Faltan el guard y el detector de límite del server.");
  if (!geometria || typeof geometria.pdfAPantalla !== "function" || typeof geometria.pantallaAPdf !== "function") throw new Error("Falta la geometría (pdfAPantalla/pantallaAPdf) del server.");
  const captura = async () => page.screenshot({ fullPage: false }).catch(() => undefined);
  try {
    cortar(señal, "abrir el wizard");
    await page.goto(MANAGE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
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
    await page.waitForTimeout(2500);
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

    // Arrastrar «Firma» al destino (ancla → fallback) y VERIFICAR: exactamente un campo, a nombre del
    // firmante y, si se puede medir, dentro del rectángulo esperado. Un reintento con deshacer.
    onProgreso(`Colocación resuelta por ${colocacion.estrategia}: ${colocacion.nota}`);
    let colocado = false;
    let motivoFalla = "";
    let hizoScrollFallback = false;
    for (let intento = 1; intento <= 2 && !colocado; intento++) {
      let vista = null;
      if (colocacion.estrategia === "ancla" && colocacion.puntoPdf && colocacion.tamanoPagina) {
        vista = await traerALaVista(page, colocacion, geometria);
        if (!vista) onProgreso("No se pudo medir la página renderizada: se usa la receta de pantalla (fallback).");
      }
      let destino;
      if (vista) destino = vista.destino;
      else if (colocacion.fallback) {
        if (!hizoScrollFallback) {
          await scrollDelFallback(page, colocacion.fallback.scroll);
          hizoScrollFallback = true;
        }
        destino = colocacion.fallback.soltarEn;
        if (colocacion.estrategia !== "fallback") onProgreso("FALLBACK: coordenadas de pantalla validadas, sin ancla de texto.");
      } else {
        motivoFalla = "No hay ancla medible ni receta de pantalla para este tipo.";
        break;
      }
      onProgreso(`Colocando la firma en (${Math.round(destino.x)}, ${Math.round(destino.y)}) — ${colocacion.descripcion}`);
      await arrastrarFirma(page, destino);
      const n = await camposDeFirma(page, firmante.nombre);
      if (n !== 1) motivoFalla = `Se esperaba 1 campo de firma y hay ${n}.`;
      else if (vista && colocacion.rectEsperado) {
        const centro = await centroDelCampo(page);
        const cajaAhora = (await medirCajaDePagina(page)) || vista.caja;
        if (!centro) {
          onProgreso("El campo quedó colocado pero el DOM no expone dónde: se acepta por conteo.");
          colocado = true;
        } else {
          const enPdf = geometria.pantallaAPdf(centro, colocacion.tamanoPagina, cajaAhora);
          const r = colocacion.rectEsperado;
          const adentro = enPdf.x >= r.x && enPdf.x <= r.x + r.w && enPdf.y >= r.y && enPdf.y <= r.y + r.h;
          if (adentro) colocado = true;
          else motivoFalla = `El campo quedó en (${Math.round(enPdf.x)}, ${Math.round(enPdf.y)}) pt, fuera del rectángulo esperado.`;
        }
      } else colocado = true;
      if (!colocado && intento === 1) {
        onProgreso(`${motivoFalla} Se deshace y se reintenta.`);
        if (n > 0) await apretar(page, "deshacer").catch(() => {});
        await page.waitForTimeout(600);
      }
    }
    if (!colocado) {
      const img = await captura();
      await salirSinEnviar(page);
      return { resultado: "requiere_revision", detalle: `No se pudo verificar un único campo «Firma de <NOMBRE>» en el lugar esperado (${motivoFalla}): no se envió.`, captura: img };
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
    const img = await captura();
    await salirSinEnviar(page).catch(() => {});
    return { resultado: "error", detalle: e?.message || String(e), captura: img };
  }
}
