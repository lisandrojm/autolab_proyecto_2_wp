/**
 * LIQUIDACIÓN DE REFERENCIA: qué cobraría una categoría a una fecha, con el desglose a la vista.
 *
 * No es un recibo de sueldo ni pretende serlo: no hay ausencias, ni horas extra reales, ni embargos,
 * ni el resto de la vida de una liquidación. Es la cuenta del CONVENIO —escala del grupo más los
 * adicionales del acta— que sirve para tres cosas concretas: cotizar un proyecto, explicarle a alguien
 * de dónde sale el número que le ofrecen, y detectar que una escala quedó vieja porque el total no da.
 *
 * DOS DECISIONES QUE NO SE PUEDEN TOMAR ACÁ
 *
 * 1. El CARÁCTER REMUNERATIVO de cada adicional no figura en el acta. Un adicional sin clasificar se
 *    suma al bruto (el dinero se paga igual) pero va en `sinClasificar`, nunca en remunerativo, y deja
 *    una advertencia. Meterlo en remunerativo por defecto sería inventar la base de los aportes.
 * 2. El FACTOR NETO (0,81) tampoco figura. El neto que sale de acá es `netoSugerido`, se calcula sólo
 *    sobre lo remunerativo y arrastra una advertencia mientras el factor siga sin confirmarse.
 *
 * Por eso la respuesta lleva `advertencias`: la cuenta se entrega igual —negarse a calcular no ayuda a
 * nadie— pero nunca sin decir qué parte está apoyada en un supuesto.
 */
export type TipoCalculoAdicional = "monto_fijo" | "mensual" | "por_anio_antiguedad" | "por_evento" | "porcentaje" | "a_confirmar";
export type BaseDePorcentaje = "basico" | "basico_mas_adicional" | "total";
export interface AdicionalVigente {
    codigo: string;
    nombre: string;
    tipoCalculo: TipoCalculoAdicional;
    /** `null` = a confirmar. */
    remunerativo: boolean | null;
    /** `false` = el tipo de cálculo o el carácter todavía no los confirmó nadie. */
    confirmado?: boolean;
    /** Importe del período vigente. `null` = no hay valor cargado para esa fecha. */
    monto: number | null;
    /** Sólo para `tipoCalculo: "porcentaje"`. */
    porcentaje?: number | null;
    base?: BaseDePorcentaje | null;
    /** Texto para mostrar ("por comida", "por año"). No interviene en la cuenta. */
    unidad?: string | null;
}
export interface EscalaParaLiquidar {
    basico: number;
    adicionalMonto: number;
    presentismoMonto: number;
    /** El total del acta (o el calculado, si no hay acta). Es la base de los porcentajes y del neto. */
    total: number;
    netoFactor?: number | null;
}
export interface PedidoDeLiquidacion {
    /** Años de antigüedad, para los adicionales `por_anio_antiguedad`. */
    aniosAntiguedad?: number;
    /**
     * Cuántas veces se devengó cada adicional, por código: `{ comidas: 12, exteriores: 3 }`.
     *
     * Para los `por_evento` es la cantidad. Para los mensuales y de monto fijo, cualquier valor > 0
     * alcanza para incluirlos (y por eso `1` es lo natural); ausente o 0 = no se incluye. Un mensual no
     * se multiplica por la cantidad: guardería 2 no es el doble de guardería.
     */
    cantidades?: Record<string, number>;
}
export interface LineaDeLiquidacion {
    codigo: string;
    nombre: string;
    tipoCalculo: TipoCalculoAdicional;
    /** Veces que se devengó (o 1). */
    cantidad: number;
    /** Importe unitario usado. */
    unitario: number;
    monto: number;
    remunerativo: boolean | null;
}
export interface LiquidacionDeReferencia {
    /** Los tres conceptos de la escala, siempre presentes. */
    basico: number;
    adicional: number;
    presentismo: number;
    /** Los adicionales del convenio que se devengaron. */
    lineas: LineaDeLiquidacion[];
    /** Escala + adicionales marcados remunerativos. */
    brutoRemunerativo: number;
    brutoNoRemunerativo: number;
    /** Adicionales con carácter sin confirmar: se pagan, pero no se los cuenta como base de aportes. */
    sinClasificar: number;
    bruto: number;
    netoSugerido: number;
    netoFactor: number;
    advertencias: string[];
}
/**
 * La cuenta completa.
 *
 * `adicionales` son los que rigen a la fecha pedida: elegir el período es de `escalaAFecha`, no de acá.
 * Esa separación es a propósito —una cuenta pura se puede testear con los números del acta sin tocar la
 * base— y es la misma razón por la que `valorarPorBruto` no sabe de Mongo.
 */
export declare function liquidacionDeReferencia(escala: EscalaParaLiquidar, adicionales: AdicionalVigente[], pedido?: PedidoDeLiquidacion): LiquidacionDeReferencia;
