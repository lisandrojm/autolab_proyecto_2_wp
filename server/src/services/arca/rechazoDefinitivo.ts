/**
 * UN RECHAZO DE ARCA QUE NO CAMBIA POR VOLVER A PRESENTAR. La presentación automática reintentaba
 * cada día a la misma persona con el mismo motivo —«El CUIL ya posee una relación laboral activa»—,
 * que es un hecho del padrón de ARCA y no un error de la corrida: hasta que esa relación no se dé de
 * baja, cada intento va a terminar igual. Estos se dejan listados con su motivo para que alguien los
 * revise; «Forzar» sigue permitiendo presentarlos a mano.
 *
 * Sólo se consideran definitivos los motivos que lo son por texto. Un rechazo sin motivo (ARCA no
 * contestó, timeout, sesión caída) o por un dato corregible (categoría, remuneración, fecha) se sigue
 * reintentando: puede haberse arreglado desde ayer.
 */
const MOTIVOS_DEFINITIVOS = [
  /ya\s+posee\s+una\s+relaci[oó]n\s+laboral\s+activa/i,
  /ya\s+tiene\s+un\s+alta\s+activa/i,
  /relaci[oó]n\s+laboral\s+activa\s+con\s+(este|el)\s+empleador/i,
];

export function esRechazoDefinitivo(motivo: unknown): boolean {
  const texto = String(motivo || "");
  return MOTIVOS_DEFINITIVOS.some((re) => re.test(texto));
}
