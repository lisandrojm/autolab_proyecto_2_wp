import { fechaCorta, textoAltaQueSePisa } from "./altasVigentes.js";
import { diaArgentina, proximaCorridaPara, sumarDias } from "./horarioAltasAutomaticas.js";
import { LAYOUT_85 } from "../../compartido/layoutAltaArca.js";
import { fechaISO } from "../../utils/contratoVigencia.js";
import { venceAltaPresentada } from "../../compartido/arca/vigenciaAltaPresentada.js";
/**
 * LAS ALTAS DE UNA PERSONA SALEN EN SECUENCIA, por empleadora (pedido del 01/11/2026). Puro: Mongo entra
 * por parámetro. Lo usan la presentación automática (`presentacionAutomatica.ts`) y la validación del
 * lote manual (`validarLoteAltas.ts`), con los mismos textos.
 *
 * QUÉ RECHAZA ARCA, visto en los datos del 01/11/2026: los ocho rechazos de ese día por «CUIL ya tiene un
 * alta activa» fueron todos jornadas de un día cuya jornada ANTERIOR de la misma persona se había
 * presentado minutos antes, en la misma corrida (García: 24/10 presentada, 31/10 rechazada). Los períodos
 * no se pisaban y la anterior tenía fecha de fin en el pasado. En Relaciones Laborales esas anteriores
 * figuraban con fecha de fin pero SIN «situación de baja»: ARCA las da por terminadas recién cuando procesa
 * el «Vencimiento de contrato», en general al día siguiente (Brina: la del 20/10 ya figuraba con baja el
 * 21/10). Entonces la regla de ARCA NO es «dos períodos que se pisan» sino UNA RELACIÓN ACTIVA POR VEZ con
 * cada empleadora, y activa = sin baja procesada.
 *
 * De ahí:
 *   1. Una relación de ARCA sin baja procesada (`cerrada`) bloquea cualquier alta nueva de la persona con
 *      esa empleadora, se pise o no. Se destraba cuando la sincronización la trae dada de baja.
 *   2. Un alta presentada desde WeProdu que ARCA no lista cuenta como activa hasta la noche de su
 *      vencimiento: el mayor entre su baja y el día en que se presentó (sin baja, abierta). Es lo que pasó el
 *      01/11. No se espera a que la sincronización la traiga porque al 01/11 trae incompleto octubre: de 157
 *      altas presentadas desde WeProdu, 102 no figuraban en Relaciones Laborales.
 *   3. Entre pendientes de la misma persona y empleadora, una por corrida: la de fecha de alta más
 *      temprana. Las siguientes esperan su turno. Jornadas encadenadas incluidas (era la idea original
 *      dejarlas salir juntas, y es justo lo que ARCA rechazó).
 *   4. La relación —de ARCA o presentada desde WeProdu— que EMPIEZA EL MISMO DÍA que el contrato pendiente
 *      es, casi seguro, ESA MISMA alta ya hecha (presentada a mano o un contrato duplicado): no se presenta
 *      (sería otro rechazo) y queda listada para revisar.
 *
 * Sigue siendo POR EMPLEADORA (ver `altasVigentes.ts`): dos CUIT distintos a la vez son legítimos.
 */
const ABIERTA = "9999-12-31";
const POS_INICIO_85 = LAYOUT_85.find((c) => c.clave === "fechaInicio");
const POS_FIN_85 = LAYOUT_85.find((c) => c.clave === "fechaFin");
/** El registro de 85 le manda a ARCA la fecha de fin. En blanco (tiempo indeterminado), ARCA deja la relación abierta hasta que alguien informe la baja. */
export const mandaFechaFin = (registro85) => !!registro85 && registro85.slice(POS_FIN_85.desde - 1, POS_FIN_85.hasta).trim() !== "";
/** Las fechas de inicio y fin tal como van en el registro de 85. */
export const fechasDelRegistro = (registro85) => (registro85 ? registro85.slice(POS_INICIO_85.desde - 1, POS_FIN_85.hasta) : "");
/**
 * Por qué este contrato no se puede presentar todavía, o `null` si nada lo traba. `relacionesArca` son las
 * de esa persona con esa empleadora; `presentadas`, las de WeProdu (se filtran acá).
 */
