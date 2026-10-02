/**
 * Código compartido server ↔ frontend: puro, sin imports (ver `jornadas.ts`).
 *
 * EL PADRÓN A VECES MANDA EL NOMBRE ENTERO EN UN SOLO CAMPO: para bastantes personas físicas viene
 * `apellido: "PUELLES SOFIA"` y `nombre` vacío. No es una persona jurídica (esa trae `tipoPersona:
 * "JURIDICA"` y `razonSocial`): es la misma persona con el nombre sin partir.
 */

/** ¿Es una persona jurídica? Lo dice `tipoPersona`; sin él, que no venga ni nombre ni apellido. */
export const esPersonaJuridica = (r: { tipoPersona?: string; nombre?: string; apellido?: string }): boolean =>
  String(r.tipoPersona || "").toUpperCase() === "JURIDICA" || (!r.nombre && !r.apellido);

/** El nombre entero cuando ARCA lo mandó en una sola parte; `null` si vino partido. */
export const nombreSinPartir = (r: { nombre?: string; apellido?: string }): string | null => (r.nombre && r.apellido ? null : String(r.apellido || r.nombre || "").trim() || null);

const palabras = (x: string) =>
  String(x || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

/** Las mismas palabras, sin importar orden, mayúsculas ni acentos (mismo criterio que `mismoNombre`). */
export const mismasPalabras = (a: string, b: string): boolean => palabras(a).length > 0 && palabras(a) === palabras(b);

/** Sugerencia para prellenar: ARCA arma APELLIDO + NOMBRES, así que la primera palabra es el apellido. */
export const sugerirParticion = (entero: string): { nombre: string; apellido: string } => {
  const p = entero.split(/\s+/).filter(Boolean);
  return p.length < 2 ? { nombre: "", apellido: entero } : { apellido: p[0], nombre: p.slice(1).join(" ") };
};
