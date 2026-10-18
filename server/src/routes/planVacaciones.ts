import { Router, Response } from "express";
import { Types } from "mongoose";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { accesoAlPlan, proyectosVisibles } from "../services/vacaciones/accesoAlPlan.js";
import {
  ErrorPlan,
  actualizarItem,
  actualizarPlan,
  aprobarItem,
  aprobarTodo,
  asignarMes,
  cancelarItem,
  cancelarPlan,
  cargarPlan,
  crearItem,
  crearPlan,
  detalleDelPlan,
  eliminarItem,
  eliminarPlan,
  enviarPlan,
  equipoParaPlan,
  listarPlanes,
  quitarAsignacion,
  rechazarItem,
  refrescarEquipo,
} from "../services/vacaciones/planVacaciones.js";
import { armarReemplazoMensual, crearReemplazoMensual, cancelarReemplazoMensual } from "../services/vacaciones/reemplazoMensual.js";

/*
  PLAN DE VACACIONES POR PROYECTO, `/api/v1/planes-vacaciones`. Todo en `services/vacaciones/planVacaciones.ts`;
  acá sólo se traduce a HTTP y se controla quién puede qué (`accesoAlPlan`): ver/armar = admin, módulo de
  Vacaciones o coordinador del proyecto; aprobar/rechazar = admin o coordinador. Router propio y no debajo
  de `/vacations` porque ese router no chequea permisos y sus `/:id` atraparían estas subrutas.
*/
type Req = AuthenticatedRequest & TenantRequest;

const manejar = (fn: (req: Req, res: Response) => Promise<any>) => async (req: Req, res: Response) => {
  try {
    const r = await fn(req, res);
    if (!res.headersSent) res.json(r ?? { ok: true });
  } catch (e: any) {
    if (e instanceof ErrorPlan) {
      res.status(e.status).json({ error: e.message, ...(e.extra !== undefined ? { avisos: e.extra } : {}) });
      return;
    }
    console.error("[PLAN-VACACIONES]", e);
    res.status(500).json({ error: "No se pudo completar la operación." });
  }
};

const tid = (req: Req) => req.tenantObjectId as Types.ObjectId;

/** Carga el plan y exige el nivel de acceso pedido. */
async function planCon(req: Req, nivel: "ver" | "editar" | "aprobar") {
  const plan = await cargarPlan(tid(req), String(req.params.id));
  const acceso = await accesoAlPlan(req, plan.projectId);
  const ok = nivel === "ver" ? acceso.puedeVer : nivel === "editar" ? acceso.puedeEditar : acceso.puedeAprobar;
  if (!ok) throw new ErrorPlan(nivel === "aprobar" ? "Sólo el coordinador del proyecto puede aprobar o rechazar los bloques." : "No tenés acceso a este plan.", 403);
  return { plan, acceso };
}

/** El plan completo, como lo pide la pantalla después de cada cambio. */
const respuesta = async (req: Req, plan: Awaited<ReturnType<typeof cargarPlan>>, acceso: Awaited<ReturnType<typeof accesoAlPlan>>, extra: Record<string, unknown> = {}) => ({
  ...(await detalleDelPlan(tid(req), plan)),
  permisos: { puedeEditar: acceso.puedeEditar, puedeAprobar: acceso.puedeAprobar, esCoordinador: acceso.esCoordinador },
  ...extra,
});

export const planVacacionesRoutes = Router();
planVacacionesRoutes.use(requireTenant, authenticateToken);

planVacacionesRoutes.get(
  "/",
  manejar(async (req) => {
    const proyectos = await proyectosVisibles(req);
    // `pendientesDeMi=true`: los planes con bloques esperando MI aprobación (los proyectos que coordino).
    let pendientesDeMi: Types.ObjectId[] | null = null;
    if (req.query.pendientesDeMi === "true") {
      const { alcanceDeResponsable } = await import("../utils/visibilidadResponsable.js");
      pendientesDeMi = (await alcanceDeResponsable(tid(req), req.user!.userId)).proyectos;
    }
    return listarPlanes(tid(req), { projectId: req.query.projectId ? String(req.query.projectId) : undefined, estado: req.query.estado ? String(req.query.estado) : undefined, proyectos, pendientesDeMi });
  }),
);

planVacacionesRoutes.get(
  "/proyectos/:projectId/equipo-para-plan",
  manejar(async (req) => {
    const acceso = await accesoAlPlan(req, String(req.params.projectId));
    if (!acceso.puedeVer) throw new ErrorPlan("No tenés acceso a este proyecto.", 403);
    const anio = Number(req.query.anioDeSaldo) || new Date().getFullYear();
    return equipoParaPlan(tid(req), String(req.tenantId), String(req.params.projectId), anio);
  }),
);

