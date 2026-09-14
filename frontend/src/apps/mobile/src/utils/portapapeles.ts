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

const escaparHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/**
 * Pide (o genera) mi link de registro, lo copia y explica qué pasó en un aviso que NO se va solo.
 *
 * Lo usan la sección Registro y la Solicitud de Contratación (cuando la persona buscada todavía no se
 * registró). `despues` es lo que se le dice que pasa una vez que la persona se registre.
 *
 * POR QUÉ UN AVISO PERSISTENTE Y NO UN TOAST. Antes era un "Link copiado" de 2 segundos, y un supervisor
 * o un coordinador no llegaba a entender qué tenía en la mano: que es un link para que la gente se
 * registre sola, que VENCE, y que ya está en su portapapeles listo para pegar. Ahora el aviso lo dice
 * todo y además MUESTRA el link, así se ve qué se va a mandar. Si el portapapeles falla —pasa en algunos
 * webviews—, el mismo aviso deja el link a la vista para copiarlo a mano, en vez de un toast de 3 segundos
 * que lo mostraba y desaparecía.
 *
 * El vencimiento sale del link real (`expiresAt`/`diasRestantes`) y no de un "7 días" fijo: el server
 * reutiliza el link vigente si hay uno, así que puede quedarle menos, y la duración de los links nuevos
 * se configura en Usuarios → Link.
 *
 * NO espera a que se cierre el aviso: devuelve apenas copió. Quienes la llaman apagan su spinner en el
 * `finally`, y si esto esperara al "Entendido" el botón quedaría girando detrás del aviso.
 */
export const copiarMiLinkDeRegistro = async (despues = "Mandáselo a quienes tengan que registrarse: por WhatsApp, por mail o como te quede cómodo."): Promise<void> => {
  let link;
  try {
    link = await registroLinksAPI.miLink();
  } catch (e: any) {
    sweetAlert.error("No se pudo generar el link", e?.response?.data?.error || "Probá de nuevo en un momento.");
    return;
  }

  const url = buildRegistroUrl(link.token);
  const dias = link.diasRestantes === 1 ? "1 día" : `${link.diasRestantes} días`;
  const copiado = await copiarAlPortapapeles(url);

  const html = `
    <div style="text-align:left" class="space-y-3 text-sm text-slate-600 dark:text-slate-300">
      <p>Es un link para que las personas <strong>se registren solas</strong> en la plataforma. Vence el <strong>${fecha(link.expiresAt)}</strong> (quedan ${dias}).</p>
      ${
        copiado
          ? `<p>Ya está <strong>copiado en tu portapapeles</strong>: pegalo y mandáselo a tus contactos.</p>`
          : `<p><strong>No se pudo copiar solo.</strong> Tocá "Copiar link" o seleccioná el link de abajo y copialo a mano.</p>`
      }
      <p>${escaparHtml(despues)}</p>
      <div style="user-select:all;-webkit-user-select:all;word-break:break-all" class="rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 font-mono text-xs text-green-700 dark:text-green-300">${escaparHtml(url)}</div>
    </div>`;

  void sweetAlert.persistente({
    icon: copiado ? "success" : "warning",
    title: copiado ? "Tu link de registro está copiado" : "Copiá tu link de registro",
    html,
    confirmButtonText: "Entendido",
    denyButtonText: copiado ? "Copiar de nuevo" : "Copiar link",
    onDeny: () => copiarAlPortapapeles(url),
  });
};
