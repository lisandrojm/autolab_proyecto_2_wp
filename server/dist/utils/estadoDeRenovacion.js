import { esContratoVigente, fechaISO } from "./contratoVigencia.js";
const alta = (c) => fechaISO(c.fecha_alta_contrato);
const fin = (c) => fechaISO(c.fecha_baja_contrato) || alta(c);
const vencido = (c, hoy) => !!alta(c) && !esContratoVigente(c, hoy) && alta(c) <= hoy;
export function estadoDeRenovacion(o) {
    const { contrato, contratos, hoy } = o;
    const estadoDe = (c) => (o.procesoTerminado(String(c.nombre_estado_empleado || "")) ? "renovado" : "en_proceso");
    if (contrato.delSistema) {
        // Sólo es una renovación si hay un contrato anterior; el primero de la persona no «renueva» nada.
        const esRenovacion = contratos.some((c) => c !== contrato && alta(c) && alta(c) < alta(contrato));
        if (!esRenovacion)
            return null;
        return vencido(contrato, hoy) ? null : estadoDe(contrato);
    }
    // Contrato viejo: ¿ya tiene una renovación posterior?
    const posteriores = contratos.filter((c) => c !== contrato && alta(c) > fin(contrato)).sort((a, b) => alta(b).localeCompare(alta(a)));
    if (posteriores.length > 0) {
        const ultimo = posteriores[0];
        if (vencido(ultimo, hoy))
            return null; // ya es historia: lo que rige es el posterior
        return ultimo.delSistema ? estadoDe(ultimo) : null;
    }
    if (o.renovacionPedida)
        return "en_proceso";
    return vencido(contrato, hoy) ? "renovar" : null;
}
/**
 * «Terminado» = el estado con el `ordenDependencia` más alto del circuito («Disponible»). Un estado
 * que no está en el circuito (sin orden, o que ya no existe) no retiene nada: cuenta como terminado.
 */
export function procesoTerminadoSegunEstados(estados, claveDe) {
    const orden = new Map();
    for (const e of estados) {
        const n = Number(e?.data?.ordenDependencia);
        if (Number.isFinite(n))
            orden.set(claveDe(String(e.name || "")), n);
    }
    const maximo = Math.max(...orden.values(), -Infinity);
    return (estado) => {
        const n = orden.get(claveDe(estado));
        return n === undefined || n >= maximo;
    };
}
