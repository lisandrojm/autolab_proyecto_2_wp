import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Shift } from "../models/Shift.js";
import { Info } from "../models/Info.js";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Company } from "../models/Company.js";
import { bajaDeArcaQueAplica, relacionesArcaDe } from "./arca/altasVigentes.js";
import { plantillaDelContrato } from "../compartido/plantillaDelContrato.js";
// El `populate("clientId")` necesita el modelo registrado; no se depende de que otro archivo lo haya cargado.
import "../models/Client.js";
import { fechaISO, hoyArgentina } from "../utils/contratoVigencia.js";
import { contratoEnLasFechas, superposiciones } from "../utils/superposicionContratos.js";
import { Contrato } from "../models/Contrato.js";
import { getArcaDefaults } from "../models/ArcaDefault.js";
import { conCascada } from "../compartido/arca/cascadaArca.js";
import { buscarTipoContrato } from "../compartido/arca/afipCompleteness.js";
import { decidirAltaVigente, liquidacionDelAlta, mensajeMismaEmpleadora, mensajeSoloServicios } from "../compartido/altaVigente.js";
/*
  SUPERPOSICIÓN DE UN ALTA CON LO QUE LA PERSONA YA TIENE: la parte que toca la base.

  Junta todos sus contratos (en cualquier proyecto) y sus otras solicitudes pendientes, y se los pasa a
  la regla pura (`utils/superposicionContratos.ts`). La usan el formulario individual (para avisar
  mientras se carga), el alta de la solicitud (que guarda la foto de los avisos para quien aprueba) y el
  alta masiva de plantillas de equipo.
*/
const idsDeTurno = (asignaciones, suelto) => {
    const ids = (asignaciones || []).flatMap((a) => (a?.shiftIds || []).map(String));
    if (suelto)
        ids.push(String(suelto));
    return [...new Set(ids.filter(Boolean))];
};
/** "10:00 - 18:00" → { inTime, outTime }. */
const partirHorario = (schedule) => {
    const [inTime = "", outTime = ""] = String(schedule || "").split("-").map((s) => s.trim());
    return { inTime, outTime };
};
/** El pedido tal como viaja en la solicitud (`metadata` del payload). */
export function pedidoDesdeSolicitud(m) {
    return {
        desde: fechaISO(m?.startDate),
        hasta: fechaISO(m?.dueDate),
        fechas: Array.isArray(m?.fechasTrabajadas) ? m.fechasTrabajadas.map((f) => fechaISO(f)).filter(Boolean) : undefined,
        dias: Array.isArray(m?.diasSemana) ? m.diasSemana.map(Number) : [],
        rotativos: !!m?.diasRotativos,
        ...partirHorario(m?.schedule),
        shiftIds: idsDeTurno(m?.areaShiftAssignments),
    };
}
/** Todo lo que la persona ya tiene comprometido: contratos (todos los proyectos) y solicitudes pendientes. */
export async function compromisosDePersona(tenantId, userId, excluirSolicitudId) {
    if (!Types.ObjectId.isValid(userId))
        return [];
    const uid = new Types.ObjectId(userId);
    /*
      SÓLO LOS PROYECTOS DEL TENANT (18/11/2026). `UserProject` no tiene `tenantId`: se acota por los
      proyectos del tenant. Antes se buscaba por `userId` solo.
    */
    const proyectosDelTenant = await Project.find({ tenantId }).distinct("_id");
    const [asignaciones, pendientes] = await Promise.all([
        UserProject.find({ userId: uid, projectId: { $in: proyectosDelTenant } })
            .select("projectId nombre_proyecto contracts.empresaContratoId contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.dias_semana contracts.dias_rotativos contracts.fechas_trabajadas contracts.hora_inicio contracts.hora_fin contracts.shiftId contracts.areaShiftAssignments contracts.nombre_turno contracts.nombre_contrato contracts.tipo_contrato_id contracts.contrato_id contracts.estadoContrato")
            .lean(),
        User.find({
            tenantId,
            "metadata.isSolicitud": true,
            "metadata.solicitudStatus": "pendiente",
            "metadata.solicitudUserId": { $in: [userId, uid] },
            ...(excluirSolicitudId && Types.ObjectId.isValid(excluirSolicitudId) ? { _id: { $ne: new Types.ObjectId(excluirSolicitudId) } } : {}),
        })
            .select("metadata.startDate metadata.dueDate metadata.fechasTrabajadas metadata.diasSemana metadata.diasRotativos metadata.schedule metadata.areaShiftAssignments metadata.projectIds")
            .lean(),
    ]);
    const proyectoIds = [...asignaciones.map((a) => a.projectId), ...pendientes.flatMap((p) => p.metadata?.projectIds || [])].filter((id) => id && Types.ObjectId.isValid(String(id)));
    const proyectos = proyectoIds.length ? await Project.find({ _id: { $in: proyectoIds } }).select("name clientId").populate("clientId", "name").lean() : [];
    const nombreDe = new Map(proyectos.map((p) => [String(p._id), p.clientId?.name ? `${p.clientId.name} | ${p.name}` : p.name]));
    /*
      CONTRATOS SIN DÍAS PERO CON TURNO: se usan los días del turno. Casi todos los contratos que vienen de
      FRAME no traen días de la semana (FRAME no los manda); los que tienen turno asignado igual dicen qué
      días trabaja la persona. Sin días ni turno, la regla lo trata como «podría pisarse» y lo dice.
    */
    const turnosSinDias = [
        ...new Set(asignaciones.flatMap((a) => (a.contracts || []).filter((c) => !(Array.isArray(c.dias_semana) && c.dias_semana.length)).flatMap((c) => idsDeTurno(c.areaShiftAssignments, c.shiftId)))),
    ].filter((id) => Types.ObjectId.isValid(id));
    const turnos = turnosSinDias.length ? await Shift.find({ _id: { $in: turnosSinDias } }).select("days").lean() : [];
    const diasDelTurno = new Map(turnos.map((t) => [String(t._id), (t.days || []).map(Number)]));
    const diasDe = (c) => {
        if (Array.isArray(c.dias_semana) && c.dias_semana.length)
            return c.dias_semana.map(Number);
        return [...new Set(idsDeTurno(c.areaShiftAssignments, c.shiftId).flatMap((id) => diasDelTurno.get(id) || []))].sort();
    };
    const compromisos = [];
    for (const a of asignaciones) {
        for (const [contractIndex, c] of (a.contracts || []).entries()) {
            const desde = fechaISO(c.fecha_alta_contrato);
            if (!desde)
                continue;
            // Un contrato anulado (la lápida que queda en su lugar) no compromete a nadie: ni avisa ni traba.
            if (c.estadoContrato === "ANULADO")
                continue;
            compromisos.push({
                origen: "contrato",
                proyectoNombre: nombreDe.get(String(a.projectId)) || a.nombre_proyecto || "",
                desde,
                hasta: fechaISO(c.fecha_baja_contrato),
                // Por días sueltos: los días exactos, no todos los de la semana que caen en el período.
                fechas: Array.isArray(c.fechas_trabajadas) && c.fechas_trabajadas.length ? c.fechas_trabajadas.map((f) => fechaISO(f)).filter(Boolean) : undefined,
                dias: diasDe(c),
                rotativos: !!c.dias_rotativos,
                inTime: c.hora_inicio || "",
                outTime: c.hora_fin || "",
                shiftIds: idsDeTurno(c.areaShiftAssignments, c.shiftId),
                turnoNombre: c.nombre_turno || "",
                tipo: { nombre_contrato: c.nombre_contrato, tipo_contrato_id: c.tipo_contrato_id, contrato_id: c.contrato_id },
                ref: { userProjectId: String(a._id), contractIndex },
                empresaId: c.empresaContratoId ? String(c.empresaContratoId) : "",
            });
        }
    }
    for (const p of pendientes) {
        const pedido = pedidoDesdeSolicitud(p.metadata);
        if (!pedido.desde && !pedido.fechas?.length)
            continue;
        compromisos.push({ origen: "solicitud", proyectoNombre: nombreDe.get(String(p.metadata?.projectIds?.[0])) || "", ...pedido });
    }
    return compromisos;
}
/**
 * Lee el trámite de un contrato: tipo → plantilla → el estado impositivo que la reclama, el mismo camino
 * que el tag de las pantallas (`estadoImpositivoDelContrato`). No se usa el estado del contrato: avanza por
 * el circuito y deja de decir el trámite. Sin plantilla o sin estado que la reclame, `null`: no se adivina.
 */
