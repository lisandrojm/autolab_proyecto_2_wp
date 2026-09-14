import { registroLinksAPI, buildRegistroUrl } from "../../../../api/registroLinks";
import { sweetAlert } from "./sweetAlert";

/** Copia al portapapeles con respaldo para navegadores sin `navigator.clipboard` (http, webviews viejos). */
export const copiarAlPortapapeles = async (texto: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* sigue con el respaldo */
  }
  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
};

const fecha = (d: string) => new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Pide (o genera) mi link de registro y lo copia: sólo el link, el texto que acompaña lo escribe quien
 * lo comparte. Lo usan la sección Registro y la Solicitud de Contratación, cuando la persona buscada
 * todavía no se registró. `despues` es lo que se le dice que pasa cuando la persona se registre.
 */
export const copiarMiLinkDeRegistro = async (despues = "Pegalo en el grupo de WhatsApp o donde corresponda."): Promise<void> => {
  try {
    const link = await registroLinksAPI.miLink();
    const url = buildRegistroUrl(link.token);
    const dias = link.diasRestantes === 1 ? "1 día" : `${link.diasRestantes} días`;
    if (await copiarAlPortapapeles(url)) await sweetAlert.success("Link copiado", `${despues}\n\nVence el ${fecha(link.expiresAt)} (quedan ${dias}).`);
    else await sweetAlert.warning("No se pudo copiar", `Copialo a mano:\n\n${url}`);
  } catch (e: any) {
    sweetAlert.error("No se pudo generar el link", e?.response?.data?.error || "Probá de nuevo en un momento.");
  }
};
