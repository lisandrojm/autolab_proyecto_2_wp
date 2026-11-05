import { fechaCorta } from "./altasVigentes.js";
const manual = (motivo, relacion) => ({ accion: "revision_manual", motivo, ...(relacion ? { relacion } : {}) });
/** Si otro contrato de WeProdu ya es esa alta, no hace falta consultar ARCA: es un duplicado para revisar. */
export function decisionSinConsultar(a) {
    if (!a.otroContratoMismoDia)
        return null;
    return manual(`Otro contrato de esta persona con esta empleadora que empieza el ${fechaCorta(a.alta)} ya figura presentado desde WeProdu: revisar si éste es un duplicado. No se marca presentado para no tener dos contratos con la misma alta.`);
}
export function decidirVerificacion(a, consulta) {
    const previa = decisionSinConsultar(a);
    if (previa)
        return previa;
    if (consulta.ok === false)
        return a.traba === "activa" ? { accion: "sin_alta", motivo: `No se pudo consultar ARCA (${consulta.error}): sigue esperando.` } : manual(`La consulta a ARCA falló: ${consulta.error}`);
    const delDia = consulta.relaciones.filter((r) => r.inicio === a.alta);
    if (delDia.length === 0 && a.traba === "activa")
        return { accion: "sin_alta", motivo: `ARCA todavía no tiene un alta que empiece el ${fechaCorta(a.alta)}: no se hizo a mano. Sigue esperando la baja de la relación activa.` };
    if (delDia.length === 0) {
        return manual(consulta.encontrada === true
            ? `ARCA muestra el CUIL y el ${fechaCorta(a.alta)} en la consulta, pero no se pudo leer la relación: revisar a mano.`
            : `La consulta a ARCA no mostró ninguna relación que empiece el ${fechaCorta(a.alta)} (la sincronización sí la había traído). Revisar a mano en Relaciones Laborales → Consultas: no se presenta por un «no la vi».`);
    }
    if (delDia.length > 1)
        return manual(`ARCA muestra ${delDia.length} relaciones que empiezan el ${fechaCorta(a.alta)}: no se puede saber cuál es la de este contrato. Revisar a mano.`);
    const r = delDia[0];
    const periodoArca = r.fin ? `del ${fechaCorta(r.inicio)} al ${fechaCorta(r.fin)}` : `desde el ${fechaCorta(r.inicio)}, sin fecha de fin`;
    if (a.baja) {
        if (r.fin === a.baja)
            return { accion: "presentada", motivo: `Resuelta por verificación automática: el alta ya estaba registrada en ARCA (${periodoArca}).`, relacion: r };
        if (!r.fin)
            return manual(`El alta ya está en ARCA (${periodoArca}), pero falta la baja del ${fechaCorta(a.baja)}: hay que informarla a mano en ARCA (el sistema no presenta bajas).`, r);
        return manual(`ARCA tiene la relación ${periodoArca} y el contrato va del ${fechaCorta(a.alta)} al ${fechaCorta(a.baja)}: las fechas de fin no coinciden. Revisar cuál es la correcta.`, r);
    }
    if (!r.fin)
        return { accion: "presentada", motivo: `Resuelta por verificación automática: el alta ya estaba registrada en ARCA (${periodoArca}).`, relacion: r };
    return manual(`ARCA tiene la relación ${periodoArca} y el contrato es por tiempo indeterminado: las fechas no coinciden. Revisar cuál es la correcta.`, r);
}
