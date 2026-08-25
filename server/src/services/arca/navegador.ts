import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, Browser, BrowserContext, Page } from "playwright-core";
import { decryptSecret, encryptSecret } from "../../utils/secretCrypto.js";
import { Tenant } from "../../models/Tenant.js";
import { clasificarPantalla, PantallaArca } from "./pantallaArca.js";

/**
 * Un Chromium en el SERVIDOR que entra a ARCA con clave fiscal y deja la pantalla de altas lista.
 *
 * POR QUÉ EXISTE
 *
 * La obra social que ARCA tiene registrada para un CUIL no la devuelve ningún webservice: Consulta
 * Padrón A13 —el único conectado— trae datos del contribuyente, y Simplificación Registral es una
 * aplicación de clave fiscal. El dato solo aparece precompletado en la pantalla de altas.
 *
 * Hasta acá eso obligaba a que cada administrativo instalara un programa en su máquina y mantuviera
 * su propia sesión abierta. Con el navegador del lado del servidor, la sesión es una sola, vive acá,
 * y el trabajo corre solo.
 *
 * ⚠ LO QUE ESTO CAMBIA, Y NO ES UN DETALLE
 *
 * Guardar una clave fiscal es una decisión de seguridad, no una mejora técnica, y el proyecto la
 * tenía tomada al revés a propósito: el login manual era la garantía de que WeProdu nunca tocara una
 * credencial que abre toda la identidad tributaria de una empresa.
 *
 * Se invirtió deliberadamente y bajo UNA condición: que el usuario cuya clave se guarda sea un
 * usuario de AFIP creado aparte, con «Simplificación Registral» como único servicio delegado desde
 * Administrador de Relaciones. Con eso, un servidor comprometido cuesta el acceso a una pantalla de
 * altas y no a la identidad tributaria de la empresa.
 *
 * La app NO puede verificar eso: los servicios delegados se ven en AFIP, no acá. Si alguna vez se
 * carga la clave del apoderado, esto sigue funcionando igual y el riesgo se multiplica sin que nada
 * avise. Por eso está escrito acá y en el modelo.
 */

const AFIP_LOGIN_URL = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
const SIMPLIFICACION_URL = "https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/app/login/IndexContribuyente.aspx";

/*
  ===========================================================================
  AL SERVICIO SE ENTRA POR EL PORTAL, NO POR LA URL
  ===========================================================================

  Loguearse en AFIP NO alcanza para abrir Simplificación Registral. El login deja una sesión del
  portal de clave fiscal; el servicio vive en otro dominio (`serviciossegsoc.afip.gob.ar`) y tiene su
  propia sesión, que se abre cuando el portal le entrega el usuario al entrar por el listado de
  servicios. Ir derecho a la URL profunda salta ese paso.

  COMPROBADO, no deducido: un GET a `IndexContribuyente.aspx` sin sesión de servicio redirige a
  `.../app/ErrorPage.aspx`, que contesta 200, se queda en el MISMO dominio y dice solo «Ha ocurrido un
  error». Por eso el chequeo de acá abajo es positivo y mira la URL final: el negativo anterior
  —«está en serviciossegsoc y no dice que la sesión venció»— daba por buena esa pantalla de error.

  Es también el paso que la persona hacía a mano y nadie había tenido que escribir: en el camino del
  Asistente, quien abría el servicio desde el portal era ella, y el programa se enganchaba a una
  pestaña que YA estaba adentro.
*/
/**
 * Cuánto se le da a AFIP para abrir una página, por intento.
 *
 * 60 s y no los 30 de fábrica de Playwright: el login de AFIP tardó más que eso en el VPS y la
 * corrida entera murió con un `Timeout 30000ms exceeded` antes de la primera persona. El sitio del
 * organismo es lento, y esperar un rato más es infinitamente más barato que volver a correr todo.
 */
const NAVEGACION_MS = 60_000;

const PORTAL_URL = "https://portalcf.cloud.afip.gob.ar/portal/app/";
const NOMBRE_SERVICIO = /simplificaci[oó]n\s*registral/i;

