import { altaQueSePisa, fechaCorta, textoAltaQueSePisa } from "./altasVigentes.js";
import { proximaCorridaPara, sumarDias } from "./horarioAltasAutomaticas.js";
import { LAYOUT_85 } from "../../compartido/layoutAltaArca.js";
import { fechaISO } from "../../utils/contratoVigencia.js";
/**
 * LAS ALTAS DE UNA PERSONA SALEN EN SECUENCIA, por empleadora (pedido del 01/11/2026). Puro: Mongo entra
 * por parámetro. Lo usan la presentación automática (`presentacionAutomatica.ts`) y la validación del
 * lote manual (`validarLoteAltas.ts`), con los mismos textos.
 *
 * Había muchísimos rechazos de ARCA por «El CUIL ya tiene un alta activa con esa empleadora» por dos
 * huecos:
 *   1. Sólo se miraban las altas presentadas DESDE WeProdu (`altaQueSePisa`). Una relación abierta en
 *      ARCA que WeProdu no presentó —cargada a mano en el portal, de antes del sistema— no bloqueaba nada.
 *      Ahora las Relaciones Laborales sincronizadas (`RelacionLaboralArca`) son una fuente más de
 *      vigencia: si una relación de ARCA se superpone con el contrato, el alta espera.
 *   2. Entre varios contratos PENDIENTES de la misma persona y empleadora no había turno: salían en
 *      vueltas de la misma corrida aunque se pisaran. Ahora va primero el de fecha de alta más temprana y
 *      los siguientes esperan.
 *
 * Sigue siendo POR EMPLEADORA (ver `altasVigentes.ts`): dos CUIT distintos a la vez son legítimos.
 *
 * JORNADAS ENCADENADAS: si la anterior termina antes de que empiece la siguiente Y su registro le manda a
 * ARCA la fecha de fin (plazo determinado), ARCA la cierra sola y las dos pueden salir en la misma
 * corrida, en vueltas sucesivas. Sin eso, veinte jornadas atrasadas de una persona tardarían veinte días
 * en modo diario. Sin fecha de fin (tiempo indeterminado) ARCA la deja abierta: turno estricto.
 *
 * LA RELACIÓN DE ARCA QUE EMPIEZA EL MISMO DÍA que el contrato pendiente no lo «pisa»: es, casi seguro,
 * ESA MISMA alta, ya hecha (presentada a mano, o el gemelo de un contrato duplicado). Presentarla de nuevo
 * termina en el mismo rechazo por alta activa, así que no se presenta y queda listada para revisar.
 */
const ABIERTA = "9999-12-31";
const POS_INICIO_85 = LAYOUT_85.find((c) => c.clave === "fechaInicio");
const POS_FIN_85 = LAYOUT_85.find((c) => c.clave === "fechaFin");
/** El registro de 85 le manda a ARCA la fecha de fin. En blanco (tiempo indeterminado), ARCA deja la relación abierta hasta que alguien informe la baja. */
export const mandaFechaFin = (registro85) => !!registro85 && registro85.slice(POS_FIN_85.desde - 1, POS_FIN_85.hasta).trim() !== "";
/** Las fechas de inicio y fin tal como van en el registro de 85: lo que ARCA mira para decir «alta activa». */
export const fechasDelRegistro = (registro85) => (registro85 ? registro85.slice(POS_INICIO_85.desde - 1, POS_FIN_85.hasta) : "");
/**
 * La relación de ARCA que se superpone con el contrato. `relaciones` ya son las de esa persona con esa
 * empleadora. La que empieza el mismo día no cuenta (ver `relacionArcaDelMismoDia`).
 */
export function relacionArcaQueSePisa(alta, baja, relaciones) {
    const a = fechaISO(alta);
    if (!a)
        return null;
    const b = fechaISO(baja) || ABIERTA;
    let peor = null;
    for (const r of relaciones) {
        if (!r.inicio || r.inicio === a)
            continue;
        const fin = r.fin || ABIERTA;
        if (r.inicio <= b && a <= fin && (!peor || fin > (peor.fin || ABIERTA)))
            peor = r;
    }
    return peor;
}
/** La relación de ARCA de esa persona y empleadora que empieza el mismo día que el contrato. */
export const relacionArcaDelMismoDia = (alta, relaciones) => {
    const a = fechaISO(alta);
    return (a && relaciones.find((r) => r.inicio === a)) || null;
};
/**
 * Por qué este contrato no se puede presentar todavía según lo que ya está vigente —en WeProdu o en
 * ARCA—, o `null` si nada lo pisa. Si lo pisan las dos fuentes, manda la que termina más tarde (abierta
 * gana), porque es la que de verdad lo destraba.
 */
