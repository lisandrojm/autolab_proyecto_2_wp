import { Types } from "mongoose";
import { pathToFileURL } from "node:url";
import UserProject from "../../models/UserProject.js";
import { ArcaAltasLog } from "../../models/ArcaAltasLog.js";
import { ArcaVerificacionAlta } from "../../models/ArcaVerificacionAlta.js";
import { Company } from "../../models/Company.js";
import { fechaISO } from "../../utils/contratoVigencia.js";
import { abrirSesionArca, credencialesDe, guardarSesion } from "./navegador.js";
import { MOTOR, MOTOR_ALTAS } from "./motor.js";
import { quienTiene, soltarCandado, tomarCandado } from "./candadoArca.js";
import { avanzarPresentada } from "./corridaAltas.js";
import { decidirVerificacion, decisionSinConsultar } from "./decisionVerificacionAlta.js";
export const itemDe = (c) => ({
    userProjectId: c.userProjectId,
    contractIndex: c.contractIndex,
    cuil: c.cuil,
    nombre: c.nombre,
    empresaId: c.empresa?._id || "",
    empresaRazonSocial: c.empresa?.razonSocial || "",
    alta: c.fechaAlta,
    baja: c.fechaBaja,
    otroContratoMismoDia: c.otroContratoMismoDia,
    traba: c.verificable || c.otroContratoMismoDia ? "mismo_dia" : "activa",
});
/**
 * EL RECORRIDO, sin Mongo ni navegador: consulta (si hace falta), decide y aplica, persona por persona.
 * Una consulta que tira no corta a las demás: esa persona queda en revisión manual con el error.
 */
