import { BrowserContext, Page } from "playwright-core";
import { Tenant } from "../../models/Tenant.js";
import { decryptSecret, encryptSecret } from "../../utils/secretCrypto.js";
import { errorDeChromium } from "../arca/navegador.js";
import { abrirContextoDropboxSign, liberarContexto } from "./perfil.js";
import { clasificarPantalla, pasoDeLogin, type PantallaDropboxSign } from "./clasificarPantalla.js";
import { VIEWPORT } from "./reglas.js";
import { soltarCandadoDropboxSign, tomarCandadoDropboxSign } from "./candado.js";

/**
 * UN CHROMIUM EN EL SERVIDOR CON LA SESIÓN DE DROPBOX SIGN (patrón `arca/navegador.ts`).
 *
 * El plan Essentials de Dropbox Sign no incluye la API, así que el bot opera la web como una persona.
 * Desde el 27/10/2026 el navegador usa un PERFIL PERSISTENTE por tenant, con identidad coherente, y
 * queda tibio entre usos (`perfil.ts`); el `storageState` cifrado sigue guardándose como respaldo. El
 * login con usuario y contraseña es el respaldo cuando la sesión vence. Ante captcha o segundo factor NO se insiste: se corta con
 * `bot.ultimoError` y la UI pide repetir el login manual (`scripts/loginDropboxSign.ts`).
 *
 * El viewport es FIJO (1457×812): las coordenadas de colocación de la firma se validaron con ése.
 */

export const MANAGE_URL = "https://app.sign.dropbox.com/home/manage";
const BASE = "integrations.dropboxSign.bot";
const NAVEGACION_MS = 60_000;

export interface SesionDropboxSign {
  /** Cerrar a secas. Al terminar, mejor `liberarSesionDropboxSign` (deja el navegador tibio si quedó sano). */
  browser: { close(): Promise<unknown> };
  ctx: BrowserContext;
  page: Page;
  seLogueo: boolean;
  pantalla: PantallaDropboxSign;
}

export async function configDelBot(tenantId: string): Promise<{ loginEmail: string; loginPassword: string; sesion: any | null }> {
  const t: any = await Tenant.findById(tenantId).select("integrations.dropboxSign.bot").lean();
  const bot = t?.integrations?.dropboxSign?.bot || {};
  let sesion: any = null;
  if (bot.sesionEnc) {
    try {
      sesion = JSON.parse(decryptSecret(bot.sesionEnc) || "null");
    } catch {
      sesion = null;
    }
  }
  return { loginEmail: bot.loginEmail || "", loginPassword: bot.loginPasswordEnc ? decryptSecret(bot.loginPasswordEnc) : "", sesion };
}

export async function guardarSesion(tenantId: string, ctx: BrowserContext): Promise<void> {
  const estado = await ctx.storageState();
  await Tenant.findByIdAndUpdate(tenantId, { $set: { [`${BASE}.sesionEnc`]: encryptSecret(JSON.stringify(estado)), [`${BASE}.sesionGuardadaAt`]: new Date() } });
}

export const anotarError = (tenantId: string, mensaje: string | null) => Tenant.findByIdAndUpdate(tenantId, { $set: { [`${BASE}.ultimoError`]: mensaje } }).catch(() => {});

/**
 * EL ESTADO DE LA CONEXIÓN CON DROPBOX SIGN (pedido del 23/10/2026: «parece caída y no se ve»). Cada
 * vez que el bot abre el navegador —en una corrida o con «Probar conexión»— queda registrado si llegó
 * al listado de documentos y cómo (sesión guardada o usuario y contraseña), o por qué no. Es lo que la
 * tarjeta y el tab muestran como «Conectada» / «Caída».
 */
export interface ConexionDropboxSign {
  estado: "ok" | "caida";
  probadaAt: Date;
  /** Cómo entró (o intentó entrar). */
  via: "sesion" | "login" | "";
  /** En qué pantalla quedó. */
  pantalla: PantallaDropboxSign | "";
  detalle: string;
  /** Lo que vio el navegador cuando falló (JPEG en base64), para verlo desde la web. */
  captura?: string | null;
}

export const anotarConexion = (tenantId: string, conexion: Omit<ConexionDropboxSign, "probadaAt">) =>
  Tenant.findByIdAndUpdate(tenantId, { $set: { [`${BASE}.conexion`]: { ...conexion, probadaAt: new Date() } } }).catch(() => {});

