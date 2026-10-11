/* Validación de CUIT/CUIL sin dependencias: la usan la pantalla y el generador del registro de alta (también en el servidor). */
export const PREFIJOS_CUIT = ["20", "23", "24", "25", "26", "27", "30", "33", "34"];

/**
 * ¿El CUIT/CUIL es realmente uno? Tener 11 dígitos no alcanza: había personas cargadas con
 * `00000000000`, que pasaban como "completo" y se mandaban igual a consultar al Padrón, donde ARCA
 * devolvía error. Se valida prefijo + dígito verificador (módulo 11), que además atrapa tipeos.
 *
 * Vive acá (y no en un componente) porque lo usan tanto la UI como el chequeo de completitud y el
 * generador del TXT, que son módulos sin React.
 */
export const cuitEsValido = (raw?: string): boolean => {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length !== 11) return false;
  if (!PREFIJOS_CUIT.includes(d.slice(0, 2))) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // 00000000000, 11111111111, etc.
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return verificador === Number(d[10]);
};