export function bloqueoPorVigencia(contrato, presentadas, relacionesArca) {
    const mismoDia = relacionArcaDelMismoDia(contrato.alta, relacionesArca);
    if (mismoDia) {
        return {
            tipo: "mismo_dia_arca",
            motivo: `ARCA ya tiene registrada una relación con esta empleadora que empieza el ${fechaCorta(mismoDia.inicio)}: revisar si esta alta ya está hecha (por ejemplo, presentada a mano o un contrato duplicado). No se presenta para no repetir el rechazo por alta activa.`,
            hasta: "",
            desbloqueo: "Revisar a mano: ARCA ya tiene un alta de ese día.",
        };
    }
    const w = altaQueSePisa(contrato, presentadas);
    const r = relacionArcaQueSePisa(contrato.alta, contrato.baja, relacionesArca);
    if (!w && !r)
        return null;
    const finW = w ? w.baja || ABIERTA : "";
    const finR = r ? r.fin || ABIERTA : "";
    if (r && finR >= finW) {
        return r.fin
            ? {
                tipo: "vigente_arca",
                motivo: `En ARCA tiene una relación con esta empleadora del ${fechaCorta(r.inicio)} al ${fechaCorta(r.fin)}: se presenta después de esa baja.`,
                hasta: r.fin,
                desbloqueo: `Después de la baja del ${fechaCorta(r.fin)} (según ARCA).`,
            }
            : {
                tipo: "vigente_arca",
                motivo: `En ARCA sigue vigente su relación con esta empleadora desde el ${fechaCorta(r.inicio)}. La relación vigente en ARCA no tiene baja: se presenta cuando ARCA informe la baja (sync de Relaciones Laborales).`,
                hasta: "",
                desbloqueo: "Cuando ARCA informe la baja (sync de Relaciones Laborales).",
            };
    }
    const p = w;
    return {
        tipo: "vigente_weprodu",
        motivo: `${textoAltaQueSePisa(p).replace(/^ya/, "Ya")}.`,
        hasta: p.baja,
        desbloqueo: p.baja ? `Después de la baja del ${fechaCorta(p.baja)}.` : "Cuando el contrato vigente tenga baja (en WeProdu o según ARCA).",
    };
}
/**
 * Qué pendientes esperan su turno: por persona y empleadora, en orden de fecha de alta, sale la primera
 * que ocupa turno; cada siguiente sale en la misma corrida sólo si la anterior también sale, termina
 * antes y le manda a ARCA la fecha de fin (jornadas encadenadas). Las demás esperan.
 */
export function esperanSuTurno(cs) {
    const grupos = new Map();
    cs.forEach((c, i) => {
        if (!c.ocupaTurno || !c.cuil || !c.empresaId || !c.fechaAlta)
            return;
        const k = `${c.cuil}|${c.empresaId}`;
        grupos.set(k, [...(grupos.get(k) || []), i]);
    });
    const out = new Map();
    for (const idx of grupos.values()) {
        idx.sort((a, b) => cs[a].fechaAlta.localeCompare(cs[b].fechaAlta) || (cs[a].fechaBaja || ABIERTA).localeCompare(cs[b].fechaBaja || ABIERTA) || a - b);
        let sigueLaFila = true;
        for (let n = 1; n < idx.length; n++) {
            const prev = cs[idx[n - 1]];
            const cur = cs[idx[n]];
            const encadena = prev.mandaFin && !!prev.fechaBaja && prev.fechaBaja < cur.fechaAlta;
            sigueLaFila = sigueLaFila && prev.presentable && !out.has(idx[n - 1]) && encadena;
            if (sigueLaFila)
                continue;
            out.set(idx[n], {
                antes: idx[n - 1],
                motivo: `Espera su turno: antes va el alta del ${fechaCorta(prev.fechaAlta)} de esta misma persona con esta empleadora.`,
                desbloqueo: `Cuando se presente el alta del ${fechaCorta(prev.fechaAlta)}${prev.mandaFin && prev.fechaBaja ? ` y pase su baja (${fechaCorta(prev.fechaBaja)})` : " y ARCA informe su baja"}.`,
                desdeDia: prev.mandaFin && prev.fechaBaja && !out.has(idx[n - 1]) ? sumarDias(prev.fechaBaja, 1) : "",
            });
        }
    }
    return out;
}
/**
 * La próxima corrida que presentaría un alta que no puede salir antes de `desdeDia`: la más tardía entre
 * la de su propio turno y la del día `desdeDia`. Reutiliza `proximaCorridaPara` (el turno de un alta es la
 * corrida de `fechaAlta - diasAntes`, por eso se le suma la anticipación).
 */
