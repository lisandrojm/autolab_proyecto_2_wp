import { esTextoDeLimite } from "./reglas.js";

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

export function clasificarPantalla(url: string, texto: string): PantallaDropboxSign {
  const u = String(url || "");
  const t = String(texto || "");
  if (esTextoDeLimite(t)) return "limite";
  if (/\/login\b|\/signin\b|\/oauth2\/authorize|accounts\.google|login_email|login_password/i.test(u)) return "login";
  if (/contrase[ñn]a|password/i.test(t) && /iniciar sesi[oó]n|sign in|log in|continuar|continue/i.test(t) && !/firmar documentos|insertar campos|revisar y enviar/i.test(t)) return "login";
  if (/revisar y enviar|enviar para firmar/i.test(t)) return "revisar";
  if (/insertar campos|agregar firmantes|seleccionar documentos|documentos seleccionados/i.test(t) || /\/prep\b|\/editor\b|\/request\b/i.test(u)) return "editor";
  if (/\/home\/manage/i.test(u) || /firmar documentos/i.test(t)) return "manage";
  return "desconocida";
}

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

export function pasoDeLogin(v: VistaLogin): PasoLogin {
  const t = String(v.texto || "");
  const u = String(v.url || "");
  if (/app\.sign\.dropbox\.com/i.test(u) && clasificarPantalla(u, t) === "manage") return "listo";
  if (/contrase[ñn]a incorrecta|incorrect password|wrong password|datos incorrectos|no coinciden/i.test(t)) return "login_clave_incorrecta";
  if (v.hayCaptcha || /captcha|no soy un robot|i'?m not a robot|verifica que eres humano|verify you are human/i.test(t)) return "login_requiere_captcha";
  if (v.hayCodigo || /c[oó]digo de (verificaci[oó]n|seguridad)|verification code|security code|two-step|verificaci[oó]n en dos pasos|autenticaci[oó]n de dos factores|two-factor|te enviamos un c[oó]digo|we sent (you )?a code|enter the code|ingres[aá] el c[oó]digo/i.test(t)) return "login_requiere_2fa";
  if (v.hayClave && !v.claveEnviada) return "clave";
  if (v.hayEmail && !v.emailCargado && !v.hayClave) return "email";
  // La pantalla de consentimiento de OAuth («Permitir» / «Allow»): no se autoriza nada en nombre de nadie.
  if (/\/oauth2\/authorize/i.test(u) && !v.hayEmail && !v.hayClave && /\b(permitir|allow|autorizar|authorize)\b/i.test(t) && /acceso|access/i.test(t)) return "login_requiere_autorizacion";
  // El login propio de Dropbox Sign que ofrece «Iniciar sesión con Dropbox» antes del formulario.
  if (!v.hayEmail && !v.hayClave && /iniciar sesi[oó]n con dropbox|sign in with dropbox|continuar con dropbox|continue with dropbox/i.test(t)) return "boton_dropbox";
  return "esperar";
}
