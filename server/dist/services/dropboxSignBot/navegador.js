import { chromium } from "playwright-core";
import { Tenant } from "../../models/Tenant.js";
import { decryptSecret, encryptSecret } from "../../utils/secretCrypto.js";
import { rutaChromium, errorDeChromium } from "../arca/navegador.js";
import { clasificarPantalla } from "./clasificarPantalla.js";
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
 * Login con usuario y contraseña. El flujo de Dropbox Sign puede pasar por www.dropbox.com/login:
 * email → Continuar → contraseña → Iniciar sesión. Si aparece captcha, código o segundo factor, se
 * aborta sin reintentar (un reintento ciego puede bloquear la cuenta).
 */
async function loguear(page, cred) {
    if (!cred.loginEmail || !cred.loginPassword)
        throw new Error("No hay usuario y contraseña de Dropbox Sign cargados (Configuración → DropboxSign → Envío automático).");
    await irA(page, MANAGE_URL);
    // Sólo los campos VISIBLES: la página de login de Dropbox trae un `input[type=password]` oculto
    // («autofill-password», señuelo para el autocompletado) que con `.first()` se tomaba y se esperaba ver
    // para siempre (caso real del 22/10/2026: «locator resolved to hidden <input name="autofill-password">»).
    const email = page.locator('input[name="login_email"], input[type="email"], input[name="email"]').filter({ visible: true }).first();
    await email.waitFor({ state: "visible", timeout: 20_000 });
    await email.fill(cred.loginEmail);
    const continuar = page.getByRole("button", { name: /continuar|siguiente|continue|next|iniciar sesi[oó]n|sign in/i }).filter({ visible: true }).first();
    await continuar.click();
    const clave = page.locator('input[name="login_password"], input[type="password"]:not([name="autofill-password"])').filter({ visible: true }).first();
    await clave.waitFor({ state: "visible", timeout: 20_000 });
    await clave.fill(cred.loginPassword);
    await page.getByRole("button", { name: /iniciar sesi[oó]n|sign in|log in|ingresar|continuar/i }).filter({ visible: true }).first().click();
    await page.waitForLoadState("domcontentloaded").catch(() => { });
    await page.waitForTimeout(4000);
    const texto = await textoDe(page);
    if (/c[oó]digo|captcha|verificaci[oó]n|segundo factor|two-step|2fa/i.test(texto) && !/firmar documentos/i.test(texto)) {
        throw new Error("Dropbox Sign pidió un captcha, un código o un segundo factor. El bot no los resuelve a propósito: repetí el login manual (npm run dropbox-sign:login).");
    }
    if (/contrase[ñn]a incorrecta|incorrect password|invalid|no coinciden|datos incorrectos/i.test(texto)) {
        throw new Error("Dropbox Sign rechazó la contraseña. Corregila antes de volver a correr: varios intentos fallidos pueden bloquear la cuenta.");
    }
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
    await irA(page, MANAGE_URL).catch(() => { });
    await page.waitForTimeout(2500);
    let pantalla = await pantallaDe(page);
    if (pantalla === "manage") {
        void guardarSesion(tenantId, ctx).catch(() => { });
        await anotarConexion(tenantId, { estado: "ok", via: "sesion", pantalla, detalle: cfg.sesion ? "Entró con la sesión guardada." : "Entró sin sesión guardada (ya estaba logueado)." });
        return { browser, ctx, page, seLogueo: false, pantalla };
    }
    if (opciones.sinLogin)
        return { browser, ctx, page, seLogueo: false, pantalla };
    try {
        await loguear(page, cfg);
        await irA(page, MANAGE_URL);
        await page.waitForTimeout(2500);
        pantalla = await pantallaDe(page);
        if (pantalla !== "manage")
            throw new Error(`Después del login no se llegó al listado de documentos (pantalla: ${pantalla}).`);
        await guardarSesion(tenantId, ctx);
        await Tenant.findByIdAndUpdate(tenantId, { $set: { [`${BASE}.ultimoLoginAt`]: new Date(), [`${BASE}.ultimoError`]: null } });
        await anotarConexion(tenantId, { estado: "ok", via: "login", pantalla, detalle: cfg.sesion ? "La sesión guardada había vencido: entró con usuario y contraseña y la renovó." : "Entró con usuario y contraseña y guardó la sesión." });
        return { browser, ctx, page, seLogueo: true, pantalla };
    }
    catch (e) {
        const detalle = e?.message || String(e);
        await anotarError(tenantId, detalle);
        const captura = await page.screenshot({ type: "jpeg", quality: 50 }).then((b) => b.toString("base64")).catch(() => null);
        await anotarConexion(tenantId, { estado: "caida", via: "login", pantalla: await pantallaDe(page).catch(() => ""), detalle: `${cfg.sesion ? "La sesión guardada no sirvió y el login tampoco: " : "Sin sesión guardada, el login falló: "}${detalle}`, captura });
        await browser.close().catch(() => { });
        throw e;
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