export function bloqueoPorVigencia(contrato, presentadas, relacionesArca, o) {
    const alta = fechaISO(contrato.alta);
    if (!alta || !contrato.empresaId)
        return null;
    const propias = presentadas.filter((p) => p.userId === contrato.userId && p.empresaId === contrato.empresaId && !(p.userProjectId === contrato.userProjectId && p.contractIndex === contrato.contractIndex) && !!p.alta);
    // 4. El alta de ese mismo día ya está hecha.
    const mismoDiaArca = relacionesArca.find((r) => r.inicio === alta);
    if (mismoDiaArca) {
        return {
            tipo: "mismo_dia",
            mismoDiaEn: "arca",
            motivo: `ARCA ya tiene registrada una relación con esta empleadora que empieza el ${fechaCorta(alta)}: revisar si esta alta ya está hecha (por ejemplo, presentada a mano o un contrato duplicado). No se presenta para no repetir el rechazo por alta activa.`,
            hasta: "",
            desbloqueo: "Revisar a mano: ARCA ya tiene un alta de ese día.",
        };
    }
    const mismoDiaW = propias.find((p) => p.alta === alta);
    if (mismoDiaW) {
        return {
            tipo: "mismo_dia",
            mismoDiaEn: "weprodu",
            motivo: `Ya se presentó en ARCA otro contrato de esta persona con esta empleadora que empieza el mismo día (${fechaCorta(alta)}): revisar si éste es un duplicado. No se presenta para no repetir el rechazo por alta activa.`,
            hasta: "",
            desbloqueo: "Revisar a mano: ya se presentó un alta de ese día.",
        };
    }
    const opciones = [];
    // 1. Activas en ARCA: sin baja procesada, se pisen o no.
    for (const r of relacionesArca) {
        if (r.cerrada)
            continue;
        opciones.push(r.fin
            ? {
                tipo: "activa_arca",
                motivo: `En ARCA sigue activa su relación con esta empleadora del ${fechaCorta(r.inicio)} al ${fechaCorta(r.fin)}: ARCA todavía no procesó esa baja y rechaza otra alta mientras tanto. Se presenta cuando la sincronización de Relaciones Laborales la traiga dada de baja.`,
                hasta: r.fin,
                desbloqueo: `Cuando ARCA procese la baja del ${fechaCorta(r.fin)} (sync de Relaciones Laborales).`,
            }
            : {
                tipo: "activa_arca",
                motivo: `En ARCA sigue activa su relación con esta empleadora desde el ${fechaCorta(r.inicio)}. La relación vigente en ARCA no tiene baja: se presenta cuando ARCA informe la baja (sync de Relaciones Laborales).`,
                hasta: "",
                desbloqueo: "Cuando ARCA informe la baja (sync de Relaciones Laborales).",
            });
    }
    // 2. Presentadas desde WeProdu que ARCA no lista: activas hasta la noche de su vencimiento (o abiertas, sin baja).
    for (const p of propias) {
        if (relacionesArca.some((r) => r.inicio === p.alta))
            continue; // la decide ARCA, arriba
        if (!p.baja) {
            opciones.push({
                tipo: "presentada",
                motivo: `${textoAltaQueSePisa(p).replace(/^ya/, "Ya")}.`,
                hasta: "",
                desbloqueo: "Cuando el contrato vigente tenga baja (en WeProdu o según ARCA).",
            });
            continue;
        }
        const diaPresentada = p.presentadaEl && Number.isFinite(Date.parse(p.presentadaEl)) ? diaArgentina(new Date(p.presentadaEl)) : "";
        // La misma regla que muestra el aviso de «Forzar alta» (ver `compartido/arca/vigenciaAltaPresentada.ts`).
        const vence = venceAltaPresentada(p.baja, diaPresentada);
        if (vence < o.hoy)
            continue; // ARCA ya procesó el vencimiento
        opciones.push({
            tipo: "presentada",
            motivo: `Ya se presentó el alta del ${fechaCorta(p.alta)} al ${fechaCorta(p.baja)} de esta persona con esta empleadora, y ARCA la da por terminada recién cuando procesa el vencimiento, la noche del ${fechaCorta(vence)}: se presenta desde el día siguiente.`,
            hasta: vence,
            desbloqueo: `Desde el ${fechaCorta(sumarDias(vence, 1))} (ARCA procesa el vencimiento la noche anterior).`,
        });
    }
    if (opciones.length === 0)
        return null;
    // Manda la que termina más tarde (abierta gana): es la que de verdad la destraba.
    return opciones.reduce((a, b) => ((b.hasta || ABIERTA) > (a.hasta || ABIERTA) ? b : a));
}
/** Por persona y empleadora, en orden de fecha de alta, sale la primera que ocupa turno; las demás esperan, cada una detrás de la anterior. */
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
        for (let n = 1; n < idx.length; n++) {
            const prev = cs[idx[n - 1]];
            const cierraSola = prev.mandaFin && !!prev.fechaBaja;
            out.set(idx[n], {
                antes: idx[n - 1],
                motivo: `Espera su turno: antes va el alta del ${fechaCorta(prev.fechaAlta)} de esta misma persona con esta empleadora, y ARCA no acepta otra hasta procesar su baja.`,
                desbloqueo: `Cuando se presente el alta del ${fechaCorta(prev.fechaAlta)} y ARCA procese su baja${cierraSola ? ` (${fechaCorta(prev.fechaBaja)})` : ""}.`,
                desdeDia: cierraSola ? sumarDias(prev.fechaBaja, 1) : "",
            });
        }
    }
    return out;
}
const mayor = (a, b) => (a > b ? a : b);
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
/**
 * La fecha prevista de un alta trabada por algo ACTIVO con baja conocida: la primera corrida del día
 * siguiente a esa baja y nunca antes de mañana, porque que ARCA la procese lo trae recién la próxima
 * sincronización (una por día). Si mañana todavía no figura, se vuelve a calcular: no se presenta a ciegas.
 */
