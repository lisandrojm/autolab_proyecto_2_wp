import { Order } from "../models/Order.js";
import { OrderConfig } from "../models/OrderConfig.js";
import { Project } from "../models/Project.js";
import { Notification } from "../models/Notification.js";
import UserProject from "../models/UserProject.js";
import { cambiarTurnoEnFila, claveAreaTurno, clavesDelMiembro, sedeDe, sedePrincipalDe } from "../compartido/areaTurno.js";
import { CATEGORIA_CAMBIO_TURNO, reglasCambioTurnoDe } from "../compartido/cambioDeTurno.js";
import { asignarAreasDeMiembro } from "./areasDeMiembro.js";
import { filaSegunContratos } from "./equipoSegunContratos.js";
import { validarPedidoCambioDeTurno } from "./cambioDeTurno.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
import { getPlainOrderNumber } from "../utils/orderHelpers.js";
const pedidoDe = (order) => {
    const p = order?.dynamicValue;
    return p && typeof p === "object" && p.projectId && p.areaId && p.shiftActualId && p.shiftSolicitadoId ? p : null;
};
const fotoDe = (order) => {
    if (!order.metadata || typeof order.metadata !== "object")
        order.metadata = {};
    if (!order.metadata.cambioTurno || typeof order.metadata.cambioTurno !== "object")
        order.metadata.cambioTurno = {};
    return order.metadata.cambioTurno;
};
/** `order.metadata.cambioTurno` cambió: que Mongoose lo note (es Mixed). */
const anotar = (order, cambios) => {
    Object.assign(fotoDe(order), cambios);
    if (typeof order.markModified === "function")
        order.markModified("metadata");
};
const esDeCambioDeTurno = (category) => category?.categoryType === CATEGORIA_CAMBIO_TURNO;
/** Dónde está la persona hoy en el proyecto (equipo + contrato que rige), como la lee todo lo demás. */
async function asignacionesHoy(project, userId, hoy) {
    const ctxSede = { areasConfig: project.areasConfig || [], sedePrincipal: sedePrincipalDe(project.metadata) };
    const vinculo = await UserProject.findOne({ userId, projectId: project._id }).select("contracts").lean();
    const fila = (project.teamConfig || []).find((c) => String(c.userId?._id ?? c.userId) === String(userId)) || null;
    const vista = filaSegunContratos(fila ? (typeof fila.toObject === "function" ? fila.toObject() : fila) : { userId }, vinculo?.contracts || [], hoy);
    return { asignaciones: vista?.areaShiftAssignments || [], ctxSede };
}
/** Mueve a la persona de `de` a `a` en la fila del pedido. Devuelve qué pasó; no toca el pedido. */
async function mover(order, de, a, ctx, hoy, motivo) {
    const pedido = pedidoDe(order);
    const project = await Project.findOne({ _id: pedido.projectId, tenantId: ctx.tenantId }).select("teamConfig areasConfig metadata.sedeIds metadata.sedeId");
    if (!project)
        throw new Error("El proyecto del pedido ya no existe.");
    const userId = String(order.userId?._id ?? order.userId);
    const { asignaciones, ctxSede } = await asignacionesHoy(project, userId, hoy);
    const sedeId = sedeDe(pedido.sedeId);
    const nuevas = cambiarTurnoEnFila(asignaciones, { areaId: pedido.areaId, sedeId, deShiftId: de, aShiftId: a }, ctxSede);
    if (!nuevas) {
        // ¿Ya está en el destino? Entonces no hay nada que hacer (idempotencia). Si no, alguien la movió a otro lado.
        return clavesDelMiembro(asignaciones, ctxSede).has(claveAreaTurno({ areaId: pedido.areaId, shiftId: a, sedeId })) ? "ya_estaba" : "no_estaba";
    }
    await asignarAreasDeMiembro({
        tenantId: ctx.tenantId,
        project,
        userId,
        asignaciones: nuevas,
        porUserId: ctx.porUserId,
        origen: "pedido-cambio-turno",
        payload: { orderId: String(order._id), orderNumber: order.orderNumber, accion: motivo, deShiftId: de, aShiftId: a },
    });
    return "movido";
}
const avisar = (ctx, order, title, message) => Notification.create({ tenantId: ctx.tenantId, userId: order.userId?._id ?? order.userId, type: "order", title, message, linkUrl: `/orders/${order._id}` }).catch((e) => console.warn("[cambio-turno] no se pudo avisar:", e?.message || e));
/**
 * ANTES DE APROBAR: el contexto pudo cambiar desde que se pidió (la movieron de turno, le aprobaron
 * vacaciones encima). Se revalida sin la anticipación. Si falla, la ruta contesta 422 y NO aprueba.
 */