/*
  Selectores del login de AFIP.

  Los dos primeros están VERIFICADOS contra la página real: son ids de JSF (`F1:username`,
  `F1:btnSiguiente`) y el campo del CUIT es `type="number"`.

  Los de la segunda pantalla NO se escriben fijos, y es a propósito: para verlos hay que mandar un
  CUIT válido, y probar con uno cualquiera es enumerar cuentas contra un organismo. Se DESCUBREN —
  «el input de contraseña que haya» y «el botón de submit que lo acompaña»— que además aguanta que
  AFIP les cambie el id, cosa que a los de JSF les pasa cuando reordenan el formulario.
*/
const SEL_LOGIN = {
  cuit: "#F1\\:username",
  siguiente: "#F1\\:btnSiguiente",
  clave: "input[type=password]",
  ingresar: "input[type=submit], button[type=submit]",
};

export interface CredencialesArca {
  cuitUsuario: string;
  clave: string;
}

export interface SesionArca {
  browser: Browser;
  ctx: BrowserContext;
  page: Page;
  /** `true` si hubo que loguearse; `false` si alcanzó con la sesión guardada. */
  seLogueo: boolean;
}

/**
 * Dónde está el Chromium, buscando en orden de preferencia.
 *
 * SE BUSCA EN VEZ DE EXIGIR UN PASO DE INSTALACIÓN. La primera corrida en el VPS falló justamente
 * por eso: Playwright tiró su cartel de «Please run npx playwright install», que es correcto pero
 * llega tarde —cuando alguien ya apretó Validar y esperó— y en un idioma que no es el de la app.
 *
 * El orden va del más compatible al más disponible:
 *
 *   1. `CHROMIUM_PATH`, para cuando el servidor tiene uno puesto a propósito. Manda siempre.
 *   2. El de Playwright, si está bajado. Es el que mejor se lleva con esta versión de la librería.
 *   3. Uno del sistema (`/usr/bin/chromium`, `google-chrome`…), que en un Linux con Chrome ya está.
 *   4. El que bajó puppeteer para generar los PDF. Existe en este servidor desde siempre, así que es
 *      el que hace que esto ande sin instalar nada — pero es de 2021, así que va último: sirve como
 *      red, no como plan.
 *
 * `undefined` deja que Playwright use el suyo, que es lo correcto cuando está.
 */
function rutaChromium(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  try {
    const propio = chromium.executablePath();
    if (propio && existsSync(propio)) return undefined;
  } catch {
    /* algunas versiones tiran si no hay browser instalado: se sigue buscando */
  }

  const delSistema = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  for (const r of delSistema) if (existsSync(r)) return r;

  const dePuppeteer = chromiumDePuppeteer();
  if (dePuppeteer) return dePuppeteer;

  return undefined;
}

/**
 * El Chromium que puppeteer bajó para generar los PDF.
 *
 * Se busca a mano y no con `require("puppeteer")` porque importarlo levanta toda la librería para
 * quedarse con una ruta. El nombre de la carpeta lleva la revisión (`linux-901912`), que cambia con
 * la versión, así que se lee el directorio en vez de escribirla fija.
 */
function chromiumDePuppeteer(): string | undefined {
  const base = resolve(dirname(fileURLToPath(import.meta.url)), "../../../node_modules/puppeteer/.local-chromium");
  if (!existsSync(base)) return undefined;
  for (const rev of readdirSync(base)) {
    for (const rel of ["chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-win/chrome.exe"]) {
      const r = resolve(base, rev, rel);
      if (existsSync(r)) return r;
    }
  }
  return undefined;
}

/**
 * Traduce el cartel de Playwright a algo accionable, en castellano.
 *
 * El original es un recuadro de arte ASCII con un comando en inglés que, metido en una franja de
 * error de la app, sale desarmado e ilegible — y no dice DÓNDE hay que correr ese comando, que es lo
 * único que hace falta saber.
 */
function errorDeChromium(e: any): Error {
  const msg = String(e?.message || e);
  if (/Executable doesn't exist|Please run the following command/i.test(msg)) {
    return new Error(
      "Falta el navegador en el servidor. Entrá al VPS y corré, dentro de la carpeta `server/`:\n\n" +
        "    npx playwright install chromium\n\n" +
        "Si el servidor ya tiene un Chromium instalado, alcanza con apuntarle: `CHROMIUM_PATH=/usr/bin/chromium`.",
    );
  }
  return e instanceof Error ? e : new Error(msg);
}

/** Lee y descifra las credenciales del tenant./** Lee y descifra las credenciales del tenant. `null` si no están cargadas. */
export async function credencialesDe(tenantId: string): Promise<CredencialesArca | null> {
  const t: any = await Tenant.findById(tenantId).select("integrations.arcaSimplificacion").lean();
  const cfg = t?.integrations?.arcaSimplificacion;
  const clave = decryptSecret(cfg?.claveEnc);
  if (!cfg?.cuitUsuario || !clave) return null;
  return { cuitUsuario: String(cfg.cuitUsuario), clave };
}

