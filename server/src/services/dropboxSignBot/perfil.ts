import os from "node:os";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { rutaChromium } from "../arca/navegador.js";
import { VIEWPORT } from "./reglas.js";

/**
 * LA IDENTIDAD DEL NAVEGADOR DE DROPBOX SIGN (27/10/2026). Cada corrida abría un Chromium nuevo,
 * headless, con un user-agent de Mac (Chrome/139) sobre un Linux con otra versión, y le presentaba las
 * cookies de la corrida anterior: para Dropbox, un equipo nuevo con cookies ajenas. Por eso la sesión
 * duraba ~1 h 30 y volvía a pedir verificación. Ahora:
 *
 *  · UN PERFIL EN DISCO POR TENANT (`launchPersistentContext`), fuera del repo y de /tmp, COMPARTIDO por
 *    las corridas, «Probar conexión», los borradores y el login asistido: lo que una persona resuelve a
 *    mano (captcha, «confiar en este dispositivo») queda en el perfil, no sólo en las cookies. El
 *    `storageState` cifrado en la base sigue guardándose como respaldo y siembra un perfil nuevo.
 *  · IDENTIDAD COHERENTE: el user-agent, `navigator.platform`, `userAgentData` y `Sec-CH-UA` dicen el
 *    sistema operativo REAL del servidor y la versión REAL del binario (medido el 27/10: sin esto las
 *    marcas decían «HeadlessChrome/151» con un UA «Chrome/139» de Mac). Sin las marcas de automatización:
 *    `navigator.webdriver` es false.
 *  · SESIÓN TIBIA: al terminar bien, el navegador queda abierto un rato (`DROPBOX_SIGN_SESION_TIBIA_MIN`,
 *    30 por defecto, 0 lo apaga) y el siguiente uso lo toma en vez de lanzar otro. Una sola por tenant;
 *    quien la toma se la lleva; vence sola. Patrón `arca/sesionTibia.ts` (con su propio mapa: comparten
 *    tenantId y no pueden pisarse).
 *
 * Un solo proceso usa el directorio a la vez: todo lo que abre el perfil va bajo `candado.ts`, y la
 * tibia ociosa sólo la toca su temporizador.
 */

export const ARGS_CHROMIUM = ["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage"];

/** Dónde vive el perfil del tenant. `DROPBOX_SIGN_PERFILES_DIR` lo cambia; por defecto, en el home del usuario del server. */
export function dirPerfil(tenantId: string): string {
  const base = process.env.DROPBOX_SIGN_PERFILES_DIR || path.join(os.homedir(), ".weprodu", "dropbox-sign-perfiles");
  return path.join(base, String(tenantId).replace(/[^a-zA-Z0-9_-]/g, ""));
}

