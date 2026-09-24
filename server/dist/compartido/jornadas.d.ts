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
 */
export declare const mesesEquivalentes: (desde: string | undefined, hasta: string | undefined, dias: number[]) => number;
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
/** Editar la jornada deja como ancla el mensual que le corresponde. `null` si todavía no se puede calcular. */
export declare const anclaDesdeJornada: (jornada: number, jornadas: number, mesesEq: number) => AnclaImporte | null;
/**
 * EL IMPORTE POR JORNADA DE UNA CATEGORÍA: su neto mensual ÷ 30, por el multiplicador del tipo de
 * contrato («Jornada» paga 1,5). Sin multiplicador cargado (0, vacío o ausente) se usa 1: es «sin
 * multiplicador», no «por cero». Se redondea a centavos DESPUÉS de multiplicar.
 */
export declare const importePorJornada: (neto: number | null | undefined, multiplicadorDiario?: number | null) => number;
