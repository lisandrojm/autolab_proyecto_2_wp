import { Router, Response } from "express";
import { Types } from "mongoose";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { ErrorVacacion } from "../services/vacaciones/crearVacacion.js";
import {
  acusarInvitacion,
  acusarOtorgamiento,
  cancelarPropuesta,
  cargarCampania,
  cerrarCampania,
  cambiarFechaLimite,
  cambiarDiasDeInicio,
  rearmarTurnos,
  confirmarAsignaciones,
  crearCampania,
  editarAsignacion,
  guardarTiposContrato,
  lanzarCampania,
  listarCampanias,
  miInvitacion,
  proponerFechas,
  recordar,
  reporteCsv,
  sugerirAsignaciones,
  tablero,
  vistaPreviaDeInvitacion,
} from "../services/vacaciones/campaniaVacaciones.js";

/*
  CAMPAÑA DE GOCE DE VACACIONES, `/api/v1/campanias-vacaciones` (15/11/2026). El circuito está en
  `services/vacaciones/campaniaVacaciones.ts`; acá sólo HTTP y permisos:
    · `/mia/*`: la persona, sobre su propia invitación (cualquier usuario logueado).
    · El resto: el admin del módulo de Vacaciones (`admin_vacations:view`).
  Las rutas `/mia` van antes que `/:id` para que no las atrape.
*/
type Req = AuthenticatedRequest & TenantRequest;

const manejar = (fn: (req: Req, res: Response) => Promise<any>) => async (req: Req, res: Response) => {
  try {
    const r = await fn(req, res);
    if (!res.headersSent) res.json(r ?? { ok: true });
  } catch (e: any) {
    if (e instanceof ErrorVacacion) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    console.error("[CAMPANIA-VACACIONES]", e);
    res.status(500).json({ error: "No se pudo completar la operación." });
  }
};

const tid = (req: Req) => req.tenantObjectId as Types.ObjectId;
const yo = (req: Req) => String(req.user!.userId);
const soloAdmin = requirePermission("admin_vacations:view");

export const campaniasVacacionesRoutes = Router();
campaniasVacacionesRoutes.use(requireTenant, authenticateToken);

/* ── La persona ── */
campaniasVacacionesRoutes.get("/mia", manejar(async (req) => ({ invitacion: await miInvitacion(tid(req), yo(req)) })));
campaniasVacacionesRoutes.post("/mia/acuse", manejar(async (req) => acusarInvitacion(tid(req), yo(req))));
campaniasVacacionesRoutes.post("/mia/proponer", manejar(async (req) => proponerFechas(tid(req), yo(req), req.body?.tramos)));
campaniasVacacionesRoutes.post("/mia/cancelar-propuesta", manejar(async (req) => cancelarPropuesta(tid(req), yo(req))));
campaniasVacacionesRoutes.post("/mia/acuse-otorgamiento", manejar(async (req) => acusarOtorgamiento(tid(req), yo(req))));

/* ── El admin ── */
campaniasVacacionesRoutes.get("/", soloAdmin, manejar(async (req) => listarCampanias(tid(req))));
campaniasVacacionesRoutes.post("/", soloAdmin, manejar(async (req) => crearCampania(tid(req), yo(req), req.body || {})));
campaniasVacacionesRoutes.get("/:id", soloAdmin, manejar(async (req) => tablero(tid(req), String(req.params.id))));
// A quién se invita: cuánta gente con días hay por tipo de contrato (la vista previa) y la selección de la campaña.
campaniasVacacionesRoutes.get("/:id/vista-previa", soloAdmin, manejar(async (req) => vistaPreviaDeInvitacion(tid(req), String(req.params.id))));
campaniasVacacionesRoutes.put("/:id/tipos-contrato", soloAdmin, manejar(async (req) => guardarTiposContrato(tid(req), String(req.params.id), req.body?.tiposContratoInvitar)));
campaniasVacacionesRoutes.post("/:id/lanzar", soloAdmin, manejar(async (req) => lanzarCampania(tid(req), String(req.params.id), yo(req), req.body?.tiposContratoInvitar)));
campaniasVacacionesRoutes.post(
  "/:id/recordatorio",
  soloAdmin,
  manejar(async (req) => {
    const c = await cargarCampania(tid(req), String(req.params.id));
    if (c.estado !== "lanzada") throw new ErrorVacacion("La campaña no está lanzada.");
    return recordar(tid(req), c, yo(req));
  }),
);
campaniasVacacionesRoutes.post("/:id/sugerir-asignaciones", soloAdmin, manejar(async (req) => sugerirAsignaciones(tid(req), String(req.params.id))));
campaniasVacacionesRoutes.put("/:id/invitaciones/:invId/asignacion", soloAdmin, manejar(async (req) => editarAsignacion(tid(req), String(req.params.id), String(req.params.invId), { desde: String(req.body?.desde || ""), hasta: String(req.body?.hasta || "") }, yo(req))));
campaniasVacacionesRoutes.post("/:id/confirmar-asignaciones", soloAdmin, manejar(async (req) => confirmarAsignaciones(tid(req), String(req.params.id), Array.isArray(req.body?.invitacionIds) ? req.body.invitacionIds.map(String) : undefined, yo(req))));
// Cambiar la fecha límite para elegir de una campaña lanzada (la de la campaña y la de cada invitación a la que le corre el plazo).
campaniasVacacionesRoutes.put("/:id/fecha-limite", soloAdmin, manejar(async (req) => cambiarFechaLimite(tid(req), String(req.params.id), req.body?.fechaLimite, yo(req))));
// Los días de la semana en que puede empezar un tramo (borrador o lanzada). Vacío = cualquier día.
campaniasVacacionesRoutes.put("/:id/dias-de-inicio", soloAdmin, manejar(async (req) => cambiarDiasDeInicio(tid(req), String(req.params.id), req.body?.diasDeInicio, yo(req))));
// Rearmar los turnos por antigüedad (se rearman solos al cambiar una regla de solapamiento con orden).
campaniasVacacionesRoutes.post("/:id/turnos", soloAdmin, manejar(async (req) => rearmarTurnos(tid(req), String(req.params.id))));
campaniasVacacionesRoutes.post("/:id/cerrar", soloAdmin, manejar(async (req) => cerrarCampania(tid(req), String(req.params.id), yo(req))));
campaniasVacacionesRoutes.get(
  "/:id/reporte.csv",
  soloAdmin,
  manejar(async (req, res) => {
    const { nombre, csv } = await reporteCsv(tid(req), String(req.params.id));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.send(csv);
  }),
);
