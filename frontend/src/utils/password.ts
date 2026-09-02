/**
 * Generador de contraseñas para el alta de usuarios.
 *
 * USA `crypto.getRandomValues`, NO `Math.random`. `Math.random` no es criptográficamente seguro: su
 * secuencia es predecible a partir de unas pocas salidas, y acá lo que se genera es la credencial con
 * la que alguien entra al sistema. Es una línea más y cierra el tema.
 *
 * SIN CARACTERES AMBIGUOS. Se excluyen `l 1 I | O 0 o` porque estas contraseñas se dictan por teléfono
 * o se copian de un mensaje: un cero y una O mayúscula son el mismo trazo en casi cualquier tipografía,
 * y el costo de esa confusión (alguien que no puede entrar y escribe pidiendo ayuda) es mucho más alto
 * que los pocos bits de entropía que se pierden.
 */
const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz";
const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const NUMEROS = "23456789";
const SIMBOLOS = "!@#$%&*?+-";
const TODOS = MINUSCULAS + MAYUSCULAS + NUMEROS + SIMBOLOS;

/** Un entero en [0, max) sin el sesgo del módulo: se descartan los valores del último tramo incompleto. */
const azar = (max: number): number => {
  const limite = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let v: number;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limite);
  return v % max;
};

/**
 * Una contraseña de `largo` caracteres con al menos uno de cada familia.
 *
 * La garantía importa: sorteando libremente, una de 14 caracteres puede salir sin ningún símbolo y ser
 * rechazada por una política de contraseñas. Se siembra uno de cada tipo, se completa al azar y se
 * mezcla con Fisher-Yates para que los sembrados no queden siempre en las mismas posiciones.
 */
export const generarPassword = (largo = 14): string => {
  const chars = [MINUSCULAS, MAYUSCULAS, NUMEROS, SIMBOLOS].map((set) => set[azar(set.length)]);
  while (chars.length < largo) chars.push(TODOS[azar(TODOS.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = azar(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};