export function momentoDesde(fechaAlta, desdeDia, cfg, ahora, hoy, o = {}) {
    const propio = proximaCorridaPara(fechaAlta, cfg, ahora, hoy, o);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desdeDia))
        return propio;
    const trasBaja = proximaCorridaPara(sumarDias(desdeDia, cfg.diasAntes), cfg, ahora, hoy, o);
    if (!propio || !trasBaja)
        return propio || trasBaja;
    return trasBaja.getTime() > propio.getTime() ? trasBaja : propio;
}
/** La corrida que espera la baja de algo vigente: la primera del día siguiente a esa baja. */
export const momentoTrasBaja = (fechaAlta, baja, cfg, ahora, hoy, o = {}) => momentoDesde(fechaAlta, /^\d{4}-\d{2}-\d{2}$/.test(baja) ? sumarDias(baja, 1) : "", cfg, ahora, hoy, o);
/**
 * EL RECHAZO POR «ALTA ACTIVA» DEJA DE SER UN LOOP (pedido del 01/11/2026). Si ARCA lo rechazó así pero
 * las Relaciones Laborales sincronizadas no muestran nada que lo pise, los datos locales están atrasados:
 * reintentar da lo mismo. Se destraba con una sincronización de Relaciones Laborales POSTERIOR al rechazo
 * (que trae la relación que lo pisa, o confirma que ya no está) o si cambiaron las fechas que se le
 * mandaron a ARCA. Sin el registro del rechazo (rechazos de antes de esta regla), sólo la sincronización.
 */
export function rechazoAltaActivaDestrabado(o) {
    const rechazo = Date.parse(o.rechazadaEl);
    if (!Number.isFinite(rechazo))
        return true;
    const sync = o.ultimaSyncOk ? Date.parse(o.ultimaSyncOk) : NaN;
    if (Number.isFinite(sync) && sync > rechazo)
        return true;
    if (o.registroAlRechazo && o.registroActual && fechasDelRegistro(o.registroAlRechazo) !== fechasDelRegistro(o.registroActual))
        return true;
    return false;
}
export const TEXTO_RECHAZO_ALTA_ACTIVA = "ARCA la rechazó por un alta activa, pero las Relaciones Laborales sincronizadas no muestran ninguna que la pise: los datos están atrasados. Se vuelve a presentar después de la próxima sincronización de Relaciones Laborales (o si cambian sus fechas).";
export const DESBLOQUEO_RECHAZO_ALTA_ACTIVA = "Después de la próxima sincronización de Relaciones Laborales (o si cambian sus fechas).";
/**
 * Las vueltas de una corrida (un lote no puede repetir CUIL, ver `validarLoteAltas`): la k-ésima alta de
 * cada persona, por fecha de alta, va en la vuelta k. Así las jornadas encadenadas salen en orden aunque
 * una rechazada haya quedado al final de la lista. Dentro de cada vuelta se respeta el orden recibido.
 */
export function vueltasPorPersona(items) {
    const rango = new Map();
    const porCuil = new Map();
    for (const c of items)
        porCuil.set(c.cuil, [...(porCuil.get(c.cuil) || []), c]);
    for (const lista of porCuil.values())
        [...lista].sort((a, b) => a.fechaAlta.localeCompare(b.fechaAlta)).forEach((c, k) => rango.set(c, k));
    const vueltas = [];
    for (const c of items) {
        const k = rango.get(c) || 0;
        while (vueltas.length <= k)
            vueltas.push([]);
        vueltas[k].push(c);
    }
    return vueltas;
}
