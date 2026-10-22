import { chromium } from "playwright-core";
import { Tenant } from "../../models/Tenant.js";
import { decryptSecret, encryptSecret } from "../../utils/secretCrypto.js";
import { rutaChromium, errorDeChromium } from "../arca/navegador.js";
import { clasificarPantalla } from "./clasificarPantalla.js";
import { VIEWPORT } from "./reglas.js";
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
async function configDelBot(tenantId) {
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
export async function textoDe(page) {
    return page.evaluate(() => document.body?.innerText || "").catch(() => "");
}
export async function pantallaDe(page) {
    return clasificarPantalla(page.url(), await textoDe(page));
}
async function irA(page, url) {
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
    const email = page.locator('input[name="login_email"], input[type="email"], input[name="email"]').first();
    await email.waitFor({ state: "visible", timeout: 20_000 });
    await email.fill(cred.loginEmail);
    const continuar = page.getByRole("button", { name: /continuar|siguiente|continue|next|iniciar sesi[oó]n|sign in/i }).first();
    await continuar.click();
    const clave = page.locator('input[name="login_password"], input[type="password"]').first();
    await clave.waitFor({ state: "visible", timeout: 20_000 });
    await clave.fill(cred.loginPassword);
    await page.getByRole("button", { name: /iniciar sesi[oó]n|sign in|log in|ingresar|continuar/i }).first().click();
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
        throw err;
    }
    const ctx = await browser.newContext({ ...(cfg.sesion ? { storageState: cfg.sesion } : {}), viewport: { ...VIEWPORT }, locale: "es-AR" });
    const page = await ctx.newPage();
    await irA(page, MANAGE_URL).catch(() => { });
    await page.waitForTimeout(2500);
    let pantalla = await pantallaDe(page);
    if (pantalla === "manage") {
        void guardarSesion(tenantId, ctx).catch(() => { });
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
        return { browser, ctx, page, seLogueo: true, pantalla };
    }
    catch (e) {
        await anotarError(tenantId, e?.message || String(e));
        await browser.close().catch(() => { });
        throw e;
    }
}