export async function revalidarAlAprobar(order, category, ctx) {
    if (!esDeCambioDeTurno(category))
        return { ok: true, errores: [] };
    const pedido = pedidoDe(order);
    if (!pedido)
        return { ok: false, errores: [{ codigo: "pedido_incompleto", mensaje: "El pedido no tiene los datos del cambio de turno." }] };
    const r = await validarPedidoCambioDeTurno(ctx.tenantId, String(order.userId?._id ?? order.userId), pedido, { reglas: reglasCambioTurnoDe(category?.config), excluirOrderId: String(order._id), hoy: ctx.hoy, alAprobar: true });
    return { ok: r.ok, errores: r.errores };
}
/** ¿Este pedido ya está en condiciones de aplicarse? Aprobado, firmado si el tipo firma, y con la fecha llegada. */
export function listoParaAplicar(order, category, hoy) {
    if (!esDeCambioDeTurno(category) || order.status !== "approved")
        return false;
    if (category?.requiresSignature && order.signatureStatus !== "signed")
        return false;
    const pedido = pedidoDe(order);
    if (!pedido || !pedido.fechaDesde || pedido.fechaDesde > hoy)
        return false;
    return !fotoDe(order).aplicado;
}
/**
 * APLICAR SI CORRESPONDE. Lo llaman la aprobación, la confirmación de firma y el cron. Escribe el equipo y
 * anota en `metadata.cambioTurno` (`aplicado` o `fallo`); el PEDIDO LO GUARDA QUIEN LLAMA (las rutas ya
 * tienen el documento abierto y lo guardan después; el cron guarda acá mismo con `guardar: true`).
 * Devuelve qué pasó, o null si no correspondía.
 */
