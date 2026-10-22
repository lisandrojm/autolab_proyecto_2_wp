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
export declare function guardarSesion(tenantId: string, ctx: BrowserContext): Promise<void>;
export declare const anotarError: (tenantId: string, mensaje: string | null) => Promise<void | (import("mongoose").Document<unknown, {}, import("../../models/Tenant.js").ITenant, {}, {}> & import("../../models/Tenant.js").ITenant & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
})>;
export declare function textoDe(page: Page): Promise<string>;
export declare function pantallaDe(page: Page): Promise<PantallaDropboxSign>;
/**
 * Abre el navegador con la sesión lista en /home/manage. Con `sinLogin` (login manual del operador)
 * devuelve la sesión en la pantalla que esté, sin intentar loguearse. Quien llama cierra el browser.
 */
export declare function abrirSesionDropboxSign(tenantId: string, opciones?: {
    visible?: boolean;
    sinLogin?: boolean;
}): Promise<SesionDropboxSign>;
