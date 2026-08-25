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
}
/** Lee y descifra las credenciales del tenant. `null` si no están cargadas. */
export declare function credencialesDe(tenantId: string): Promise<CredencialesArca | null>;
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
