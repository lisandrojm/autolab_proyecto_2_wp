import { Browser, BrowserContext, Page } from "playwright-core";
export interface CredencialesArca {
    cuitUsuario: string;
    clave: string;
}
export interface SesionArca {
    browser: Browser;
    ctx: BrowserContext;
    page: Page;
    /** `true` si hubo que loguearse; `false` si alcanzó con la sesión guardada. */
    seLogueo: boolean;
    /** Cuánto costó cada paso de abrirla. Va al log de la corrida (ver `ArcaObrasSocialesLog.tiempos`). */
    tiempos: {
        lanzarMs: number;
        sesionGuardadaMs: number;
        loginMs: number;
    };
}
/** Lee y descifra las credenciales del tenant./** Lee y descifra las credenciales del tenant. `null` si no están cargadas. */
export declare function credencialesDe(tenantId: string): Promise<CredencialesArca | null>;
/**
 * Guarda la sesión para la próxima corrida.
 *
 * Cifrada, igual que la clave: mientras dura, entrar con esta sesión no pide contraseña, así que
 * dejarla en claro sería guardar la credencial en claro con otro nombre.
 */
export declare function guardarSesion(tenantId: string, ctx: BrowserContext): Promise<void>;
/**
 * Abre un navegador con la sesión de ARCA lista, logueándose solo si hace falta.
 *
 * SE INTENTA PRIMERO CON LA SESIÓN GUARDADA. Loguearse en cada corrida es tráfico innecesario contra
 * el organismo, es lento, y multiplica las oportunidades de que AFIP pida un segundo factor. La
 * sesión dura días.
 *
 * Quien llama TIENE que cerrar el browser (`await sesion.browser.close()`), o cada corrida deja un
 * Chromium vivo comiéndose la memoria del VPS.
 */
export declare function abrirSesionArca(tenantId: string, cred: CredencialesArca): Promise<SesionArca>;
