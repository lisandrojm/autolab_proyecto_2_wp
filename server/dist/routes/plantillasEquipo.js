import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { MOBILE_HIRING_TEMPLATES } from "../utils/permisosMobile.js";
import { actualizarPlantilla, actualizarPuesto, agregarPuestos, asignarPuesto, condicionesEnEquipo, condicionesDelEquipo, reemplazoEnEquipo, usoDelPuestoEnEquipo, borrarEquipo, borrarPlantilla, contratarPlantilla, contratarVarios, previewDeVarios, crearEquipo, crearPlantilla, duplicarPlantilla, ErrorPlantilla, listarPlantillas, obtenerPlantilla, previewDeContratacion, quitarPuesto, actualizarEquipo, usarGeneral, } from "../services/plantillasEquipo.js";
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
    r.post("/:id/puestos", ...mw, manejar((req) => agregarPuestos(a(req), req.params.id, req.body?.puestos || [], req.body?.equipoId)));
    r.put("/:id/puestos/:puestoId", ...mw, manejar((req) => actualizarPuesto(a(req), req.params.id, req.params.puestoId, req.body || {})));
    r.delete("/:id/puestos/:puestoId", ...mw, manejar((req) => quitarPuesto(a(req), req.params.id, req.params.puestoId)));
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
// Los equipos (quién ocupa cada puesto): sólo en las personales.
// Nombre + condiciones (el turno) en el mismo pedido; `copiarDe` trae las personas de otro equipo.
router.post("/:id/equipos", ...movil, manejar((req) => crearEquipo(acceso(req, "personal"), req.params.id, String(req.body?.nombre || ""), req.body?.copiarDe, req.body?.condiciones, { projectId: req.body?.projectId, empresaContratoId: req.body?.empresaContratoId, convenioId: req.body?.convenioId, categorias: req.body?.categorias })));
// Las condiciones del equipo (contrato, área y turno, horario, días): valen para todos sus puestos.
router.put("/:id/equipos/:equipoId/condiciones", ...movil, manejar((req) => condicionesDelEquipo(acceso(req, "personal"), req.params.id, req.params.equipoId, req.body || {})));
// Nombre y/o proyecto (con empresa y convenio) del equipo; `categorias` = las del nivel de su proyecto.
router.put("/:id/equipos/:equipoId", ...movil, manejar((req) => actualizarEquipo(acceso(req, "personal"), req.params.id, req.params.equipoId, req.body || {})));
router.delete("/:id/equipos/:equipoId", ...movil, manejar((req) => borrarEquipo(acceso(req, "personal"), req.params.id, req.params.equipoId)));
// `userId: null` deja el puesto sin asignar en ese equipo.
router.put("/:id/equipos/:equipoId/puestos/:puestoId", ...movil, manejar((req) => asignarPuesto(acceso(req, "personal"), req.params.id, req.params.equipoId, req.params.puestoId, req.body?.userId ?? null)));
// Las condiciones propias del puesto en ese equipo (horario, días, área y turno, contrato…). `restablecer: true` vuelve a las del puesto.
router.put("/:id/equipos/:equipoId/puestos/:puestoId/condiciones", ...movil, manejar((req) => condicionesEnEquipo(acceso(req, "personal"), req.params.id, req.params.equipoId, req.params.puestoId, req.body || {})));
// `excluido: true` saca el puesto de ESE equipo (sigue en la plantilla); `false` lo vuelve a usar.
router.put("/:id/equipos/:equipoId/puestos/:puestoId/uso", ...movil, manejar((req) => usoDelPuestoEnEquipo(acceso(req, "personal"), req.params.id, req.params.equipoId, req.params.puestoId, req.body?.excluido === true)));
// El reemplazo del puesto: `{ replacedUserId, motivoReemplazoId }`, o `{ quitar: true }`. Único lugar donde se crea uno.
router.put("/:id/equipos/:equipoId/puestos/:puestoId/reemplazo", ...movil, manejar((req) => reemplazoEnEquipo(acceso(req, "personal"), req.params.id, req.params.equipoId, req.params.puestoId, req.body || {})));
// No escribe nada: lo que saldría, con importes, errores y advertencias por puesto.
router.post("/:id/preview", ...movil, manejar((req) => previewDeContratacion(acceso(req, "personal"), req.params.id, req.body || {})));
// Todo o nada, con `idempotencyKey`.
router.post("/:id/contratar", ...movil, manejar(async (req, res) => {
    const r = await contratarPlantilla(acceso(req, "personal"), req.params.id, req.body || {});
    res.status(r.repetido ? 200 : 201);
    return r;
}));
// «Contratar todos»: varios equipos de la plantilla, cada uno con sus fechas. Todo o nada, un lote por equipo.
router.post("/:id/preview-varios", ...movil, manejar((req) => previewDeVarios(acceso(req, "personal"), req.params.id, req.body || {})));
router.post("/:id/contratar-varios", ...movil, manejar(async (req, res) => {
    const r = await contratarVarios(acceso(req, "personal"), req.params.id, req.body || {});
    res.status(r.repetido ? 200 : 201);
    return r;
}));
// ── Escritorio: las generales ──
// Permiso propio: quien arma las plantillas generales no tiene por qué ver los contratos, ni al revés.
const escritorio = [requireTenant, authenticateToken, requirePermission("admin_hiring_templates:view")];
const generalesRouter = rutasDe("general", escritorio);
export { router as plantillasEquipoRoutes, generalesRouter as plantillasGeneralesRoutes };
