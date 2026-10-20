/**
 * EL CBU: 22 DÍGITOS, NADA MÁS QUE DÍGITOS.
 *
 * La regla vive acá y no repetida en cada formulario porque se pide en TRES lugares —«Nuevo Usuario»,
 * «Editar Usuario» y el link de registro— y son el mismo dato. Con la cuenta escrita tres veces, el
 * día que uno acepte 21 o admita un guion, ese formulario carga un CBU con el que después no se puede
 * transferir, y el error aparece recién en el banco.
 *
 * SIN GUIONES, Y NO ES UNA PREFERENCIA DE ESTILO. El CBU es un número de 22 posiciones con dígitos
 * verificadores adentro; los guiones que a veces se muestran son separadores visuales del resumen o
 * del homebanking, no parte del dato. Guardado con guiones deja de tener 22 caracteres y cualquier
 * validación por largo —la de acá y la del otro lado— lo rechaza. Por eso se limpian al escribir en
 * vez de avisar después: quien lo pega del homebanking no tiene por qué saber esto.
 */

/** Un CBU argentino tiene exactamente esta cantidad de dígitos. */
export const CBU_DIGITOS = 22;

/**
 * Deja SOLO dígitos y corta en 22.
 *
 * Se aplica en el `onChange`, así que pegar «0170 0999 2000 0012 3456 78» del homebanking entra
 * limpio y del tirón. Cortar en el tope y no dejar seguir escribiendo es a propósito: un campo que
 * acepta 25 y avisa al guardar hace tipear tres dígitos que nunca iban a servir.
 */
export const soloDigitosCbu = (valor: string): string => String(valor || "").replace(/\D/g, "").slice(0, CBU_DIGITOS);

/** Cuántos faltan para los 22. `0` = completo. */
export const faltanDigitosCbu = (valor: string): number => Math.max(0, CBU_DIGITOS - soloDigitosCbu(valor).length);

/**
 * Está empezado pero incompleto. Vacío NO cuenta como incompleto.
 *
 * La distinción es la que decide si se puede guardar: un CBU vacío es «todavía no lo tengo», que es
 * un estado válido —se completa cuando la persona lo manda—; uno de 18 dígitos es un dato roto que
 * parece cargado. Lo primero se deja pasar, lo segundo no.
 */
export const cbuIncompleto = (valor: string): boolean => {
  const limpio = soloDigitosCbu(valor);
  return limpio.length > 0 && limpio.length < CBU_DIGITOS;
};

/**
 * El contador que se muestra debajo del campo, siempre.
 *
 * Dice los dos números —cuántos van y cuántos faltan— desde el primer dígito, y no solo cuando algo
 * está mal: contar 22 caracteres a ojo en la pantalla es exactamente lo que nadie va a hacer, y es
 * cuando se cuela un CBU de 21.
 */
export const contadorCbu = (valor: string): string => {
  const puestos = soloDigitosCbu(valor).length;
  const faltan = CBU_DIGITOS - puestos;
  if (puestos === 0) return `${CBU_DIGITOS} dígitos, sin guiones.`;
  if (faltan > 0) return `${puestos} de ${CBU_DIGITOS} · falta${faltan === 1 ? "" : "n"} ${faltan}.`;
  return `${CBU_DIGITOS} de ${CBU_DIGITOS} ✓`;
};

/**
 * ¿Los dos dígitos verificadores cierran? (algoritmo del BCRA: bloque de 8 con pesos 7-1-3-9 y
 * bloque de 14 con pesos 3-9-7-1). Sólo con los 22 dígitos.
 */
export const cbuValido = (valor: string): boolean => {
  const d = soloDigitosCbu(valor);
  if (d.length !== CBU_DIGITOS) return false;
  const verifica = (bloque: string, pesos: number[]) => {
    const suma = pesos.reduce((t, p, i) => t + Number(bloque[i]) * p, 0);
    return (10 - (suma % 10)) % 10 === Number(bloque[pesos.length]);
  };
  return verifica(d.slice(0, 8), [7, 1, 3, 9, 7, 1, 3]) && verifica(d.slice(8), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]);
};

/**
 * EL CVU DE UNA BILLETERA, CON LOS CEROS DEL PRINCIPIO.
 *
 * El CVU tiene 22 dígitos como el CBU, pero los de las billeteras empiezan con seis ceros
 * («0000003100…» en Mercado Pago) y la gente lo copia sin ellos: 16 dígitos que nunca llegan a 22.
 * Si al completarlo con ceros adelante los verificadores cierran, era eso y se completa; si no, se deja
 * como está (es un número mal copiado, no un CVU sin ceros). Con menos de 14 dígitos, o todo ceros, no
 * se intenta: «0» con 21 ceros adelante cierra los verificadores y no es la cuenta de nadie.
 */
export const completarCvu = (valor: string): string => {
  const d = soloDigitosCbu(valor);
  if (d.length < 14 || d.length >= CBU_DIGITOS || !/[1-9]/.test(d)) return d;
  const completo = d.padStart(CBU_DIGITOS, "0");
  return cbuValido(completo) ? completo : d;
};