export async function textoDe(page: Page): Promise<string> {
  return page.evaluate(() => document.body?.innerText || "").catch(() => "");
}

export async function pantallaDe(page: Page): Promise<PantallaDropboxSign> {
  return clasificarPantalla(page.url(), await textoDe(page));
}

export async function irA(page: Page, url: string): Promise<void> {
  for (let intento = 1; ; intento++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVEGACION_MS });
      return;
    } catch (e: any) {
      if (intento >= 3 || !/interrupted by another navigation|Timeout/i.test(String(e?.message || e))) throw e;
    }
  }
}

/**
 * UN ERROR DE LOGIN CON NOMBRE (26/10/2026): `login_requiere_2fa`, `login_requiere_captcha`, `login_clave_incorrecta`,
 * `login_requiere_autorizacion`, `login_sin_credenciales`, `login_sin_avance`. Antes todo terminaba en un timeout de
 * Playwright o en «pantalla: login», que no decía qué pasó ni qué hacer.
 */
export class ErrorLogin extends Error {
  codigo: string;
  constructor(codigo: string, mensaje: string) {
    super(`${codigo}: ${mensaje}`);
    this.codigo = codigo;
  }
}

/**
 * UN SOLO NAVEGADOR «IDENTIDAD»: mismo viewport, idioma y zona horaria en cada uso. El user-agent ya
 * no es fijo a mano (era de Mac y Chrome/139 sobre un Linux con otra versión, 27/10/2026): lo arma
 * `perfil.ts` con el SO y la versión reales, igual en todos los usos.
 */
export const OPCIONES_CONTEXTO = {
  viewport: { ...VIEWPORT },
  locale: "es-AR",
  timezoneId: "America/Argentina/Buenos_Aires",
} as const;

const MENSAJES_LOGIN: Record<string, string> = {
  login_requiere_verificacion: "Dropbox pidió una verificación que el bot no resuelve a propósito (código, captcha, «¿eras vos?» o confirmación por correo). Usá «Conectarse a Dropbox Sign»: la sesión queda guardada.",
  login_email_no_avanza: "Se escribió el email y se apretó «Continuar», pero la pantalla siguió en el paso del email (dos intentos, con el aviso de cookies cerrado).",
  login_password_no_avanza: "Se escribió la contraseña y se apretó «Continuar», pero la pantalla siguió pidiéndola sin decir que fuera incorrecta.",
  login_requiere_2fa: "Dropbox pidió un código de verificación (segundo factor). El bot no lo resuelve a propósito: conectate con «Conectarse» (login asistido) y la sesión queda guardada.",
  login_requiere_captcha: "Dropbox pidió un captcha. El bot no lo resuelve a propósito: conectate con «Conectarse» (login asistido).",
  login_clave_incorrecta: "Dropbox rechazó la contraseña. Corregila antes de volver a correr: varios intentos fallidos pueden bloquear la cuenta.",
  login_requiere_autorizacion: "Dropbox pide autorizar el acceso de Dropbox Sign a la cuenta. El bot no autoriza nada solo: hacelo una vez con «Conectarse».",
};

// Los campos se buscan SÓLO VISIBLES y por su testid primero. La página de Dropbox trae un
// `input[type=password]` oculto de autocompletado (#credential-autofill-hint, name="autofill-password") ANTES del
// real: con `.first()` sin filtro se lo elegía y `fill` esperaba para siempre (22/10/2026).
const SELECTORES_EMAIL = ['input[data-testid="email-field"]:visible', 'input[type="email"]:visible', 'input[name="login_email"]:visible', 'input[name="email"]:visible', 'input[name="susi_email"]:visible', 'input[autocomplete="username"]:visible'];
const SELECTORES_CLAVE = ['input[data-testid="password-field"]:visible', "input#password-field:visible", 'input[type="password"]:visible:not([name="autofill-password"]):not(#credential-autofill-hint)'];
const SELECTORES_CODIGO = ['input[autocomplete="one-time-code"]:visible', 'input[name*="code" i]:visible', 'input[data-testid*="code" i]:visible'];
const SELECTORES_CAPTCHA = ['iframe[src*="recaptcha"]:visible', 'iframe[src*="hcaptcha"]:visible', 'iframe[src*="arkose"]:visible', 'iframe[title*="captcha" i]:visible'];
/** Cuando funciona tarda ~15 s: con 45 el diagnóstico llega antes (eran 120, 27/10/2026). */
const LOGIN_MS = 45_000;
/** Cuánto se espera a que un paso del login cambie la pantalla. */
const PASO_MS = 12_000;
/** Cuánto se tolera «esperar» seguido sobre dropbox.com sin que cambie nada antes de cortar con lo que dice la pantalla. */
const ESPERA_MUDA_MS = 20_000;

