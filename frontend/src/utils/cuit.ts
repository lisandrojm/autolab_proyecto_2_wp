/**
 * Formateo de CUIT/CUIL para mostrar: 20123456783 -> "20-12345678-3".
 *
 * Si el valor guardado no tiene 11 dígitos se devuelve tal cual en vez de vacío: en un listado es
 * preferible ver el dato mal cargado (y poder corregirlo) que ver la celda en blanco. Ojo: esto es
 * distinto de `fmtCuit` en `components/contratos/ConstanciaBulk.tsx`, que devuelve "" a propósito
 * porque ahí el vacío significa "no hay CUIT usable para consultar AFIP".
 */
export const formatCuit = (raw?: string | null): string => {
  const valor = String(raw || "").trim();
  if (!valor) return "";
  const d = valor.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : valor;
};