async function lectorDeTramites() {
    const [plantillas, estados] = await Promise.all([
        ContratoFrame.find().select("name data.id data.nombre contratoId contratoIds").lean(),
        Info.find({ type: "estado-empleado", "data.esImpositivo": true }).select("data.tipoImpositivo data.contratoFrameIds").lean(),
    ]);
    return (tipo) => {
        if (!tipo)
            return null;
        const id = tipo.contrato_id ? String(tipo.contrato_id) : "";
        const plantilla = plantillaDelContrato(tipo, plantillas) || (id ? plantillas.find((p) => [p.contratoId, ...(p.contratoIds || [])].some((c) => String(c) === id)) : null);
        if (!plantilla)
            return null;
        const estado = estados.find((e) => (e.data?.contratoFrameIds || []).some((f) => String(f) === String(plantilla._id)));
        return estado?.data?.tipoImpositivo || null;
    };
}
/**
 * LAS BAJAS DE ARCA SOBRE LOS CONTRATOS (18/11/2026). Un contrato a tiempo indeterminado sin fecha de baja
 * en WeProdu cubre cualquier fecha futura, aunque en ARCA la relación ya terminó: la baja llega al espejo
 * (`RelacionLaboralArca`) pero no al contrato. Antes de mirar si se pisa, cada contrato toma la baja de
 * ARCA con el MISMO match de la presentación de altas (`bajaDeArcaQueAplica`: CUIL + CUIT de la empresa
 * del contrato + fecha de alta exacta). Sin empresa, sin CUIT o sin relación en ARCA queda como está.
 * `cuitDe`: `empresaId` → CUIT. Puro.
 */
