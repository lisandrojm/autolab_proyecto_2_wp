/**
 * ═══════════════════════════════════════════════════════════════════════
 * CÓDIGO COMPARTIDO SERVER ↔ FRONTEND (`server/src/compartido/`)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * El frontend importa este archivo tal cual (alias `@compartido` en `frontend/vite.config.ts` y
 * `frontend/tsconfig.json`): es la ÚNICA copia del cálculo de jornadas e importes, la que usan el alta
 * individual (en el navegador) y el alta masiva de plantillas de equipo (en el server). Por eso acá sólo
 * va código puro: nada de Node, Mongoose ni del DOM, y sin imports.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * LAS JORNADAS DE UNA SOLICITUD: DE DÓNDE SALEN Y CUÁNDO SE PUEDEN PISAR
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Cantidad de jornadas convivía con cuatro datos que determinan lo mismo —fecha de inicio, de fin, días
 * por semana y días marcados— sin que nada validara que cerraran entre sí: se podía mandar un período
 * de tres semanas con 8 jornadas y ningún día marcado. Ahora hay una jerarquía:
 *
 *   Días FIJOS     las jornadas se CALCULAN: cuántas veces caen los días marcados en el período.
 *                  Se pueden pisar sólo a propósito («Editar manualmente») y con motivo, porque el
 *                  calendario no siempre es la producción: se extiende un rodaje, se cae un día por
 *                  lluvia, se trabaja un feriado. Alguien audita después por qué la liquidación no
 *                  coincide con el calendario, y el motivo es la respuesta.
 *   Días ROTATIVOS no hay patrón semanal del cual derivarlas: se cargan a mano y son la fuente de
 *                  verdad, con tope en los días corridos del período.
 */
export type MotivoAjusteJornadas = "extension_rodaje" | "jornada_caida" | "feriado_trabajado" | "franco_trabajado" | "alta_baja_parcial" | "reemplazo_parcial" | "otro";
export declare const MOTIVOS_AJUSTE_JORNADAS: {
    valor: MotivoAjusteJornadas;
    label: string;
}[];
/** Con «Otro» el motivo ES el texto, así que tiene que decir algo. */
export declare const NOTA_MINIMA_OTRO = 10;
/**
 * EL PERÍODO CON EL QUE SE CUENTAN JORNADAS E IMPORTES.
 *
 * A plazo es el del contrato: desde → hasta. Uno de TIEMPO INDETERMINADO no tiene hasta, y sin período
 * no había jornadas ni meses: el importe por jornada quedaba en 0 y la diferencia diaria contra la
 * escala, negativa. Se toma entonces el MES CALENDARIO COMPLETO del alta: las jornadas son las de ese
 * mes, así que la jornada es el mensual ÷ sus días hábiles —la misma regla que un contrato a plazo de
 * un mes entero— y el total del contrato no existe.
 */
export declare const periodoDeCalculo: (desde: string | undefined, hasta: string | undefined, indeterminado: boolean) => {
    desde: string;
    hasta: string;
};
/** Cómo se explica el período de un contrato de tiempo indeterminado. `""` si no aplica. */
export declare const avisoIndeterminado: (desde: string | undefined, indeterminado: boolean) => string;
/** Días corridos del período, ambos extremos inclusive. `null` si falta una fecha o el fin es anterior. */
export declare const diasCorridos: (desde?: string, hasta?: string) => number | null;
/**
 * Cuántas veces caen los días de semana marcados dentro del período, ambos extremos inclusive.
 *
 * Es una cuenta exacta —no `semanas × días`, que en una semana cortada al medio erra— y no sabe de
 * feriados: para eso está el ajuste con motivo. `null` si no hay período válido o no hay días marcados.
 */
export declare const jornadasDelCalendario: (desde: string | undefined, hasta: string | undefined, dias: number[]) => number | null;
/**
 * LAS JORNADAS QUE DA EL CALENDARIO, según cómo se pide el contrato:
 *  - por DÍAS SUELTOS («Jornada»): los días marcados, uno por jornada. NO los días de la semana que
 *    caen en el período: «el martes 1 y el martes 15» son 2 jornadas, aunque entre los dos haya otro
 *    martes (así se contaba antes, y la solicitud salía con 3).
 *  - con días ROTATIVOS: no hay patrón del cual deducirlas (`null`: se cargan a mano).
 *  - por PERÍODO: los días de la semana marcados que caen en él (`jornadasDelCalendario`).
 *
 * SALVO QUE EL TIPO DE CONTRATO LAS FIJE (`jornadasDelTipo`, la «Cantidad de jornadas» de su ABM): un
 * plazo fijo son 30 aunque el calendario del mes dé 27. Ahí manda el tipo, con período o con días
 * rotativos. Con días sueltos no: cada día marcado es una jornada, y eso es lo que se paga.
 */