export async function verificarLote(o) {
    const out = [];
    let consultadas = 0;
    for (const item of o.items) {
        let consulta = null;
        let decision = decisionSinConsultar(item);
        if (!decision) {
            if (consultadas++ > 0)
                await o.pausa?.();
            try {
                consulta = await o.consultar(item);
            }
            catch (e) {
                consulta = { ok: false, error: String(e?.message || e) };
            }
            decision = decidirVerificacion(item, consulta);
        }
        const accion = await o.aplicar(item, decision, consulta);
        const { html: _html, ...sinPantalla } = (consulta || {});
        out.push({ item, decision, accion, consulta: consulta ? sinPantalla : null });
        console.log(`[verificacion-altas] ${item.nombre} (${item.cuil}) alta ${item.alta}: ${decision.accion} → ${accion}. ${decision.motivo}`);
    }
    return out;
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const pausaEntrePersonas = () => esperar(1500 + Math.floor(Math.random() * 1500));
const ddmmaaaa = (iso) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
const enCurso = new Map();
export const verificacionEnCursoDe = (tenantId) => enCurso.get(tenantId) || null;
export const claveDe = (i) => `${i.userProjectId}:${i.contractIndex}`;
/**
 * Verifica en ARCA estas altas: una sesión por empleadora, con el candado de ARCA. `enSeco`: consulta
 * ARCA y decide, pero no escribe NADA en la base (ni el contrato, ni la auditoría, ni el registro).
 */
export async function verificarAltasEnArca(o) {
    const estado = { arrancadaEl: new Date(), claves: o.items.map(claveDe), terminada: false, resultados: [] };
    if (!o.enSeco)
        enCurso.set(o.tenantId, estado);
    const resultados = [];
    try {
        const cred = await credencialesDe(o.tenantId);
        if (!cred)
            throw new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión.");
        const grupos = new Map();
        for (const i of o.items)
            grupos.set(i.empresaId, [...(grupos.get(i.empresaId) || []), i]);
        for (const [empresaId, items] of grupos) {
            const empresa = Types.ObjectId.isValid(empresaId) ? await Company.findById(empresaId).select("cuit razonSocial").lean() : null;
            const cuit = String(empresa?.cuit || "").replace(/\D/g, "");
            const aplicar = aplicador({ ...o, empresaId, empresaRazonSocial: String(empresa?.razonSocial || items[0].empresaRazonSocial), empresaCuit: cuit });
            // Si ninguna necesita ARCA (todas son duplicados de WeProdu), no se abre sesión.
            const necesitanArca = items.some((i) => !decisionSinConsultar(i));
            if (!necesitanArca || cuit.length !== 11) {
                const error = cuit.length !== 11 ? "La empleadora del contrato no tiene CUIT de 11 dígitos." : "";
                resultados.push(...(await verificarLote({ items, consultar: async () => ({ ok: false, error }), aplicar })));
                continue;
            }
            // Otra corrida de ARCA (altas, constancias, obras sociales) usa la misma sesión: se espera hasta 30 min.
            const fin = Date.now() + 30 * 60_000;
            while (quienTiene(o.tenantId) && Date.now() < fin)
                await esperar(5000);
            if (quienTiene(o.tenantId)) {
                resultados.push(...(await verificarLote({ items, consultar: async () => ({ ok: false, error: "Había otra corrida de ARCA en curso y no terminó en 30 minutos." }), aplicar })));
                continue;
            }
            tomarCandado(o.tenantId, "verificacion");
            let sesion = null;
            let fallo = false;
            try {
                sesion = await abrirSesionArca(o.tenantId, cred);
                const { aceptarSelectorDeCuit } = (await import(pathToFileURL(MOTOR).href));
                const motor = (await import(pathToFileURL(MOTOR_ALTAS).href));
                const page = sesion.page;
                if (!(await aceptarSelectorDeCuit(page, cuit)))
                    throw new Error(`No pude elegir la empleadora ${cuit} en ARCA (¿el usuario delegado la tiene?).`);
                // Como la descarga de constancias: un respiro antes de salir del selector, y a Relaciones Laborales.
                await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => { });
                await page.waitForTimeout(1500).catch(() => { });
                await motor.entrarARelacionesLaborales({ page });
                const r = await verificarLote({
                    items,
                    consultar: async (i) => {
                        const x = await motor.relacionesPorCuil({ page, cuil: i.cuil, fechaInicio: ddmmaaaa(i.alta) });
                        return { ok: true, relaciones: x.relaciones || [], encontrada: x.encontrada === true ? true : null, html: x.html };
                    },
                    aplicar,
                    pausa: pausaEntrePersonas,
                });
                resultados.push(...r);
            }
            catch (e) {
                fallo = true;
                // Lo que no llegó a consultarse queda en revisión manual con el error (mañana se vuelve a mirar).
                const hechos = new Set(resultados.map((x) => claveDe(x.item)));
                const quedan = items.filter((i) => !hechos.has(claveDe(i)));
                resultados.push(...(await verificarLote({ items: quedan, consultar: async () => ({ ok: false, error: String(e?.message || e) }), aplicar })));
            }
            finally {
                const s = sesion;
                if (s && !fallo && !o.enSeco)
                    await guardarSesion(o.tenantId, s.ctx).catch(() => { });
                await s?.browser.close().catch(() => { });
                soltarCandado(o.tenantId, "verificacion");
            }
        }
    }
    catch (e) {
        estado.error = String(e?.message || e);
        throw e;
    }
    finally {
        estado.resultados = resultados.map((r) => ({ clave: claveDe(r.item), nombre: r.item.nombre, resultado: r.decision.accion, motivo: r.decision.motivo }));
        estado.terminada = true;
    }
    return resultados;
}
/**
 * Cómo se aplica cada decisión en la base (o no, en seco).
 *
 * Lo usan dos caminos que terminan igual —el alta ya estaba en ARCA, se marca presentada y sigue el
 * circuito—: la VERIFICACIÓN (consulta en vivo, `via: "verificacion"`) y la ADOPCIÓN DE ALTAS EXTERNAS
 * (Relaciones Laborales sincronizadas, `via: "externa"`, ver `adopcionAltasExternas.ts`).
 *
 * `noRepetirManual`: la adopción corre en cada sincronización; una revisión manual que ya dice lo mismo
 * no se vuelve a escribir ni a auditar (`sin_cambios`).
 */
