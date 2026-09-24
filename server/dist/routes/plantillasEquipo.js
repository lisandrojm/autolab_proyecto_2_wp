import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { MOBILE_HIRING_TEMPLATES } from "../utils/permisosMobile.js";
import { actualizarIntegrante, actualizarPlantilla, agregarIntegrantes, borrarPlantilla, contratarPlantilla, crearPlantilla, duplicarPlantilla, ErrorPlantilla, listarPlantillas, obtenerPlantilla, previewDeContratacion, quitarIntegrante, reemplazarIntegrante, usarGeneral, } from "../services/plantillasEquipo.js";
const manejar = (fn) => async (req, res) => {
    try {
        const r = await fn(req, res);
        if (!res.headersSent)
            res.json(r ?? { ok: true });
    }
    catch (e) {
        if (e instanceof ErrorPlantilla) {
            res.status(e.status).json({ error: e.message, ...(e.extra ? { plan: e.extra } : {}) });
            return;
        }
        console.error("[PLANTILLAS-EQUIPO]", e);
        res.status(500).json({ error: "No se pudo completar la operación." });
    }
};
const acceso = (req, alcance) => ({ tenantId: req.tenantObjectId, userId: req.user.userId, alcance });
/** El CRUD de plantillas y de sus puestos, para un alcance. */
function rutasDe(alcance, mw) {
    const r = Router();
    const a = (req) => acceso(req, alcance);
    r.get("/", ...mw, manejar((req) => listarPlantillas(a(req), String(req.query.projectId || ""))));
    r.post("/", ...mw, manejar(async (req, res) => {
        res.status(201);
        return crearPlantilla(a(req), req.body || {});
    }));
    r.get("/:id", ...mw, manejar((req) => obtenerPlantilla(a(req), req.params.id)));
    r.put("/:id", ...mw, manejar((req) => actualizarPlantilla(a(req), req.params.id, req.body || {})));
    r.delete("/:id", ...mw, manejar(async (req) => {
        await borrarPlantilla(a(req), req.params.id);
        return { ok: true };
    }));
    r.post("/:id/duplicar", ...mw, manejar((req) => duplicarPlantilla(a(req), req.params.id, req.body?.nombre)));
    r.post("/:id/integrantes", ...mw, manejar((req) => agregarIntegrantes(a(req), req.params.id, req.body?.integrantes || [])));
    r.put("/:id/integrantes/:integranteId", ...mw, manejar((req) => actualizarIntegrante(a(req), req.params.id, req.params.integranteId, req.body || {})));
    r.delete("/:id/integrantes/:integranteId", ...mw, manejar((req) => quitarIntegrante(a(req), req.params.id, req.params.integranteId)));
    return r;
}
// ── Móvil: las personales ──
const movil = [requireTenant, authenticateToken, requirePermission(MOBILE_HIRING_TEMPLATES)];
const router = Router();
// Las generales, para elegir una y copiarla («Usar»). Van antes de `/:id` para que no las tome como id.
router.get("/generales", ...movil, manejar((req) => listarPlantillas(acceso(req, "general"), "")));
router.get("/generales/:id", ...movil, manejar((req) => obtenerPlantilla(acceso(req, "general"), req.params.id)));
router.post("/generales/:id/usar", ...movil, manejar(async (req, res) => {
    res.status(201);
    return usarGeneral(acceso(req, "personal"), req.params.id, String(req.body?.projectId || ""), req.body?.nombre);
}));
router.use(rutasDe("personal", movil));
router.post("/:id/integrantes/:integranteId/reemplazar", ...movil, manejar((req) => reemplazarIntegrante(acceso(req, "personal"), req.params.id, req.params.integranteId, String(req.body?.userId || ""))));
// No escribe nada: lo que saldría, con importes, errores y advertencias por puesto.
router.post("/:id/preview", ...movil, manejar((req) => previewDeContratacion(acceso(req, "personal"), req.params.id, req.body || {})));
// Todo o nada, con `idempotencyKey`.
router.post("/:id/contratar", ...movil, manejar(async (req, res) => {
    const r = await contratarPlantilla(acceso(req, "personal"), req.params.id, req.body || {});
    res.status(r.repetido ? 200 : 201);
    return r;
}));
// ── Escritorio: las generales ──
// Permiso propio: quien arma las plantillas generales no tiene por qué ver los contratos, ni al revés.
const escritorio = [requireTenant, authenticateToken, requirePermission("admin_hiring_templates:view")];
const generalesRouter = rutasDe("general", escritorio);
export { router as plantillasEquipoRoutes, generalesRouter as plantillasGeneralesRoutes };
