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
export declare const ADVERTENCIA_DIRECTORES_LRT = "Modalidad de directores (LRT): confirmar antes de dar de baja";
/** «LRT(Direc.SA, Municip.Org.cent.y descent.Emp.Mixta,docent.priv.opúbl.de jurisd.incorp. o no al SIJP». */
export declare const esModalidadDirectoresLrt: (modalidad: unknown) => boolean;
/** La advertencia que lleva una relación por su modalidad en ARCA ("" si ninguna). */
export declare const advertenciaDeModalidad: (modalidad: unknown) => string;
export declare const TIPO_INDETERMINADO = "Indeterminado";
export declare const TIPO_PLAZO_FIJO = "Plazo fijo";
export declare const TIPO_JORNADA = "Jornada";
export declare const TIPO_DIRECTORES_LRT = "Directores (LRT)";
/** En este orden van en el filtro; lo que no entre en ninguno se agrega al final con su nombre. */
export declare const TIPOS_DE_RELACION: string[];
/** El tipo de un contrato de WeProdu por su nombre («Tiempo Indeterminado», «Plazo fijo 6x6», «Jornada 2030 S.R.L.»). */
export declare function tipoDeContratoWeprodu(nombre: string): string;
/** El tipo de una relación por la modalidad que declara ARCA. «Indeterminado» se mira antes: contiene «determinado». */
export declare function tipoDeModalidadArca(modalidad: string): string;
/**
 * El tipo de la relación para la lista. `contratos` son los nombres de los contratos de WeProdu de la relación
 * (ninguno, uno, o varios cuando está repetida); si entre varios hay más de un tipo, van todos («A + B»).
 */
export declare function tipoDeRelacion(contratos: string[], modalidadArca: string): string;
