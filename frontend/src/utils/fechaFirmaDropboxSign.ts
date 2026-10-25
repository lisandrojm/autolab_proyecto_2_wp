/**
 * LA HORA DE LA FIRMA ESTÁ EN EL NOMBRE DEL ARCHIVO FIRMADO.
 *
 * Cuando Dropbox Sign deposita el PDF firmado en «Requested signatures» le pega al nombre el título
 * del envío y un instante: «…_ID-000003.pdf_ Firma solicit Wed, 07 Oct 2026 19h07m43s.pdf». Ese
 * instante es el momento en que se completó la firma, y está en UTC: medido el 25/10/2026 contra la
 * casilla, cae entre 8 y 10 segundos después de la llegada del mail «Fulano firmó …» de ese mismo
 * documento (el PDF se genera cuando se firma). Por eso se parsea como UTC y se muestra en hora
 * argentina, con zona fija: la hora de quien mira no tiene que ver con la hora en que se firmó.
 *
 * La fecha del archivo en Dropbox (`serverModified`) es OTRA cosa: cuándo entró a la carpeta. Con la
 * integración cortada y después rescatado, el archivo entra días después de firmado (11/10 para
 * firmas del 6 y 7/10). Mostrar las dos es lo que deja entender qué pasó con cada documento.
 */

const MESES: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/** «Wed, 07 Oct 2026 19h07m43s» en cualquier parte del nombre; el día de la semana es opcional. */
const SELLO = /(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*)?(\d{2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(\d{2})h(\d{2})m(\d{2})s/;

/** El instante de la firma que Dropbox Sign escribió en el nombre, o null si el nombre no lo trae. */
export function fechaFirmaDeNombre(nombre: string): Date | null {
  const m = SELLO.exec(String(nombre || ""));
  if (!m) return null;
  const [, dia, mes, anio, hh, mm, ss] = m;
  const d = new Date(Date.UTC(Number(anio), MESES[mes], Number(dia), Number(hh), Number(mm), Number(ss)));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const ZONA_AR = "America/Argentina/Buenos_Aires";

/** `07/10/2026 16:07`, en horario argentino y 24 h. Vacío si no hay fecha. */
export function formatearFechaFirma(d: Date | null): string {
  if (!d) return "";
  const fecha = d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA_AR });
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA_AR });
  return `${fecha} ${hora}`;
}