export declare const jornadasFijadasPorElTipo: (jornadasDelTipo: unknown, porDiasSueltos: boolean) => number | null;
export declare const jornadasCalculadasDelPedido: (p: {
    porDiasSueltos: boolean;
    fechas: string[];
    rotativos: boolean;
    desde: string;
    hasta: string;
    dias: number[];
    jornadasDelTipo?: unknown;
}) => number | null;
export interface DatosJornadas {
    desde: string;
    hasta: string;
    diasPorSemana: string;
    dias: number[];
    rotativos: boolean;
    jornadas: string;
    calculadas: number | null;
    ajustado: boolean;
    motivo: string;
    nota: string;
}
/** Un mensaje por campo; campo ausente = está bien. Se muestran debajo de cada uno, no en un alert. */
export interface ErroresJornadas {
    fechas?: string;
    diasPorSemana?: string;
    dias?: string;
    jornadas?: string;
    motivo?: string;
    nota?: string;
}
/** Hay diferencia real entre lo cargado a mano y el calendario. Sin diferencia no hay nada que justificar. */
export declare const hayAjuste: (d: Pick<DatosJornadas, "rotativos" | "ajustado" | "calculadas" | "jornadas">) => boolean;
/** Qué impide enviar. Vacío = se puede. */
export declare const erroresDeJornadas: (d: DatosJornadas) => ErroresJornadas;
/**
 * MESES EQUIVALENTES DEL PERÍODO: cuánto dura el contrato medido en meses, prorrateando cada mes que
 * toca por sus días hábiles.
 *
 *     Σ  jornadas del período en ese mes ÷ días hábiles de ese mes
 *
 * «Hábiles» son los días de la semana MARCADOS en el formulario, no un valor fijo: con Lu–Vi,
 * septiembre 2026 tiene 22 y febrero 2026 tiene 20. Por eso un mes calendario completo aporta
 * exactamente 1 y medio mes ~0,5, tenga los hábiles que tenga. Es lo que hace que un mes completo
 * totalice justo el importe mensual (ver `derivarImportes`).
 *
 * 0 si falta el período o no hay días marcados.
 *
 * DÍAS SUELTOS (`fechas`): las jornadas de cada mes son los días MARCADOS, no todos los días de la
 * semana que caen entre el primero y el último. «Viernes 2, 9 y 23» de octubre son 3 de los 5 viernes
 * del mes (0,6), no 4 de 5: contando el período, el mensual daba una jornada más cara que la real.
 */
export declare const mesesEquivalentes: (desde: string | undefined, hasta: string | undefined, dias: number[], fechas?: string[]) => number;
/** Qué importe quedó fijo: el último que se cargó entre mensual y total. Ver `derivarImportes`. */
export type AnclaImporte = {
    unidad: "mensual" | "total";
    valor: number;
};
export interface Importes {
    jornada: number | null;
    semana: number | null;
    mensual: number | null;
    total: number | null;
}
/**
 * LOS CUATRO IMPORTES A PARTIR DEL ANCLA. El mensual (o el total, si fue lo último que se editó) es lo
 * fijo; la jornada es la DERIVADA y varía según los días hábiles del período, que es lo correcto:
 *
 *     total   = mensual × mesesEquivalentes        (o mensual = total ÷ mesesEquivalentes)
 *     jornada = total ÷ jornadas del contrato
 *     semana  = jornada × días por semana
 *
 * Sin ancla (todavía no hay con qué calcular el mensual) se parte de la jornada. Nunca divide por 0:
 * lo que no se puede calcular queda en `null`. Todo con precisión completa; se redondea al mostrar.
 */
export declare const derivarImportes: (p: {
    ancla: AnclaImporte | null;
    jornada: number | null;
    mesesEq: number;
    jornadas: number;
    diasSemana: number;
}) => Importes;
/**
 * CUÁNTOS MESES DURA EL CONTRATO PARA LOS IMPORTES, con las jornadas del tipo de contrato.
 *
 * Si el tipo dice cuántas jornadas tiene un mes («Jornada»: 22), un mes son 22 jornadas: el contrato
 * dura `jornadas ÷ 22` meses, y con eso `derivarImportes` da mensual = jornada × 22 —que es la escala
 * mensual × el multiplicador, la misma base de `importePorJornada`—. Con los meses del calendario, un
 * día suelto contaba como un cuarto de mes y el mensual salía jornada × 4.
 *
 * Sin jornadas en el tipo, los meses del período de siempre (`mesesEquivalentes`).
 */
