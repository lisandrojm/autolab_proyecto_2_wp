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
import { redondearCentavos, NETO_FACTOR_POR_DEFECTO } from "./escalaCalculo.js";
/** Cuántas veces se devengó: los mensuales y de monto fijo no se multiplican. */
const cantidadDe = (ad, pedido) => {
    const pedida = Number(pedido.cantidades?.[ad.codigo] ?? 0);
    if (ad.tipoCalculo === "por_anio_antiguedad")
        return Math.max(0, Number(pedido.aniosAntiguedad ?? 0));
    if (ad.tipoCalculo === "por_evento")
        return Math.max(0, pedida);
    // Mensual, monto fijo y "a confirmar": se incluye o no, pero no se multiplica.
    return pedida > 0 ? 1 : 0;
};
const baseDelPorcentaje = (base, escala) => {
    if (base === "basico")
        return escala.basico;
    if (base === "basico_mas_adicional")
        return escala.basico + escala.adicionalMonto;
    return escala.total;
};
/**
 * La cuenta completa.
 *
 * `adicionales` son los que rigen a la fecha pedida: elegir el período es de `escalaAFecha`, no de acá.
 * Esa separación es a propósito —una cuenta pura se puede testear con los números del acta sin tocar la
 * base— y es la misma razón por la que `valorarPorBruto` no sabe de Mongo.
 */
export function liquidacionDeReferencia(escala, adicionales, pedido = {}) {
    const advertencias = [];
    const netoFactor = Number(escala.netoFactor ?? NETO_FACTOR_POR_DEFECTO);
    const lineas = [];
    for (const ad of adicionales) {
        const cantidad = cantidadDe(ad, pedido);
        if (cantidad <= 0)
            continue;
        let unitario;
        if (ad.tipoCalculo === "porcentaje") {
            if (ad.porcentaje == null) {
                advertencias.push(`«${ad.nombre}» es un porcentaje y no tiene el porcentaje cargado: quedó afuera de la cuenta.`);
                continue;
            }
            unitario = redondearCentavos((baseDelPorcentaje(ad.base, escala) * Number(ad.porcentaje)) / 100);
        }
        else {
            if (ad.monto == null) {
                advertencias.push(`«${ad.nombre}» no tiene importe para esa fecha: quedó afuera de la cuenta.`);
                continue;
            }
            unitario = redondearCentavos(ad.monto);
        }
        if (ad.confirmado === false)
            advertencias.push(`«${ad.nombre}»: tipo de cálculo y carácter remunerativo a confirmar.`);
        if (ad.remunerativo == null)
            advertencias.push(`«${ad.nombre}»: no se sabe si es remunerativo, así que no entra en la base de aportes.`);
        lineas.push({ codigo: ad.codigo, nombre: ad.nombre, tipoCalculo: ad.tipoCalculo, cantidad, unitario, monto: redondearCentavos(unitario * cantidad), remunerativo: ad.remunerativo });
    }
    const sumar = (filtro) => redondearCentavos(lineas.filter(filtro).reduce((acc, l) => acc + l.monto, 0));
    const adicionalesRemunerativos = sumar((l) => l.remunerativo === true);
    const brutoNoRemunerativo = sumar((l) => l.remunerativo === false);
    const sinClasificar = sumar((l) => l.remunerativo == null);
    // La escala (básico + adicional + presentismo) es remunerativa por definición: es el sueldo del convenio.
    const brutoRemunerativo = redondearCentavos(escala.total + adicionalesRemunerativos);
    const bruto = redondearCentavos(brutoRemunerativo + brutoNoRemunerativo + sinClasificar);
    advertencias.push(`El neto es una estimación: sale de aplicar el factor ${netoFactor} sobre lo remunerativo, y ese factor no figura en ninguna acta.`);
    if (sinClasificar > 0)
        advertencias.push("Hay adicionales sin carácter definido: se suman al bruto pero no al cálculo del neto.");
    return {
        basico: redondearCentavos(escala.basico),
        adicional: redondearCentavos(escala.adicionalMonto),
        presentismo: redondearCentavos(escala.presentismoMonto),
        lineas,
        brutoRemunerativo,
        brutoNoRemunerativo,
        sinClasificar,
        bruto,
        netoSugerido: redondearCentavos(redondearCentavos(brutoRemunerativo * netoFactor) + brutoNoRemunerativo + sinClasificar),
        netoFactor,
        // Sin duplicados: el mismo supuesto se dice una vez.
        advertencias: [...new Set(advertencias)],
    };
}
