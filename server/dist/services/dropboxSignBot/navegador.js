import { chromium } from "playwright-core";
import { Tenant } from "../../models/Tenant.js";
import { decryptSecret, encryptSecret } from "../../utils/secretCrypto.js";
import { rutaChromium, errorDeChromium } from "../arca/navegador.js";
import { clasificarPantalla, pasoDeLogin } from "./clasificarPantalla.js";
import { VIEWPORT } from "./reglas.js";
import { soltarCandadoDropboxSign, tomarCandadoDropboxSign } from "./candado.js";
/**
 * UN CHROMIUM EN EL SERVIDOR CON LA SESIÓN DE DROPBOX SIGN (patrón `arca/navegador.ts`).
 *
 * El plan Essentials de Dropbox Sign no incluye la API, así que el bot opera la web como una persona.
 * La sesión (`storageState`) se guarda cifrada y se renueva en cada corrida; el login con usuario y
 * contraseña es el respaldo cuando vence. Ante captcha o segundo factor NO se insiste: se corta con
 * `bot.ultimoError` y la UI pide repetir el login manual (`scripts/loginDropboxSign.ts`).
 *
 * El viewport es FIJO (1457×812): las coordenadas de colocación de la firma se validaron con ése.
 */
export const MANAGE_URL = "https://app.sign.dropbox.com/home/manage";
const BASE = "integrations.dropboxSign.bot";
const NAVEGACION_MS = 60_000;
export async function configDelBot(tenantId) {
    const t = await Tenant.findById(tenantId).select("integrations.dropboxSign.bot").lean();
    const bot = t?.integrations?.dropboxSign?.bot || {};
    let sesion = null;
    if (bot.sesionEnc) {
        try {
            sesion = JSON.parse(decryptSecret(bot.sesionEnc) || "null");
        }
        catch {
            sesion = null;
        }
    }
    return { loginEmail: bot.loginEmail || "", loginPassword: bot.loginPasswordEnc ? decryptSecret(bot.loginPasswordEnc) : "", sesion };
}
export async function guardarSesion(tenantId, ctx) {
    const estado = await ctx.storageState();
    await Tenant.findByIdAndUpdate(tenantId, { $set: { [`${BASE}.sesionEnc`]: encryptSecret(JSON.stringify(estado)), [`${BASE}.sesionGuardadaAt`]: new Date() } });
}
export const anotarError = (tenantId, mensaje) => Tenant.findByIdAndUpdate(tenantId, { $set: { [`${BASE}.ultimoError`]: mensaje } }).catch(() => { });
export const anotarConexion = (tenantId, conexion) => Tenant.findByIdAndUpdate(tenantId, { $set: { [`${BASE}.conexion`]: { ...conexion, probadaAt: new Date() } } }).catch(() => { });
export async function textoDe(page) {
    return page.evaluate(() => document.body?.innerText || "").catch(() => "");
}
export async function pantallaDe(page) {
    return clasificarPantalla(page.url(), await textoDe(page));
}
export async function irA(page, url) {
    for (let intento = 1;; intento++) {
        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVEGACION_MS });
            return;
        }
        catch (e) {
            if (intento >= 3 || !/interrupted by another navigation|Timeout/i.test(String(e?.message || e)))
                throw e;
        }
    }
}
/**
 * UN ERROR DE LOGIN CON NOMBRE (26/10/2026): `login_requiere_2fa`, `login_requiere_captcha`, `login_clave_incorrecta`,
 * `login_requiere_autorizacion`, `login_sin_credenciales`, `login_sin_avance`. Antes todo terminaba en un timeout de
 * Playwright o en «pantalla: login», que no decía qué pasó ni qué hacer.
 */