export function compromisosConBajasDeArca(compromisos, relaciones, cuil, cuitDe) {
    return compromisos.map((c) => {
        if (c.origen !== "contrato")
            return c;
        const cuit = c.empresaId ? cuitDe(c.empresaId) : "";
        const otrasAltas = compromisos.filter((o) => o !== c && o.origen === "contrato" && o.empresaId === c.empresaId && o.desde).map((o) => o.desde);
        const r = bajaDeArcaQueAplica({ cuil, cuit, alta: c.desde, baja: c.hasta }, relaciones, { otrasAltas });
        return r ? { ...c, hasta: r.fin, bajaSegunArca: { hastaContrato: c.hasta, empleadoraCuit: cuit } } : c;
    });
}
const digitos = (v) => String(v ?? "").replace(/\D/g, "");
/**
 * Los contratos de la persona con las bajas de ARCA aplicadas (ver `compromisosConBajasDeArca`), y lo que
 * hizo falta para eso: el CUIL, el CUIT y el nombre de cada empresa y las relaciones de ARCA (de ahí sale
 * también la liquidación de cada alta, ver `altasArcaEnFechas`).
 */
async function contratosConBajasDeArca(tenantId, userId, compromisos) {
    const empresaIds = [...new Set(compromisos.map((c) => c.empresaId || "").filter((id) => Types.ObjectId.isValid(id)))];
    const vacio = { contratos: compromisos, cuil: "", relaciones: [], cuitDe: (_id) => "", nombreEmpresa: (_id) => "" };
    if (empresaIds.length === 0)
        return vacio;
    const [usuario, empresas] = await Promise.all([User.findById(userId).select("metadata.cuit").lean(), Company.find({ _id: { $in: empresaIds } }).select("cuit name").lean()]);
    const cuits = new Map(empresas.map((e) => [String(e._id), digitos(e.cuit)]));
    const nombres = new Map(empresas.map((e) => [String(e._id), String(e.name || "")]));
    const cuitDe = (id) => cuits.get(id) || "";
    const nombreEmpresa = (id) => nombres.get(id) || "";
    const cuil = digitos(usuario?.metadata?.cuit);
    if (cuil.length !== 11)
        return { ...vacio, cuitDe, nombreEmpresa };
    const relaciones = await relacionesArcaDe(tenantId, [cuil]);
    return { contratos: compromisosConBajasDeArca(compromisos, relaciones, cuil, cuitDe), cuil, relaciones, cuitDe, nombreEmpresa };
}
/**
 * La liquidación de cada tipo de contrato: el código del tipo (por `contrato_id`, o por el nombre en los
 * contratos viejos) con la cascada global, como el registro de alta (`afipCompleteness`, sin escalón de empresa).
 */
