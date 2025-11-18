import { Router } from "express";
import { z } from "zod";
import { VacationRequest } from "../models/VacationRequest.js";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { Notification } from "../models/Notification.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { Types } from "mongoose";

const router = Router();

router.use(requireTenant, authenticateToken);

const createVacationSchema = z.object({
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
  reason: z.string().min(1),
});

const updateVacationSchema = z.object({
  startDate: z.string().transform((str) => new Date(str)).optional(),
  endDate: z.string().transform((str) => new Date(str)).optional(),
  reason: z.string().min(1).optional(),
});

function calculateDays(start: Date, end: Date): number {
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
}

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const vacations = await VacationRequest.find({
      tenantId: req.tenantObjectId,
      userId,
    })
      .sort({ createdAt: -1 })
      .populate("approvedBy", "firstName lastName email");

    res.json(vacations);
  } catch (error) {
    console.error("Get vacations error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/available", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const profile = await EmployeeProfile.findOne({
      tenantId: req.tenantObjectId,
      userId,
    });

    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

    const approvedVacations = await VacationRequest.find({
      tenantId: req.tenantObjectId,
      userId,
      status: "approved",
      startDate: { $gte: yearStart, $lte: yearEnd },
    });

    const daysUsed = approvedVacations.reduce((sum, vac) => sum + vac.daysRequested, 0);
    const daysAvailable = Math.max(0, profile.vacationPolicy.annualDays - daysUsed);

    res.json({
      total: profile.vacationPolicy.annualDays,
      used: daysUsed,
      available: daysAvailable,
    });
  } catch (error) {
    console.error("Get available days error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

    const vacations = await VacationRequest.find({
      tenantId: req.tenantObjectId,
      userId,
      startDate: { $gte: yearStart, $lte: yearEnd },
    });

    const stats = vacations.reduce(
      (acc, vac) => {
        acc[vac.status] = (acc[vac.status] || 0) + 1;
        if (vac.status === "approved") {
          acc.totalDays += vac.daysRequested;
        }
        return acc;
      },
      { pending: 0, approved: 0, rejected: 0, cancelled: 0, totalDays: 0 }
    );

    res.json(stats);
  } catch (error) {
    console.error("Get vacation stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const vacation = await VacationRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
    }).populate("approvedBy", "firstName lastName email");

    if (!vacation) {
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }

    res.json(vacation);
  } catch (error) {
    console.error("Get vacation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = createVacationSchema.parse(req.body);

    if (data.startDate < new Date()) {
      res.status(400).json({ error: "Start date cannot be in the past" });
      return;
    }

    if (data.endDate < data.startDate) {
      res.status(400).json({ error: "End date must be after start date" });
      return;
    }

    const daysRequested = calculateDays(data.startDate, data.endDate);

    const vacation = new VacationRequest({
      tenantId: req.tenantObjectId,
      userId,
      ...data,
      daysRequested,
      status: "pending",
    });

    await vacation.save();

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "vacation_request_created",
      description: `Created vacation request for ${daysRequested} days`,
      entityType: "VacationRequest",
      entityId: vacation._id,
    });

    res.status(201).json(vacation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create vacation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = updateVacationSchema.parse(req.body);

    const vacation = await VacationRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
    });

    if (!vacation) {
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }

    if (vacation.status !== "pending") {
      res.status(400).json({ error: "Only pending requests can be updated" });
      return;
    }

    if (data.startDate && data.endDate) {
      vacation.daysRequested = calculateDays(data.startDate, data.endDate);
    } else if (data.startDate) {
      vacation.daysRequested = calculateDays(data.startDate, vacation.endDate);
    } else if (data.endDate) {
      vacation.daysRequested = calculateDays(vacation.startDate, data.endDate);
    }

    Object.assign(vacation, data);
    await vacation.save();

    res.json(vacation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update vacation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const vacation = await VacationRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
    });

    if (!vacation) {
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }

    if (vacation.status !== "pending") {
      res.status(400).json({ error: "Only pending requests can be deleted" });
      return;
    }

    await VacationRequest.findByIdAndDelete(vacation._id);

    res.json({ message: "Vacation request deleted successfully" });
  } catch (error) {
    console.error("Delete vacation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as vacationRoutes };
