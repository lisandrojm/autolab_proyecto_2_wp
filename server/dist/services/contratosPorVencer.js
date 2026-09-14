import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { RoleFrame } from "../models/RoleFrame.js";
import { RenovacionContrato } from "../models/RenovacionContrato.js";
import { alcanceDeResponsable } from "../utils/visibilidadResponsable.js";
import { fechaISO, hoyArgentina } from "../utils/contratoVigencia.js";
/** Con cuánta anticipación aparece un contrato: una semana antes de su fecha de baja. */
export const DIAS_DE_AVISO = 7;
// Fechas "YYYY-MM-DD" como días calendario: al mediodía UTC, para que ningún huso corra el día.
const sumarDias = (iso, dias) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
};
const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
const idDe = (x) => (x && typeof x === "object" ? String(x._id ?? "") : x ? String(x) : "");
/**
 * Cómo puede estar escrita, en día/mes/año, una fecha de la ventana: con "/" o "-", y con o sin cero
 * adelante en el día y el mes. Son las formas que `fechaISO` acepta además de la ISO.
 */
export const variantesDMY = (desde, dias) => {
    const formas = new Set();
    for (let i = 0; i <= dias; i++) {
        const [y, m, d] = sumarDias(desde, i).split("-");
        for (const sep of ["/", "-"])
            for (const mm of [m, String(Number(m))])
                for (const dd of [d, String(Number(d))])
                    formas.add(`${dd}${sep}${mm}${sep}${y}`);
    }
    return [...formas];
};
/** Las combinaciones área/turno de un contrato. */
const combosDeContrato = (c) => {
    const desdeAsignaciones = (c.areaShiftAssignments || [])
        .map((a) => ({ areaId: idDe(a.areaId), shiftIds: (a.shiftIds || []).map(idDe).filter(Boolean) }))
        .filter((a) => a.areaId && a.shiftIds.length > 0);
    if (desdeAsignaciones.length > 0)
        return desdeAsignaciones;
    return idDe(c.areaId) && idDe(c.shiftId) ? [{ areaId: idDe(c.areaId), shiftIds: [idDe(c.shiftId)] }] : [];
};
// Lo que se lee de cada contrato. Los contratos cargan documentación y firmas: traerlos enteros pesa.
const CAMPOS_CONTRATO = ["fecha_alta_contrato", "fecha_baja_contrato", "nombre_contrato", "nombre_rol_frame", "rol_frame_id", "nombre_area", "nombre_turno", "areaId", "shiftId", "areaShiftAssignments", "hora_inicio", "hora_fin", "sueldo_jornada", "dias_por_semana", "dias_semana", "dias_rotativos", "empresaContratoId"];
/*
  CACHÉ CORTA, POR PERSONA.

  El inicio pide el número y Contratación la lista, casi siempre uno detrás del otro: sin esto el mismo
  cálculo corría dos veces seguidas. Se guarda la PROMESA y no el resultado, así un pedido que llega
  mientras el otro todavía calcula se suma a ese en vez de largar otro igual.

  Un minuto alcanza para ese ir y venir. Decidir sobre un contrato la vacía entera
  (`olvidarContratosPorVencer`): la decisión cambia la lista del supervisor Y la de los coordinadores.
*/
const CACHE_MS = 60_000;
const cache = new Map();
export function olvidarContratosPorVencer() {
    cache.clear();
}
export function listarContratosPorVencer(tenantId, userId, hoy = hoyArgentina()) {
    const ahora = Date.now();
    for (const [k, v] of cache)
        if (v.hasta <= ahora)
            cache.delete(k);
    const clave = `${tenantId}:${userId}:${hoy}`;
    const guardado = cache.get(clave);
    if (guardado)
        return guardado.promesa;
    const promesa = calcular(tenantId, userId, hoy);
    cache.set(clave, { hasta: ahora + CACHE_MS, promesa });
    // Un error no se guarda: el próximo pedido vuelve a intentar.
    promesa.catch(() => cache.delete(clave));
    return promesa;
}
async function calcular(tenantId, userId, hoy) {
    const t0 = Date.now();
    const tenant = new Types.ObjectId(String(tenantId));
    const yo = new Types.ObjectId(String(userId));
    // 1. De qué proyectos: los que supervisa (enteros) y los que coordina (sus áreas/turnos). En paralelo.
    const [{ proyectos: supervisados }, conCoordinacion] = await Promise.all([
        alcanceDeResponsable(tenant, String(userId)),
        Project.find({ tenantId: tenant, "coordinatorAssignments.userId": yo }).select("_id coordinatorAssignments").lean(),
    ]);
    const supervisa = new Set(supervisados.map(String));
    const coordina = new Map();
    for (const p of conCoordinacion) {
        const combos = new Set();
        for (const a of p.coordinatorAssignments || [])
            if (String(a.userId) === String(userId))
                combos.add(`${a.areaId}::${a.shiftId}`);
        coordina.set(String(p._id), combos);
    }
    const projectIds = [...new Set([...supervisa, ...coordina.keys()])];
    if (projectIds.length === 0)
        return [];
    const t1 = Date.now();
    /*
      2. Las asignaciones con algún contrato que termina en la ventana, FILTRADAS EN LA BASE.
  
      Antes se traían todas las de los proyectos a cargo y se filtraba acá: miles de asignaciones para
      quedarse con un puñado. Ahora la base sólo devuelve las que tienen una baja en la ventana, escrita
      como ISO (rango de texto: "2026-09-20" y "2026-09-20T03:00" caen adentro) o como día/mes/año (la
      lista de formas posibles). Lo usa el índice de `contracts.fecha_baja_contrato`. El filtro exacto
      sigue acá abajo: la base puede dejar pasar de más, nunca de menos.
    */
    const limite = sumarDias(hoy, DIAS_DE_AVISO);
    const seleccion = ["projectId", "userId", ...CAMPOS_CONTRATO.map((c) => `contracts.${c}`)].join(" ");
    const asignaciones = await UserProject.find({
        projectId: { $in: projectIds.map((id) => new Types.ObjectId(id)) },
        $or: [{ "contracts.fecha_baja_contrato": { $gte: hoy, $lt: sumarDias(limite, 1) } }, { "contracts.fecha_baja_contrato": { $in: variantesDMY(hoy, DIAS_DE_AVISO) } }],
    })
        .select(seleccion)
        .lean();
    const t2 = Date.now();
    const candidatos = [];
    for (const up of asignaciones) {
        const contratos = up.contracts || [];
        const pid = String(up.projectId);
        for (const c of contratos) {
            const alta = fechaISO(c.fecha_alta_contrato);
            const baja = fechaISO(c.fecha_baja_contrato);
            // Sin alta no se sabe cuánto dura; sin baja es por tiempo indeterminado y no vence.
            if (!alta || !baja)
                continue;
            if (alta > hoy || baja < hoy || baja > limite)
                continue;
            if (diasEntre(alta, baja) + 1 <= DIAS_DE_AVISO)
                continue;
            if (contratos.some((o) => o !== c && fechaISO(o.fecha_alta_contrato) > baja))
                continue;
            if (!supervisa.has(pid)) {
                const mios = coordina.get(pid);
                const suyos = combosDeContrato(c).flatMap((a) => a.shiftIds.map((s) => `${a.areaId}::${s}`));
                if (!mios || !suyos.some((k) => mios.has(k)))
                    continue;
            }
            candidatos.push({ up, c, alta, baja, pid });
        }
    }
    if (candidatos.length === 0) {
        avisarSiTardo(t0, t1, t2, Date.now(), asignaciones.length, 0);
        return [];
    }
    // 3. Lo ya resuelto y los nombres, todo junto: son consultas independientes.
    const combos = candidatos.map((x) => combosDeContrato(x.c)[0]);
    const [decisiones, personas, proyectos, areas, turnos, roles] = await Promise.all([
        RenovacionContrato.find({ tenantId: tenant, userProjectId: { $in: candidatos.map((x) => x.up._id) } }).lean(),
        User.find({ _id: { $in: candidatos.map((x) => x.up.userId) } }).select("firstName lastName metadata.fullName metadata.roles_frame").lean(),
        Project.find({ _id: { $in: candidatos.map((x) => x.up.projectId) } }).select("name clientId").populate("clientId", "name").lean(),
        Area.find({ _id: { $in: combos.filter(Boolean).map((a) => a.areaId) } }).select("name").lean(),
        Shift.find({ _id: { $in: combos.filter(Boolean).map((a) => a.shiftIds[0]) } }).select("name").lean(),
        RoleFrame.find({ "data.rol.id": { $in: candidatos.map((x) => Number(x.c.rol_frame_id)).filter((n) => Number.isFinite(n) && n > 0) } }).select("name data.rol.id").lean(),
    ]);
    // Una renovación rechazada, cancelada o borrada no resuelve nada.
    const decisionDe = new Map(decisiones.map((d) => [`${d.userProjectId}::${d.fechaBajaContrato}`, d]));
    const solicitudIds = decisiones.filter((d) => d.decision === "renovar" && d.solicitudId).map((d) => d.solicitudId);
    const solicitudes = solicitudIds.length > 0 ? await User.find({ _id: { $in: solicitudIds } }).select("metadata.solicitudStatus").lean() : [];
    const estadoDe = new Map(solicitudes.map((u) => [String(u._id), u.metadata?.solicitudStatus]));
    const personaDe = new Map(personas.map((u) => [String(u._id), u]));
    const proyectoDe = new Map(proyectos.map((p) => [String(p._id), p]));
    const areaDe = new Map(areas.map((a) => [String(a._id), a.name]));
    const turnoDe = new Map(turnos.map((s) => [String(s._id), s.name]));
    const rolDe = new Map(roles.map((r) => [Number(r.data?.rol?.id), r]));
    const resultado = [];
    candidatos.forEach((x, i) => {
        const { up, c, alta, baja, pid } = x;
        const d = decisionDe.get(`${up._id}::${baja}`);
        if (d?.decision === "dejar_vencer")
            return;
        const estado = d ? estadoDe.get(String(d.solicitudId)) : undefined;
        if (d && (estado === "pendiente" || estado === "aprobada"))
            return;
        const persona = personaDe.get(String(up.userId)) || {};
        const proyecto = proyectoDe.get(pid) || {};
        const nombre = persona.metadata?.fullName || `${persona.firstName || ""} ${persona.lastName || ""}`.trim() || "Sin nombre";
        const combo = combos[i];
        const rol = rolDe.get(Number(c.rol_frame_id));
        const horario = c.hora_inicio && c.hora_fin ? `${c.hora_inicio} - ${c.hora_fin}` : "";
        // La renovación arranca al día siguiente de la baja y dura lo mismo. Son sólo la precarga: se editan.
        const inicio = sumarDias(baja, 1);
        const rolesDeLaPersona = (persona.metadata?.roles_frame || []).map(String);
        resultado.push({
            userProjectId: String(up._id),
            userId: String(up.userId),
            nombre,
            projectId: pid,
            proyectoNombre: proyecto.name || "",
            clienteNombre: proyecto.clientId?.name || "",
            areaNombre: (combo && areaDe.get(combo.areaId)) || c.nombre_area || "",
            turnoNombre: (combo && turnoDe.get(combo.shiftIds[0])) || c.nombre_turno || "",
            rolFrame: c.nombre_rol_frame || rol?.name || "",
            contrato: c.nombre_contrato || "",
            horario,
            fechaAlta: alta,
            fechaBaja: baja,
            diasRestantes: diasEntre(hoy, baja),
            motivo: supervisa.has(pid) ? "supervisa" : "coordina",
            renovacionRechazada: !!d,
            plantilla: {
                firstName: persona.firstName || "",
                lastName: persona.lastName || "",
                metadata: {
                    fullName: nombre,
                    projectIds: [pid],
                    solicitudUserId: String(up.userId),
                    // El rol del contrato si se puede resolver; si no, el primero de la persona.
                    roles_frame: rol ? [String(rol._id)] : rolesDeLaPersona.slice(0, 1),
                    startDate: inicio,
                    dueDate: sumarDias(inicio, diasEntre(alta, baja)),
                    diasPorSemana: c.dias_por_semana ?? undefined,
                    diasSemana: Array.isArray(c.dias_semana) ? c.dias_semana : [],
                    diasRotativos: !!c.dias_rotativos,
                    schedule: horario || undefined,
                    dailyRate: c.sueldo_jornada || undefined,
                    empresaContratoId: c.empresaContratoId ? String(c.empresaContratoId) : undefined,
                    areaShiftAssignments: combosDeContrato(c),
                },
            },
        });
    });
    avisarSiTardo(t0, t1, t2, Date.now(), asignaciones.length, resultado.length);
    return resultado.sort((a, b) => a.fechaBaja.localeCompare(b.fechaBaja) || a.nombre.localeCompare(b.nombre));
}
/** Deja en el log cuánto tardó cada parte, sólo si el total pasó un segundo: es para saber DÓNDE, no cuánto siempre. */
function avisarSiTardo(t0, t1, t2, t3, asignaciones, porVencer) {
    if (t3 - t0 < 1000)
        return;
    console.log(`[POR-VENCER] ${t3 - t0} ms · proyectos a cargo ${t1 - t0} ms · asignaciones ${t2 - t1} ms (${asignaciones}) · decisiones y nombres ${t3 - t2} ms · ${porVencer} por vencer`);
}
