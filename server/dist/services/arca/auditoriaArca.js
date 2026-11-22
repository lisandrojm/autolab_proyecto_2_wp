/**
 * ARCA EN MODO AUDITORÍA (etapa 5, 20/11/2026): LO QUE NO ENCAJA ENTRE WEPRODU Y ARCA, EN UN SOLO LUGAR.
 *
 * Las bajas con evidencia fuerte ya llegan solas al contrato (`bajasArcaAutomaticas.ts`). Esto es lo otro:
 * lo que NO se escribe porque la evidencia no alcanza o porque la diferencia es un hecho que tiene que
 * decidir una persona. Se lista, con las dos fechas y el porqué; nada de acá escribe ni deduce.
 *
 *  - faltaBajaArca      el contrato terminó en WeProdu y en ARCA la relación sigue abierta: falta presentar
 *                       la baja EN ARCA (la exposición legal es ésta).
 *  - revisionManual     tramos de ARCA que ningún contrato explica, un hecho en medio de varios tramos, otro
 *                       contrato con la misma alta (Xiara), recibos posteriores a la baja de ARCA (Jordan,
 *                       Fernández: WeProdu fusionó relaciones).
 *  - granularidad       ARCA declara por jornadas dentro del contrato, pero el último tramo termina más de
 *                       15 días antes que el contrato: ¿la persona dejó antes? (Sarli, Peralta, Freno).
 *  - relacionSinContrato una relación de ARCA cuyo inicio no es el alta exacta de ningún contrato, pero que
 *                       se solapa con contratos de esa persona y empleadora: la misma relación con otra
 *                       fecha (Valentina Pellegrini: 07/02 vs 10/02/2025) o un tramo de ARCA que WeProdu
 *                       tiene por jornadas. No se alinea sola (decisión del 18/11).
 *  - relacionVariosContratos una relación VIVA en ARCA (abierta, o con fin de hoy en adelante) con VARIOS contratos
 *                       en WeProdu de la misma persona, empleadora y fecha de alta (22/11/2026). Bajas ARCA no las
 *                       lista. Dos casos, y cada fila dice cuál: el contrato DUPLICADO en un mismo proyecto (se anula
 *                       el que sobra) y la MISMA RELACIÓN EN VARIOS PROYECTOS, que se resuelve a mano. Sale de la misma
 *                       función que arma esa lista (`listaBajasArca`), para que los dos lugares no difieran.
 *  - discrepanciasFrame lo que FRAME manda distinto de WeProdu y el import no pisó (vacío mientras el import
 *                       esté pausado; el contador tenía que vivir en un lugar que alguien mire).
 *
 * Y LO QUE NO ES PARA MIRAR, contado aparte (`historicasArcaPosterior`, fuera del total): contratos cuya alta se
 * cargó A MANO en ARCA y donde ARCA termina DESPUÉS que el contrato. Hallazgo del 22/11/2026, sobre los 5.712
 * contratos con relación exacta y las dos fechas de fin: las 353 altas presentadas desde WeProdu (con su registro
 * guardado) tienen en ARCA el mismo fin que se mandó, que es la baja del contrato; los 831 casos son todos de
 * altas hechas a mano entre 2024 y 2026 (545 con un día de más, sin patrón: no depende del tipo ni de que el
 * horario cruce la medianoche). La convención de WeProdu y la de ARCA es la misma. Como ya no se importa de FRAME
 * (deprecado en noviembre de 2026), es un conjunto histórico cerrado: no crece y no requiere acción. Si un alta
 * presentada DESDE WeProdu apareciera con ARCA terminando después, eso sí es para mirar y va a `revisionManual`.
 *
 * Los TOTALES se guardan en el tenant (`sincronizacionRelaciones.auditoria`) después de cada corrida
 * automática y cada vez que alguien abre la pestaña: así el contador del menú no recalcula nada.
 */
