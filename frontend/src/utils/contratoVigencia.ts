/**
 * Vigencia de contratos: criterio único para toda la plataforma (desk y mobile).
 *
 * Un contrato de TIEMPO INDETERMINADO se guarda con `fecha_baja_contrato` vacía (el wizard la
 * fuerza cuando el tipo de contrato tiene tildado "Es tiempo indeterminado"), así que la ausencia
 * de fecha de baja es justamente lo que lo identifica como vigente.
 *
 * El bug que corrige este módulo NO estaba en cómo se evalúa la vigencia, sino en CUÁL contrato se
 * evaluaba: se tomaba siempre el último del array, y si después del indeterminado quedaba cargado
 * un contrato viejo ya vencido, la persona figuraba como NO VIGENTE teniendo un contrato abierto.
 *
 * Nota sobre el flag `esTiempoIndeterminado` del tipo de contrato: no se usa para forzar la
 * vigencia. Si un contrato indeterminado tiene fecha de baja cargada, esa baja es real (es la
 * forma de dar de baja a alguien) y hay que respetarla; el flag solo sirve, al guardar, para dejar
 * la fecha de baja vacía.
 */

export interface ContratoVigenciaLike {
  fecha_alta_contrato?: string;
  fecha_baja_contrato?: string;
  [key: string]: any;
}

/** Fecha de hoy (local) como "YYYY-MM-DD", para comparar contra las fechas ISO de los contratos. */
const hoyISO = (): string => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/**
 * Normaliza "YYYY-MM-DD...", "DD/MM/YYYY" y "DD-MM-YYYY" a "YYYY-MM-DD". "" si no se puede.
 * OJO: en la base hay contratos con la fecha de baja guardada como el STRING "null" (no el valor
 * null), así que hay que tratarla explícitamente como vacía: un `if (!baja)` la daría por válida.
 */
export const fechaISO = (valor?: string | null): string => {
  if (!valor) return "";
  const texto = String(valor).trim();
  if (!texto || ["null", "undefined", "-", "—"].includes(texto.toLowerCase())) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.substring(0, 10);
  const partes = texto.split(/[-/]/);
  if (partes.length === 3 && partes[2].length === 4) {
    return `${partes[2]}-${partes[1].padStart(2, "0")}-${partes[0].padStart(2, "0")}`;
  }
  const d = new Date(texto);
  if (isNaN(d.getTime())) return "";
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/** Vigente = sin fecha de baja (tiempo indeterminado) o con baja de hoy en adelante. */
export const esContratoVigente = (contrato?: ContratoVigenciaLike | null): boolean => {
  if (!contrato) return false;
  const baja = fechaISO(contrato.fecha_baja_contrato);
  return !baja || baja >= hoyISO();
};

/** Igual que `esContratoVigente` pero recibiendo solo la fecha (para datos ya desarmados). */
export const esFechaBajaVigente = (fechaBaja?: string | null): boolean => {
  const baja = fechaISO(fechaBaja);
  return !baja || baja >= hoyISO();
};

/** Un contrato es de tiempo indeterminado cuando no tiene fecha de baja: no vence. */
export const esTiempoIndeterminado = (contrato?: ContratoVigenciaLike | null): boolean => !!contrato && !fechaISO(contrato.fecha_baja_contrato);

/**
 * Clave de antigüedad de un contrato: fecha de alta y, para desempatar, cuándo se cargó.
 * Se ordena por fecha y NO por la posición en el array, porque según la pantalla los contratos
 * llegan en orden natural o invertido (el modal los muestra del más nuevo al más viejo).
 */
const claveAntiguedad = (contrato: ContratoVigenciaLike): string => `${fechaISO(contrato.fecha_alta_contrato)}|${String(contrato.fecha_carga || "")}`;

/**
 * Contrato que representa la situación actual de la persona en el proyecto, por orden de prioridad:
 *
 *  1. TIEMPO INDETERMINADO: si tiene uno (sin fecha de baja) ese es el que rige, aunque después
 *     figuren cargados contratos a plazo. Un contrato sin fecha de fin sigue abierto.
 *  2. Si no hay indeterminado, el vigente más reciente.
 *  3. Si no hay ninguno vigente, el más reciente de todos, para mostrar el histórico con su NO VIGENTE.
 */
export const getContratoActivo = <T extends ContratoVigenciaLike>(contratos?: T[] | null): T | null => {
  if (!Array.isArray(contratos) || contratos.length === 0) return null;

  const masReciente = (lista: T[]) => lista.reduce((mejor, actual) => (claveAntiguedad(actual) >= claveAntiguedad(mejor) ? actual : mejor));

  const indeterminados = contratos.filter((c) => esTiempoIndeterminado(c));
  if (indeterminados.length > 0) return masReciente(indeterminados);

  const vigentes = contratos.filter((c) => esContratoVigente(c));
  if (vigentes.length > 0) return masReciente(vigentes);

  return masReciente(contratos);
};