export const momentoTrasBaja = (fechaAlta, baja, cfg, ahora, hoy, o = {}) => /^\d{4}-\d{2}-\d{2}$/.test(baja) ? momentoDesde(fechaAlta, mayor(sumarDias(baja, 1), sumarDias(hoy, 1)), cfg, ahora, hoy, o) : null;
/**
 * La fecha prevista de un alta que espera su turno: no antes del día siguiente a la corrida que presenta la
 * anterior (la baja de esa llega con la sincronización de al otro día), ni antes del día siguiente a su
 * baja. `null` si la anterior no tiene fecha o su baja la tiene que informar alguien.
 */
export function momentoDetrasDe(fechaAlta, espera, anterior, cfg, ahora, hoy, o = {}) {
    if (!anterior || !espera.desdeDia)
        return null;
    return momentoDesde(fechaAlta, mayor(espera.desdeDia, sumarDias(diaArgentina(anterior), 1)), cfg, ahora, hoy, o);
}
/**
 * EL RECHAZO POR «ALTA ACTIVA» DEJA DE SER UN LOOP (pedido del 01/11/2026). Si ARCA lo rechazó así pero lo
 * sincronizado no muestra nada activo, los datos locales están atrasados: reintentar da lo mismo. Se
 * destraba con una sincronización de Relaciones Laborales POSTERIOR al rechazo (que trae lo que lo traba,
 * o confirma que ya no está) o si cambiaron las fechas que se le mandaron a ARCA. Sin el registro del
 * rechazo (rechazos de antes de esta regla), sólo la sincronización.
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
export const TEXTO_RECHAZO_ALTA_ACTIVA = "ARCA la rechazó por un alta activa, pero las Relaciones Laborales sincronizadas no muestran ninguna: los datos están atrasados. Se vuelve a presentar después de la próxima sincronización de Relaciones Laborales (o si cambian sus fechas).";
export const DESBLOQUEO_RECHAZO_ALTA_ACTIVA = "Después de la próxima sincronización de Relaciones Laborales (o si cambian sus fechas).";
/**
 * Las vueltas de una corrida (un lote no puede repetir CUIL, ver `validarLoteAltas`): la k-ésima alta de
 * cada persona, por fecha de alta, va en la vuelta k. Con el turno por persona y empleadora casi siempre es
 * una sola; quedan más con dos empleadoras distintas, que son corridas distintas igual.
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
