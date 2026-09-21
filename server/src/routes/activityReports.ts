import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Request } from "../models/Request.js";
import { Notification } from "../models/Notification.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { computeCompliance } from "../services/complianceService.js";
import { resolverFiltrosDeNovedades } from "../services/filtrosDeNovedades.js";
import { Role } from "../models/Role.js";
import { alcanceDeResponsable } from "../utils/visibilidadResponsable.js";
import { MOBILE_ACTIVITY_COMPLIANCE } from "../utils/permisosMobile.js";
import { createFuzzySearchRegex } from "../utils/searchHelpers.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";

const router = Router();

/** Los nombres que la pantalla muestra de cada parte. `populate` sobre objetos planos: la agregación no los trae sola. */
const POPULADOS = [
  { path: "userId", select: "firstName lastName" },
  { path: "projectId", select: "name clientId", populate: { path: "clientId", select: "name" } },
  { path: "areaId", select: "name" },
  { path: "shiftId", select: "name" },
];

router.use(requireTenant, authenticateToken);

const isAdminReq = (req: AuthenticatedRequest): boolean => {
  const roles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
  const primary = req.user?.primaryRole?.toLowerCase();
  return roles.includes("admin") || roles.includes("superadmin") || primary === "admin" || primary === "superadmin";
};

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * QUÉ CUMPLIMIENTO PUEDE VER QUIEN PREGUNTA.
 *
 *   · Admin: todo, como hasta ahora (el modal del panel web).
 *   · Con «Seguimiento de novedades» (el supervisor en el móvil): SÓLO los proyectos que supervisa, es
 *     decir aquellos cuyo responsable es él. Un supervisor no ve los coordinadores de otro.
 *   · Cualquier otro: nada (`null` → 403).
 *
 * `{}` significa sin recorte; `{ projectIds }` es la lista a la que se acota (puede venir vacía).
 */
async function alcanceCumplimiento(req: AuthenticatedRequest & TenantRequest): Promise<{ projectIds?: string[] } | null> {
  if (isAdminReq(req)) return {};
  const roleNames = req.user?.roles || [];
  if (roleNames.length === 0) return null;
  const roles = await Role.find({ tenantId: req.tenantObjectId, name: { $in: roleNames.map((n) => new RegExp(`^${escaparRegex(String(n))}$`, "i")) } })
    .select("permissions")
    .lean();
  if (!roles.some((r: any) => (r.permissions || []).includes(MOBILE_ACTIVITY_COMPLIANCE))) return null;
  const { proyectos } = await alcanceDeResponsable(req.tenantObjectId, req.user!.userId);
  return { projectIds: proyectos.map(String) };
}

const MAX_RANGE_DAYS = 92;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const attendanceSchema = z.object({
  employeeId: z.string(),
  status: z.string().optional(),
  absenceReason: z.string().optional(),
  replacementId: z.string().optional().or(z.literal("")),
  overtimeHours: z.number().optional(),
  replacementOvertimeHours: z.number().optional(),
  overtimeHours50: z.number().optional(),
  overtimeHours100: z.number().optional(),
  replacementOvertimeHours50: z.number().optional(),
  replacementOvertimeHours100: z.number().optional(),
  replacementInTime: z.string().optional(),
  replacementOutTime: z.string().optional(),
  notes: z.string().optional(),
  inTime: z.string().optional(),
  outTime: z.string().optional(),
  scheduleInTime: z.string().optional(),
  scheduleOutTime: z.string().optional(),
});

