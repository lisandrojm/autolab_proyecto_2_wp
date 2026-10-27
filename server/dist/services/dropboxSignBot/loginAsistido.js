import { Tenant } from "../../models/Tenant.js";
import { errorDeChromium } from "../arca/navegador.js";
import { VIEWPORT } from "./reglas.js";
import { MANAGE_URL, anotarConexion, anotarError, configDelBot, guardarSesion, irA, loguear, pantallaDe } from "./navegador.js";
import { abrirContextoDropboxSign, liberarContexto } from "./perfil.js";
import { quienTieneDropboxSign, soltarCandadoDropboxSign, tomarCandadoDropboxSign } from "./candado.js";
/**
 * EL LOGIN ASISTIDO DESDE LA WEB (pedido del 23/10/2026: «un botón conectarse, nada en consola»).
 *
 * El navegador del servidor no tiene pantalla, y Dropbox Sign a veces pide captcha o un código que el
 * bot no resuelve a propósito. Entonces se le presta la pantalla al usuario: el server abre un Chromium
 * headless en el login, la web muestra capturas (JPEG cada ~0,8 s) y reenvía clicks, texto y teclas.
 * En cuanto el navegador llega al listado de documentos, la sesión se guarda cifrada (la misma que usa
 * el bot) y el navegador se cierra solo. Nada de lo tipeado se guarda ni se loguea.
 *
 * Mientras está abierto tiene el CANDADO del bot: no arranca ninguna tanda. Se cierra solo a los 10
 * minutos sin actividad.
 *
 * LA PANTALLA PRIMERO (27/10/2026). Usa el MISMO perfil en disco que las corridas (`perfil.ts`): lo que
 * se resuelve acá a mano queda para el bot. Y no pelea con la persona: el intento automático con el
 * usuario guardado NO corre si hace poco Dropbox pidió verificación o el login no avanzó (insistir
 * empeora el freno); en ese caso es un botón. Cuando corre, «Tomar el control» lo corta en el acto.
 */
