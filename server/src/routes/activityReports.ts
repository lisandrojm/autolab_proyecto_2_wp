import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { ActivityReport } from "../models/ActivityReport.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.use(requireTenant, authenticateToken);

const attendanceSchema = z.object({
  employeeId: z.string(),
  status: z.string().optional(),
  absenceReason: z.string().optional(),
  replacementId: z.string().optional().or(z.literal("")),
  overtimeHours: z.number().optional(),
  notes: z.string().optional(),
});

const createReportSchema = z.object({
  date: z.string(),
  hasActivity: z.boolean(),
  comments: z.string().optional(),
  attendance: z.array(attendanceSchema).optional(),
  projectId: z.string().optional(),
  areaId: z.string().optional(),
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

    const reports = await ActivityReport.find(filter)
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

    const report = await ActivityReport.create({
      tenantId: req.tenantObjectId,
      userId,
      ...data,
      submittedAt: new Date(),
    });

    // Log the activity
    const ActivityLog = (await import("../models/ActivityLog.js")).ActivityLog;
    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "activity_report_created",
      description: `Novedades del día ${data.date}`,
      entityType: "ActivityReport",
      entityId: report._id,
      metadata: {
        date: data.date,
        hasActivity: data.hasActivity,
        projectId: data.projectId,
      },
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

router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const report = await ActivityReport.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
    })
      .populate("projectId", "name")
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

    const report = await ActivityReport.findOneAndDelete(filter);

    if (!report) {
      res.status(404).json({ error: "Reporte no encontrado o no autorizado" });
      return;
    }

    // Log the activity
    const ActivityLog = (await import("../models/ActivityLog.js")).ActivityLog;
    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "activity_report_deleted",
      description: `Novedades eliminadas del día ${report.date}`,
      entityType: "ActivityReport",
      entityId: report._id,
      metadata: {
        date: report.date,
        projectId: report.projectId,
      },
    });

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

    const report = await ActivityReport.findOneAndUpdate(filter, data, { new: true });

    if (!report) {
      res.status(404).json({ error: "Reporte no encontrado o no autorizado para editar" });
      return;
    }

    // Log the activity
    const ActivityLog = (await import("../models/ActivityLog.js")).ActivityLog;
    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "activity_report_updated",
      description: `Novedades actualizadas del día ${data.date}`,
      entityType: "ActivityReport",
      entityId: report._id,
      metadata: {
        date: data.date,
        hasActivity: data.hasActivity,
        projectId: data.projectId,
      },
    });

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

export { router as activityReportRoutes };
