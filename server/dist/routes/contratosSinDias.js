import { Router } from "express";
import { Types } from "mongoose";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Shift } from "../models/Shift.js";
import "../models/Client.js";
import { fechaISO, hoyArgentina } from "../utils/contratoVigencia.js";
import { faltaDefinirDias } from "../compartido/diasDeTrabajo.js";
/*
  CONTRATOS SIN DÍAS (Contratación → Sin días, escritorio).

  Un contrato tiene que decir qué días trabaja la persona: sin eso no se sabe si se superpone con otro
  ni si un feriado le cae en día laborable. Desde la plataforma ya no se puede guardar uno sin días
  (`assign-member`), pero los que vienen de FRAME no los traen. Acá se listan los VIGENTES O FUTUROS
  que no los tienen —los terminados ya no importan— para completarlos a mano; si tienen turno, se
  proponen los días del turno.

  UN CONTRATO NO TIENE `_id` (son subdocumentos de `UserProject.contracts`): se lo nombra por su
  asignación y su posición, y al guardar se confirma que en esa posición siga estando el mismo contrato
  (misma fecha de alta). Si alguien lo movió mientras tanto, se rechaza en vez de escribir en otro.
*/
const router = Router();
const acceso = [requireTenant, authenticateToken, requirePermission("admin_contracts:view")];
const idsDeTurno = (c) => [...new Set([...(c.areaShiftAssignments || []).flatMap((a) => (a?.shiftIds || []).map(String)), ...(c.shiftId ? [String(c.shiftId)] : [])])].filter((id) => Types.ObjectId.isValid(id));
router.get("/", ...acceso, async (req, res) => {
    try {
        const hoy = hoyArgentina();
        const proyectos = await Project.find({ tenantId: req.tenantObjectId }).select("name clientId").populate("clientId", "name").lean();
        const nombreProyecto = new Map(proyectos.map((p) => [String(p._id), p.clientId?.name ? `${p.clientId.name} | ${p.name}` : p.name]));
        const ups = await UserProject.find({ projectId: { $in: proyectos.map((p) => p._id) } })
            .select("userId projectId nombre_proyecto contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.dias_semana contracts.dias_por_semana contracts.dias_rotativos contracts.hora_inicio contracts.hora_fin contracts.shiftId contracts.areaShiftAssignments contracts.nombre_contrato contracts.nombre_rol_frame contracts.cantidad_jornadas_laborales")
            .lean();
        const filas = [];
        for (const up of ups) {
            (up.contracts || []).forEach((c, indice) => {
                if (Array.isArray(c.dias_semana) && c.dias_semana.length > 0)
                    return;
                const baja = fechaISO(c.fecha_baja_contrato);
                if (baja && baja < hoy)
                    return; // terminado: ya no importa
                filas.push({ up, c, indice });
            });
        }
        const turnos = await Shift.find({ _id: { $in: [...new Set(filas.flatMap((f) => idsDeTurno(f.c)))] } }).select("name days").lean();
        const turnoDe = new Map(turnos.map((t) => [String(t._id), t]));
        const personas = await User.find({ _id: { $in: [...new Set(filas.map((f) => String(f.up.userId)))] } }).select("firstName lastName metadata.fullName").lean();
        const personaDe = new Map(personas.map((u) => [String(u._id), (u.metadata?.fullName || `${u.firstName || ""} ${u.lastName || ""}`).trim()]));
        const contratos = filas
            .map(({ up, c, indice }) => {
            const deTurno = idsDeTurno(c).map((id) => turnoDe.get(id)).filter(Boolean);
            const sugeridos = [...new Set(deTurno.flatMap((t) => (t.days || []).map(Number)))].sort((a, b) => a - b);
            return {
                userProjectId: String(up._id),
                indice,
                persona: personaDe.get(String(up.userId)) || "Sin nombre",
                userId: String(up.userId),
                proyecto: nombreProyecto.get(String(up.projectId)) || up.nombre_proyecto || "",
                fechaAlta: fechaISO(c.fecha_alta_contrato),
                fechaBaja: fechaISO(c.fecha_baja_contrato),
                horario: c.hora_inicio && c.hora_fin ? `${c.hora_inicio} a ${c.hora_fin}` : "",
                contrato: c.nombre_contrato || "",
                rol: c.nombre_rol_frame || "",
                jornadas: c.cantidad_jornadas_laborales ?? null,
                turno: deTurno.map((t) => t.name).join(", "),
                diasSugeridos: sugeridos,
            };
        })
            .sort((a, b) => a.proyecto.localeCompare(b.proyecto) || a.persona.localeCompare(b.persona));
        res.json({ contratos });
    }
    catch (error) {
        console.error("Contratos sin días error:", error);
        res.status(500).json({ error: "No se pudieron cargar los contratos." });
    }
});
router.put("/", ...acceso, async (req, res) => {
    try {
        const { userProjectId, indice, fechaAlta } = req.body || {};
        const dias = [...new Set((Array.isArray(req.body?.dias_semana) ? req.body.dias_semana : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
        const rotativos = !!req.body?.dias_rotativos;
        const porSemana = Number(req.body?.dias_por_semana) || (rotativos ? 0 : dias.length);
        const falta = faltaDefinirDias(porSemana, rotativos, dias);
        if (falta) {
            res.status(400).json({ error: `Faltan los días que trabaja: ${falta}.` });
            return;
        }
        if (!Types.ObjectId.isValid(String(userProjectId)) || !Number.isInteger(Number(indice))) {
            res.status(400).json({ error: "Falta indicar qué contrato." });
            return;
        }
        const up = await UserProject.findById(userProjectId).select("projectId contracts.fecha_alta_contrato").lean();
        const deEsteTenant = up && (await Project.exists({ _id: up.projectId, tenantId: req.tenantObjectId }));
        const c = up?.contracts?.[Number(indice)];
        if (!deEsteTenant || !c || fechaISO(c.fecha_alta_contrato) !== String(fechaAlta || "")) {
            res.status(409).json({ error: "Ese contrato cambió mientras tanto. Recargá la lista." });
            return;
        }
        const i = Number(indice);
        await UserProject.updateOne({ _id: userProjectId }, { $set: { [`contracts.${i}.dias_semana`]: dias, [`contracts.${i}.dias_por_semana`]: porSemana, [`contracts.${i}.dias_rotativos`]: rotativos } });
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Guardar días del contrato error:", error);
        res.status(500).json({ error: "No se pudieron guardar los días." });
    }
});
export { router as contratosSinDiasRoutes };
