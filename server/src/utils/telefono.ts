/**
 * EL CELULAR, VALIDADO POR CANTIDAD DE DÍGITOS — del lado del server.
 *
 * Es el espejo de `frontend/src/utils/telefono.ts`. Existe porque el formulario sólo es la primera
 * puerta: el alta por link de registro es pública, y cualquiera puede mandar el POST sin pasar por él.
 * Sin esto se guardaba lo que llegara —letras incluidas— y el número roto aparecía recién cuando alguien
 * intentaba llamar. NO se toca una regla sin la otra.
 *
 * Un celular argentino son 10 dígitos nacionales (código de área sin 0 + número sin 15). Se aceptan los
 * prefijos +54, el 9 de los celulares y el 0 de larga distancia: ningún código de área empieza con 5, 9
 * ni 0, así que sacarlos nunca se come un dígito real.
 */

export const CELULAR_DIGITOS = 10;

export const digitosNacionales = (texto: string): string => {
  let d = String(texto || "").replace(/\D/g, "");
  if (d.startsWith("54")) {
    d = d.slice(2);
    if (d.startsWith("9")) d = d.slice(1);
  }
  if (d.startsWith("0")) d = d.slice(1);
  return d;
};

/** Válido si, además de los 10 dígitos, no trae nada que no pueda ir en un teléfono (letras, por ejemplo). */
export const celularValido = (texto: string): boolean => /^[\d\s()+-]+$/.test(String(texto || "")) && new RegExp(`^[1-9]\\d{${CELULAR_DIGITOS - 1}}$`).test(digitosNacionales(texto));
