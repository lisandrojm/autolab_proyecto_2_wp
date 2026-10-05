/**
 * Código compartido server ↔ frontend: puro, sin imports (ver `jornadas.ts`).
 *
 * EL PADRÓN A VECES MANDA EL NOMBRE ENTERO EN UN SOLO CAMPO: para bastantes personas físicas viene
 * `apellido: "PUELLES SOFIA"` y `nombre` vacío. No es una persona jurídica (esa trae `tipoPersona:
 * "JURIDICA"` y `razonSocial`): es la misma persona con el nombre sin partir.
 */
/** ¿Es una persona jurídica? Lo dice `tipoPersona`; sin él, que no venga ni nombre ni apellido. */
export declare const esPersonaJuridica: (r: {
    tipoPersona?: string;
    nombre?: string;
    apellido?: string;
}) => boolean;
/** El nombre entero cuando ARCA lo mandó en una sola parte; `null` si vino partido. */
export declare const nombreSinPartir: (r: {
    nombre?: string;
    apellido?: string;
}) => string | null;
/** Las mismas palabras, sin importar orden, mayúsculas ni acentos (mismo criterio que `mismoNombre`). */
export declare const mismasPalabras: (a: string, b: string) => boolean;
/** Sugerencia para prellenar: ARCA arma APELLIDO + NOMBRES, así que la primera palabra es el apellido. */
export declare const sugerirParticion: (entero: string) => {
    nombre: string;
    apellido: string;
};