async function lectorDeLiquidacion() {
    const [tipos, dg] = await Promise.all([Contrato.find().select("name data.afipModalidadLiquidacion").lean(), getArcaDefaults().catch(() => null)]);
    const porId = new Map(tipos.map((t) => [String(t._id), t]));
    return (tipo) => {
        const t = (tipo?.contrato_id && porId.get(String(tipo.contrato_id))) || buscarTipoContrato(tipos, tipo?.nombre_contrato);
        return conCascada(t?.data?.afipModalidadLiquidacion, "tipo_contrato", "modalidadLiquidacion", undefined, dg || undefined).valor;
    };
}
export async function altasArcaEnFechas(tenantId, userId, pedido, excluir) {
    if (!userId)
        return [];
    const { contratos, cuil, relaciones, cuitDe, nombreEmpresa } = await contratosConBajasDeArca(tenantId, userId, (await compromisosDePersona(tenantId, userId)).filter((c) => c.origen === "contrato" && !(excluir && c.ref?.userProjectId === excluir.userProjectId && c.ref?.contractIndex === excluir.contractIndex)));
    const enFechas = contratos.filter((c) => contratoEnLasFechas(pedido, [c]));
    if (enFechas.length === 0)
        return [];
    const [tramiteDe, liquidacionDelTipo] = await Promise.all([lectorDeTramites(), lectorDeLiquidacion()]);
    const altas = [];
    for (const c of enFechas) {
        if (tramiteDe(c.tipo) !== "alta_temprana_afip")
            continue;
        const cuit = c.empresaId ? cuitDe(c.empresaId) : "";
        const relacion = cuil && cuit ? relaciones.find((r) => r.cuil === cuil && r.empleadoraCuit === cuit && r.inicio === c.desde) : undefined;
        const l = liquidacionDelAlta(relacion?.modLiquidacion, liquidacionDelTipo(c.tipo));
        altas.push({ ...c, liquidacion: l.liquidacion, origenLiquidacion: l.origen, empresaNombre: c.empresaId ? nombreEmpresa(c.empresaId) : "" });
    }
    // Rastro de cada alta que entró en la decisión: con qué baja y qué liquidación.
    for (const a of altas) {
        console.log(`[alta-vigente] user ${userId}: contrato ${a.ref?.userProjectId}#${a.ref?.contractIndex} (${a.proyectoNombre || "?"}, ${a.desde} → ${a.hasta || "sin baja"}${a.bajaSegunArca ? ` según ARCA; en el contrato ${a.bajaSegunArca.hastaContrato || "sin baja"}` : ""}) ` +
            `liquidación ${a.liquidacion} (${a.origenLiquidacion}), empresa ${a.empresaNombre || a.empresaId || "?"}`);
    }
    return altas;
}
/** La regla de `compartido/altaVigente.ts` sobre las altas de la persona en esas fechas. */
export async function decisionAltaDePersona(tenantId, userId, pedido, empresaId, excluir) {
    const altas = await altasArcaEnFechas(tenantId, userId, pedido, excluir);
    const d = decidirAltaVigente(altas, empresaId);
    return { ...d, altas, mensaje: d.soloServicios ? mensajeSoloServicios(d.soloServicios) : d.mismaEmpleadora ? mensajeMismaEmpleadora(d.mismaEmpleadora) : "" };
}
/**
 * Por qué este alta ante ARCA no se puede hacer, o `null`. Sólo frena el trámite de ARCA, no el de
 * Servicios. `empresaId`: la empresa del contrato nuevo (sin ella no se revisa la misma empleadora).
 */
export async function rechazoAltaArcaConContrato(tenantId, userId, tramite, pedido, empresaId, excluir) {
    if (tramite !== "alta_temprana_afip")
        return null;
    return (await decisionAltaDePersona(tenantId, userId, pedido, empresaId, excluir)).mensaje || null;
}
/** El trámite de un tipo de contrato por su `_id` (tipo → plantilla → estado impositivo), o `null`. */
export async function tramiteDelTipo(contratoId) {
    if (!contratoId || !Types.ObjectId.isValid(String(contratoId)))
        return null;
    return (await lectorDeTramites())({ contrato_id: String(contratoId) });
}
/** Los avisos de superposición de un alta para una persona. `[]` si no es una persona registrada. */
export async function superposicionesDeAlta(tenantId, userId, pedido, excluirSolicitudId) {
    if (!userId)
        return [];
    return superposiciones(pedido, await compromisosDePersona(tenantId, userId, excluirSolicitudId), hoyArgentina());
}