/**
 * ¿VISIBLE DE VERDAD? (26/10/2026). El `:visible` de Playwright sólo mira que tenga tamaño y no esté
 * `visibility:hidden`: un campo de contraseña con OPACIDAD 0 que Dropbox deja en el paso del email
 * contaba como visible, el bot lo tomaba por el paso de contraseña, escribía ahí y decía «la
 * contraseña se mandó» con la pantalla todavía en el email (captura real del 26/10). Acá además:
 * opacidad > 0 en él y sus ancestros, al menos 20×10 px, dentro de la ventana, y que en su centro no
 * haya otra cosa encima (el aviso de cookies).
 */
async function realmenteVisible(loc: ReturnType<Page["locator"]>): Promise<boolean> {
  return loc
    .evaluate((el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 10 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const e = getComputedStyle(n);
        if (e.display === "none" || e.visibility === "hidden" || Number(e.opacity) === 0) return false;
        if (n.getAttribute("aria-hidden") === "true") return false;
      }
      const arriba = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!arriba && (arriba === el || el.contains(arriba) || arriba.contains(el) || (arriba as HTMLElement).closest?.("label") === el.closest("label"));
    })
    .catch(() => false);
}

/**
 * EL AVISO DE COOKIES (26/10/2026) tapa el formulario de login de Dropbox: el click en «Continuar» no
 * llegaba. Se cierra con «Rechazar» (lo que menos comparte) y, si no está, con su cruz. Idempotente:
 * se llama en cada vuelta del login porque reaparece después de la redirección OAuth. Devuelve si cerró algo.
 */
export async function cerrarBannerCookies(page: Page): Promise<boolean> {
  const candidatos = [
    page.locator('button:visible, [role="button"]:visible').filter({ hasText: /^\s*(rechazar|rechazar todo|rechazar todas|reject|reject all|decline|decline all)\s*$/i }),
    page.locator('[aria-label*="cerrar" i]:visible, [aria-label*="close" i]:visible').filter({ has: page.locator("xpath=ancestor-or-self::*[contains(translate(., 'COOKIES', 'cookies'), 'cookies')]") }),
  ];
  for (const c of candidatos) {
    const b = c.first();
    if (await b.count().catch(() => 0)) {
      await b.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      return true;
    }
  }
  return false;
}

async function primerVisible(page: Page, selectores: string[]) {
  for (const sel of selectores) {
    const todos = page.locator(sel);
    const n = Math.min(await todos.count().catch(() => 0), 5);
    for (let i = 0; i < n; i++) {
      const loc = todos.nth(i);
      if (await realmenteVisible(loc)) return loc;
    }
  }
  return null;
}

/** Espera hasta `ms` a que `cond()` se cumpla (mirando cada 700 ms). */
async function esperarQue(page: Page, ms: number, cond: () => Promise<boolean>, señal?: { cortada: boolean }): Promise<boolean> {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    if (señal?.cortada) return false;
    if (await cond()) return true;
    await page.waitForTimeout(700);
  }
  return cond();
}

/** Aprieta el botón del paso (por su texto) o, si no se encuentra, Enter sobre el campo. */
async function enviarPaso(page: Page, campo: ReturnType<Page["locator"]>, boton: RegExp): Promise<void> {
  const b = page.locator('button:visible, [role="button"]:visible, input[type="submit"]:visible').filter({ hasText: boton }).first();
  if (await b.count().catch(() => 0)) await b.click({ timeout: 10_000 });
  else await campo.press("Enter");
}

/** Espera hasta que la pantalla sea una conocida (listado, login o el freno), sin pausas fijas a ciegas. */
async function esperarPantalla(page: Page, ms: number): Promise<PantallaDropboxSign> {
  const hasta = Date.now() + ms;
  let p = await pantallaDe(page);
  while (Date.now() < hasta && !["manage", "login", "limite"].includes(p)) {
    await page.waitForTimeout(1000);
    p = await pantallaDe(page);
  }
  return p;
}