/** El user-agent y su metadata, armados con el SO real del servidor y la versión real del binario. */
export function identidad(version: string, plataforma: NodeJS.Platform = os.platform(), arquitectura: string = os.arch(), release: string = os.release()) {
  const major = String(version).split(".")[0] || "0";
  const arm = /arm/.test(arquitectura);
  const so =
    plataforma === "darwin"
      ? { ua: "Macintosh; Intel Mac OS X 10_15_7", navigator: "MacIntel", uad: "macOS", version: "10.15.7" }
      : plataforma === "win32"
        ? { ua: "Windows NT 10.0; Win64; x64", navigator: "Win32", uad: "Windows", version: "10.0.0" }
        : { ua: `X11; Linux ${arm ? "aarch64" : "x86_64"}`, navigator: `Linux ${arm ? "aarch64" : "x86_64"}`, uad: "Linux", version: String(release).split("-")[0] || "" };
  return {
    userAgent: `Mozilla/5.0 (${so.ua}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
    platform: so.navigator,
    acceptLanguage: "es-AR,es;q=0.9",
    userAgentMetadata: {
      brands: [
        { brand: "Chromium", version: major },
        { brand: "Not=A?Brand", version: "99" },
      ],
      fullVersionList: [
        { brand: "Chromium", version },
        { brand: "Not=A?Brand", version: "99.0.0.0" },
      ],
      fullVersion: version,
      platform: so.uad,
      platformVersion: so.version,
      architecture: arm ? "arm" : "x86",
      model: "",
      mobile: false,
      bitness: "64",
      wow64: false,
    },
  };
}

export interface ContextoDropboxSign {
  ctx: BrowserContext;
  page: Page;
  /** Cierra el navegador (para quien no lo deja tibio). */
  browser: { close(): Promise<unknown> };
  /** El perfil se creó recién (y se sembró con la sesión de respaldo, si había). */
  perfilNuevo: boolean;
  /** Vino de la sesión tibia: el navegador ya estaba abierto. */
  tibia: boolean;
}

interface Tibia {
  sesion: ContextoDropboxSign;
  vence: ReturnType<typeof setTimeout>;
}
const tibias = new Map<string, Tibia>();

export function msSesionTibia(valor: string | undefined = process.env.DROPBOX_SIGN_SESION_TIBIA_MIN): number {
  const crudo = String(valor ?? "").trim();
  const min = crudo === "" ? 30 : Number(crudo);
  return Number.isFinite(min) && min >= 0 ? Math.round(min * 60_000) : 30 * 60_000;
}

export const hayTibiaDropboxSign = (tenantId: string) => tibias.has(tenantId);

/** Cierra la tibia del tenant, si hay. */
export async function cerrarTibiaDropboxSign(tenantId: string): Promise<void> {
  const t = tibias.get(tenantId);
  if (!t) return;
  tibias.delete(tenantId);
  clearTimeout(t.vence);
  await t.sesion.browser.close().catch(() => {});
}

/**
 * Libera el navegador al terminar: SANO (llegó a donde tenía que llegar) queda tibio; si no, se cierra.
 * Nunca deja dos: si había otra tibia (no debería, por el candado), se cierra.
 */
export async function liberarContexto(tenantId: string, sesion: ContextoDropboxSign | null | undefined, sana: boolean): Promise<void> {
  if (!sesion) return;
  const ms = msSesionTibia();
  if (!sana || !(ms > 0)) return void (await sesion.browser.close().catch(() => {}));
  const previa = tibias.get(tenantId);
  if (previa && previa.sesion !== sesion) await cerrarTibiaDropboxSign(tenantId);
  const vence = setTimeout(() => void cerrarTibiaDropboxSign(tenantId), ms);
  vence.unref?.();
  tibias.set(tenantId, { sesion, vence });
}

/** Aplica la identidad a una página (por CDP: es lo único que también fija `userAgentData` y `Sec-CH-UA`). */
async function aplicarIdentidad(ctx: BrowserContext, page: Page, id: ReturnType<typeof identidad>): Promise<void> {
  const s = await ctx.newCDPSession(page).catch(() => null);
  await s?.send("Emulation.setUserAgentOverride", id as any).catch(() => {});
}

/**
 * El navegador del tenant con su perfil: la tibia si hay (y sigue viva), o uno nuevo. Quien llama tiene
 * el candado y, al terminar, llama `liberarContexto`.
 */
export async function abrirContextoDropboxSign(tenantId: string, opciones: { headless?: boolean; sesionRespaldo?: any | null } = {}): Promise<ContextoDropboxSign> {
  const t = tibias.get(tenantId);
  if (t) {
    tibias.delete(tenantId);
    clearTimeout(t.vence);
    const viva = await t.sesion.page.evaluate(() => 1).catch(() => 0);
    if (viva === 1) return { ...t.sesion, tibia: true };
    await t.sesion.browser.close().catch(() => {});
  }
  const dir = dirPerfil(tenantId);
  const perfilNuevo = !existsSync(dir);
  mkdirSync(dir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: opciones.headless !== false,
    executablePath: rutaChromium(),
    args: ARGS_CHROMIUM,
    ignoreDefaultArgs: ["--enable-automation"],
    viewport: { ...VIEWPORT },
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  });
  const id = identidad(ctx.browser()?.version() || "0");
  ctx.on("page", (p) => void aplicarIdentidad(ctx, p, id));
  // Un perfil recién creado se siembra con la sesión de respaldo (cookies) guardada en la base.
  if (perfilNuevo && Array.isArray(opciones.sesionRespaldo?.cookies) && opciones.sesionRespaldo.cookies.length) await ctx.addCookies(opciones.sesionRespaldo.cookies).catch(() => {});
  const page = ctx.pages()[0] || (await ctx.newPage());
  await aplicarIdentidad(ctx, page, id);
  for (const extra of ctx.pages().filter((p) => p !== page)) await extra.close().catch(() => {});
  return { ctx, page, browser: { close: () => ctx.close() }, perfilNuevo, tibia: false };
}