const BASE = "integrations.dropboxSign.bot";
const INACTIVIDAD_MS = 10 * 60_000;
const TECLAS_PERMITIDAS = new Set(["Enter", "Tab", "Backspace", "Escape", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Space", "Delete", "Home", "End"]);
/** Cuánto tiempo después de un freno de Dropbox (verificación, login sin avance) no se intenta el login automático solo. */
const SIN_AUTOMATICO_TRAS_FRENO_MS = 6 * 3600_000;
const FRENO = /login_requiere|login_sin_avance|login_password_no_avanza|login_email_no_avanza|captcha|2fa|verificaci[oó]n/i;
const abiertos = new Map();
/**
 * Las aperturas EN CURSO (27/10/2026): dos «abrir» casi juntos —React StrictMode monta el modal dos
 * veces en desarrollo, o un doble click— comparten la misma apertura. Antes el segundo chocaba con el
 * candado del primero («ocupado con el login asistido») y el navegador del primero quedaba huérfano,
 * con el candado tomado, hasta el cierre por inactividad.
 */
const abriendo = new Map();
const estadoDe = (a, extra = {}) => ({
    estado: a?.estado || "cerrado",
    pantalla: "",
    url: a?.page?.url?.() || "",
    detalle: a?.detalle || "",
    viewport: { ...VIEWPORT },
    abiertoEl: a?.abiertoEl ? a.abiertoEl.toISOString() : null,
    automatico: !!a?.automatico,
    puedeAutomatico: !!a?.hayCredenciales && !a?.automatico && a?.estado === "abierto",
    ...extra,
});
function reprogramarCierre(a) {
    if (a.timer)
        clearTimeout(a.timer);
    a.timer = setTimeout(() => void cerrarLoginAsistido(a.tenantId, "Se cerró por inactividad (10 min).").catch(() => { }), INACTIVIDAD_MS);
}
/** Si el navegador ya está en el listado: guarda la sesión, anota la conexión y cierra. Devuelve true si conectó. */
async function conectarSiLlego(a, pantalla) {
    if (pantalla !== "manage" || a.estado !== "abierto")
        return a.estado === "conectado";
    a.estado = "conectado";
    a.detalle = "Sesión guardada: el bot ya puede entrar solo.";
    await guardarSesion(a.tenantId, a.ctx).catch(() => { });
    await Tenant.findByIdAndUpdate(a.tenantId, { $set: { [`${BASE}.ultimoLoginAt`]: new Date(), [`${BASE}.ultimoError`]: null } }).catch(() => { });
    await anotarConexion(a.tenantId, { estado: "ok", via: "login", pantalla, detalle: "Entró con el login asistido desde la web y guardó la sesión.", captura: null });
    // Se cierra después de devolver la última captura.
    setTimeout(() => void cerrarLoginAsistido(a.tenantId).catch(() => { }), 1500);
    return true;
}
/** El login automático con el usuario guardado, en segundo plano e interrumpible con «Tomar el control». */
function arrancarAutomatico(a, cfg) {
    if (a.automatico || a.estado !== "abierto")
        return;
    a.automatico = true;
    a.señal = { cortada: false };
    a.detalle = `Entrando solo con el usuario guardado (${cfg.loginEmail})… Si preferís hacerlo vos, «Tomar el control».`;
    const { page } = a;
    void (async () => {
        try {
            await loguear(page, cfg, a.señal);
            if (!/\/home\/manage/i.test(page.url()))
                await irA(page, MANAGE_URL).catch(() => { });
            await page.waitForTimeout(1500);
            const p = await pantallaDe(page).catch(() => "desconocida");
            if (!(await conectarSiLlego(a, p)) && a.estado === "abierto")
                a.detalle = "El login automático no llegó al listado de documentos: terminalo en la pantalla.";
        }
        catch (e) {
            if (a.estado === "abierto")
                a.detalle = a.señal.cortada ? "Tenés el control: hacé click en el campo, escribí y apretá Enter." : `${String(e?.message || e).replace(/^[a-z_]+:\s*/, "")} Terminalo en la pantalla: hacé click en el campo, escribí y apretá Enter.`;
        }
        finally {
            a.automatico = false;
            reprogramarCierre(a);
        }
    })();
}
/** Abre el navegador en el login (o reusa el que ya está abierto). Si entra directo con la sesión guardada, conecta y cierra. */
export async function abrirLoginAsistido(tenantId) {
    const enCurso = abriendo.get(tenantId);
    if (enCurso)
        return enCurso;
    // Un candado de login sin login vivo (ni abierto ni abriéndose) es un resto: se suelta.
    if (quienTieneDropboxSign(tenantId)?.motivo === "login" && !abiertos.has(tenantId))
        soltarCandadoDropboxSign(tenantId);
    const p = abrirLoginAsistidoDeVerdad(tenantId).finally(() => abriendo.delete(tenantId));
    abriendo.set(tenantId, p);
    return p;
}
async function abrirLoginAsistidoDeVerdad(tenantId) {
    const previo = abiertos.get(tenantId);
    if (previo && previo.estado === "abierto") {
        reprogramarCierre(previo);
        return estadoDe(previo, { pantalla: await pantallaDe(previo.page).catch(() => "") });
    }
    // Recién conectado (se cierra en 1,5 s): no es «ocupado», es «listo».
    if (previo && previo.estado === "conectado")
        return estadoDe(previo);
    tomarCandadoDropboxSign(tenantId, false, "login");
    try {
        const cfg = await configDelBot(tenantId);
        let sesion;
        try {
            sesion = await abrirContextoDropboxSign(tenantId, { sesionRespaldo: cfg.sesion });
        }
        catch (e) {
            const err = errorDeChromium(e);
            await anotarError(tenantId, err.message);
            throw Object.assign(err, { status: 500 });
        }
        const { ctx, page } = sesion;
        const a = { tenantId, sesion, ctx, page, abiertoEl: new Date(), estado: "abierto", detalle: "Iniciá sesión en la pantalla. Si aparece un captcha o un código, resolvelo acá mismo.", timer: null, automatico: false, señal: { cortada: false }, hayCredenciales: !!(cfg.loginEmail && cfg.loginPassword), ultimaRespuesta: null };
        page.on("response", (r) => {
            if (r.request().isNavigationRequest() && r.frame() === page.mainFrame())
                a.ultimaRespuesta = { status: r.status(), url: r.url().split("?")[0] };
        });
        abiertos.set(tenantId, a);
        reprogramarCierre(a);
        await irA(page, MANAGE_URL).catch(() => { });
        await page.waitForTimeout(2000);
        const pantalla = await pantallaDe(page).catch(() => "desconocida");
        await conectarSiLlego(a, pantalla);
        if (a.estado === "abierto") {
            if (!a.hayCredenciales)
                a.detalle = "No hay usuario y contraseña guardados para entrar solo: iniciá sesión en la pantalla (o cargalos en «Envío automático» para la próxima).";
            else {
                const t = await Tenant.findById(tenantId).select("integrations.dropboxSign.bot.conexion").lean();
                const c = t?.integrations?.dropboxSign?.bot?.conexion;
                const frenoReciente = c?.estado === "caida" && c?.probadaAt && Date.now() - new Date(c.probadaAt).getTime() < SIN_AUTOMATICO_TRAS_FRENO_MS && FRENO.test(String(c.detalle || ""));
                if (frenoReciente)
                    a.detalle = "Hace poco Dropbox frenó el login automático (pidió verificación o no avanzó): para no insistir, la pantalla es tuya. Iniciá sesión acá, o probá «Entrar con el usuario guardado».";
                else
                    arrancarAutomatico(a, cfg);
            }
        }
        return estadoDe(a, { pantalla });
    }
    catch (e) {
        soltarCandadoDropboxSign(tenantId);
        abiertos.delete(tenantId);
        throw e;
    }
}
/** La captura actual más el estado. Si el navegador llegó al listado, conecta. */
export async function pantallaLoginAsistido(tenantId) {
    const a = abiertos.get(tenantId);
    if (!a)
        return estadoDe(undefined, { detalle: "No hay un login asistido abierto." });
    const pantalla = await pantallaDe(a.page).catch(() => "desconocida");
    await conectarSiLlego(a, pantalla);
    const jpeg = await a.page.screenshot({ type: "jpeg", quality: 80 }).then((b) => b.toString("base64")).catch(() => undefined);
    return estadoDe(a, { pantalla, jpeg, diagnostico: await diagnosticoSiVacia(a) });
}
/** Un click, texto o tecla del usuario, reenviados al navegador. Devuelve la captura resultante. */
/** Espera (hasta 5 s) a que el login automático termine de cortarse después de «Tomar el control». */
async function esperarCorte(a) {
    for (let i = 0; i < 25 && a.automatico; i++)
        await new Promise((r) => setTimeout(r, 200));
}
export async function accionLoginAsistido(tenantId, accion) {
    const a = abiertos.get(tenantId);
    if (!a || a.estado !== "abierto")
        return estadoDe(a, { detalle: a?.detalle || "No hay un login asistido abierto." });
    // «Tomar el control»: corta el login automático en el acto (lo mira en cada vuelta y en cada espera).
    if (accion.tipo === "tomar_control") {
        a.señal.cortada = true;
        a.detalle = "Tomaste el control: el login automático se detiene.";
        await esperarCorte(a);
        return pantallaLoginAsistido(tenantId);
    }
    if (accion.tipo === "automatico") {
        if (a.automatico)
            return pantallaLoginAsistido(tenantId);
        const cfg = await configDelBot(tenantId);
        if (!cfg.loginEmail || !cfg.loginPassword)
            throw Object.assign(new Error("No hay usuario y contraseña guardados."), { status: 400 });
        arrancarAutomatico(a, cfg);
        return pantallaLoginAsistido(tenantId);
    }
    // Mientras el bot entra solo, la pantalla no acepta nada: dos manos tipeando a la vez rompen el login.
    if (a.automatico)
        return pantallaLoginAsistido(tenantId);
    reprogramarCierre(a);
    const { page } = a;
    switch (accion.tipo) {
        case "click": {
            const x = Math.max(0, Math.min(VIEWPORT.width, Number(accion.x) || 0));
            const y = Math.max(0, Math.min(VIEWPORT.height, Number(accion.y) || 0));
            await page.mouse.click(x, y);
            break;
        }
        case "tipear": {
            const texto = String(accion.texto || "").slice(0, 500);
            if (texto)
                await page.keyboard.type(texto, { delay: 15 });
            break;
        }
        case "tecla": {
            const tecla = String(accion.tecla || "");
            if (!TECLAS_PERMITIDAS.has(tecla))
                throw Object.assign(new Error(`Tecla no permitida: ${tecla}`), { status: 400 });
            await page.keyboard.press(tecla === "Space" ? " " : tecla);
            break;
        }
        case "scroll":
            await page.mouse.wheel(0, Math.max(-2000, Math.min(2000, Number(accion.dy) || 0)));
            break;
        case "recargar":
            await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => { });
            await page.waitForTimeout(2500);
            break;
        case "reiniciar":
            // Empezar de nuevo SIN la sesión vieja: se borran las cookies y se vuelve a Dropbox Sign (arranca el OAuth limpio).
            await a.ctx.clearCookies().catch(() => { });
            await irA(page, MANAGE_URL).catch(() => { });
            await page.waitForTimeout(3000);
            a.detalle = "Se empezó de nuevo sin la sesión vieja: iniciá sesión en la pantalla.";
            break;
    }
    await page.waitForTimeout(700);
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => { });
    return pantallaLoginAsistido(tenantId);
}
/**
 * LA PÁGINA EN BLANCO (27/10/2026): oauth2/authorize quedó blanca y sin texto. Si la página no muestra
 * nada, se dice qué devolvió Dropbox: código HTTP, título, tamaño y comienzo del HTML, e iframes.
 */
