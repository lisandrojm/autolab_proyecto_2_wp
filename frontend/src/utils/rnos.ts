/**
 * Formatea un código RNOS de obra social con el formato oficial: `X-XXXX-X`.
 *
 * El "ID Externo" de las obras sociales siempre fue el RNOS, guardado como dígitos sueltos. Se
 * rellena a 6 con ceros a la izquierda porque así lo escribe el organismo, y así se puede cotejar
 * contra un padrón de un vistazo.
 *
 * Vive acá porque lo usan tres pantallas (el catálogo, la ficha de la empresa y el ABM de Empresas):
 * estaba copiado en dos y la tercera lo iba a copiar de nuevo.
 */
export const formatRnos = (raw?: string | null): string => {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const p = digits.padStart(6, "0").slice(-6);
  return `${p[0]}-${p.slice(1, 5)}-${p[5]}`;
};
