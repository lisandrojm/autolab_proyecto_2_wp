/**
 * LA MODALIDAD DE UNA RELACIÓN, COMO LA DECLARA ARCA (22/11/2026).
 *
 * El espejo de Relaciones Laborales trae la modalidad de contratación como TEXTO («A tiempo completo
 * indeterminado/Trabajo permanente», «LRT(Direc.SA, Municip.Org.cent.y descent…»), no como código. Acá vive lo que
 * Bajas ARCA y el panel leen de ese texto, para que la lista y el panel no difieran:
 *
 *   · `advertenciaDeModalidad`: las relaciones declaradas con la modalidad de directores (LRT) llevan una
 *     advertencia visible en la fila y en el panel. No frena nada: es para que alguien confirme antes de dar de baja.
 *   · `tipoDeRelacion`: el tipo por el que se filtra y se ordena la lista. Con contrato en WeProdu manda el tipo de
 *     WeProdu (una «Jornada» está declarada en ARCA como plazo fijo: se la quiere ver como jornada). Sin contrato,
 *     la modalidad que declara ARCA.
 */

export const ADVERTENCIA_DIRECTORES_LRT = "Modalidad de directores (LRT): confirmar antes de dar de baja";

/** «LRT(Direc.SA, Municip.Org.cent.y descent.Emp.Mixta,docent.priv.opúbl.de jurisd.incorp. o no al SIJP». */
export const esModalidadDirectoresLrt = (modalidad: unknown): boolean => /^\s*LRT\b/i.test(String(modalidad ?? ""));

/** La advertencia que lleva una relación por su modalidad en ARCA ("" si ninguna). */
export const advertenciaDeModalidad = (modalidad: unknown): string => (esModalidadDirectoresLrt(modalidad) ? ADVERTENCIA_DIRECTORES_LRT : "");

export const TIPO_INDETERMINADO = "Indeterminado";
export const TIPO_PLAZO_FIJO = "Plazo fijo";
export const TIPO_JORNADA = "Jornada";
export const TIPO_DIRECTORES_LRT = "Directores (LRT)";
/** En este orden van en el filtro; lo que no entre en ninguno se agrega al final con su nombre. */
export const TIPOS_DE_RELACION = [TIPO_INDETERMINADO, TIPO_PLAZO_FIJO, TIPO_JORNADA, TIPO_DIRECTORES_LRT];

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** El tipo de un contrato de WeProdu por su nombre («Tiempo Indeterminado», «Plazo fijo 6x6», «Jornada 2030 S.R.L.»). */
export function tipoDeContratoWeprodu(nombre: string): string {
  const n = sinTildes(String(nombre || ""));
  if (/indeterminad/.test(n)) return TIPO_INDETERMINADO;
  if (/jornada|jornal/.test(n)) return TIPO_JORNADA;
  if (/plazo/.test(n)) return TIPO_PLAZO_FIJO;
  return String(nombre || "").trim() || "Sin tipo";
}

/** El tipo de una relación por la modalidad que declara ARCA. «Indeterminado» se mira antes: contiene «determinado». */
export function tipoDeModalidadArca(modalidad: string): string {
  if (esModalidadDirectoresLrt(modalidad)) return TIPO_DIRECTORES_LRT;
  const n = sinTildes(String(modalidad || ""));
  if (/indeterminad/.test(n)) return TIPO_INDETERMINADO;
  if (/plazo fijo|determinad/.test(n)) return TIPO_PLAZO_FIJO;
  return String(modalidad || "").trim() || "Sin modalidad";
}

/**
 * El tipo de la relación para la lista. `contratos` son los nombres de los contratos de WeProdu de la relación
 * (ninguno, uno, o varios cuando está repetida); si entre varios hay más de un tipo, van todos («A + B»).
 */
export function tipoDeRelacion(contratos: string[], modalidadArca: string): string {
  const tipos = [...new Set(contratos.map(tipoDeContratoWeprodu))];
  return tipos.length ? tipos.join(" + ") : tipoDeModalidadArca(modalidadArca);
}
