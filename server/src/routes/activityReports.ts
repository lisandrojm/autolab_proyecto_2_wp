import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Request } from "../models/Request.js";
import { Notification } from "../models/Notification.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { computeCompliance } from "../services/complianceService.js";

const router = Router();

router.use(requireTenant, authenticateToken);

const isAdminReq = (req: AuthenticatedRequest): boolean => {
  const roles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
  const primary = req.user?.primaryRole?.toLowerCase();
  return roles.includes("admin") || roles.includes("superadmin") || primary === "admin" || primary === "superadmin";
};

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

    // If not admin, only show own reports
    if (!isAdmin) {
      filter.userId = userId;
    }

    const reports = await Request.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .populate("userId", "firstName lastName")
      .populate({
        path: "projectId",
        select: "name clientId",
        populate: {
          path: "clientId",
          select: "name",
        },
      })
      .populate("areaId", "name")
      .populate("shiftId", "name")
      .populate("attendance.employeeId", "firstName lastName")
      .populate("attendance.replacementId", "firstName lastName");

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

// GET /compliance - Control de cumplimiento de novedades por coordinador (admin-only)
router.get("/compliance", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdminReq(req)) {
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
      projectId: req.query.projectId ? String(req.query.projectId) : undefined,
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

// POST /compliance/remind - Notifica a los coordinadores con novedades faltantes (admin-only)
router.post("/compliance/remind", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdminReq(req)) {
      res.status(403).json({ error: "No autorizado" });
      return;
    }
    const { from, to, projectId, coordinatorIds, message } = req.body || {};
    if (!DATE_RE.test(String(from)) || !DATE_RE.test(String(to)) || String(from) > String(to)) {
      res.status(400).json({ error: "Parámetros 'from'/'to' inválidos" });
      return;
    }

    // Recalcular server-side (nunca confiar en una lista del cliente).
    const data = await computeCompliance(req.tenantObjectId!, { from, to, projectId });
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

router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const report = await Request.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
    })
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