/** La URL sin query (el OAuth trae client_id y state): para el log alcanza con dónde estaba. */
const urlCorta = (u: string) => String(u || "").split(/[?#]/)[0];

/**
 * LOGIN CON USUARIO Y CONTRASEÑA, PASO A PASO (26/10/2026). Dropbox Sign redirige a
 * www.dropbox.com/oauth2/authorize: email → «Continuar» → contraseña → «Iniciar sesión» → de vuelta a
 * app.sign.dropbox.com. Cada vuelta mira la pantalla (`pasoDeLogin`) y hace lo que corresponde; no se
 * busca la contraseña antes de que exista. Segundo factor, captcha o autorizar la app cortan con su
 * código (un reintento ciego puede bloquear la cuenta).
 */
export async function loguear(page: Page, cred: { loginEmail: string; loginPassword: string }, señal: { cortada: boolean } = { cortada: false }): Promise<void> {
  if (!cred.loginEmail || !cred.loginPassword) throw new ErrorLogin("login_sin_credenciales", "No hay usuario y contraseña de Dropbox Sign cargados (Configuración → DropboxSign → Envío automático).");
  const hasta = Date.now() + LOGIN_MS;
  let emailCargado = false;
  let claveEnviada = false;
  let intentosEmail = 0;
  let intentosClave = 0;
  let clicksDropbox = 0;
  let volvioAlListado = false;
  let esperandoDesde: number | null = null;
  while (Date.now() < hasta) {
    // «Tomar el control» del login asistido: se corta en el acto, sin tocar nada más.
    if (señal.cortada) throw new ErrorLogin("login_cancelado", "Se tomó el control a mano: el login automático se detuvo.");
    // Primero el aviso de cookies: tapa el formulario y se come los clicks. Reaparece tras cada redirección.
    await cerrarBannerCookies(page);
    const email = await primerVisible(page, SELECTORES_EMAIL);
    const clave = await primerVisible(page, SELECTORES_CLAVE);
    const url = page.url();
    const texto = await textoDe(page);
    const paso = pasoDeLogin({
      url,
      texto,
      hayEmail: !!email,
      hayClave: !!clave,
      hayCodigo: !!(await primerVisible(page, SELECTORES_CODIGO)),
      hayCaptcha: !!(await primerVisible(page, SELECTORES_CAPTCHA)),
      emailCargado,
      claveEnviada,
    });
    if (paso === "listo") return;
    // EL «ESPERAR» MUDO (27/10/2026): sobre dropbox.com, sin campos ni nada reconocible, más de 20 s
    // seguidos → se corta diciendo qué muestra la pantalla, en vez de agotar el presupuesto.
    if (paso === "esperar" && /(^|\.)dropbox\.com\//i.test(url.replace(/^https?:\/\//, ""))) {
      esperandoDesde ??= Date.now();
      if (Date.now() - esperandoDesde > ESPERA_MUDA_MS) {
        const queDice = texto.replace(/\s+/g, " ").trim().slice(0, 300);
        throw new ErrorLogin("login_sin_avance", `La pantalla de Dropbox quedó ${Math.round(ESPERA_MUDA_MS / 1000)} s sin nada que el bot sepa completar${claveEnviada ? " (después de mandar la contraseña)" : ""}. ${queDice ? `Dice: «${queDice}».` : "No muestra texto (página en blanco)."}`);
      }
    } else esperandoDesde = null;
    // Lo que necesita una persona corta YA con su código, no con un timeout de 120 s.
    if (paso === "login_requiere_2fa" || paso === "login_requiere_captcha" || /¿?(eras|fuiste) (vos|t[uú])|was (this|it) you|revis[aá] tu (correo|email)|check your (email|inbox)|confirm(a|á) (tu|que)/i.test(texto)) {
      throw new ErrorLogin("login_requiere_verificacion", `${MENSAJES_LOGIN.login_requiere_verificacion} (${paso === "login_requiere_captcha" ? "captcha" : paso === "login_requiere_2fa" ? "código / segundo factor" : "confirmación"})`);
    }
    if (paso.startsWith("login_")) throw new ErrorLogin(paso, MENSAJES_LOGIN[paso] || "El login se frenó.");

    if (paso === "email" && email) {
      // PASO 1: email → «Continuar» → la pantalla TIENE que mostrar la contraseña (o cambiar). Un reintento.
      intentosEmail++;
      await email.fill(cred.loginEmail);
      emailCargado = true;
      await enviarPaso(page, email, /^\s*(continuar|continue|siguiente|next)\s*$/i);
      const avanzo = await esperarQue(page, PASO_MS, async () => !!(await primerVisible(page, SELECTORES_CLAVE)) || !(await primerVisible(page, SELECTORES_EMAIL)), señal);
      if (señal.cortada) continue;
      if (!avanzo) {
        if (intentosEmail >= 2) throw new ErrorLogin("login_email_no_avanza", MENSAJES_LOGIN.login_email_no_avanza);
        emailCargado = false; // se reintenta el paso entero
      }
      continue;
    }
    if (paso === "clave" && clave) {
      // PASO 2: sólo con el campo de contraseña VISIBLE DE VERDAD (lo garantiza `primerVisible`).
      intentosClave++;
      await clave.fill(cred.loginPassword);
      claveEnviada = true;
      await enviarPaso(page, clave, /^\s*(iniciar sesi[oó]n|sign in|log in|ingresar|continuar|continue)\s*$/i);
      const avanzo = await esperarQue(page, PASO_MS, async () => !(await primerVisible(page, SELECTORES_CLAVE)) || /contrase[ñn]a incorrecta|incorrect password|wrong password/i.test(await textoDe(page)), señal);
      if (señal.cortada) continue;
      if (!avanzo) {
        if (intentosClave >= 2) throw new ErrorLogin("login_password_no_avanza", MENSAJES_LOGIN.login_password_no_avanza);
        claveEnviada = false;
      }
      continue;
    }
    if (paso === "boton_dropbox") {
      if (++clicksDropbox > 2) throw new ErrorLogin("login_sin_avance", "«Iniciar sesión con Dropbox» no lleva al formulario de login.");
      await page.locator('button:visible, a:visible, [role="button"]:visible').filter({ hasText: /iniciar sesi[oó]n con dropbox|sign in with dropbox|continuar con dropbox|continue with dropbox/i }).first().click({ timeout: 10_000 });
    } else if (claveEnviada && !volvioAlListado && /app\.sign\.dropbox\.com/i.test(url) && !/\/home\/manage/i.test(url) && (await pantallaDe(page)) !== "login") {
      // Volvió a Dropbox Sign logueado pero a otra página (inicio, bienvenida): al listado.
      volvioAlListado = true;
      await irA(page, MANAGE_URL).catch(() => {});
    }
    await page.waitForTimeout(1500);
  }
  // El mensaje dice SÓLO lo que de verdad pasó: «la contraseña se mandó» únicamente si su campo estuvo visible.
  // Y QUÉ DICE la pantalla donde quedó (27/10/2026: quedó en oauth2/authorize sin campos y sin saber qué pedía).
  const queDice = (await textoDe(page).catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 300);
  throw new ErrorLogin(
    "login_sin_avance",
    `En ${LOGIN_MS / 1000} s el login no llegó al listado de documentos${claveEnviada ? " (la contraseña se escribió en su campo visible y se mandó)" : emailCargado ? " (se cargó el email; el campo de contraseña nunca apareció)" : " (no apareció el campo de email)"}.${queDice ? ` La pantalla dice: «${queDice}».` : ""}`,
  );
}

/**
 * Abre el navegador con la sesión lista en /home/manage. Con `sinLogin` (login manual del operador)
 * devuelve la sesión en la pantalla que esté, sin intentar loguearse. Quien llama cierra el browser.
 */
export async function abrirSesionDropboxSign(tenantId: string, opciones: { visible?: boolean; sinLogin?: boolean } = {}): Promise<SesionDropboxSign> {
  const cfg = await configDelBot(tenantId);
  let abierto;
  try {
    abierto = await abrirContextoDropboxSign(tenantId, { headless: !opciones.visible, sesionRespaldo: cfg.sesion });
  } catch (e: any) {
    const err = errorDeChromium(e);
    await anotarError(tenantId, err.message);
    await anotarConexion(tenantId, { estado: "caida", via: "", pantalla: "", detalle: err.message });
    throw err;
  }
  const { ctx, page } = abierto;
  const browser = abierto.browser;

  // PRIMERO LA SESIÓN GUARDADA (26/10/2026): directo al listado. Se espera a que la pantalla se defina
  // (listado o login) en vez de 2,5 s fijos: con la página lenta caía en «desconocida» y se logueaba de más.
  await irA(page, MANAGE_URL).catch(() => {});
  let pantalla = await esperarPantalla(page, 25_000);
  if (pantalla === "manage") {
    void guardarSesion(tenantId, ctx).catch(() => {});
    await anotarConexion(tenantId, { estado: "ok", via: "sesion", pantalla, detalle: abierto.tibia ? "Entró con el navegador que había quedado abierto (sesión tibia)." : "Entró con la sesión del perfil guardado." });
    return { browser, ctx, page, seLogueo: false, pantalla };
  }
  if (opciones.sinLogin) return { browser, ctx, page, seLogueo: false, pantalla };

  try {
    await loguear(page, cfg);
    pantalla = await esperarPantalla(page, 15_000);
    if (pantalla !== "manage") {
      await irA(page, MANAGE_URL);
      pantalla = await esperarPantalla(page, 25_000);
    }
    if (pantalla !== "manage") throw new ErrorLogin("login_sin_avance", `Después del login no se llegó al listado de documentos (pantalla: ${pantalla}).`);
    await guardarSesion(tenantId, ctx);
    await Tenant.findByIdAndUpdate(tenantId, { $set: { [`${BASE}.ultimoLoginAt`]: new Date(), [`${BASE}.ultimoError`]: null } });
    await anotarConexion(tenantId, { estado: "ok", via: "login", pantalla, detalle: cfg.sesion ? "La sesión guardada había vencido: entró con usuario y contraseña y la renovó." : "Entró con usuario y contraseña y guardó la sesión." });
    return { browser, ctx, page, seLogueo: true, pantalla };
  } catch (e: any) {
    // Lo que se vio cuando falló: captura, URL y pantalla, para el log de la corrida y la tarjeta de conexión.
    const codigo = e instanceof ErrorLogin ? e.codigo : "login_fallo";
    const pantallaFin = await pantallaDe(page).catch(() => "" as const);
    const url = urlCorta(page.url());
    const base = e?.message || String(e);
    const detalle = `${e instanceof ErrorLogin ? base : `login_fallo: ${base}`} (pantalla: ${pantallaFin || "?"} · ${url || "sin URL"})`;
    await anotarError(tenantId, detalle);
    const captura = await page.screenshot({ type: "jpeg", quality: 50 }).then((b) => b.toString("base64")).catch(() => null);
    await anotarConexion(tenantId, { estado: "caida", via: "login", pantalla: pantallaFin, detalle: `${cfg.sesion ? "La sesión guardada no sirvió y el login tampoco: " : "Sin sesión guardada, el login falló: "}${detalle}`, captura });
    await browser.close().catch(() => {});
    throw Object.assign(new Error(detalle), { codigo, captura, url, pantalla: pantallaFin });
  }
}

/**
 * «PROBAR CONEXIÓN»: abre el navegador, intenta llegar al listado de documentos (sesión guardada o
 * usuario y contraseña) y lo cierra. No toca ningún documento. Deja registrado el resultado como una
 * corrida más. Pide el candado: no corre mientras hay una tanda en curso.
 */
export async function probarConexionDropboxSign(tenantId: string): Promise<ConexionDropboxSign> {
  tomarCandadoDropboxSign(tenantId, false, "prueba");
  try {
    const sesion = await abrirSesionDropboxSign(tenantId);
    await guardarSesion(tenantId, sesion.ctx).catch(() => {});
    // Queda tibia: la corrida o la prueba siguiente no vuelven a entrar.
    await liberarSesionDropboxSign(tenantId, sesion, true);
  } catch {
    /* el motivo ya quedó anotado en `conexion` y en `ultimoError` */
  } finally {
    soltarCandadoDropboxSign(tenantId);
  }
  const t: any = await Tenant.findById(tenantId).select(`${BASE}.conexion`).lean();
  return t?.integrations?.dropboxSign?.bot?.conexion || { estado: "caida", probadaAt: new Date(), via: "", pantalla: "", detalle: "No se pudo registrar el resultado." };
}

/** Al terminar de usar la sesión: si quedó sana, el navegador queda tibio (`perfil.ts`); si no, se cierra. */
export async function liberarSesionDropboxSign(tenantId: string, sesion: { ctx: BrowserContext; page: Page; browser: { close(): Promise<unknown> } } | null | undefined, sana: boolean): Promise<void> {
  if (!sesion) return;
  await liberarContexto(tenantId, { ...sesion, perfilNuevo: false, tibia: false }, sana && !sesion.page.isClosed());
}
