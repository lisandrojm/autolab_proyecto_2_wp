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
