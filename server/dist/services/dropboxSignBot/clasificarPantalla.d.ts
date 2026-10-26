/**
 * EN QUÉ PANTALLA DE DROPBOX SIGN ESTÁ EL NAVEGADOR, por la URL y el texto visible (patrón
 * `arca/pantallaArca.ts`). Pura: se testea con textos de fixtures, sin Playwright.
 *
 *  · `limite`      el freno antiabuso («Debido a la seguridad de la cuenta…»). Se mira PRIMERO porque
 *                  aparece dentro de la pantalla de revisión.
 *  · `login`       pide usuario o contraseña (app.sign.dropbox.com o www.dropbox.com/login).
 *  · `revisar`     «Revisar y enviar», con el botón «Enviar para firmar».
 *  · `editor`      «Insertar campos» (o «Agregar firmantes» / «Seleccionar documentos»: los pasos del wizard).
 *  · `manage`      /home/manage: el listado de documentos.
 */
export type PantallaDropboxSign = "login" | "manage" | "editor" | "revisar" | "limite" | "desconocida";
export declare function clasificarPantalla(url: string, texto: string): PantallaDropboxSign;
/**
 * QUÉ PASO DEL LOGIN SE VE (26/10/2026). Dropbox Sign manda a www.dropbox.com/oauth2/authorize: primero
 * pide el EMAIL y recién después de «Continuar» muestra la CONTRASEÑA. Antes el bot buscaba la
 * contraseña apenas cargaba la página y terminaba en un timeout genérico. Ahora cada vuelta mira la
 * pantalla y decide el próximo paso; lo que el bot no resuelve a propósito (segundo factor, captcha,
 * autorizar la app) corta con un código propio, no con un timeout.
 */
export type PasoLogin = "listo" | "email" | "clave" | "boton_dropbox" | "esperar" | "login_requiere_2fa" | "login_requiere_captcha" | "login_clave_incorrecta" | "login_requiere_autorizacion";
export interface VistaLogin {
    url: string;
    texto: string;
    /** Hay un campo de email VISIBLE. */
    hayEmail: boolean;
    /** Hay un campo de contraseña VISIBLE (no el señuelo oculto de autocompletado). */
    hayClave: boolean;
    /** Hay un campo de código de un solo uso visible. */
    hayCodigo: boolean;
    /** Hay un captcha visible (iframe de recaptcha/hcaptcha/arkose). */
    hayCaptcha: boolean;
    /** Ya se escribió el email en esta pasada. */
    emailCargado: boolean;
    /** Ya se mandó la contraseña en esta pasada. */
    claveEnviada: boolean;
}
export declare function pasoDeLogin(v: VistaLogin): PasoLogin;