import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { DiscrepanciaFrame } from "../../models/DiscrepanciaFrame.js";
import { User } from "../../models/User.js";
import { fechaISO } from "../../utils/contratoVigencia.js";
import { UMBRAL_GRANULARIDAD_DIAS } from "../../utils/bajasArcaContrato.js";
import { relacionesSinContratoExacto } from "../../utils/auditoriaArca.js";
import { cargarContextoArca, planDeBajasArca } from "./bajasArcaContratos.js";
import { listaBajasArca } from "./listaBajasArca.js";
const BASE = "integrations.arcaSimplificacion.sincronizacionRelaciones";
const dig = (v) => String(v ?? "").replace(/\D/g, "");
const fechaDe = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : fechaISO(v));
const sinCrudos = ({ bajaCruda: _b, altaCruda: _a, ...x }) => x;
export async function auditoriaArca(tenantId) {
    const tid = new Types.ObjectId(String(tenantId));
    // La lista de Bajas ARCA se calcula en paralelo: de ahí salen las relaciones con varios contratos.
    const [ctx, bajas] = await Promise.all([cargarContextoArca(tid), listaBajasArca(tid)]);
    const plan = await planDeBajasArca(tid, { contexto: ctx });
    const relacionVariosContratos = bajas.bloqueadas
        .filter((x) => x.motivo === "varios_contratos" || x.motivo === "varios_proyectos")
        .map((x) => ({
        userId: x.userId || "",
        persona: x.persona,
        cuil: x.cuil,
        empleadora: x.empleadora,
        empleadoraCuit: x.empleadoraCuit,
        inicio: x.inicio,
        fin: x.finArca,
        tipo: x.motivo === "varios_proyectos" ? "varios_proyectos" : "duplicado",
        nota: x.motivo === "varios_proyectos" ? "Misma relación en varios proyectos: resolver a mano" : "Contrato duplicado en el mismo proyecto: anular el que sobra",
        contratos: x.contratos.map((c) => ({ contratoKey: c.contratoKey, userProjectId: c.userProjectId, posicion: c.posicion, proyecto: c.proyecto, contrato: c.contrato, alta: c.alta, baja: c.baja })),
    }));
    // Lo que sale del clasificador de bajas.
    const faltaBajaArca = plan.items.filter((x) => x.tipo === "arca_abierta").map(sinCrudos);
    // ARCA termina después que el contrato: histórico si el alta se cargó a mano; para mirar si salió de WeProdu.
    const posteriores = plan.items.filter((x) => x.tipo === "arca_posterior");
    const historicasArcaPosterior = posteriores.filter((x) => !x.altaDesdeWeprodu).length;
    const revisionManual = [
        ...plan.items.filter((x) => x.tipo === "revision_manual"),
        ...posteriores.filter((x) => x.altaDesdeWeprodu).map((x) => ({ ...x, alerta: "ARCA termina después que el contrato y el alta se presentó desde WeProdu: no es una de las históricas hechas a mano" })),
    ].map(sinCrudos);
    const granularidad = plan.items.filter((x) => x.tipo === "arca_granularidad" && (x.diasAntesDelFin ?? 0) > UMBRAL_GRANULARIDAD_DIAS).map(sinCrudos);
    // Relaciones de ARCA sin contrato exacto (regla pura en `utils/auditoriaArca.ts`).
    const porClave = new Map();
    const porPersona = new Map();
    const empresaPorCuit = new Map([...ctx.empresa.values()].map((e) => [e.cuit, e.nombre]));
    const contratos = [];
    for (const up of ctx.ups) {
        const u = ctx.porUsuario.get(String(up.userId));
        if (!u)
            continue;
        const cuil = dig(u.metadata.cuit);
        porPersona.set(cuil, { userId: String(up.userId), persona: `${u.firstName || ""} ${u.lastName || ""}`.trim() });
        (up.contracts || []).forEach((c, i) => {
            // Servicios no cuenta como contrato de ninguna relación (ver `sinRelacionEnArca`).
            if (!c?.contratoKey || !c.empresaContratoId || ctx.esServicios(c))
                return;
            const e = ctx.empresa.get(String(c.empresaContratoId));
            if (!e)
                return;
            porClave.set(String(c.contratoKey), { up, c, i });
            contratos.push({ contratoKey: String(c.contratoKey), alta: fechaDe(c.fecha_alta_contrato), baja: fechaDe(c.fecha_baja_contrato), cuil, cuit: e.cuit, estadoContrato: c.estadoContrato });
        });
    }
    const relacionSinContrato = relacionesSinContratoExacto(contratos, [...ctx.relsPorCuil.values()].flat(), ctx.hoy)
        .map((x) => ({
        userId: porPersona.get(x.cuil)?.userId || "",
        persona: porPersona.get(x.cuil)?.persona || x.cuil,
        cuil: x.cuil,
        empleadora: empresaPorCuit.get(x.cuit) || x.cuit,
        empleadoraCuit: x.cuit,
        inicio: x.inicio,
        fin: x.fin,
        situacionBaja: x.situacionBaja,
        contratos: x.contratos.map((s) => {
            const d = porClave.get(s.contratoKey);
            return { contratoKey: s.contratoKey, userProjectId: String(d.up._id), posicion: d.i, proyecto: d.up.nombre_proyecto || "", contrato: d.c.nombre_contrato || "", alta: s.alta, baja: s.baja, dias: s.dias };
        }),
    }))
        .sort((a, b) => a.persona.localeCompare(b.persona) || a.inicio.localeCompare(b.inicio));
    // Discrepancias con FRAME sin resolver (las viejas pueden no tener tenant).
    const disc = await DiscrepanciaFrame.find({ tenantId: { $in: [tid, null] }, resuelta: false }).sort({ ultimaVezEl: -1 }).lean();
    const ids = [...new Set(disc.map((d) => String(d.userId || "")).filter((x) => Types.ObjectId.isValid(x)))];
    const nombres = new Map();
    if (ids.length) {
        const us = await User.find({ _id: { $in: ids.map((x) => new Types.ObjectId(x)) } }).select("firstName lastName").lean();
        for (const u of us)
            nombres.set(String(u._id), `${u.firstName || ""} ${u.lastName || ""}`.trim());
    }
    const discrepanciasFrame = disc.map((d) => ({
        _id: String(d._id),
        userId: String(d.userId || ""),
        persona: nombres.get(String(d.userId || "")) || String(d.userId || ""),
        userProjectId: String(d.userProjectId),
        contratoKey: d.contratoKey ? String(d.contratoKey) : null,
        posicion: Number(d.posicion ?? 0),
        campo: String(d.campo || ""),
        weprodu: String(d.weprodu?.nombre || d.weprodu?.id || "—"),
        frame: String(d.frame?.nombre || d.frame?.id || "—"),
        detectadaEl: d.detectadaEl ? new Date(d.detectadaEl).toISOString() : "",
        ultimaVezEl: d.ultimaVezEl ? new Date(d.ultimaVezEl).toISOString() : "",
        veces: Number(d.veces || 1),
    }));
    const totales = {
        faltaBajaArca: faltaBajaArca.length,
        revisionManual: revisionManual.length,
        granularidad: granularidad.length,
        relacionSinContrato: relacionSinContrato.length,
        relacionVariosContratos: relacionVariosContratos.length,
        discrepanciasFrame: discrepanciasFrame.length,
        total: faltaBajaArca.length + revisionManual.length + granularidad.length + relacionSinContrato.length + relacionVariosContratos.length + discrepanciasFrame.length,
        historicasArcaPosterior,
    };
    return { hoy: ctx.hoy, espejoAl: ctx.espejoAl, calculadoEl: new Date().toISOString(), faltaBajaArca, revisionManual, granularidad, relacionSinContrato, relacionVariosContratos, discrepanciasFrame, totales };
}
/** Deja los totales en el tenant: es lo que lee el contador sin recalcular. */
export async function guardarTotalesAuditoria(tenantId, totales, el = new Date()) {
    await Tenant.updateOne({ _id: new Types.ObjectId(String(tenantId)) }, { $set: { [`${BASE}.auditoria`]: { el, totales } } });
}
export async function totalesGuardados(tenantId) {
    const t = await Tenant.findById(new Types.ObjectId(String(tenantId))).select(`${BASE}.auditoria`).lean();
    const a = t?.integrations?.arcaSimplificacion?.sincronizacionRelaciones?.auditoria;
    return { el: a?.el ? new Date(a.el).toISOString() : null, totales: a?.totales || null };
}
/** Para la corrida automática: recalcula y guarda los totales. Nunca tira. */
export async function recalcularAuditoriaArca(tenantId) {
    try {
        const a = await auditoriaArca(tenantId);
        await guardarTotalesAuditoria(tenantId, a.totales);
        console.log(`[auditoria-arca] ${tenantId}: ${a.totales.total} para mirar (falta baja en ARCA ${a.totales.faltaBajaArca} · revisión manual ${a.totales.revisionManual} · granularidad ${a.totales.granularidad} · relación sin contrato exacto ${a.totales.relacionSinContrato} · relación con varios contratos ${a.totales.relacionVariosContratos ?? 0} · FRAME ${a.totales.discrepanciasFrame})`);
        return a.totales;
    }
    catch (e) {
        console.error(`[auditoria-arca] ${tenantId}: falló:`, e?.message || e);
        return null;
    }
}
