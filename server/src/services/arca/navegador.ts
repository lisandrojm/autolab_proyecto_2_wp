import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, Browser, BrowserContext, Page } from "playwright-core";
import { decryptSecret, encryptSecret } from "../../utils/secretCrypto.js";
import { Tenant } from "../../models/Tenant.js";

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

/** ¿La pestaña está adentro de Simplificación Registral, o AFIP la mandó al login? */
async function dentroDeSimplificacion(page: Page): Promise<boolean> {
  if (!/serviciossegsoc\.afip\.gob\.ar/i.test(page.url())) return false;
  const texto = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  return !/sesi[oó]n ha finalizado|no ha iniciado su sesi[oó]n|ingrese con su clave fiscal/i.test(texto);
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
  await page.goto(AFIP_LOGIN_URL, { waitUntil: "domcontentloaded" });

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
  const page = await ctx.newPage();

  await page.goto(SIMPLIFICACION_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  if (await dentroDeSimplificacion(page)) return { browser, ctx, page, seLogueo: false };

  try {
    await loguear(page, cred);
    await page.goto(SIMPLIFICACION_URL, { waitUntil: "domcontentloaded" });
    if (!(await dentroDeSimplificacion(page))) {
      throw new Error("Entré a AFIP pero Simplificación Registral no abrió. ¿El usuario tiene ese servicio delegado en Administrador de Relaciones?");
    }
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
