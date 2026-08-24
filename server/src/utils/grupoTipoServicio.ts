/**
 * A qué Grupo de Tipo de Servicio pertenece un código de ARCA.
 *
 * LA REGLA
 *
 *   código < 500   → grupo "1" · CONTINUOS      (238 de los 293)
 *   código ≥ 500   → grupo "2" · DISCONTINUOS   (55)
 *
 * Verificada contra el filtro del propio Simplificación Registral sobre los 293 tipos, sin
 * excepciones. Los 55 del grupo 2 son 500–550 consecutivos más 557, 558, 559 y 560.
 *
 * POR QUÉ EL CÓDIGO MANDA Y EL CAMPO `grupo` NO
 *
 * `arca-tipos-servicio.grupo` existe para poder filtrar y mostrar sin recalcular en cada render — es
 * dato REDUNDANTE, derivado de `externalId`. Sirve para leer; no sirve para decidir. Un `grupo` que
 * llega en un request es solo lo que el cliente creía, y creerle es guardar una combinación que ARCA
 * después rechaza. Por eso al escribir se deriva del código y se compara.
 *
 * El grupo NO viaja en el TXT: el registro de 130 posiciones no le reserva ninguna. Lo que viaja son
 * las posiciones 107-109 con el tipo de servicio. El grupo está para que elegir ese tipo entre 293
 * opciones —49 nombres aparecen repetidos— no sea adivinar.
 */

/** El primer código del grupo DISCONTINUOS. Todo lo que esté por debajo es CONTINUOS. */
export const PRIMER_CODIGO_DISCONTINUO = 500;

export const GRUPO_CONTINUOS = "1";
export const GRUPO_DISCONTINUOS = "2";

export type GrupoTipoServicio = typeof GRUPO_CONTINUOS | typeof GRUPO_DISCONTINUOS;

/**
 * El grupo que le corresponde a un código de tipo de servicio.
 *
 * `""` cuando no hay código con qué decidir. NO se asume ningún grupo por defecto: elegir mal acá es
 * escribir otro número en las posiciones 107-109, que es un dato del alta y no una preferencia.
 */
export function grupoDeTipoServicio(codigo: unknown): GrupoTipoServicio | "" {
  const digitos = String(codigo ?? "").replace(/\D/g, "");
  if (digitos === "") return "";
  const n = Number(digitos);
  if (!Number.isFinite(n)) return "";
  return n < PRIMER_CODIGO_DISCONTINUO ? GRUPO_CONTINUOS : GRUPO_DISCONTINUOS;
}

/** ¿Ese tipo de servicio pertenece a ese grupo? Sin código o sin grupo, no hay nada que contradecir. */
export function tipoPerteneceAlGrupo(codigoTipo: unknown, grupo: unknown): boolean {
  const esperado = grupoDeTipoServicio(codigoTipo);
  const declarado = String(grupo ?? "").trim();
  if (!esperado || !declarado) return true;
  return esperado === declarado;
}
