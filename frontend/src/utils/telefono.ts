/**
 * EL CELULAR, VALIDADO POR CANTIDAD DE DÍGITOS.
 *
 * Es el espejo de `server/src/utils/telefono.ts`: la misma regla en los dos lados, o un número se acepta
 * en el formulario y lo rechaza el server (o al revés). NO se toca una sin la otra.
 *
 * Un celular argentino tiene 10 dígitos nacionales: el código de área SIN el 0 y el número SIN el 15
 * (11 1234-5678, 351 123-4567, 2966 12-3456). Cómo se escriba no importa —espacios, guiones, paréntesis—,
 * y se aceptan los prefijos con los que la gente lo copia de WhatsApp o de la agenda:
 *
 *   +54 9 11 1234-5678   → el 54 del país y el 9 de los celulares se sacan
 *   011 1234-5678        → el 0 de larga distancia se saca
 *
 * Ningún código de área empieza con 5, 9 ni 0, así que sacar esos prefijos nunca se come un dígito real.
 * Lo que NO se puede corregir solo es el 15 metido después del código de área: los códigos tienen de 2 a 4
 * dígitos y no hay forma de saber dónde está sin una tabla. Por eso ese caso se explica en vez de adivinarse.
 */

export const CELULAR_DIGITOS = 10;

/** Deja sólo lo que puede ir en un teléfono. Las letras no llegan ni a escribirse. */
export const soloCaracteresDeTelefono = (texto: string): string => texto.replace(/[^\d\s()+-]/g, "").slice(0, 25);

/** Los dígitos nacionales: sin +54, sin el 9 de los celulares y sin el 0 de larga distancia. */
export const digitosNacionales = (texto: string): string => {
  let d = String(texto || "").replace(/\D/g, "");
  if (d.startsWith("54")) {
    d = d.slice(2);
    if (d.startsWith("9")) d = d.slice(1);
  }
  if (d.startsWith("0")) d = d.slice(1);
  return d;
};

export const celularValido = (texto: string): boolean => new RegExp(`^[1-9]\\d{${CELULAR_DIGITOS - 1}}$`).test(digitosNacionales(texto));

/**
 * Por qué no es un celular válido, en palabras de quien lo carga. `null` si está bien o si está vacío
 * (que sea obligatorio lo dice otra regla, y "falta el teléfono" es un mensaje distinto).
 */
export const motivoCelularInvalido = (texto: string): string | null => {
  const d = digitosNacionales(texto);
  if (!d || celularValido(texto)) return null;
  if (d.length < CELULAR_DIGITOS) {
    const faltan = CELULAR_DIGITOS - d.length;
    return `le ${faltan === 1 ? "falta 1 dígito" : `faltan ${faltan} dígitos`}: código de área sin 0 y número sin 15, 10 dígitos en total`;
  }
  const sobran = d.length - CELULAR_DIGITOS;
  return `tiene ${sobran === 1 ? "1 dígito" : `${sobran} dígitos`} de más: poné el código de área sin 0 y el número sin 15, 10 dígitos en total`;
};
