/**
 * Solo para los tests: correr el escaneo de mentira y con una ventana corta.
 *
 * En producción no se pasan nunca. Existen porque la regla que hay que probar —agrupar la ráfaga sin
 * postergarla— es de TIEMPO, y sin poder achicar la ventana el test tendría que esperar ocho segundos
 * reales por cada caso, que es como se termina no probándolo.
 */
export interface OpcionesEscaneo {
    correr?: (tenantId: string) => Promise<unknown>;
    esperaMs?: number;
}
/**
 * La firma del webhook, verificada contra el CUERPO EXACTO que mandó Dropbox.
 *
 * `X-Dropbox-Signature` es un HMAC-SHA256 del body crudo con el app secret. Tiene que calcularse
 * sobre los bytes tal cual llegaron: si se firma `JSON.stringify(req.body)` el resultado no coincide
 * casi nunca —cambia un espacio, el orden de una clave— y el webhook queda rechazando todo.
 *
 * `timingSafeEqual` y no `===` porque comparar strings corta en el primer byte distinto, y ese tiempo
 * es medible: con suficientes intentos se puede adivinar una firma byte a byte. Es barato hacerlo bien.
 */
export declare function firmaValida(rawBody: Buffer, firma: string, appSecret: string): boolean;
/**
 * CUÁLES DE ESTOS TENANTS FIRMÓ REALMENTE ESTE AVISO.
 *
 * Está aparte y es pura porque es la regla de seguridad del endpoint, y es la que hay que poder
 * probar sin base de datos: que un `account_id` compartido entre dos organizaciones NO deje que la
 * firma de una dispare el escaneo de la otra.
 *
 * Se prueban TODOS, no se corta en el primero que valida: la misma cuenta puede estar conectada en
 * dos organizaciones con la misma app, y ahí las dos tienen derecho a escanear.
 */
export declare function autorizadosDe<T extends {
    appSecret: string;
}>(tenants: T[], rawBody: Buffer, firma: string): T[];
export interface TenantsDeCuentas {
    /** TODOS los tenants de TODAS las cuentas avisadas. Puede haber más de uno por cuenta. */
    tenants: Array<{
        _id: any;
        accountId: string;
        appSecret: string;
    }>;
    /** Cuentas que no son de nadie en este servidor. Ni error ni ataque: ruido, pero se dice. */
    cuentasSinTenant: string[];
    /** Tenants con Dropbox conectado y todavía sin `accountId`: están esperando su primer escaneo. */
    tenantsSinAccountId: number;
}
/**
 * Los tenants cuya cuenta de Dropbox es alguna de las que avisó el webhook.
 *
 * DEVUELVE TODOS, no el primero. Dos cosas obligan a eso:
 *
 *   - `list_folder.accounts` es un ARRAY: un aviso puede traer varias cuentas;
 *   - la misma cuenta de Dropbox puede estar conectada en dos organizaciones.
 *
 * En los dos casos, quedarse con el primero deja a alguien sin escanear y sin ningún síntoma: los
 * archivos llegan a Dropbox y sus contratos simplemente no avanzan hasta que pase el reloj.
 *
 * Y de yapa cuenta los que están conectados pero todavía sin `accountId`. Ese estado es transitorio
 * —lo completa el primer escaneo— pero mientras dura, sus avisos son indistinguibles de una cuenta
 * ajena. Contarlos es lo que permite saber, mirando un log, si falta configurar algo o si alguien
 * está golpeando el endpoint.
 */
export declare function tenantsDeCuentas(accountIds: string[]): Promise<TenantsDeCuentas>;
/**
 * Encola un escaneo para este tenant, agrupando la ráfaga.
 *
 * Vuelve al instante: el escaneo corre por su cuenta. Dropbox espera una respuesta rápida y deja de
 * mandar notificaciones al que tarda, así que escanear DENTRO del request sería la forma de terminar
 * sin webhook — que es exactamente lo contrario de lo que se quiere.
 */
export declare function programarEscaneo(tenantId: string, opts?: OpcionesEscaneo): void;
/** Solo para los tests y para poder apagar limpio: cancela lo encolado. */
export declare function limpiarPendientes(): void;
