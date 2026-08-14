/**
 * Formateo de CUIT/CUIL para mostrar: 20123456783 -> "20-12345678-3".
 *
 * Si el valor guardado no tiene 11 dígitos se devuelve tal cual en vez de vacío: en un listado es
 * preferible ver el dato mal cargado (y poder corregirlo) que ver la celda en blanco. Ojo: esto es
 * distinto de `fmtCuit` en `components/contratos/ConstanciaBulk.tsx`, que devuelve "" a propósito
 * porque ahí el vacío significa "no hay CUIT usable para consultar ARCA".
 */
export const formatCuit = (raw?: string | null): string => {
  const valor = String(raw || "").trim();
  if (!valor) return "";
  const d = valor.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : valor;
};

/** Prefijos que usa ARCA: 20/23/24/25/26/27 personas físicas, 30/33/34 jurídicas. */
const PREFIJOS_CUIT = ["20", "23", "24", "25", "26", "27", "30", "33", "34"];

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
