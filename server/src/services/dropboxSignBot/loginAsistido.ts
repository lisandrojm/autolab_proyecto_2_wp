import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { Tenant } from "../../models/Tenant.js";
import { rutaChromium, errorDeChromium } from "../arca/navegador.js";
import { VIEWPORT } from "./reglas.js";
import { MANAGE_URL, OPCIONES_CONTEXTO, anotarConexion, anotarError, configDelBot, guardarSesion, irA, loguear, pantallaDe } from "./navegador.js";
import { soltarCandadoDropboxSign, tomarCandadoDropboxSign } from "./candado.js";
import type { PantallaDropboxSign } from "./clasificarPantalla.js";

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
 */

const BASE = "integrations.dropboxSign.bot";
const INACTIVIDAD_MS = 10 * 60_000;
const TECLAS_PERMITIDAS = new Set(["Enter", "Tab", "Backspace", "Escape", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Space", "Delete"]);

interface Asistido {
  tenantId: string;
  browser: Browser;
  ctx: BrowserContext;
  page: Page;
  abiertoEl: Date;
  estado: "abierto" | "conectado" | "cerrado";
  detalle: string;
  timer: NodeJS.Timeout | null;
  /** El bot está entrando solo con las credenciales guardadas: la pantalla no acepta clicks ni texto. */
  automatico: boolean;
}

export interface EstadoLoginAsistido {
  estado: "abierto" | "conectado" | "cerrado";
  pantalla: PantallaDropboxSign | "";
  url: string;
  detalle: string;
  viewport: { width: number; height: number };
  abiertoEl: string | null;
  /** El bot está entrando solo con las credenciales guardadas. */
  automatico: boolean;
  /** La captura (JPEG base64), cuando se pide la pantalla. */
  jpeg?: string;
}

export type AccionLoginAsistido = { tipo: "click"; x: number; y: number } | { tipo: "tipear"; texto: string } | { tipo: "tecla"; tecla: string } | { tipo: "scroll"; dy: number };

const abiertos = new Map<string, Asistido>();

const estadoDe = (a: Asistido | undefined, extra: Partial<EstadoLoginAsistido> = {}): EstadoLoginAsistido => ({
  estado: a?.estado || "cerrado",
  pantalla: "",
  url: a?.page?.url?.() || "",
  detalle: a?.detalle || "",
  viewport: { ...VIEWPORT },
  abiertoEl: a?.abiertoEl ? a.abiertoEl.toISOString() : null,
  automatico: !!a?.automatico,
  ...extra,
});

function reprogramarCierre(a: Asistido): void {
  if (a.timer) clearTimeout(a.timer);
  a.timer = setTimeout(() => void cerrarLoginAsistido(a.tenantId, "Se cerró por inactividad (10 min).").catch(() => {}), INACTIVIDAD_MS);
}

/** Si el navegador ya está en el listado: guarda la sesión, anota la conexión y cierra. Devuelve true si conectó. */
async function conectarSiLlego(a: Asistido, pantalla: PantallaDropboxSign): Promise<boolean> {
  if (pantalla !== "manage" || a.estado !== "abierto") return a.estado === "conectado";
  a.estado = "conectado";
  a.detalle = "Sesión guardada: el bot ya puede entrar solo.";
  await guardarSesion(a.tenantId, a.ctx).catch(() => {});
  await Tenant.findByIdAndUpdate(a.tenantId, { $set: { [`${BASE}.ultimoLoginAt`]: new Date(), [`${BASE}.ultimoError`]: null } }).catch(() => {});
  await anotarConexion(a.tenantId, { estado: "ok", via: "login", pantalla, detalle: "Entró con el login asistido desde la web y guardó la sesión.", captura: null });
  // Se cierra después de devolver la última captura.
  setTimeout(() => void cerrarLoginAsistido(a.tenantId).catch(() => {}), 1500);
  return true;
}

/** Abre el navegador en el login (o reusa el que ya está abierto). Si entra directo con la sesión guardada, conecta y cierra. */
export async function abrirLoginAsistido(tenantId: string): Promise<EstadoLoginAsistido> {
  const previo = abiertos.get(tenantId);
  if (previo && previo.estado === "abierto") {
    reprogramarCierre(previo);
    return estadoDe(previo, { pantalla: await pantallaDe(previo.page).catch(() => "" as const) });
  }
  tomarCandadoDropboxSign(tenantId, false, "login");
  let browser: Browser;
  try {
    const cfg = await configDelBot(tenantId);
    try {
      browser = await chromium.launch({ headless: true, executablePath: rutaChromium() });
    } catch (e: any) {
      const err = errorDeChromium(e);
      await anotarError(tenantId, err.message);
      throw Object.assign(err, { status: 500 });
    }
    const ctx = await browser.newContext({ ...(cfg.sesion ? { storageState: cfg.sesion } : {}), ...OPCIONES_CONTEXTO, viewport: { ...VIEWPORT } });
    const page = await ctx.newPage();
    const a: Asistido = { tenantId, browser, ctx, page, abiertoEl: new Date(), estado: "abierto", detalle: "Iniciá sesión en la pantalla. Si aparece un captcha o un código, resolvelo acá mismo.", timer: null, automatico: false };
    abiertos.set(tenantId, a);
    reprogramarCierre(a);
    await irA(page, MANAGE_URL).catch(() => {});
    await page.waitForTimeout(2000);
    const pantalla = await pantallaDe(page).catch(() => "desconocida" as const);
    await conectarSiLlego(a, pantalla);
    /*
      PRIMERO EL BOT, SOLO (pedido del 26/10/2026): con usuario y contraseña guardados, el navegador
      entra por su cuenta con el mismo login que usan las corridas (`loguear`), y la pantalla lo muestra
      mientras tanto. Sólo si Dropbox Sign pide algo que el bot no resuelve a propósito —captcha, código,
      segundo factor— la pantalla queda para que la persona lo termine.
    */
    if (a.estado === "abierto" && cfg.loginEmail && cfg.loginPassword) {
      a.automatico = true;
      a.detalle = `Entrando solo con el usuario guardado (${cfg.loginEmail})…`;
      void (async () => {
        try {
          await loguear(page, cfg);
          if (!/\/home\/manage/i.test(page.url())) await irA(page, MANAGE_URL).catch(() => {});
          await page.waitForTimeout(1500);
          const p = await pantallaDe(page).catch(() => "desconocida" as const);
          if (!(await conectarSiLlego(a, p)) && a.estado === "abierto") a.detalle = "El login automático no llegó al listado de documentos: terminalo en la pantalla.";
        } catch (e: any) {
          if (a.estado === "abierto") a.detalle = `${String(e?.message || e).replace(/^[a-z_]+:\s*/, "")} Terminalo en la pantalla: hacé click en el campo, escribí y apretá Enter.`;
        } finally {
          a.automatico = false;
          reprogramarCierre(a);
        }
      })();
    } else if (a.estado === "abierto") {
      a.detalle = "No hay usuario y contraseña guardados para entrar solo: iniciá sesión en la pantalla (o cargalos en «Envío automático» para la próxima).";
    }
    return estadoDe(a, { pantalla });
  } catch (e) {
    soltarCandadoDropboxSign(tenantId);
    abiertos.delete(tenantId);
    throw e;
  }
}

/** La captura actual más el estado. Si el navegador llegó al listado, conecta. */
export async function pantallaLoginAsistido(tenantId: string): Promise<EstadoLoginAsistido> {
  const a = abiertos.get(tenantId);
  if (!a) return estadoDe(undefined, { detalle: "No hay un login asistido abierto." });
  const pantalla = await pantallaDe(a.page).catch(() => "desconocida" as const);
  await conectarSiLlego(a, pantalla);
  const jpeg = await a.page.screenshot({ type: "jpeg", quality: 55 }).then((b) => b.toString("base64")).catch(() => undefined);
  return estadoDe(a, { pantalla, jpeg });
}

/** Un click, texto o tecla del usuario, reenviados al navegador. Devuelve la captura resultante. */
export async function accionLoginAsistido(tenantId: string, accion: AccionLoginAsistido): Promise<EstadoLoginAsistido> {
  const a = abiertos.get(tenantId);
  if (!a || a.estado !== "abierto") return estadoDe(a, { detalle: a?.detalle || "No hay un login asistido abierto." });
  // Mientras el bot entra solo, la pantalla no acepta nada: dos manos tipeando a la vez rompen el login.
  if (a.automatico) return pantallaLoginAsistido(tenantId);
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
      if (texto) await page.keyboard.type(texto, { delay: 15 });
      break;
    }
    case "tecla": {
      const tecla = String(accion.tecla || "");
      if (!TECLAS_PERMITIDAS.has(tecla)) throw Object.assign(new Error(`Tecla no permitida: ${tecla}`), { status: 400 });
      await page.keyboard.press(tecla === "Space" ? " " : tecla);
      break;
    }
    case "scroll":
      await page.mouse.wheel(0, Math.max(-2000, Math.min(2000, Number(accion.dy) || 0)));
      break;
  }
  await page.waitForTimeout(700);
  await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
  return pantallaLoginAsistido(tenantId);
}

export async function cerrarLoginAsistido(tenantId: string, motivo?: string): Promise<{ ok: boolean; estado: EstadoLoginAsistido["estado"] }> {
  const a = abiertos.get(tenantId);
  if (!a) return { ok: false, estado: "cerrado" };
  if (a.timer) clearTimeout(a.timer);
  const estadoFinal = a.estado === "conectado" ? "conectado" : "cerrado";
  if (a.estado === "abierto") {
    a.estado = "cerrado";
    a.detalle = motivo || "Se cerró sin llegar al listado de documentos: no se guardó ninguna sesión.";
  }
  abiertos.delete(tenantId);
  await a.browser.close().catch(() => {});
  soltarCandadoDropboxSign(tenantId);
  return { ok: true, estado: estadoFinal };
}

export const hayLoginAsistido = (tenantId: string): boolean => abiertos.get(tenantId)?.estado === "abierto";
