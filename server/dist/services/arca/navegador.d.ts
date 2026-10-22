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
/**
 * Dónde está el Chromium, buscando en orden de preferencia.
 *
 * SE BUSCA EN VEZ DE EXIGIR UN PASO DE INSTALACIÓN. La primera corrida en el VPS falló justamente
 * por eso: Playwright tiró su cartel de «Please run npx playwright install», que es correcto pero
 * llega tarde —cuando alguien ya apretó Validar y esperó— y en un idioma que no es el de la app.
 *
 * El orden va del más compatible al más disponible:
 *
 *   1. `CHROMIUM_PATH`, para cuando el servidor tiene uno puesto a propósito. Manda siempre.
 *   2. El de Playwright, si está bajado. Es el que mejor se lleva con esta versión de la librería.
 *   3. Uno del sistema (`/usr/bin/chromium`, `google-chrome`…), que en un Linux con Chrome ya está.
 *   4. El que bajó puppeteer para generar los PDF. Existe en este servidor desde siempre, así que es
 *      el que hace que esto ande sin instalar nada — pero es de 2021, así que va último: sirve como
 *      red, no como plan.
 *
 * `undefined` deja que Playwright use el suyo, que es lo correcto cuando está.
 */
export declare function rutaChromium(): string | undefined;
/**
 * Traduce el cartel de Playwright a algo accionable, en castellano.
 *
 * El original es un recuadro de arte ASCII con un comando en inglés que, metido en una franja de
 * error de la app, sale desarmado e ilegible — y no dice DÓNDE hay que correr ese comando, que es lo
 * único que hace falta saber.
 */
export declare function errorDeChromium(e: any): Error;
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
 * ¿Esta sesión, que quedó tibia de una corrida anterior, sigue adentro del servicio?
 *
 * Se le pregunta a ARCA, no a la página: el HTML que quedó en pantalla es de la corrida anterior y
 * dice «servicio» aunque AFIP ya haya cortado la sesión por inactividad. Navegar al selector de CUIT
 * es el mismo chequeo que el camino rápido de `abrirSesionArca` (≈1 s contra los ≈11 s de abrir una
 * sesión nueva), y deja la página donde los motores la esperan: parada en el selector.
 *
 * Cualquier duda es un «no»: quien llama cierra esta y abre una nueva por el camino de siempre.
 */
export declare function revalidarSesionArca(sesion: SesionArca): Promise<boolean>;
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
export declare function abrirSesionArca(tenantId: string, cred: CredencialesArca, opciones?: {
    visible?: boolean;
}): Promise<SesionArca>;