const createReportSchema = z.object({
  date: z.string(),
  hasActivity: z.boolean(),
  comments: z.string().optional(),
  attendance: z.array(attendanceSchema).optional(),
  projectId: z.string().optional(),
  areaId: z.string().optional(),
  shiftId: z.string().optional(),
});

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
    const primaryRole = req.user?.primaryRole?.toLowerCase();
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin") || primaryRole === "admin" || primaryRole === "superadmin";

    const filter: any = {
      tenantId: req.tenantObjectId,
    };

    // "Mis Novedades" en mobile siempre pide las propias con ?mine=1, sea admin o no — evita que un
    // coordinador con rol Admin dispare un fetch (con populate de attendance) de TODO el historial
    // del tenant solo para filtrarlo a "las mías" en el cliente. El panel de admin en desktop
    // (RequestsPage) sigue pidiendo sin este parámetro y ve todo, como siempre.
    const forceOwn = req.query.mine === "1" || req.query.mine === "true";
    if (!isAdmin || forceOwn) {
      filter.userId = userId;
    }

    /*
      LOS FILTROS Y LA BÚSQUEDA, DEL LADO DEL SERVER.

      La pantalla los aplicaba sobre la lista completa que tenía en memoria, y por eso necesitaba
      bajarla completa antes de poder mostrar nada. Resueltos acá, una página es una página.

      La búsqueda mira las mismas tres cosas que miraba la pantalla: el número del parte, el nombre
      del proyecto y quién lo cargó. El número está en el parte; los otros dos viven en otras
      colecciones, así que primero se resuelven a ids y el parte se busca por esos ids.

      `createFuzzySearchRegex` es el mismo criterio que usan Usuarios y Contratos: ignora tildes y
      espacios, y exige todas las palabras. Es el que ya usaba el buscador de esta pantalla del lado
      del cliente, así que buscar lo mismo sigue trayendo lo mismo.
    */
    const soloId = (v: unknown) => (typeof v === "string" && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : null);
    const proyectoPedido = soloId(req.query.projectId);
    const areaPedida = soloId(req.query.areaId);
    const turnoPedido = soloId(req.query.shiftId);
    if (proyectoPedido) filter.projectId = proyectoPedido;
    if (areaPedida) filter.areaId = areaPedida;
    if (turnoPedido) filter.shiftId = turnoPedido;

    const busqueda = String(req.query.search || "").trim();
    if (busqueda) {
      const patron = createFuzzySearchRegex(busqueda);
      const regex = { $regex: patron, $options: "i" };
      const [proyectos, personas] = await Promise.all([
        Project.find({ tenantId: req.tenantObjectId, name: regex }).distinct("_id"),
        User.find({
          tenantId: req.tenantObjectId,
          $or: [
            { firstName: regex },
            { lastName: regex },
            { "metadata.fullName": regex },
            // Nombre y apellido juntos: «Javier Martin» no matchea ninguno de los dos por separado.
            { $expr: { $regexMatch: { input: { $concat: [{ $ifNull: ["$firstName", ""] }, " ", { $ifNull: ["$lastName", ""] }] }, regex: patron, options: "i" } } },
          ],
        }).distinct("_id"),
      ]);
      filter.$or = [{ reportNumber: regex }, { projectId: { $in: proyectos } }, { userId: { $in: personas } }];
    }

    /*
      EL LISTADO NO MANDA EL DETALLE DE ASISTENCIA: MANDA SUS NÚMEROS.

      Cada parte trae una fila por persona del turno —quince o veinte— con su estado, su reemplazo,
      sus horarios y sus horas extra. La tabla de Novedades, de todo eso, muestra CINCO NÚMEROS por
      fila. Traer el detalle entero para contarlos en el navegador costaba 27 segundos y 4,5 MB:
      720 partes, 7.920 renglones de asistencia, cada uno con su empleado y su reemplazante
      poblados. El 92% de ese peso era `attendance`.

      Ahora los cuenta Mongo (2,9 s y 342 KB medidos, sobre los mismos 720 partes) y el detalle se
      pide al abrir un parte, con `GET /activity-reports/:id`.

      LOS CRITERIOS SON LOS DE LA PANTALLA, no otros: ausente es todo lo que no sea `present` ni
      `late`; «otros presentes» son los que tienen «adicional» en el motivo; y horas extra CUENTA
      renglones, no suma horas —la suma va aparte, para el total de arriba—. Si cambian allá
      (`esAusente`, `esOtroPresente`, `tieneHorasExtras` en `RequestsPage`), cambian acá.

      `empleados` son los ids, sin repetir, de la gente que figura en el parte: es lo único que la
      pantalla usa del detalle para armar la columna «Área | Turno» (busca a cada uno en el
      directorio y mira su área y turno en ese proyecto). Van los ids pelados, no las fichas.
    */
    const noVino = (campo: string) => ({ $not: [{ $in: [`$$a.${campo}`, ["present", "late"]] }] });
    const tieneReemplazo = { $ne: [{ $ifNull: ["$$a.replacementId", null] }, null] };
    const horasExtraDeLaFila = { $ifNull: ["$$a.overtimeHours", 0] };
    const contar = (cond: any) => ({ $size: { $filter: { input: { $ifNull: ["$attendance", []] }, as: "a", cond } } });

    /** Los cinco números de la fila más los ids de su gente, listos para meter en un `$addFields`. */
    const numeros = {
      $addFields: {
        registros: { $size: { $ifNull: ["$attendance", []] } },
        ausentes: contar(noVino("status")),
        reemplazos: contar({ $and: [noVino("status"), tieneReemplazo] }),
        otrosPresentes: contar({ $regexMatch: { input: { $ifNull: ["$a.absenceReason", ""] }, regex: "adicional", options: "i" } }),
        /*
          Los que se tomaron un compensatorio. Es uno de los estados del parte, así que estas personas
          TAMBIÉN cuentan en «ausentes» —ausente es todo lo que no sea presente ni tarde— y eso no
          cambia: la columna nueva dice cuántas de esas ausencias fueron por compensatorio.
        */
        compensatorios: contar({ $eq: ["$a.status", "compensatory"] }),
        conHorasExtra: contar({ $gt: [horasExtraDeLaFila, 0] }),
        // El total de horas de la cabecera, que suma horas y no renglones.
        sumaHorasExtra: { $sum: { $map: { input: { $ifNull: ["$attendance", []] }, as: "a", in: horasExtraDeLaFila } } },
        empleados: { $setUnion: [{ $map: { input: { $ifNull: ["$attendance", []] }, as: "a", in: "$$a.employeeId" } }, []] },
      },
    };

    /*
      MODO PAGINADO (`?page=`): una página, el total y los totales de la cabecera.

      Sin `page` contesta el array de siempre, que es lo que espera «Mis novedades» del móvil
      (`?mine=1`: son las propias de una persona y no hay nada que paginar).

      Un solo `$facet`: las dos respuestas salen del mismo `$match` y del mismo `$sort`, así que la
      base recorre los partes una vez. La página cuenta sus cinco números DESPUÉS de recortar —25
      documentos— y los totales se suman sin traer ningún detalle.
    */
    const paginado = req.query.page !== undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));

    if (paginado) {
      const [salida] = await Request.aggregate([
        { $match: filter },
        { $sort: { date: -1, createdAt: -1 } },
        {
          $facet: {
            filas: [{ $skip: (page - 1) * limit }, { $limit: limit }, numeros, { $project: { attendance: 0 } }],
            // Los de la cabecera, sobre TODO lo filtrado y no sobre la página: es lo que decían antes.
            totales: [
              {
                $group: {
                  _id: null,
                  partes: { $sum: 1 },
                  ausentes: { $sum: contar(noVino("status")) },
                  horasExtra: { $sum: { $sum: { $map: { input: { $ifNull: ["$attendance", []] }, as: "a", in: horasExtraDeLaFila } } } },
                },
              },
            ],
          },
        },
      ]);

      const filas = salida?.filas || [];
      const totales = salida?.totales?.[0] || { partes: 0, ausentes: 0, horasExtra: 0 };
      await Request.populate(filas, POPULADOS);
      res.json({
        rows: filas,
        pagination: { page, limit, total: totales.partes, totalPages: Math.max(1, Math.ceil(totales.partes / limit)) },
        totales: { partes: totales.partes, ausentes: totales.ausentes, horasExtra: totales.horasExtra },
      });
      return;
    }

    const reports = await Request.aggregate([{ $match: filter }, { $sort: { date: -1, createdAt: -1 } }, numeros, { $project: { attendance: 0 } }]);

    await Request.populate(reports, POPULADOS);

    res.json(reports);
  } catch (error) {
    console.error("Get activity reports error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const body = req.body;

    // Clean up empty strings for replacementId which might cause ObjectId casting issues
    if (body.attendance) {
      body.attendance = body.attendance.map((att: any) => {
        if (att.replacementId === "") delete att.replacementId;
        return att;
      });
    }

    const data = createReportSchema.parse(body);

    const report = await Request.create({
      tenantId: req.tenantObjectId,
      userId,
      ...data,
      submittedAt: new Date(),
    });

    res.status(201).json(report);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create activity report error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /compliance - Control de cumplimiento de novedades por coordinador (admin, o supervisor sobre sus proyectos)
router.get("/compliance", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const alcance = await alcanceCumplimiento(req);
    const projectIdPedido = req.query.projectId ? String(req.query.projectId) : undefined;
    if (!alcance || (projectIdPedido && alcance.projectIds && !alcance.projectIds.includes(projectIdPedido))) {
      res.status(403).json({ error: "No autorizado" });
      return;
    }
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
      res.status(400).json({ error: "Parámetros 'from'/'to' inválidos (YYYY-MM-DD, from<=to)" });
      return;
    }
    // Cap de rango para evitar cómputos gigantes.
    const rangeDays = (new Date(to + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / 86400000;
    if (rangeDays > MAX_RANGE_DAYS) {
      res.status(400).json({ error: `Rango demasiado grande (máx ${MAX_RANGE_DAYS} días)` });
      return;
    }

    const data = await computeCompliance(req.tenantObjectId!, {
      from,
      to,
      projectId: projectIdPedido,
      projectIds: alcance.projectIds,
      coordinatorId: req.query.coordinatorId ? String(req.query.coordinatorId) : undefined,
      areaId: req.query.areaId ? String(req.query.areaId) : undefined,
      shiftId: req.query.shiftId ? String(req.query.shiftId) : undefined,
    });
    res.json(data);
  } catch (error) {
    console.error("Compliance error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /compliance/remind - Notifica a los coordinadores con novedades faltantes (admin, o supervisor sobre sus proyectos)
router.post("/compliance/remind", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { from, to, projectId, coordinatorIds, message } = req.body || {};
    const alcance = await alcanceCumplimiento(req);
    if (!alcance || (projectId && alcance.projectIds && !alcance.projectIds.includes(String(projectId)))) {
      res.status(403).json({ error: "No autorizado" });
      return;
    }
    if (!DATE_RE.test(String(from)) || !DATE_RE.test(String(to)) || String(from) > String(to)) {
      res.status(400).json({ error: "Parámetros 'from'/'to' inválidos" });
      return;
    }

    // Recalcular server-side (nunca confiar en una lista del cliente).
    // Con el mismo alcance que la consulta: un supervisor sólo puede recordarle a los de sus proyectos.
    const data = await computeCompliance(req.tenantObjectId!, { from, to, projectId, projectIds: alcance.projectIds });
    const idSet = Array.isArray(coordinatorIds) && coordinatorIds.length ? new Set(coordinatorIds.map(String)) : null;
    const behind = data.coordinators.filter((c) => c.missingCount > 0 && (!idSet || idSet.has(c.userId)));

    // Dedupe: no crear un segundo recordatorio no-leído del mismo tipo el mismo día.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const notified: { userId: string; name: string; missingCount: number }[] = [];
    for (const c of behind) {
      if (!mongoose.Types.ObjectId.isValid(c.userId)) continue;
      const exists = await Notification.findOne({
        tenantId: req.tenantObjectId,
        userId: c.userId,
        type: "novedad_compliance_reminder",
        isRead: false,
        createdAt: { $gte: startOfToday },
      }).select("_id");
      if (exists) continue;
      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: c.userId,
        type: "novedad_compliance_reminder",
        title: "Novedades pendientes",
        message: message
          ? String(message)
          : `Tenés ${c.missingCount} novedad(es) sin enviar. Por favor cargalas para completar los registros.`,
        linkUrl: "/mobile",
      });
      notified.push({ userId: c.userId, name: c.name, missingCount: c.missingCount });
    }

    res.json({ notified, count: notified.length });
  } catch (error) {
    console.error("Compliance remind error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
  UN PARTE, CON SU DETALLE DE ASISTENCIA.

  QUIÉN PUEDE ABRIRLO ES LO MISMO QUE DECIDE QUIÉN LO VE EN LA LISTA: el admin, cualquiera del
  tenant; los demás, los suyos. Estaba atado a `userId` SIEMPRE, porque nació para «mi novedad» del
  móvil, donde uno abre las propias. Cuando el listado del panel dejó de mandar la asistencia y el
  detalle pasó a pedirse acá, eso se volvió un 404 para el admin en cada parte que no hubiera
  cargado él —o sea casi todos—: la pantalla se quedaba sin renglones y caía en su camino viejo,
  que arma una lista figurada con TODO el personal del proyecto y los da a todos por presentes.

  El recorte por `userId` se conserva para quien no es admin: es el mismo que aplica el listado.
*/
router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const filtro: any = { _id: req.params.id, tenantId: req.tenantObjectId };
    if (!isAdminReq(req)) filtro.userId = userId;

    const report = await Request.findOne(filtro)
      .populate("projectId", "name")
      .populate("areaId", "name")
      .populate("shiftId", "name")
      .populate("attendance.employeeId", "firstName lastName")
      .populate("attendance.replacementId", "firstName lastName");

    if (!report) {
      res.status(404).json({ error: "Reporte no encontrado" });
      return;
    }
    res.json(report);
  } catch (error) {
    console.error("Get report detail error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
    const primaryRole = req.user?.primaryRole?.toLowerCase();
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin") || primaryRole === "admin" || primaryRole === "superadmin";

    const filter: any = {
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    };

    // If not admin, restrict to own reports
    if (!isAdmin) {
      filter.userId = userId;
    }

    const report = await Request.findOneAndDelete(filter);

    if (!report) {
      res.status(404).json({ error: "Reporte no encontrado o no autorizado" });
      return;
    }

    res.json({ message: "Reporte eliminado correctamente" });
  } catch (error) {
    console.error("Delete report error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
    const primaryRole = req.user?.primaryRole?.toLowerCase();
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin") || primaryRole === "admin" || primaryRole === "superadmin";

    const filter: any = {
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    };

    // If not admin, restrict to own reports
    if (!isAdmin) {
      filter.userId = userId;
    }

    const body = req.body;
    // Clean up empty strings for replacementId which might cause ObjectId casting issues
    if (body.attendance) {
      body.attendance = body.attendance.map((att: any) => {
        if (att.replacementId === "") delete att.replacementId;
        return att;
      });
    }

    const data = createReportSchema.parse(body);

    const report = await Request.findOneAndUpdate(filter, data, { new: true });

    if (!report) {
      res.status(404).json({ error: "Reporte no encontrado o no autorizado para editar" });
      return;
    }

    res.json(report);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update report error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as RequestRoutes };

/**
 * LOS MISMOS FILTROS DE GESTIONAR EQUIPO, SOBRE EL PERÍODO.
 *
 * Devuelve quiénes pasan y qué poner en cada desplegable. Ver `services/filtrosDeNovedades.ts`:
 * se resuelve en el server porque vigencia, tipo, estado impositivo y reemplazo dependen del
 * contrato que rige, y calcularlos en el navegador obligaba a bajarse los contratos de las 1.577
 * personas del tenant.
 */
router.get("/filtros-de-personas", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const desde = String(req.query.desde || "");
    const hasta = String(req.query.hasta || "");
    if (!DATE_RE.test(desde) || !DATE_RE.test(hasta) || desde > hasta) {
      res.status(400).json({ error: "Parámetros 'desde'/'hasta' inválidos (AAAA-MM-DD, desde<=hasta)" });
      return;
    }

    const resultado = await resolverFiltrosDeNovedades(req.tenantObjectId!, {
      desde,
      hasta,
      estadoUsuario: (req.query.estadoUsuario as any) || "",
      vigencia: (req.query.vigencia as any) || "",
      tipoContrato: req.query.tipoContrato ? String(req.query.tipoContrato) : "",
      estadoContrato: req.query.estadoContrato ? String(req.query.estadoContrato) : "",
      areaTurno: req.query.areaTurno ? String(req.query.areaTurno) : "",
      reemplazo: (req.query.reemplazo as any) || "",
      rol: req.query.rol ? String(req.query.rol) : "",
      // El interruptor de la tabla: cambia qué contrato rige en cada fila, así que tiene que viajar.
      soloContratoActivo: req.query.soloContratoActivo !== "0",
    });

    res.json(resultado);
  } catch (error) {
    console.error("Filtros de personas error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
