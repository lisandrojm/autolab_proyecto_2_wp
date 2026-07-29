/**
 * Vigencia de contratos: mismo criterio que usa el front (`frontend/src/utils/contratoVigencia.ts`).
 *
 * Un contrato de TIEMPO INDETERMINADO se guarda con `fecha_baja_contrato` vacía, así que la
 * ausencia de fecha de baja es lo que lo identifica como vigente. El punto importante es CUÁL
 * contrato se evalúa: tomar siempre el último del array daba NO VIGENTE a quien tenía un
 * indeterminado abierto seguido de un contrato viejo ya vencido.
 *
 * El flag `esTiempoIndeterminado` del tipo de contrato no se usa acá: si un contrato indeterminado
 * tiene fecha de baja cargada, esa baja es real y se respeta.
 */

export interface ContratoVigenciaLike {
  fecha_alta_contrato?: string;
  fecha_baja_contrato?: string;
  [key: string]: any;
}

/** "Hoy" en hora de Argentina (el VPS puede correr en UTC), como "YYYY-MM-DD". */
export function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}

/**
 * Normaliza "YYYY-MM-DD...", "DD/MM/YYYY" y "DD-MM-YYYY" a "YYYY-MM-DD". "" si no se puede.
 * OJO: en la base hay contratos con la fecha de baja guardada como el STRING "null" (no el valor
 * null), así que hay que tratarla explícitamente como vacía: un `if (!baja)` la daría por válida.
 */
export function fechaISO(valor?: string | null): string {
  if (!valor) return "";
  const texto = String(valor).trim();
  if (!texto || ["null", "undefined", "-", "—"].includes(texto.toLowerCase())) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.substring(0, 10);
  const partes = texto.split(/[-/]/);
  if (partes.length === 3 && partes[2].length === 4) {
    return `${partes[2]}-${partes[1].padStart(2, "0")}-${partes[0].padStart(2, "0")}`;
  }
  return "";
}

/** Vigente = sin fecha de baja (tiempo indeterminado) o con baja de hoy en adelante. */
export function esContratoVigente(contrato: ContratoVigenciaLike | null | undefined, hoy: string = hoyArgentina()): boolean {
  if (!contrato) return false;
  const baja = fechaISO(contrato.fecha_baja_contrato);
  return !baja || baja >= hoy;
}

/** Igual que `esContratoVigente`, recibiendo solo la fecha de baja. */
export function esFechaBajaVigente(fechaBaja: string | null | undefined, hoy: string = hoyArgentina()): boolean {
  const baja = fechaISO(fechaBaja);
  return !baja || baja >= hoy;
}

/**
 * Contrato que representa la situación actual: el más reciente de los VIGENTES y, si no hay
 * ninguno vigente, el último cargado (para seguir mostrando el histórico).
 */
export function getContratoActivo<T extends ContratoVigenciaLike>(contratos: T[] | null | undefined, hoy: string = hoyArgentina()): T | null {
  if (!Array.isArray(contratos) || contratos.length === 0) return null;

  const vigentes = contratos.filter((c) => esContratoVigente(c, hoy));
  if (vigentes.length === 0) return contratos[contratos.length - 1]!;

  return vigentes.reduce((mejor, actual) => (fechaISO(actual.fecha_alta_contrato) >= fechaISO(mejor.fecha_alta_contrato) ? actual : mejor));
}