async function diagnosticoSiVacia(a) {
    const d = await a.page
        .evaluate(() => {
        const texto = (document.body?.innerText || "").trim();
        if (texto.length > 0)
            return null;
        const html = document.documentElement?.outerHTML || "";
        const iframes = Array.from(document.querySelectorAll("iframe")).map((f) => `${(f.getAttribute("src") || "(sin src)").split("?")[0].slice(0, 80)} ${Math.round(f.getBoundingClientRect().width)}×${Math.round(f.getBoundingClientRect().height)}`);
        return { titulo: document.title, largo: html.length, inicio: html.replace(/\s+/g, " ").replace(/<script[\s\S]*?<\/script>/gi, "<script/>").slice(0, 400), iframes, listo: document.readyState };
    })
        .catch(() => null);
    if (!d)
        return undefined;
    const r = a.ultimaRespuesta;
    return `Página sin texto · respuesta ${r ? `HTTP ${r.status}` : "sin datos"} · título «${d.titulo || "(vacío)"}» · ${d.largo} caracteres de HTML · readyState ${d.listo}${d.iframes.length ? ` · iframes: ${d.iframes.join(", ")}` : ""} · HTML: ${d.inicio}`;
}
export async function cerrarLoginAsistido(tenantId, motivo) {
    const a = abiertos.get(tenantId);
    if (!a)
        return { ok: false, estado: "cerrado" };
    if (a.timer)
        clearTimeout(a.timer);
    const estadoFinal = a.estado === "conectado" ? "conectado" : "cerrado";
    if (a.estado === "abierto") {
        a.estado = "cerrado";
        a.detalle = motivo || "Se cerró sin llegar al listado de documentos: no se guardó ninguna sesión.";
    }
    abiertos.delete(tenantId);
    // Conectado, el navegador queda tibio con su perfil para la próxima corrida; si no, se cierra.
    // El candado se suelta SIEMPRE, aunque cerrar el navegador falle.
    a.señal.cortada = true;
    try {
        await liberarContexto(tenantId, a.sesion, estadoFinal === "conectado");
    }
    finally {
        soltarCandadoDropboxSign(tenantId);
    }
    return { ok: true, estado: estadoFinal };
}
export const hayLoginAsistido = (tenantId) => abiertos.get(tenantId)?.estado === "abierto";
