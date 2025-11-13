import { Router } from "express";
import { z } from "zod";
import { AbsenceRequest } from "../models/AbsenceRequest.js";
import { Area } from "../models/Area.js";
import { User } from "../models/User.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { Notification } from "../models/Notification.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { Types } from "mongoose";

const router = Router();

router.use(requireTenant, authenticateToken);

const createAbsenceRequestSchema = z.object({
  type: z.enum(["vacation", "compensatory", "special_leave", "extra"]),
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
  reason: z.string().optional(),
  source: z.enum(["mobile", "admin"]).optional().default("mobile"),
});

const updateAbsenceRequestSchema = z.object({
  type: z.enum(["vacation", "compensatory", "special_leave", "extra"]).optional(),
  startDate: z.string().transform((str) => new Date(str)).optional(),
  endDate: z.string().transform((str) => new Date(str)).optional(),
  reason: z.string().optional(),
});

const approveSchema = z.object({
  replacementEmployeeId: z.string().optional(),
  notes: z.string().optional(),
});

const rejectSchema = z.object({
  rejectionReason: z.string().min(1),
});

function calculateDays(start: Date, end: Date): number {
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
}

router.get("/my", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const requests = await AbsenceRequest.find({
      tenantId: req.tenantObjectId,
      employeeId: userId,
    })
      .sort({ createdAt: -1 })
      .populate("approverId", "firstName lastName email")
      .populate("replacementEmployeeId", "firstName lastName email")
      .populate("areaId", "name");

    res.json(requests);
  } catch (error) {
    console.error("Get my absence requests error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/pending", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { areaId, type, from, to } = req.query;
    const filter: any = {
      tenantId: req.tenantObjectId,
      status: "pending",
    };

    if (areaId) filter.areaId = areaId;
    if (type) filter.type = type;
    if (from || to) {
      filter.startDate = {};
      if (from) filter.startDate.$gte = new Date(from as string);
      if (to) filter.startDate.$lte = new Date(to as string);
    }

    const requests = await AbsenceRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate("employeeId", "firstName lastName email")
      .populate("areaId", "name")
      .populate("supervisorId", "firstName lastName email");

    res.json(requests);
  } catch (error) {
    console.error("Get pending absence requests error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { employeeId, status, type, from, to, areaId } = req.query;
    const filter: any = { tenantId: req.tenantObjectId };

    if (employeeId) filter.employeeId = employeeId;
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (areaId) filter.areaId = areaId;
    if (from || to) {
      filter.startDate = {};
      if (from) filter.startDate.$gte = new Date(from as string);
      if (to) filter.startDate.$lte = new Date(to as string);
    }

    const requests = await AbsenceRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate("employeeId", "firstName lastName email")
      .populate("areaId", "name")
      .populate("approverId", "firstName lastName email")
      .populate("replacementEmployeeId", "firstName lastName email")
      .populate("supervisorId", "firstName lastName email");

    res.json(requests);
  } catch (error) {
    console.error("Get absence requests error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const request = await AbsenceRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    })
      .populate("employeeId", "firstName lastName email")
      .populate("areaId", "name")
      .populate("approverId", "firstName lastName email")
      .populate("replacementEmployeeId", "firstName lastName email")
      .populate("supervisorId", "firstName lastName email");

    if (!request) {
      res.status(404).json({ error: "Absence request not found" });
      return;
    }

    res.json(request);
  } catch (error) {
    console.error("Get absence request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = createAbsenceRequestSchema.parse(req.body);

    if (data.startDate < new Date()) {
      res.status(400).json({ error: "Start date cannot be in the past" });
      return;
    }

    if (data.endDate < data.startDate) {
      res.status(400).json({ error: "End date must be after start date" });
      return;
    }

    const daysCount = calculateDays(data.startDate, data.endDate);

    const user = await User.findById(userId);
    let areaId: Types.ObjectId | undefined;

    const area = await Area.findOne({
      tenantId: req.tenantObjectId,
      employeeIds: userId,
    });

    if (area) {
      areaId = area._id as Types.ObjectId;
    }

    const request = new AbsenceRequest({
      tenantId: req.tenantObjectId,
      employeeId: userId,
      areaId,
      supervisorId: area?.supervisorId,
      ...data,
      daysCount,
      status: "pending",
      postponeCount: 0,
    });

    await request.save();

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "absence_request_created",
      description: `Created ${data.type} request for ${daysCount} days`,
      entityType: "AbsenceRequest",
      entityId: request._id,
    });

    const populatedRequest = await AbsenceRequest.findById(request._id)
      .populate("employeeId", "firstName lastName email")
      .populate("areaId", "name")
      .populate("supervisorId", "firstName lastName email");

    res.status(201).json(populatedRequest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create absence request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = updateAbsenceRequestSchema.parse(req.body);

    const request = await AbsenceRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      employeeId: userId,
    });

    if (!request) {
      res.status(404).json({ error: "Absence request not found" });
      return;
    }

    if (request.status !== "pending") {
      res.status(400).json({ error: "Only pending requests can be updated" });
      return;
    }

    if (data.startDate && data.endDate) {
      request.daysCount = calculateDays(data.startDate, data.endDate);
    } else if (data.startDate) {
      request.daysCount = calculateDays(data.startDate, request.endDate);
    } else if (data.endDate) {
      request.daysCount = calculateDays(request.startDate, data.endDate);
    }

    Object.assign(request, data);
    await request.save();

    const populatedRequest = await AbsenceRequest.findById(request._id)
      .populate("employeeId", "firstName lastName email")
      .populate("areaId", "name")
      .populate("approverId", "firstName lastName email")
      .populate("replacementEmployeeId", "firstName lastName email");

    res.json(populatedRequest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update absence request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id/approve", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = approveSchema.parse(req.body);

    const request = await AbsenceRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!request) {
      res.status(404).json({ error: "Absence request not found" });
      return;
    }

    if (request.status !== "pending") {
      res.status(400).json({ error: "Only pending requests can be approved" });
      return;
    }

    if (data.replacementEmployeeId) {
      const replacement = await User.findOne({
        _id: data.replacementEmployeeId,
        tenantId: req.tenantObjectId,
      });

      if (!replacement) {
        res.status(400).json({ error: "Replacement employee not found" });
        return;
      }

      request.replacementEmployeeId = new Types.ObjectId(data.replacementEmployeeId);

      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: data.replacementEmployeeId,
        title: "You have been assigned as replacement",
        message: `You will be covering for ${(request.employeeId as any).firstName || "an employee"} from ${request.startDate.toLocaleDateString()} to ${request.endDate.toLocaleDateString()}`,
        type: "info",
        isRead: false,
      });
    }

    request.status = "approved";
    request.approverId = new Types.ObjectId(userId);
    request.approvedAt = new Date();
    if (data.notes) request.notes = data.notes;

    await request.save();

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "absence_request_approved",
      description: `Approved ${request.type} request`,
      entityType: "AbsenceRequest",
      entityId: request._id,
    });

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: request.employeeId,
      title: "Absence request approved",
      message: `Your ${request.type} request has been approved`,
      type: "success",
      isRead: false,
    });

    const populatedRequest = await AbsenceRequest.findById(request._id)
      .populate("employeeId", "firstName lastName email")
      .populate("areaId", "name")
      .populate("approverId", "firstName lastName email")
      .populate("replacementEmployeeId", "firstName lastName email");

    res.json(populatedRequest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Approve absence request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id/reject", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = rejectSchema.parse(req.body);

    const request = await AbsenceRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!request) {
      res.status(404).json({ error: "Absence request not found" });
      return;
    }

    if (request.status !== "pending") {
      res.status(400).json({ error: "Only pending requests can be rejected" });
      return;
    }

    request.status = "rejected";
    request.approverId = new Types.ObjectId(userId);
    request.rejectedAt = new Date();
    request.rejectionReason = data.rejectionReason;

    await request.save();

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "absence_request_rejected",
      description: `Rejected ${request.type} request`,
      entityType: "AbsenceRequest",
      entityId: request._id,
    });

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: request.employeeId,
      title: "Absence request rejected",
      message: `Your ${request.type} request has been rejected: ${data.rejectionReason}`,
      type: "error",
      isRead: false,
    });

    const populatedRequest = await AbsenceRequest.findById(request._id)
      .populate("employeeId", "firstName lastName email")
      .populate("areaId", "name")
      .populate("approverId", "firstName lastName email");

    res.json(populatedRequest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Reject absence request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id/postpone", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const request = await AbsenceRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!request) {
      res.status(404).json({ error: "Absence request not found" });
      return;
    }

    if (request.status !== "pending") {
      res.status(400).json({ error: "Only pending requests can be postponed" });
      return;
    }

    if (request.postponeCount >= 3) {
      res.status(400).json({ error: "Maximum postpone limit reached (3)" });
      return;
    }

    request.postponeCount += 1;
    request.lastPostponedAt = new Date();

    await request.save();

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId: req.user!.userId,
      action: "absence_request_postponed",
      description: `Postponed ${request.type} request (${request.postponeCount}/3)`,
      entityType: "AbsenceRequest",
      entityId: request._id,
    });

    const populatedRequest = await AbsenceRequest.findById(request._id)
      .populate("employeeId", "firstName lastName email")
      .populate("areaId", "name")
      .populate("approverId", "firstName lastName email");

    res.json(populatedRequest);
  } catch (error) {
    console.error("Postpone absence request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id/cancel", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const request = await AbsenceRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      employeeId: userId,
    });

    if (!request) {
      res.status(404).json({ error: "Absence request not found" });
      return;
    }

    if (request.status !== "pending") {
      res.status(400).json({ error: "Only pending requests can be cancelled" });
      return;
    }

    request.status = "cancelled";
    await request.save();

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "absence_request_cancelled",
      description: `Cancelled ${request.type} request`,
      entityType: "AbsenceRequest",
      entityId: request._id,
    });

    const populatedRequest = await AbsenceRequest.findById(request._id)
      .populate("employeeId", "firstName lastName email")
      .populate("areaId", "name");

    res.json(populatedRequest);
  } catch (error) {
    console.error("Cancel absence request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as absenceRequestRoutes };