/** La sesión guardada, si hay. Se descifra en memoria y nunca toca el disco. */
async function sesionGuardada(tenantId: string): Promise<any | null> {
  const t: any = await Tenant.findById(tenantId).select("integrations.arcaSimplificacion.sesionEnc").lean();
  const plano = decryptSecret(t?.integrations?.arcaSimplificacion?.sesionEnc);
  if (!plano) return null;
  try {
    return JSON.parse(plano);
  } catch {
    return null;
  }
}

/**
 * Guarda la sesión para la próxima corrida.
 *
 * Cifrada, igual que la clave: mientras dura, entrar con esta sesión no pide contraseña, así que
 * dejarla en claro sería guardar la credencial en claro con otro nombre.
 */
async function guardarSesion(tenantId: string, ctx: BrowserContext): Promise<void> {
  const estado = await ctx.storageState();
  await Tenant.findByIdAndUpdate(tenantId, {
    $set: {
      "integrations.arcaSimplificacion.sesionEnc": encryptSecret(JSON.stringify(estado)),
      "integrations.arcaSimplificacion.sesionGuardadaAt": new Date(),
    },
  });
}

/**
 * Navega aguantando las redirecciones encadenadas de AFIP.
 *
 * `page.goto` tira «Navigation to X is interrupted by another navigation to Y» cuando, mientras
 * cargaba, la página arrancó sola para otro lado. En AFIP eso no es una falla: es el portal
 * mandándote adonde corresponde, y la navegación que interrumpe ES la buena. Tratarlo como error hizo
 * fallar una corrida entera con un mensaje de Playwright en inglés y sin ninguna pista.
 *
 * Tampoco tira si no llega: vuelve, y el estado de la pantalla lo decide quien llama — que puede
 * decir dónde terminó, en vez de dónde no pudo entrar.
 */
async function irA(page: Page, url: string): Promise<void> {
  let ultimo: any = null;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVEGACION_MS });
      return;
    } catch (e: any) {
      ultimo = e;
      const msg = String(e?.message || e);
      // Los dos motivos por los que se reintenta, y ninguno es un error de nuestro lado:
      //   - la cadena de redirecciones de AFIP interrumpió la navegación (la que interrumpe ES la buena);
      //   - AFIP tardó más que el timeout, que en horario pico pasa.
      if (!/interrupted by another navigation|Timeout .* exceeded/i.test(msg)) throw e;
      // Se deja terminar lo que haya en curso antes de volver a intentar: reintentar encima de una
      // navegación viva es pedir la misma interrupción de nuevo.
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
  }
  /*
    Se agotaron los intentos. El mensaje de Playwright es un `Timeout 30000ms exceeded` con un call
    log en inglés que no dice NADA accionable: se reemplaza por lo que de verdad pasó y por lo único
    que se puede hacer al respecto.
  */
  if (/Timeout .* exceeded/i.test(String(ultimo?.message || ultimo))) {
    throw new Error(`AFIP no terminó de abrir ${url} en ${Math.round((NAVEGACION_MS / 1000) * 3)} segundos (3 intentos).\n\nSuele ser el sitio del organismo lento o caído: probá de nuevo en un rato. Si pasa siempre, revisá que el VPS tenga salida a auth.afip.gob.ar.`);
  }
  throw ultimo;
}

/**
 * En qué pantalla estamos, dicho en positivo.
 *
 * Distinguir «error del servicio» de «me mandó al login» de «esto no es ARCA» es lo que permite que
 * el mensaje diga qué pasó. El chequeo anterior era negativo —«¿el texto NO dice que la sesión
 * venció?»— y por eso daba por buena `ErrorPage.aspx`, que no lo dice.
 *
 * La regla en sí vive en `pantallaArca.ts`, sin Playwright, para poder probarla.
 */
async function pantallaDe(page: Page): Promise<PantallaArca> {
  const texto = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  return clasificarPantalla(page.url(), texto);
}

/**
 * Abre «Simplificación Registral» desde el listado de servicios del portal, como lo hace la persona.
 *
 * Los servicios se buscan de tres formas y no de una: por el link al dominio del servicio, por el
 * rótulo, y —si el portal los tiene escondidos— tipeando en el buscador. Es una pantalla de un
 * organismo que cambia sin avisar y que no podemos ver desde acá sin una clave fiscal: una sola
 * estrategia se rompe con el próximo rediseño y se lleva puesta la única forma de entrar.
 *
 * Devuelve la pestaña que quedó adentro (el portal abre algunos servicios en una nueva), o `null` si
 * el servicio no aparece — que es el ÚNICO caso en que tiene sentido preguntar por la delegación.
 */
