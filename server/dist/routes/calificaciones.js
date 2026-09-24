import { Router } from "express";
import { Types } from "mongoose";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { User } from "../models/User.js";
import { MOBILE_TEAMS } from "../utils/permisosMobile.js";
import { crearCalificacion, esDelProyecto, historialDeCalificaciones, leerCalificacion, resumenDeCalificaciones, tieneAlCargoElProyecto } from "../services/calificaciones.js";
/*
  CALIFICACIONES (ver `models/Calificacion.ts`).

  Dos puertas, con permisos distintos:
   - ESCRITORIO (`admin_users:view`): la lista de Usuarios y las solicitudes de renovación. Ve y califica
     a cualquiera del tenant.
   - EQUIPOS del móvil (`mobile_teams:view`): sólo a la gente de un proyecto que quien califica tiene a
     cargo (lo supervisa o coordina ahí). El proyecto va en la ruta y se controla en cada pedido.

  La de fin de contrato NO pasa por acá: va con la decisión en `routes/contratosPorVencer.ts`, donde ya
  se controla que el contrato le aparezca a quien decide.
*/
const router = Router();
const escritorio = [requireTenant, authenticateToken, requirePermission("admin_users:view")];
const equipos = [requireTenant, authenticateToken, requirePermission(MOBILE_TEAMS)];
const idsDe = (x) => (Array.isArray(x) ? x.map(String).filter((id) => Types.ObjectId.isValid(id)).slice(0, 500) : []);
// ── Escritorio ──────────────────────────────────────────────────────────────
// POST y no GET: una página de usuarios son decenas de ids.
router.post("/resumen", ...escritorio, async (req, res) => {
    try {
        res.json({ resumen: await resumenDeCalificaciones(req.tenantObjectId, idsDe(req.body?.userIds)) });
    }
    catch (error) {
        console.error("Resumen de calificaciones error:", error);
        res.status(500).json({ error: "No se pudieron cargar las calificaciones." });
    }
});
router.get("/usuario/:userId", ...escritorio, async (req, res) => {
    try {
        if (!Types.ObjectId.isValid(req.params.userId)) {
            res.status(400).json({ error: "Persona inválida." });
            return;
        }
        res.json(await historialDeCalificaciones(req.tenantObjectId, req.params.userId));
    }
    catch (error) {
        console.error("Historial de calificaciones error:", error);
        res.status(500).json({ error: "No se pudieron cargar las calificaciones." });
    }
});
router.post("/", ...escritorio, async (req, res) => {
    try {
        const { userId, origen, solicitudId } = req.body || {};
        const leida = leerCalificacion(req.body);
        if ("error" in leida) {
            res.status(400).json({ error: leida.error });
            return;
        }
        if (origen !== "usuarios" && origen !== "solicitud_renovacion") {
            res.status(400).json({ error: "Origen de la calificación inválido." });
            return;
        }
        if (!Types.ObjectId.isValid(String(userId)) || !(await User.exists({ _id: userId, tenantId: req.tenantObjectId }))) {
            res.status(404).json({ error: "No se encontró a la persona." });
            return;
        }
        if (String(userId) === String(req.user.userId)) {
            res.status(400).json({ error: "No podés calificarte a vos mismo." });
            return;
        }
        // Desde una solicitud de renovación: se guarda de qué solicitud y de qué proyecto era.
        let projectId;
        if (origen === "solicitud_renovacion") {
            const solicitud = Types.ObjectId.isValid(String(solicitudId)) ? await User.findOne({ _id: solicitudId, tenantId: req.tenantObjectId }).select("metadata.projectIds metadata.solicitudUserId").lean() : null;
            if (!solicitud || String(solicitud.metadata?.solicitudUserId) !== String(userId)) {
                res.status(400).json({ error: "La solicitud no corresponde a esa persona." });
                return;
            }
            projectId = solicitud.metadata?.projectIds?.[0] ? String(solicitud.metadata.projectIds[0]) : undefined;
        }
        const c = await crearCalificacion({ tenantId: req.tenantObjectId, userId: String(userId), ...leida, origen, projectId, solicitudId: origen === "solicitud_renovacion" ? String(solicitudId) : undefined, calificadoPor: req.user.userId });
        res.status(201).json({ ok: true, _id: String(c._id) });
    }
    catch (error) {
        console.error("Calificar error:", error);
        res.status(500).json({ error: "No se pudo guardar la calificación." });
    }
});
// ── Equipos (móvil) ─────────────────────────────────────────────────────────
/** Corta con 403 si el proyecto no está a cargo de quien pide. */
const aCargo = async (req, res) => {
    if (await tieneAlCargoElProyecto(req.tenantObjectId, req.user.userId, req.params.projectId))
        return true;
    res.status(403).json({ error: "Ese proyecto no está a tu cargo." });
    return false;
};
// El promedio de toda la gente del proyecto: una llamada para pintar las estrellas de Equipos.
router.get("/equipo/:projectId/resumen", ...equipos, async (req, res) => {
    try {
        if (!(await aCargo(req, res)))
            return;
        const miembros = await User.find({ tenantId: req.tenantObjectId, projectIds: req.params.projectId }).select("_id").lean();
        res.json({ resumen: await resumenDeCalificaciones(req.tenantObjectId, miembros.map((m) => String(m._id))) });
    }
    catch (error) {
        console.error("Resumen de calificaciones (equipo) error:", error);
        res.status(500).json({ error: "No se pudieron cargar las calificaciones." });
    }
});
router.get("/equipo/:projectId/usuario/:userId", ...equipos, async (req, res) => {
    try {
        if (!(await aCargo(req, res)))
            return;
        if (!(await esDelProyecto(req.tenantObjectId, req.params.userId, req.params.projectId))) {
            res.status(404).json({ error: "Esa persona no es del proyecto." });
            return;
        }
        res.json(await historialDeCalificaciones(req.tenantObjectId, req.params.userId));
    }
    catch (error) {
        console.error("Historial de calificaciones (equipo) error:", error);
        res.status(500).json({ error: "No se pudieron cargar las calificaciones." });
    }
});
router.post("/equipo/:projectId", ...equipos, async (req, res) => {
    try {
        if (!(await aCargo(req, res)))
            return;
        const userId = String(req.body?.userId || "");
        const leida = leerCalificacion(req.body);
        if ("error" in leida) {
            res.status(400).json({ error: leida.error });
            return;
        }
        if (!(await esDelProyecto(req.tenantObjectId, userId, req.params.projectId))) {
            res.status(404).json({ error: "Esa persona no es del proyecto." });
            return;
        }
        if (userId === String(req.user.userId)) {
            res.status(400).json({ error: "No podés calificarte a vos mismo." });
            return;
        }
        const c = await crearCalificacion({ tenantId: req.tenantObjectId, userId, ...leida, origen: "equipos", projectId: req.params.projectId, calificadoPor: req.user.userId });
        res.status(201).json({ ok: true, _id: String(c._id) });
    }
    catch (error) {
        console.error("Calificar (equipo) error:", error);
        res.status(500).json({ error: "No se pudo guardar la calificación." });
    }
});
export { router as calificacionesRoutes };
