/**
 * DOS TIPOS DE FECHA QUE NO SE FORMATEAN IGUAL, y por eso son dos funciones y no una con opciones.
 *
 * **Un instante** pasó en un momento exacto del tiempo: `ultimaRevision` es «la revisión corrió a las
 * 09:14». Se guarda en UTC y se muestra convertido a la hora de quien mira. Convertirlo es correcto.
 *
 * **Una fecha de calendario** no es un momento: «la escala rige desde el 1 de julio» es el 1 de julio
 * en cualquier huso, y no tiene hora. Si se la trata como instante, `new Date("2026-07-01")` la lee
 * como medianoche UTC y en Argentina (UTC-3) eso cae el **30 de junio a las 21:00** — así que la
 * pantalla muestra `30/6`. Ese es el bug de la escala que aparece un día antes, y no se arregla
 * sumándole horas: se arregla NO CONVIRTIENDO lo que no es un instante.
 *
 * Una sola función con dos formatos no alcanzaría, porque la diferencia no está en cómo se imprime
 * sino en si se convierte de huso o no. Dos nombres obligan a decidir cuál es cada dato.
 */

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/**
 * Un INSTANTE, en hora local y 24 h: `30/8/2026 09:14`.
 *
 * Con revisión diaria, el día solo no responde «¿esto corrió hoy temprano o quedó de ayer?».
 */
export const formatearInstante = (valor?: string | Date | null): string => {
  if (!valor) return '—';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
};

/**
 * Una FECHA DE CALENDARIO: `1/7/2026`. Sin hora y SIN conversión de huso.
 *
 * El caso normal es un string `"2026-07-01"`, y ahí no se construye ningún `Date`: se parte el texto.
 * No es una optimización — es la única forma de que el resultado no dependa del huso de quien mira.
 *
 * Si llega un `Date` (los documentos viejos guardaban estas fechas como tal, escritas a medianoche
 * UTC) se leen sus componentes **en UTC**, que es donde está el día que se quiso escribir. Usar los
 * getters locales lo correría un día para cualquiera al oeste de Greenwich.
 */
export const formatearFechaCalendario = (valor?: string | Date | null): string => {
  if (!valor) return '—';

  if (typeof valor === 'string') {
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
    // Formatos raros (ya en dd/mm/aaaa, o texto libre): se devuelven tal cual antes que arriesgar
    // una interpretación. Mostrar el dato crudo es peor que mostrarlo lindo, pero mucho mejor que
    // mostrar otro día.
    return valor;
  }

  if (Number.isNaN(valor.getTime())) return String(valor);
  return `${valor.getUTCDate()}/${valor.getUTCMonth() + 1}/${valor.getUTCFullYear()}`;
};
