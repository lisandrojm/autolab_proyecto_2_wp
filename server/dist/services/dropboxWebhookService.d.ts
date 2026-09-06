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
/** Los tenants cuya cuenta de Dropbox es una de las que avisó el webhook. */
export declare function tenantsDeCuentas(accountIds: string[]): Promise<Array<{
    _id: any;
    appSecret: string;
}>>;
/**
 * Encola un escaneo para este tenant, agrupando la ráfaga.
 *
 * Vuelve al instante: el escaneo corre por su cuenta. Dropbox espera una respuesta rápida y deja de
 * mandar notificaciones al que tarda, así que escanear DENTRO del request sería la forma de terminar
 * sin webhook — que es exactamente lo contrario de lo que se quiere.
 */
export declare function programarEscaneo(tenantId: string): void;
/** Solo para los tests y para poder apagar limpio: cancela lo encolado. */
export declare function limpiarPendientes(): void;