export function aplicador(o) {
    const via = o.via || "verificacion";
    const origen = via === "externa" ? "sync" : "consulta";
    /** El registro de la pestaña Presentadas: uno por empleadora y verificación, creado con la primera que se marca. */
    let logId = null;
    const usuario = o.usuarioId && Types.ObjectId.isValid(o.usuarioId) ? new Types.ObjectId(o.usuarioId) : undefined;
    return async (item, d, consulta) => {
        if (o.enSeco)
            return "en_seco";
        const campo = `contracts.${item.contractIndex}`;
        // ¿Sigue siendo ESE contrato y sigue sin presentar? Si no, no se toca nada.
        const up = await UserProject.findById(item.userProjectId).select(`contracts.fecha_alta_contrato contracts.empresaContratoId contracts.altaArcaPresentada contracts.verificacionArca`).lean();
        const c = up?.contracts?.[item.contractIndex];
        if (o.noRepetirManual && d.accion === "revision_manual" && c?.verificacionArca?.resultado === "revision_manual" && c.verificacionArca.origen === origen && c.verificacionArca.motivo === d.motivo)
            return "sin_cambios";
        let accion = d.accion === "presentada" ? "marcada_presentada" : d.accion === "sin_alta" ? "sigue_trabada" : "revision_manual";
        if (!c || fechaISO(c.fecha_alta_contrato) !== item.alta || String(c.empresaContratoId || "") !== item.empresaId)
            accion = "contrato_cambio";
        else if (c.altaArcaPresentada && c.altaArcaPresentada.resultado !== "fallida")
            accion = "ya_resuelta";
        const { html, ...consultaSinPantalla } = (consulta || {});
        const auditoria = await ArcaVerificacionAlta.create({
            tenantId: o.tenantObjectId,
            userProjectId: new Types.ObjectId(item.userProjectId),
            contractIndex: item.contractIndex,
            cuil: item.cuil,
            nombre: item.nombre,
            empresaId: Types.ObjectId.isValid(o.empresaId) ? new Types.ObjectId(o.empresaId) : undefined,
            empresaRazonSocial: o.empresaRazonSocial,
            alta: item.alta,
            baja: item.baja,
            automatica: o.automatica,
            usuarioId: usuario,
            enSeco: false,
            consulta: consulta ? consultaSinPantalla : null,
            decision: d.accion,
            motivo: d.motivo,
            accion,
            html: typeof html === "string" ? html : undefined,
            origen,
            detectadaPor: o.detectadaPor,
            ladoALado: d.ladoALado,
        });
        if (accion === "contrato_cambio" || accion === "ya_resuelta")
            return accion;
        const verificacionArca = {
            el: new Date(),
            resultado: d.accion,
            motivo: d.motivo,
            ...("relacion" in d && d.relacion ? { relacion: { inicio: d.relacion.inicio, fin: d.relacion.fin, baja: d.relacion.baja || "", ...(d.relacion.modalidad ? { modalidad: d.relacion.modalidad } : {}) } } : {}),
            origen,
            ...(d.ladoALado ? { esperado: d.ladoALado.esperado, encontradas: d.ladoALado.encontradas } : {}),
            automatica: o.automatica,
            usuarioId: usuario,
            auditoriaId: auditoria._id,
        };
        // Sólo si sigue sin presentar (o rechazada): una segunda verificación, o una corrida que llegó antes, no la pisa.
        const sinPresentar = { $or: [{ [`${campo}.altaArcaPresentada`]: null }, { [`${campo}.altaArcaPresentada.resultado`]: "fallida" }] };
        // Todavía no está en ARCA: no se toca la marca de presentación; queda anotado cuándo se miró.
        if (d.accion === "sin_alta") {
            const r = await UserProject.updateOne({ _id: item.userProjectId, ...sinPresentar }, { $set: { [`${campo}.verificacionArca`]: verificacionArca } });
            return r.modifiedCount > 0 ? "sigue_trabada" : "ya_resuelta";
        }
        if (d.accion === "revision_manual") {
            const r = await UserProject.updateOne({ _id: item.userProjectId, ...sinPresentar }, { $set: { [`${campo}.verificacionArca`]: verificacionArca } });
            return r.modifiedCount > 0 ? "revision_manual" : "ya_resuelta";
        }
        if (!logId) {
            const log = await ArcaAltasLog.create({
                tenantId: o.tenantObjectId,
                tipo: via,
                usuarioId: usuario,
                automatica: o.automatica,
                empresaId: Types.ObjectId.isValid(o.empresaId) ? new Types.ObjectId(o.empresaId) : undefined,
                empresaCuit: o.empresaCuit,
                empresaRazonSocial: o.empresaRazonSocial,
                enSeco: false,
                contratos: [],
                resultado: "aceptada",
                irreversible: false,
            });
            logId = log._id;
        }
        const r = await UserProject.updateOne({ _id: item.userProjectId, ...sinPresentar }, {
            $set: {
                [`${campo}.altaArcaPresentada`]: { via, fecha: new Date(), resultado: "presentada", ...(via === "verificacion" ? { porConsulta: true } : {}), motivo: d.motivo, logId },
                [`${campo}.verificacionArca`]: verificacionArca,
            },
        });
        if (r.modifiedCount === 0) {
            await ArcaVerificacionAlta.updateOne({ _id: auditoria._id }, { $set: { accion: "ya_resuelta" } });
            return "ya_resuelta";
        }
        await ArcaAltasLog.updateOne({ _id: logId }, { $push: { contratos: { userProjectId: new Types.ObjectId(item.userProjectId), contractIndex: item.contractIndex, cuil: item.cuil, nombre: item.nombre, resultado: "presentada", motivo: d.motivo, porConsulta: via === "verificacion" } } });
        await avanzarPresentada(item.userProjectId, item.contractIndex);
        return "marcada_presentada";
    };
}
