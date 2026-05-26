import { Router } from "express";
import { z } from "zod";
import { Request } from "../models/Request.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
const router = Router();
router.use(requireTenant, authenticateToken);
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
router.get("/", async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
        const primaryRole = req.user?.primaryRole?.toLowerCase();
        const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin") || primaryRole === "admin" || primaryRole === "superadmin";
        const filter = {
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
    }
    catch (error) {
        console.error("Get activity reports error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.post("/", async (req, res) => {
    try {
        const userId = req.user.userId;
        const body = req.body;
        // Clean up empty strings for replacementId which might cause ObjectId casting issues
        if (body.attendance) {
            body.attendance = body.attendance.map((att) => {
                if (att.replacementId === "")
                    delete att.replacementId;
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
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid data", details: error.errors });
            return;
        }
        console.error("Create activity report error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get("/:id", async (req, res) => {
    try {
        const userId = req.user.userId;
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
    }
    catch (error) {
        console.error("Get report detail error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
        const primaryRole = req.user?.primaryRole?.toLowerCase();
        const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin") || primaryRole === "admin" || primaryRole === "superadmin";
        const filter = {
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
    }
    catch (error) {
        console.error("Delete report error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.put("/:id", async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
        const primaryRole = req.user?.primaryRole?.toLowerCase();
        const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin") || primaryRole === "admin" || primaryRole === "superadmin";
        const filter = {
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
            body.attendance = body.attendance.map((att) => {
                if (att.replacementId === "")
                    delete att.replacementId;
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
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid data", details: error.errors });
            return;
        }
        console.error("Update report error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as RequestRoutes };
