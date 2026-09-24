import { Router, Response } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { MOBILE_HIRING_TEMPLATES } from "../utils/permisosMobile.js";
import {
  actualizarIntegrante,
  actualizarPlantilla,
  agregarIntegrantes,
  borrarPlantilla,
  contratarPlantilla,
  crearPlantilla,
  duplicarPlantilla,
  ErrorPlantilla,
  listarPlantillas,
  obtenerPlantilla,
  previewDeContratacion,
  quitarIntegrante,
  reemplazarIntegrante,
} from "../services/plantillasEquipo.js";

/*
  PLANTILLAS DE EQUIPO (pestaña «Plantillas» de Contratación, en el móvil). Todo en
  `services/plantillasEquipo.ts`; acá sólo se traduce a HTTP. Permiso propio (`mobile_hiring_templates`).
*/
const router = Router();
const acceso = [requireTenant, authenticateToken, requirePermission(MOBILE_HIRING_TEMPLATES)];
type Req = AuthenticatedRequest & TenantRequest;

const manejar = (fn: (req: Req, res: Response) => Promise<any>) => async (req: Req, res: Response) => {
  try {
    const r = await fn(req, res);
    if (!res.headersSent) res.json(r ?? { ok: true });
  } catch (e: any) {
    if (e instanceof ErrorPlantilla) {
      res.status(e.status).json({ error: e.message, ...(e.extra ? { plan: e.extra } : {}) });
      return;
    }
    console.error("[PLANTILLAS-EQUIPO]", e);
    res.status(500).json({ error: "No se pudo completar la operación." });
  }
};

router.get("/", ...acceso, manejar((req) => listarPlantillas(req.tenantObjectId!, String(req.query.projectId || ""))));
router.post("/", ...acceso, manejar(async (req, res) => {
  res.status(201);
  return crearPlantilla(req.tenantObjectId!, req.user!.userId, req.body || {});
}));
router.get("/:id", ...acceso, manejar((req) => obtenerPlantilla(req.tenantObjectId!, req.params.id)));
router.put("/:id", ...acceso, manejar((req) => actualizarPlantilla(req.tenantObjectId!, req.params.id, req.body || {})));
router.delete("/:id", ...acceso, manejar(async (req) => {
  await borrarPlantilla(req.tenantObjectId!, req.params.id);
  return { ok: true };
}));
router.post("/:id/duplicar", ...acceso, manejar((req) => duplicarPlantilla(req.tenantObjectId!, req.user!.userId, req.params.id, req.body?.nombre)));

router.post("/:id/integrantes", ...acceso, manejar((req) => agregarIntegrantes(req.tenantObjectId!, req.params.id, req.body?.integrantes || [])));
router.put("/:id/integrantes/:integranteId", ...acceso, manejar((req) => actualizarIntegrante(req.tenantObjectId!, req.params.id, req.params.integranteId, req.body || {})));
router.delete("/:id/integrantes/:integranteId", ...acceso, manejar((req) => quitarIntegrante(req.tenantObjectId!, req.params.id, req.params.integranteId)));
router.post("/:id/integrantes/:integranteId/reemplazar", ...acceso, manejar((req) => reemplazarIntegrante(req.tenantObjectId!, req.params.id, req.params.integranteId, String(req.body?.userId || ""))));

// No escribe nada: lo que saldría, con importes, errores y advertencias por integrante.
router.post("/:id/preview", ...acceso, manejar((req) => previewDeContratacion(req.tenantObjectId!, req.params.id, req.body || {})));
// Todo o nada, con `idempotencyKey`.
router.post("/:id/contratar", ...acceso, manejar(async (req, res) => {
  const r = await contratarPlantilla(req.tenantObjectId!, req.user!.userId, req.params.id, req.body || {});
  res.status(r.repetido ? 200 : 201);
  return r;
}));

export { router as plantillasEquipoRoutes };