export async function aplicarSiCorresponde(order, category, ctx, opciones = {}) {
    const hoy = ctx.hoy || hoyArgentina();
    if (!listoParaAplicar(order, category, hoy))
        return null;
    const pedido = pedidoDe(order);
    // Revalidar justo antes de escribir: lo que importa acá es que siga en el turno de origen y sin ausencias encima.
    const r = await validarPedidoCambioDeTurno(ctx.tenantId, String(order.userId?._id ?? order.userId), pedido, { reglas: reglasCambioTurnoDe(category?.config), excluirOrderId: String(order._id), hoy, alAprobar: true });
    const foto = fotoDe(order);
    let resultado;
    if (!r.ok && !r.errores.every((e) => e.codigo === "mismo_turno")) {
        // «mismo_turno» acá es que YA ESTÁ en el destino: se trata abajo como aplicado. Cualquier otra cosa es un fallo.
        resultado = "fallo";
        const primeraVez = !foto.fallo;
        anotar(order, { fallo: { el: hoy, errores: r.errores } });
        if (primeraVez)
            await avisar(ctx, order, "No se pudo aplicar tu cambio de turno", `Tu pedido N°: ${getPlainOrderNumber(order.orderNumber)} no se pudo aplicar: ${r.errores.map((e) => e.mensaje).join(" ")}`);
    }
    else {
        resultado = await mover(order, pedido.shiftActualId, pedido.shiftSolicitadoId, ctx, hoy, "aplicar");
        if (resultado === "no_estaba") {
            const primeraVez = !foto.fallo;
            anotar(order, { fallo: { el: hoy, errores: [{ codigo: "turno_actual_distinto", mensaje: "Ya no estás en el turno desde el que pediste el cambio." }] } });
            if (primeraVez)
                await avisar(ctx, order, "No se pudo aplicar tu cambio de turno", `Tu pedido N°: ${getPlainOrderNumber(order.orderNumber)} no se pudo aplicar: ya no estás en el turno desde el que lo pediste.`);
        }
        else {
            anotar(order, { aplicado: { el: hoy, por: ctx.porUserId || null }, fallo: null });
            if (resultado === "movido")
                await avisar(ctx, order, "Cambio de turno aplicado", `Desde hoy estás en el turno ${foto.turnoSolicitadoNombre || "pedido"}${pedido.fechaHasta ? ` hasta el ${fechaCorta(pedido.fechaHasta)}` : ""}.`);
        }
    }
    if (opciones.guardar)
        await Order.updateOne({ _id: order._id }, { $set: { "metadata.cambioTurno": foto } });
    return resultado;
}
/** Con `fechaHasta` vencida y el cambio aplicado: devolver a la persona a su turno original. */
export async function revertirSiCorresponde(order, category, ctx, opciones = {}) {
    const hoy = ctx.hoy || hoyArgentina();
    const pedido = pedidoDe(order);
    const foto = fotoDe(order);
    if (!esDeCambioDeTurno(category) || !pedido || !pedido.fechaHasta || pedido.fechaHasta >= hoy || !foto.aplicado || foto.revertido)
        return null;
    const resultado = await mover(order, pedido.shiftSolicitadoId, pedido.shiftActualId, ctx, hoy, "revertir");
    // Si ya no estaba en el turno pedido, alguien la movió después: no hay nada que devolver, y no se insiste.
    anotar(order, { revertido: { el: hoy, nota: resultado === "no_estaba" ? "No estaba en el turno pedido al vencer el cambio: no se tocó el equipo." : null } });
    if (resultado === "movido")
        await avisar(ctx, order, "Fin del cambio de turno", `Terminó tu cambio de turno temporal: desde hoy volvés al turno ${foto.turnoActualNombre || "original"}.`);
    if (opciones.guardar)
        await Order.updateOne({ _id: order._id }, { $set: { "metadata.cambioTurno": foto } });
    return resultado;
}
const fechaCorta = (iso) => {
    const [y, m, d] = String(iso || "").split("-");
    return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : iso;
};
/**
 * EL BARRIDO DIARIO (lo llama `cambioTurnoCronService.ts`): en todos los tenants, aplicar los cambios cuya
 * fecha llegó y revertir los temporales vencidos. Devuelve cuántos de cada cosa, para el log.
 */
export async function barridoDiarioDeCambiosDeTurno(hoy = hoyArgentina()) {
    const tipos = await OrderConfig.find({ categoryType: CATEGORIA_CAMBIO_TURNO }).lean();
    const r = { aplicados: 0, revertidos: 0, fallos: 0 };
    for (const tipo of tipos) {
        const ctx = { tenantId: tipo.tenantId, hoy };
        const pedidos = await Order.find({ tenantId: tipo.tenantId, categoryId: tipo._id, status: "approved" }).lean();
        for (const order of pedidos) {
            try {
                const aplicado = await aplicarSiCorresponde(order, tipo, ctx, { guardar: true });
                if (aplicado === "movido" || aplicado === "ya_estaba")
                    r.aplicados++;
                else if (aplicado === "fallo" || aplicado === "no_estaba")
                    r.fallos++;
                const revertido = await revertirSiCorresponde(order, tipo, ctx, { guardar: true });
                if (revertido === "movido")
                    r.revertidos++;
            }
            catch (e) {
                r.fallos++;
                console.error(`[cambio-turno] pedido ${order.orderNumber || order._id}:`, e?.message || e);
            }
        }
    }
    return r;
}
