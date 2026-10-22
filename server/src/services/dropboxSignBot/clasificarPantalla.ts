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
  if (/\/login\b|\/signin\b|accounts\.google|login_email|login_password/i.test(u)) return "login";
  if (/contrase[ñn]a|password/i.test(t) && /iniciar sesi[oó]n|sign in|log in|continuar|continue/i.test(t) && !/firmar documentos|insertar campos|revisar y enviar/i.test(t)) return "login";
  if (/revisar y enviar|enviar para firmar/i.test(t)) return "revisar";
  if (/insertar campos|agregar firmantes|seleccionar documentos|documentos seleccionados/i.test(t) || /\/prep\b|\/editor\b|\/request\b/i.test(u)) return "editor";
  if (/\/home\/manage/i.test(u) || /firmar documentos/i.test(t)) return "manage";
  return "desconocida";
}