planVacacionesRoutes.post(
  "/",
  manejar(async (req) => {
    const acceso = await accesoAlPlan(req, String(req.body?.projectId || ""));
    if (!acceso.puedeEditar) throw new ErrorPlan("No tenés acceso a este proyecto.", 403);
    const plan = await crearPlan(tid(req), String(req.tenantId), req.user!.userId, req.body);
    return respuesta(req, plan, acceso);
  }),
);

planVacacionesRoutes.get(
  "/:id",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "ver");
    return respuesta(req, plan, acceso);
  }),
);

planVacacionesRoutes.patch(
  "/:id",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "editar");
    const r = await actualizarPlan(tid(req), String(req.tenantId), plan, req.body || {});
    return respuesta(req, plan, acceso, { quitados: r.quitados });
  }),
);

planVacacionesRoutes.delete(
  "/:id",
  manejar(async (req) => {
    const { plan } = await planCon(req, "editar");
    await eliminarPlan(plan);
    return { ok: true };
  }),
);

planVacacionesRoutes.post(
  "/:id/cancelar",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "editar");
    await cancelarPlan(plan);
    return respuesta(req, plan, acceso);
  }),
);

planVacacionesRoutes.post(
  "/:id/refrescar-equipo",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "editar");
    await refrescarEquipo(tid(req), String(req.tenantId), plan);
    return respuesta(req, plan, acceso);
  }),
);

planVacacionesRoutes.post(
  "/:id/asignar-mes",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "editar");
    const r = await asignarMes(plan, req.body || {});
    return respuesta(req, plan, acceso, { reparto: r });
  }),
);

planVacacionesRoutes.delete(
  "/:id/asignaciones",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "editar");
    const r = await quitarAsignacion(plan, { ...(req.query as any), ...(req.body || {}) });
    return respuesta(req, plan, acceso, { quitados: r.quitados });
  }),
);

planVacacionesRoutes.post(
  "/:id/items",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "editar");
    const itemId = await crearItem(plan, req.body || {});
    return respuesta(req, plan, acceso, { itemId });
  }),
);

planVacacionesRoutes.patch(
  "/:id/items/:itemId",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "editar");
    await actualizarItem(plan, String(req.params.itemId), req.body || {});
    return respuesta(req, plan, acceso);
  }),
);

planVacacionesRoutes.delete(
  "/:id/items/:itemId",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "editar");
    await eliminarItem(plan, String(req.params.itemId));
    return respuesta(req, plan, acceso);
  }),
);

planVacacionesRoutes.post(
  "/:id/enviar",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "editar");
    const r = await enviarPlan(tid(req), plan, req.user!.userId, Array.isArray(req.body?.itemIds) ? req.body.itemIds : undefined);
    return respuesta(req, plan, acceso, { enviados: r.enviados });
  }),
);

planVacacionesRoutes.post(
  "/:id/items/:itemId/aprobar",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "aprobar");
    const r = await aprobarItem(tid(req), String(req.tenantId), plan, String(req.params.itemId), req.user!.userId);
    return respuesta(req, plan, acceso, { vacationId: r.vacationId });
  }),
);

planVacacionesRoutes.post(
  "/:id/items/:itemId/rechazar",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "aprobar");
    await rechazarItem(tid(req), plan, String(req.params.itemId), req.user!.userId, req.body?.motivo);
    return respuesta(req, plan, acceso);
  }),
);

planVacacionesRoutes.post(
  "/:id/aprobar-todo",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "aprobar");
    const r = await aprobarTodo(tid(req), String(req.tenantId), plan, req.user!.userId);
    return respuesta(req, plan, acceso, { resultado: r });
  }),
);

/*
  REEMPLAZO MENSUAL de un rol en un mes (ver `services/vacaciones/reemplazoMensual.ts`): `preview` arma la
  solicitud sin guardar nada (para mostrar jornadas, importe y avisos); el POST la crea y la vincula al plan.
*/
planVacacionesRoutes.post(
  "/:id/reemplazos/preview",
  manejar(async (req) => {
    const { plan } = await planCon(req, "editar");
    const r = await armarReemplazoMensual(tid(req), plan, req.body || {});
    return { cubreA: r.cubreA, avisos: r.avisos, resumen: r.resumen };
  }),
);

planVacacionesRoutes.post(
  "/:id/reemplazos",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "editar");
    const r = await crearReemplazoMensual(tid(req), req.user!.userId, plan, req.body || {});
    return respuesta(req, plan, acceso, { reemplazo: r });
  }),
);

planVacacionesRoutes.delete(
  "/:id/reemplazos/:rid",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "editar");
    await cancelarReemplazoMensual(tid(req), req.user!.userId, plan, String(req.params.rid), req.body?.motivo ?? (req.query.motivo as string | undefined));
    return respuesta(req, plan, acceso);
  }),
);

planVacacionesRoutes.post(
  "/:id/items/:itemId/cancelar",
  manejar(async (req) => {
    const { plan, acceso } = await planCon(req, "editar");
    await cancelarItem(tid(req), plan, String(req.params.itemId), req.body || {});
    return respuesta(req, plan, acceso);
  }),
);