export declare const mesesParaImportes: (mesesEq: number, jornadas: number, jornadasDelTipo?: number | null) => number;
/** Editar la jornada deja como ancla el mensual que le corresponde. `null` si todavía no se puede calcular. */
export declare const anclaDesdeJornada: (jornada: number, jornadas: number, mesesEq: number) => AnclaImporte | null;
/** Lo que hace falta de la escala de una categoría para el importe por jornada. */
export interface EscalaParaJornada {
    sueldoBasico?: number | null;
    sueldoAdicional?: number | null;
    presentismo?: number | null;
    /** Respaldo: básico + adicional + presentismo, para las categorías que no traen los tres por separado. */
    sueldoBruto?: number | null;
}
/** Sin jornadas cargadas en el tipo de contrato, el mes se cuenta de 30 días. */
export declare const JORNADAS_DEL_MES_POR_DEFECTO = 30;
/**
 * EL IMPORTE POR JORNADA DE UNA CATEGORÍA, con el tipo de contrato:
 *
 *     (básico + adicional + presentismo) ÷ jornadas del tipo de contrato × multiplicador diario
 *
 * Con «Jornada» (22 jornadas, ×1,5) y el G10 del 634/11: (734.833,55 + 154.315,05 + 88.914,86)
 * ÷ 22 × 1,5 = 66.686,15. Antes era el NETO ÷ 30 × multiplicador (39.611,57 con esos números): no
 * usaba las jornadas del tipo y partía del neto en vez del bruto.
 *
 *   - Sin los tres componentes por separado se usa el bruto de la escala, que es su suma.
 *   - Sin jornadas en el tipo de contrato (0, vacío o ausente) se divide por 30.
 *   - Sin multiplicador (0, vacío o ausente) se usa 1: es «sin multiplicador», no «por cero».
 *
 * Se redondea a centavos DESPUÉS de multiplicar. Es la única cuenta: la usan el formulario del móvil,
 * las plantillas de equipo, la carga en lote y la web.
 */
export declare const importePorJornada: (escala: EscalaParaJornada | null | undefined, multiplicadorDiario?: number | null, jornadasDelTipo?: number | null) => number;
/** Los sueldos que guarda el contrato, derivados del importe por jornada. Ver `sueldosDelContrato`. */
export interface SueldosDelContrato {
    /** Neto por jornada: el bruto por jornada × neto/bruto de la escala. */
    sueldo_diario_neto: number;
    /** Diario neto × jornadas del contrato: lo que cobra en mano por todo el contrato. */
    sueldo_mano: number;
    /** Neto por los días que trabaja (= sueldo en mano). */
    sueldo_neto: number;
    /** Bruto por los días que trabaja: bruto por jornada × jornadas. */
    sueldo_bruto: number;
    /** Diario neto cargado − diario neto de la escala: cuánto se lo subió o bajó al editar los importes. */
    diferencia_diaria_neto: number;
}
/**
 * LOS SUELDOS DEL CONTRATO, la misma cuenta que muestra la solicitud del móvil.
 *
 * Parten del importe por jornada que se pactó (`jornadaBruto`, el `sueldo_jornada` del contrato o el
 * `dailyRate` de la solicitud), que es BRUTO, y de las jornadas del contrato:
 *
 *     diario neto  = jornada bruta × neto/bruto de la escala          (0,81 en el 634/11)
 *     en mano      = diario neto × jornadas
 *     neto         = diario neto × jornadas
 *     bruto        = jornada bruta × jornadas
 *     diferencia   = diario neto − diario neto de la escala          (0 si no se editó el importe)
 *
 * Antes el neto y el bruto eran los MENSUALES de la escala aunque el contrato fuera de un día, el
 * diario neto era el neto ÷ 30 y el sueldo en mano salía de la jornada bruta: cuatro números que no
 * hablaban del mismo contrato. Sin escala (un servicio) no hay descuentos que aplicar: neto = bruto.
 */
export declare const sueldosDelContrato: (p: {
    jornadaBruto: number;
    jornadas: number;
    proporcionNeto?: number | null;
    jornadaBrutoEscala?: number | null;
}) => SueldosDelContrato;