export class ErrorLogin extends Error {
    codigo;
    constructor(codigo, mensaje) {
        super(`${codigo}: ${mensaje}`);
        this.codigo = codigo;
    }
}
const MENSAJES_LOGIN = {
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
const LOGIN_MS = 120_000;
async function primerVisible(page, selectores) {
    for (const sel of selectores) {
        const loc = page.locator(sel).first();
        if (await loc.count().catch(() => 0))
            return loc;
    }
    return null;
}
/** Aprieta el botón del paso (por su texto) o, si no se encuentra, Enter sobre el campo. */
async function enviarPaso(page, campo, boton) {
    const b = page.locator('button:visible, [role="button"]:visible, input[type="submit"]:visible').filter({ hasText: boton }).first();
    if (await b.count().catch(() => 0))
        await b.click({ timeout: 10_000 });
    else
        await campo.press("Enter");
}
/** Espera hasta que la pantalla sea una conocida (listado, login o el freno), sin pausas fijas a ciegas. */
async function esperarPantalla(page, ms) {
    const hasta = Date.now() + ms;
    let p = await pantallaDe(page);
    while (Date.now() < hasta && !["manage", "login", "limite"].includes(p)) {
        await page.waitForTimeout(1000);
        p = await pantallaDe(page);
    }
    return p;
}
/** La URL sin query (el OAuth trae client_id y state): para el log alcanza con dónde estaba. */
const urlCorta = (u) => String(u || "").split(/[?#]/)[0];
/**
 * LOGIN CON USUARIO Y CONTRASEÑA, PASO A PASO (26/10/2026). Dropbox Sign redirige a
 * www.dropbox.com/oauth2/authorize: email → «Continuar» → contraseña → «Iniciar sesión» → de vuelta a
 * app.sign.dropbox.com. Cada vuelta mira la pantalla (`pasoDeLogin`) y hace lo que corresponde; no se
 * busca la contraseña antes de que exista. Segundo factor, captcha o autorizar la app cortan con su
 * código (un reintento ciego puede bloquear la cuenta).
 */
export async function loguear(page, cred) {
    if (!cred.loginEmail || !cred.loginPassword)
        throw new ErrorLogin("login_sin_credenciales", "No hay usuario y contraseña de Dropbox Sign cargados (Configuración → DropboxSign → Envío automático).");
    const hasta = Date.now() + LOGIN_MS;
    let emailCargado = false;
    let claveEnviada = false;
    let clicksDropbox = 0;
    let volvioAlListado = false;
    while (Date.now() < hasta) {
        const email = await primerVisible(page, SELECTORES_EMAIL);
        const clave = await primerVisible(page, SELECTORES_CLAVE);
        const url = page.url();
        const paso = pasoDeLogin({
            url,
            texto: await textoDe(page),
            hayEmail: !!email,
            hayClave: !!clave,
            hayCodigo: !!(await primerVisible(page, SELECTORES_CODIGO)),
            hayCaptcha: !!(await primerVisible(page, SELECTORES_CAPTCHA)),
            emailCargado,
            claveEnviada,
        });
        if (paso === "listo")
            return;
        if (paso.startsWith("login_"))
            throw new ErrorLogin(paso, MENSAJES_LOGIN[paso] || "El login se frenó.");
        if (paso === "email" && email) {
            await email.fill(cred.loginEmail);
            emailCargado = true;
            await enviarPaso(page, email, /continuar|continue|siguiente|next/i);
        }
        else if (paso === "clave" && clave) {
            await clave.fill(cred.loginPassword);
            claveEnviada = true;
            await enviarPaso(page, clave, /iniciar sesi[oó]n|sign in|log in|ingresar|continuar|continue/i);
        }
        else if (paso === "boton_dropbox") {
            if (++clicksDropbox > 2)
                throw new ErrorLogin("login_sin_avance", "«Iniciar sesión con Dropbox» no lleva al formulario de login.");
            await page.locator('button:visible, a:visible, [role="button"]:visible').filter({ hasText: /iniciar sesi[oó]n con dropbox|sign in with dropbox|continuar con dropbox|continue with dropbox/i }).first().click({ timeout: 10_000 });
        }
        else if (claveEnviada && !volvioAlListado && /app\.sign\.dropbox\.com/i.test(url) && !/\/home\/manage/i.test(url) && (await pantallaDe(page)) !== "login") {
            // Volvió a Dropbox Sign logueado pero a otra página (inicio, bienvenida): al listado.
            volvioAlListado = true;
            await irA(page, MANAGE_URL).catch(() => { });
        }
        await page.waitForTimeout(1500);
    }
    throw new ErrorLogin("login_sin_avance", `En ${LOGIN_MS / 1000} s el login no llegó al listado de documentos${claveEnviada ? " (la contraseña se mandó)" : emailCargado ? " (se cargó el email; la contraseña nunca apareció)" : " (no apareció el campo de email)"}.`);
}
/**
 * Abre el navegador con la sesión lista en /home/manage. Con `sinLogin` (login manual del operador)
 * devuelve la sesión en la pantalla que esté, sin intentar loguearse. Quien llama cierra el browser.
 */
export async function abrirSesionDropboxSign(tenantId, opciones = {}) {
    const cfg = await configDelBot(tenantId);
    let browser;
    try {
        browser = await chromium.launch({ headless: !opciones.visible, executablePath: rutaChromium() });
    }
    catch (e) {
        const err = errorDeChromium(e);
        await anotarError(tenantId, err.message);
        await anotarConexion(tenantId, { estado: "caida", via: "", pantalla: "", detalle: err.message });
        throw err;
    }
    const ctx = await browser.newContext({ ...(cfg.sesion ? { storageState: cfg.sesion } : {}), viewport: { ...VIEWPORT }, locale: "es-AR" });
    const page = await ctx.newPage();
    // PRIMERO LA SESIÓN GUARDADA (26/10/2026): directo al listado. Se espera a que la pantalla se defina
    // (listado o login) en vez de 2,5 s fijos: con la página lenta caía en «desconocida» y se logueaba de más.
    await irA(page, MANAGE_URL).catch(() => { });
    let pantalla = await esperarPantalla(page, 25_000);
    if (pantalla === "manage") {
        void guardarSesion(tenantId, ctx).catch(() => { });
        await anotarConexion(tenantId, { estado: "ok", via: "sesion", pantalla, detalle: cfg.sesion ? "Entró con la sesión guardada." : "Entró sin sesión guardada (ya estaba logueado)." });
        return { browser, ctx, page, seLogueo: false, pantalla };
    }
    if (opciones.sinLogin)
        return { browser, ctx, page, seLogueo: false, pantalla };
    try {
        await loguear(page, cfg);
        pantalla = await esperarPantalla(page, 15_000);
        if (pantalla !== "manage") {
            await irA(page, MANAGE_URL);
            pantalla = await esperarPantalla(page, 25_000);
        }
        if (pantalla !== "manage")
            throw new ErrorLogin("login_sin_avance", `Después del login no se llegó al listado de documentos (pantalla: ${pantalla}).`);
        await guardarSesion(tenantId, ctx);
        await Tenant.findByIdAndUpdate(tenantId, { $set: { [`${BASE}.ultimoLoginAt`]: new Date(), [`${BASE}.ultimoError`]: null } });
        await anotarConexion(tenantId, { estado: "ok", via: "login", pantalla, detalle: cfg.sesion ? "La sesión guardada había vencido: entró con usuario y contraseña y la renovó." : "Entró con usuario y contraseña y guardó la sesión." });
        return { browser, ctx, page, seLogueo: true, pantalla };
    }
    catch (e) {
        // Lo que se vio cuando falló: captura, URL y pantalla, para el log de la corrida y la tarjeta de conexión.
        const codigo = e instanceof ErrorLogin ? e.codigo : "login_fallo";
        const pantallaFin = await pantallaDe(page).catch(() => "");
        const url = urlCorta(page.url());
        const base = e?.message || String(e);
        const detalle = `${e instanceof ErrorLogin ? base : `login_fallo: ${base}`} (pantalla: ${pantallaFin || "?"} · ${url || "sin URL"})`;
        await anotarError(tenantId, detalle);
        const captura = await page.screenshot({ type: "jpeg", quality: 50 }).then((b) => b.toString("base64")).catch(() => null);
        await anotarConexion(tenantId, { estado: "caida", via: "login", pantalla: pantallaFin, detalle: `${cfg.sesion ? "La sesión guardada no sirvió y el login tampoco: " : "Sin sesión guardada, el login falló: "}${detalle}`, captura });
        await browser.close().catch(() => { });
        throw Object.assign(new Error(detalle), { codigo, captura, url, pantalla: pantallaFin });
    }
}
/**
 * «PROBAR CONEXIÓN»: abre el navegador, intenta llegar al listado de documentos (sesión guardada o
 * usuario y contraseña) y lo cierra. No toca ningún documento. Deja registrado el resultado como una
 * corrida más. Pide el candado: no corre mientras hay una tanda en curso.
 */
export async function probarConexionDropboxSign(tenantId) {
    tomarCandadoDropboxSign(tenantId, false);
    try {
        const sesion = await abrirSesionDropboxSign(tenantId);
        await guardarSesion(tenantId, sesion.ctx).catch(() => { });
        await sesion.browser.close().catch(() => { });
    }
    catch {
        /* el motivo ya quedó anotado en `conexion` y en `ultimoError` */
    }
    finally {
        soltarCandadoDropboxSign(tenantId);
    }
    const t = await Tenant.findById(tenantId).select(`${BASE}.conexion`).lean();
    return t?.integrations?.dropboxSign?.bot?.conexion || { estado: "caida", probadaAt: new Date(), via: "", pantalla: "", detalle: "No se pudo registrar el resultado." };
}
