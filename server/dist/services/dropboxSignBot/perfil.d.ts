import { type BrowserContext, type Page } from "playwright-core";
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
export declare const ARGS_CHROMIUM: string[];
/** Dónde vive el perfil del tenant. `DROPBOX_SIGN_PERFILES_DIR` lo cambia; por defecto, en el home del usuario del server. */
export declare function dirPerfil(tenantId: string): string;
/** El user-agent y su metadata, armados con el SO real del servidor y la versión real del binario. */
export declare function identidad(version: string, plataforma?: NodeJS.Platform, arquitectura?: string, release?: string): {
    userAgent: string;
    platform: string;
    acceptLanguage: string;
    userAgentMetadata: {
        brands: {
            brand: string;
            version: string;
        }[];
        fullVersionList: {
            brand: string;
            version: string;
        }[];
        fullVersion: string;
        platform: string;
        platformVersion: string;
        architecture: string;
        model: string;
        mobile: boolean;
        bitness: string;
        wow64: boolean;
    };
};
export interface ContextoDropboxSign {
    ctx: BrowserContext;
    page: Page;
    /** Cierra el navegador (para quien no lo deja tibio). */
    browser: {
        close(): Promise<unknown>;
    };
    /** El perfil se creó recién (y se sembró con la sesión de respaldo, si había). */
    perfilNuevo: boolean;
    /** Vino de la sesión tibia: el navegador ya estaba abierto. */
    tibia: boolean;
}
export declare function msSesionTibia(valor?: string | undefined): number;
export declare const hayTibiaDropboxSign: (tenantId: string) => boolean;
/** Cierra la tibia del tenant, si hay. */
export declare function cerrarTibiaDropboxSign(tenantId: string): Promise<void>;
/**
 * Libera el navegador al terminar: SANO (llegó a donde tenía que llegar) queda tibio; si no, se cierra.
 * Nunca deja dos: si había otra tibia (no debería, por el candado), se cierra.
 */
export declare function liberarContexto(tenantId: string, sesion: ContextoDropboxSign | null | undefined, sana: boolean): Promise<void>;
/**
 * El navegador del tenant con su perfil: la tibia si hay (y sigue viva), o uno nuevo. Quien llama tiene
 * el candado y, al terminar, llama `liberarContexto`.
 */
export declare function abrirContextoDropboxSign(tenantId: string, opciones?: {
    headless?: boolean;
    sesionRespaldo?: any | null;
}): Promise<ContextoDropboxSign>;