async function abrirServicioDesdeElPortal(ctx: BrowserContext, page: Page): Promise<Page | null> {
  await irA(page, PORTAL_URL);
  /*
    EL PORTAL ES UNA SPA: el HTML llega vacío y la lista de servicios aparece después.

    Comprobado: sin sesión, `portal/app/` se queda en la misma URL con el body en blanco y recién
    entonces se va sola a `/expiredSession` y de ahí al login. Buscar el servicio apenas termina el
    `domcontentloaded` es buscarlo en una página que todavía no existe — y devolver `null` ahí sería
    decir «el usuario no tiene el servicio delegado» por haber preguntado demasiado rápido.
  */
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  let enlace = await esperarEnlaceDelServicio(page, 15_000);
  if (!enlace) {
    for (const sel of ['input[type="search"]', 'input[placeholder*="usc" i]', "#buscadorInput", 'input[name*="busc" i]']) {
      const campo = page.locator(sel).first();
      if (!(await campo.count().catch(() => 0))) continue;
      // Sin tilde: el buscador del portal filtra por texto y así entra igual escriba AFIP
      // «Simplificación» o «Simplificacion».
      await campo.fill("Simplificacion Registral").catch(() => {});
      enlace = await esperarEnlaceDelServicio(page, 10_000);
      if (enlace) break;
    }
  }
  if (!enlace) return null;

  // Puede abrir pestaña nueva o navegar en la misma: se espera la nueva sin exigirla.
  const [nueva] = await Promise.all([ctx.waitForEvent("page", { timeout: 15_000 }).catch(() => null), enlace.click().catch(() => {})]);
  const destino = nueva || page;
  await destino.waitForLoadState("domcontentloaded").catch(() => {});
  return destino;
}

/** Espera a que el servicio aparezca, hasta `ms`. Devuelve `null` recién cuando de verdad no está. */
async function esperarEnlaceDelServicio(page: Page, ms: number) {
  const hasta = Date.now() + ms;
  for (;;) {
    const e = await enlaceDelServicio(page);
    if (e) return e;
    if (Date.now() >= hasta) return null;
    await page.waitForTimeout(500);
  }
}

async function enlaceDelServicio(page: Page) {
  const porHref = page.locator('a[href*="serviciossegsoc"], a[href*="MiSimplificacion"]').first();
  if (await porHref.count().catch(() => 0)) return porHref;
  const porRotulo = page.locator("a, button").filter({ hasText: NOMBRE_SERVICIO }).first();
  if (await porRotulo.count().catch(() => 0)) return porRotulo;
  return null;
}

/**
 * Completa el login de clave fiscal.
 *
 * El formulario de AFIP es en DOS PASOS: primero el CUIT y «Siguiente», y recién en la pantalla que
 * sigue aparece el campo de la clave. Mandar los dos juntos no funciona: el campo de clave todavía
 * no existe en el DOM cuando se carga la página.
 *
 * Si aparece un segundo factor o un captcha, esto NO reintenta ni intenta resolverlo: corta con un
 * mensaje que dice qué pasó. Un reintento ciego contra el login de un organismo puede terminar en una
 * cuenta bloqueada, que es mucho peor que una corrida fallida.
 */
