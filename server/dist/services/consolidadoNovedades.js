/**
 * EL CONSOLIDADO DE NOVEDADES: de la base a la entrada de la regla (`utils/consolidadoNovedades.ts`).
 *
 * Junta, para un período y uno o más proyectos: los partes con su asistencia, los contratos de todo el
 * que tenga vínculo con el proyecto o figure en un parte, y los catálogos para poner nombres (áreas,
 * turnos, empresas, categorías, tipos de contrato, motivos, feriados, centro de costo). La regla es pura
 * y está testeada aparte; acá sólo se resuelven ids y nombres. Nada se escribe.
 *
 * Es por proyecto a propósito: una persona sin ningún parte en el mes es una alerta, y sin proyecto que
 * la acote serían las 1.500 personas del tenant.
 */
import { Types } from "mongoose";
import { Request } from "../models/Request.js";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Client } from "../models/Client.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { Company } from "../models/Company.js";
import { CategoriaSat } from "../models/CategoriaSat.js";
import { Info } from "../models/Info.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { Holiday } from "../models/Holiday.js";
import { CentroCosto } from "../models/CentroCosto.js";
import { fechaISO } from "../utils/contratoVigencia.js";
import { consolidarNovedades } from "../utils/consolidadoNovedades.js";
const oid = (v) => (v && Types.ObjectId.isValid(String(v)) ? new Types.ObjectId(String(v)) : null);
const str = (v) => (v === null || v === undefined ? "" : String(v)).trim();
const num = (v) => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; };
const etiquetaTurno = (t) => (t ? `${t.name}${t.startTime && t.endTime ? ` (${t.startTime} - ${t.endTime})` : ""}` : "");
export async function armarConsolidado(tenantId, o) {
    const proyectoOids = o.proyectoIds.map(oid).filter(Boolean);
    const proyectosRaw = await Project.find({ _id: { $in: proyectoOids }, tenantId }).select("name clientId centroCostoId centroCostoEmpresaTangoId").lean();
    const clientes = await Client.find({ _id: { $in: proyectosRaw.map((p) => p.clientId).filter(Boolean) } }).select("name").lean();
    const centrosRaw = await CentroCosto.find({ "data.id": { $in: proyectosRaw.map((p) => p.centroCostoId).filter((x) => Number.isFinite(Number(x)) && x !== null) } }).select("codAuxiliar descAuxiliar name data empresaTangoId").lean();
    const nombreCliente = new Map(clientes.map((c) => [String(c._id), str(c.name)]));
    const centroDe = (p) => {
        const candidatos = centrosRaw.filter((c) => Number(c.data?.id) === Number(p.centroCostoId));
        const c = candidatos.find((x) => !p.centroCostoEmpresaTangoId || x.empresaTangoId === p.centroCostoEmpresaTangoId) || candidatos[0];
        return c ? `${str(c.codAuxiliar) || str(c.name)}${str(c.descAuxiliar) ? ` ${str(c.descAuxiliar)}` : ""}`.trim() : "";
    };
    const proyectos = proyectosRaw.map((p) => ({ id: String(p._id), nombre: str(p.name), cliente: nombreCliente.get(String(p.clientId || "")) || "", centroCosto: centroDe(p) }));
    const proyectoDe = new Map(proyectos.map((p) => [p.id, p]));
    const idsProyecto = proyectos.map((p) => new Types.ObjectId(p.id));
    const [partesRaw, ups, areas, turnos, empresas, categorias, tipos, motivosRaw, feriadosRaw] = await Promise.all([
        Request.find({ tenantId, projectId: { $in: idsProyecto }, date: { $gte: o.desde, $lte: o.hasta } }).select("reportNumber date projectId areaId shiftId userId comments attendance").lean(),
        UserProject.find({ projectId: { $in: idsProyecto } }).select("userId projectId contracts").lean(),
        Area.find({ tenantId }).select("name").lean(),
        Shift.find({ tenantId }).select("name startTime endTime").lean(),
        Company.find({}).select("razonSocial").lean(),
        CategoriaSat.find({}).select("name data.id").lean(),
        Info.find({ type: "contrato" }).select("name data.id").lean(),
        RequestConfig.find({ tenantId }).select("name order").sort({ order: 1, name: 1 }).lean(),
        Holiday.find({ tenantId, date: { $gte: new Date(`${o.desde}T00:00:00Z`), $lte: new Date(`${o.hasta}T23:59:59Z`) } }).select("date name").lean(),
    ]);
    const areaPorId = new Map(areas.map((a) => [String(a._id), str(a.name)]));
    const turnoPorId = new Map(turnos.map((t) => [String(t._id), t]));
    const empresaPorId = new Map(empresas.map((e) => [String(e._id), str(e.razonSocial)]));
    const categoriaPorNum = new Map(categorias.map((c) => [Number(c.data?.id), str(c.name)]));
    const tipoPorNum = new Map(tipos.map((t) => [Number(t.data?.id), str(t.name)]));
    const unicoPorHorario = (entrada, salida) => { if (!entrada || !salida)
        return null; const m = turnos.filter((t) => t.startTime === entrada && t.endTime === salida); return m.length === 1 ? m[0] : null; };
    // Personas: vínculos del proyecto, quien figure en un parte, reemplazantes y responsables.
    const idsPersonas = new Set();
    for (const up of ups)
        idsPersonas.add(String(up.userId));
    for (const p of partesRaw) {
        idsPersonas.add(String(p.userId || ""));
        for (const a of p.attendance || []) {
            idsPersonas.add(String(a.employeeId || ""));
            if (a.replacementId)
                idsPersonas.add(String(a.replacementId));
        }
    }
    idsPersonas.delete("");
    const usuarios = await User.find({ _id: { $in: [...idsPersonas].map(oid).filter(Boolean) } }).select("firstName lastName email metadata.cuit metadata.numeroLegajoTango metadata.fullName").lean();
    const personas = usuarios.map((u) => ({
        id: String(u._id),
        nombre: [str(u.lastName), str(u.firstName)].filter(Boolean).join(", ") || str(u.metadata?.fullName) || str(u.email) || String(u._id),
        cuil: str(u.metadata?.cuit).replace(/\D/g, ""),
        legajo: str(u.metadata?.numeroLegajoTango),
    }));
    const nombreDe = new Map(personas.map((p) => [p.id, p.nombre]));
    const contratos = [];
    for (const up of ups) {
        const proyecto = proyectoDe.get(String(up.projectId));
        if (!proyecto)
            continue;
        (up.contracts || []).forEach((c, i) => {
            if (!c || c.estadoContrato === "ANULADO")
                return; // lápida (etapa 2b)
            const alta = fechaISO(c.fecha_alta_contrato);
            if (!alta)
                return;
            const asignaciones = Array.isArray(c.areaShiftAssignments) ? c.areaShiftAssignments : [];
            const idsTurno = [...new Set([...(c.shiftId ? [String(c.shiftId)] : []), ...asignaciones.flatMap((a) => (a?.shiftIds || []).map(String))])];
            contratos.push({
                key: String(c.contratoKey || `${up._id}#${i}`),
                personaId: String(up.userId),
                proyectoId: proyecto.id,
                proyecto: proyecto.nombre,
                centroCosto: proyecto.centroCosto,
                alta,
                baja: fechaISO(c.fecha_baja_contrato),
                tipo: str(c.nombre_contrato) || tipoPorNum.get(Number(c.tipo_contrato_id)) || "",
                tipoId: str(c.tipo_contrato_id),
                empresa: str(c.nombre_empresa_contrato) || empresaPorId.get(String(c.empresaContratoId || "")) || "",
                empresaId: str(c.empresaContratoId),
                categoria: str(c.nombre_categoria_sat) || categoriaPorNum.get(Number(c.categoria_sat_id)) || "",
                categoriaId: str(c.categoria_sat_id),
                area: str(c.nombre_area) || areaPorId.get(String(c.areaId || asignaciones[0]?.areaId || "")) || "",
                turno: str(c.nombre_turno) || idsTurno.map((id) => str(turnoPorId.get(id)?.name)).filter(Boolean).join(", "),
                horaInicio: str(c.hora_inicio),
                horaFin: str(c.hora_fin),
                sueldoJornada: num(c.sueldo_jornada),
                sueldoMano: num(c.sueldo_mano),
                fechasTrabajadas: [...new Set((Array.isArray(c.fechas_trabajadas) ? c.fechas_trabajadas : []).map((f) => fechaISO(String(f))).filter(Boolean))].sort(),
                diasSemana: [...new Set((Array.isArray(c.dias_semana) ? c.dias_semana : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))],
                rotativo: !!c.dias_rotativos,
            });
        });
    }
    const partes = partesRaw.map((p) => {
        const proyecto = proyectoDe.get(String(p.projectId || ""));
        const turnoParte = turnoPorId.get(String(p.shiftId || ""));
        return {
            numero: str(p.reportNumber),
            fecha: str(p.date).slice(0, 10),
            proyectoId: proyecto.id,
            proyecto: proyecto.nombre,
            area: areaPorId.get(String(p.areaId || "")) || "",
            turno: etiquetaTurno(turnoParte),
            responsable: nombreDe.get(String(p.userId || "")) || "",
            comentario: str(p.comments),
            registros: (p.attendance || []).map((a) => {
                const entradaPrevista = str(a.scheduleInTime), salidaPrevista = str(a.scheduleOutTime);
                // El turno de la fila: el suyo si va dos veces en el parte, el del parte, o el único que tiene ese horario.
                const turno = turnoPorId.get(String(a.shiftId || "")) || turnoParte || unicoPorHorario(entradaPrevista, salidaPrevista);
                return {
                    personaId: String(a.employeeId || ""),
                    status: str(a.status),
                    motivo: str(a.absenceReason),
                    reemplazanteId: a.replacementId ? String(a.replacementId) : "",
                    extras: Number(a.overtimeHours) || 0,
                    h50: Number(a.overtimeHours50) || 0,
                    h100: Number(a.overtimeHours100) || 0,
                    entradaReal: str(a.inTime),
                    salidaReal: str(a.outTime),
                    entradaPrevista,
                    salidaPrevista,
                    area: areaPorId.get(String(a.areaId || p.areaId || "")) || "",
                    turno: etiquetaTurno(turno),
                };
            }),
        };
    });
    const feriados = feriadosRaw.map((h) => ({ fecha: new Date(h.date).toISOString().slice(0, 10), nombre: str(h.name) })).filter((h) => h.fecha >= o.desde && h.fecha <= o.hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const motivos = [...new Set(motivosRaw.map((m) => str(m.name)).filter(Boolean))];
    const resultado = consolidarNovedades({ desde: o.desde, hasta: o.hasta, personas, contratos, partes, feriados, motivos });
    return { desde: o.desde, hasta: o.hasta, proyectos, feriados, motivos, ...resultado, totales: { resumen: resultado.resumen.length, detalle: resultado.detalle.length, partes: resultado.partes.length, revisar: resultado.revisar.length } };
}
