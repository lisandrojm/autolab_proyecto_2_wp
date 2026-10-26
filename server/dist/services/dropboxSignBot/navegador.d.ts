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