async function loguear(page: Page, cred: CredencialesArca): Promise<void> {
  // Por `irA` y no `page.goto`: el login de AFIP también encadena redirecciones.
  await irA(page, AFIP_LOGIN_URL);

  await page.fill(SEL_LOGIN.cuit, cred.cuitUsuario.replace(/\D/g, ""));
  await page.click(SEL_LOGIN.siguiente);
  await page.waitForLoadState("domcontentloaded").catch(() => {});

  /*
    El CUIT rechazado se detecta ACÁ y no esperando el campo de clave.

    Cuando AFIP no reconoce el número, vuelve a la MISMA pantalla con el cartel «Número de CUIL/CUIT
    incorrecto» — no hay error, no hay redirección, y el campo de contraseña simplemente nunca
    aparece. Sin este chequeo, el síntoma sería un timeout de 20 segundos y un mensaje sobre la
    pantalla que cambió, que manda a buscar el problema al lugar equivocado.
  */
  const paso1 = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  if (/n[uú]mero de cuil\/cuit incorrecto/i.test(paso1)) {
    throw new Error(`AFIP no reconoce el CUIT ${cred.cuitUsuario}. Tiene que ser el del usuario con clave fiscal, no el de la empleadora.`);
  }

  const campoClave = await page.waitForSelector(SEL_LOGIN.clave, { timeout: 20_000 }).catch(() => null);
  if (!campoClave) {
    throw new Error("AFIP no mostró el campo de la clave. Si el CUIT es correcto, puede que la pantalla de login haya cambiado.");
  }

  await campoClave.fill(cred.clave);
  await page.click(SEL_LOGIN.ingresar);
  await page.waitForLoadState("domcontentloaded").catch(() => {});

  const texto = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  if (/c[oó]digo de seguridad|segundo factor|token|captcha/i.test(texto)) {
    throw new Error("AFIP pidió un segundo factor o un captcha. Esta automatización no los resuelve a propósito: reintentar a ciegas puede bloquear la cuenta.");
  }
  if (/clave o usuario inv[aá]lido|datos incorrectos|no coinciden|clave incorrecta/i.test(texto)) {
    throw new Error("AFIP rechazó la clave. Ojo: varios intentos fallidos bloquean la cuenta, así que corregila antes de volver a correr.");
  }
}

/**
 * Abre un navegador con la sesión de ARCA lista, logueándose solo si hace falta.
 *
 * SE INTENTA PRIMERO CON LA SESIÓN GUARDADA. Loguearse en cada corrida es tráfico innecesario contra
 * el organismo, es lento, y multiplica las oportunidades de que AFIP pida un segundo factor. La
 * sesión dura días.
 *
 * Quien llama TIENE que cerrar el browser (`await sesion.browser.close()`), o cada corrida deja un
 * Chromium vivo comiéndose la memoria del VPS.
 */
export async function abrirSesionArca(tenantId: string, cred: CredencialesArca): Promise<SesionArca> {
  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: rutaChromium() });
  } catch (e: any) {
    // El «falta el navegador» tiene que llegar como instrucción, no como el cartel de Playwright.
    const err = errorDeChromium(e);
    await Tenant.findByIdAndUpdate(tenantId, { $set: { "integrations.arcaSimplificacion.ultimoError": err.message } });
    throw err;
  }
  const guardada = await sesionGuardada(tenantId);
  const ctx = await browser.newContext(guardada ? { storageState: guardada } : {});
  let page = await ctx.newPage();

  /*
    Camino rápido: con la sesión guardada la URL profunda entra derecho, porque la sesión DEL SERVICIO
    viaja en el `storageState`. Si venció, ARCA devuelve `FinSession.aspx` y se cae al login de abajo.
  */
  await irA(page, SIMPLIFICACION_URL).catch(() => {});
  if ((await pantallaDe(page)) === "servicio") return { browser, ctx, page, seLogueo: false };

  try {
    await loguear(page, cred);

    const destino = await abrirServicioDesdeElPortal(ctx, page);
    if (!destino) {
      throw new Error(
        "Entré a AFIP con ese usuario, pero «Simplificación Registral» no aparece entre sus servicios en el portal. " +
          "Delegáselo desde Administrador de Relaciones con el CUIT de la empleadora, o revisá que la delegación esté aceptada.",
      );
    }
    const estadoPantalla = await pantallaDe(destino);
    if (estadoPantalla !== "servicio") {
      // Se dice DÓNDE terminó. Un «no abrió» a secas mandó a revisar la delegación, que estaba bien.
      throw new Error(`Abrí «Simplificación Registral» desde el portal pero la pantalla que apareció no es la del servicio (${estadoPantalla}): ${destino.url()}`);
    }
    page = destino;

    await guardarSesion(tenantId, ctx);
    await Tenant.findByIdAndUpdate(tenantId, {
      $set: { "integrations.arcaSimplificacion.ultimoLoginAt": new Date(), "integrations.arcaSimplificacion.ultimoError": "" },
    });
    return { browser, ctx, page, seLogueo: true };
  } catch (e: any) {
    // El motivo queda guardado para que la pantalla pueda decirlo sin ir a buscar los logs del VPS.
    await Tenant.findByIdAndUpdate(tenantId, { $set: { "integrations.arcaSimplificacion.ultimoError": String(e?.message || e) } });
    await browser.close().catch(() => {});
    throw e;
  }
}
