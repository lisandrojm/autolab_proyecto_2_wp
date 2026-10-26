import { Browser, BrowserContext, Page } from "playwright-core";
import { type PantallaDropboxSign } from "./clasificarPantalla.js";
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
export declare const MANAGE_URL = "https://app.sign.dropbox.com/home/manage";
export interface SesionDropboxSign {
    browser: Browser;
    ctx: BrowserContext;
    page: Page;
    seLogueo: boolean;
    pantalla: PantallaDropboxSign;
}
export declare function configDelBot(tenantId: string): Promise<{
    loginEmail: string;
    loginPassword: string;
    sesion: any | null;
}>;
export declare function guardarSesion(tenantId: string, ctx: BrowserContext): Promise<void>;
export declare const anotarError: (tenantId: string, mensaje: string | null) => Promise<void | (import("mongoose").Document<unknown, {}, import("../../models/Tenant.js").ITenant, {}, {}> & import("../../models/Tenant.js").ITenant & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
})>;
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
export declare const anotarConexion: (tenantId: string, conexion: Omit<ConexionDropboxSign, "probadaAt">) => Promise<void | (import("mongoose").Document<unknown, {}, import("../../models/Tenant.js").ITenant, {}, {}> & import("../../models/Tenant.js").ITenant & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
})>;
export declare function textoDe(page: Page): Promise<string>;
export declare function pantallaDe(page: Page): Promise<PantallaDropboxSign>;
export declare function irA(page: Page, url: string): Promise<void>;
/**
 * UN ERROR DE LOGIN CON NOMBRE (26/10/2026): `login_requiere_2fa`, `login_requiere_captcha`, `login_clave_incorrecta`,
 * `login_requiere_autorizacion`, `login_sin_credenciales`, `login_sin_avance`. Antes todo terminaba en un timeout de
 * Playwright o en «pantalla: login», que no decía qué pasó ni qué hacer.
 */
export declare class ErrorLogin extends Error {
    codigo: string;
    constructor(codigo: string, mensaje: string);
}
/**
 * UN SOLO NAVEGADOR «IDENTIDAD» (26/10/2026): mismo user-agent, viewport, idioma y zona horaria en
 * cada corrida, en «Probar conexión» y en el login asistido. Chromium headless se anuncia como
 * «HeadlessChrome»; si el agente cambia entre el login y la corrida, Dropbox invalida la sesión por
 * seguridad (la guardada a las 01:56 ya no servía a las 08:37).
 */
export declare const OPCIONES_CONTEXTO: {
    readonly viewport: {
        readonly width: 1457;
        readonly height: 812;
    };
    readonly locale: "es-AR";
    readonly timezoneId: "America/Argentina/Buenos_Aires";
    readonly userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
};
/**
 * EL AVISO DE COOKIES (26/10/2026) tapa el formulario de login de Dropbox: el click en «Continuar» no
 * llegaba. Se cierra con «Rechazar» (lo que menos comparte) y, si no está, con su cruz. Idempotente:
 * se llama en cada vuelta del login porque reaparece después de la redirección OAuth. Devuelve si cerró algo.
 */
export declare function cerrarBannerCookies(page: Page): Promise<boolean>;
/**
 * LOGIN CON USUARIO Y CONTRASEÑA, PASO A PASO (26/10/2026). Dropbox Sign redirige a
 * www.dropbox.com/oauth2/authorize: email → «Continuar» → contraseña → «Iniciar sesión» → de vuelta a
 * app.sign.dropbox.com. Cada vuelta mira la pantalla (`pasoDeLogin`) y hace lo que corresponde; no se
 * busca la contraseña antes de que exista. Segundo factor, captcha o autorizar la app cortan con su
 * código (un reintento ciego puede bloquear la cuenta).
 */
export declare function loguear(page: Page, cred: {
    loginEmail: string;
    loginPassword: string;
}): Promise<void>;
/**
 * Abre el navegador con la sesión lista en /home/manage. Con `sinLogin` (login manual del operador)
 * devuelve la sesión en la pantalla que esté, sin intentar loguearse. Quien llama cierra el browser.
 */
export declare function abrirSesionDropboxSign(tenantId: string, opciones?: {
    visible?: boolean;
    sinLogin?: boolean;
}): Promise<SesionDropboxSign>;
/**
 * «PROBAR CONEXIÓN»: abre el navegador, intenta llegar al listado de documentos (sesión guardada o
 * usuario y contraseña) y lo cierra. No toca ningún documento. Deja registrado el resultado como una
 * corrida más. Pide el candado: no corre mientras hay una tanda en curso.
 */
export declare function probarConexionDropboxSign(tenantId: string): Promise<ConexionDropboxSign>;
