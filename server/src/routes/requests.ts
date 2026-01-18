import { Router } from "express";
import { z } from "zod";
import { Request } from "../models/Request.js";
import { User } from "../models/User.js";
import { Notification } from "../models/Notification.js";
import { authenticateToken, AuthenticatedRequest, requireRole } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { Types } from "mongoose";

const router = Router();

router.use(requireTenant, authenticateToken);

const createRequestSchema = z.object({
  typeKey: z.string().min(1, "Type is required"),
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
  reason: z.string().optional(),
  source: z.enum(["mobile", "admin"]).default("admin"),
});

const approveRequestSchema = z.object({
  replacementEmployeeId: z.string().optional(),
  notes: z.string().optional(),
});

const rejectRequestSchema = z.object({
  rejectionReason: z.string().min(1, "Rejection reason is required"),
});


function calculateDays(start: Date, end: Date): number {
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 20, status, type, employeeId, search } = req.query;
    const userId = req.user!.userId;

    const isSupervisor = req.user!.roles?.some((r) => ["admin", "manager", "superadmin"].includes(r));

    const filter: any = { tenantId: req.tenantObjectId };

    if (!isSupervisor) {
      filter.employeeId = userId;
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    if (type && type !== "all") {
      filter.typeKey = type;
    }

    if (employeeId) {
      filter.employeeId = new Types.ObjectId(String(employeeId));
    }

    const skip = (Number(page) - 1) * Number(limit);

    let requests = await Request.find(filter)
      .populate("employeeId", "firstName lastName email")
      .populate("approverId", "firstName lastName email")
      .populate("replacementEmployeeId", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    if (search) {
      const searchLower = String(search).toLowerCase();
      requests = requests.filter((req) => {
        const employee = req.employeeId as any;
        const fullName = `${employee?.firstName || ""} ${employee?.lastName || ""}`.toLowerCase();
        return fullName.includes(searchLower) || req.typeKey.toLowerCase().includes(searchLower);
      });
    }

    const total = await Request.countDocuments(filter);

    res.json({
      requests,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error("Get requests error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/my", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const requests = await Request.find({
      tenantId: req.tenantObjectId,
      employeeId: userId,
    })
      .populate("approverId", "firstName lastName email")
      .populate("replacementEmployeeId", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error("Get my requests error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/pending", requireRole(["admin", "manager", "superadmin"]), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const requests = await Request.find({
      tenantId: req.tenantObjectId,
      status: "pending",
    })
      .populate("employeeId", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error("Get pending requests error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const isSupervisor = req.user!.roles?.some((r) => ["admin", "manager", "superadmin"].includes(r));

    const filter: any = {
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    };

    if (!isSupervisor) {
      filter.employeeId = userId;
    }

    const request = await Request.findOne(filter)
      .populate("employeeId", "firstName lastName email")
      .populate("approverId", "firstName lastName email")
      .populate("replacementEmployeeId", "firstName lastName email");

    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    res.json(request);
  } catch (error) {
    console.error("Get request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = createRequestSchema.parse(req.body);

    if (data.startDate < new Date()) {
      res.status(400).json({ error: "Start date cannot be in the past" });
      return;
    }

    if (data.endDate < data.startDate) {
      res.status(400).json({ error: "End date must be after start date" });
      return;
    }

    const daysCount = calculateDays(data.startDate, data.endDate);

    const request = new Request({
      tenantId: req.tenantObjectId,
      employeeId: userId,
      ...data,
      daysCount,
      status: "pending",
    });

    await request.save();

    

    const supervisors = await User.find({
      tenantId: req.tenantObjectId,
      roles: { $in: ["admin", "manager", "superadmin"] },
    });

    for (const supervisor of supervisors) {
      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: supervisor._id,
        type: "info",
        title: "Nueva solicitud de ausencia",
        message: `Nueva solicitud de ${data.typeKey} pendiente de aprobación`,
        linkUrl: `/admin/requests/${request._id}`,
      });
    }

    const populatedRequest = await Request.findById(request._id)
      .populate("employeeId", "firstName lastName email")
      .populate("approverId", "firstName lastName email")
      .populate("replacementEmployeeId", "firstName lastName email");

    res.status(201).json(populatedRequest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id/approve", requireRole(["admin", "manager", "superadmin"]), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = approveRequestSchema.parse(req.body);

    const request = await Request.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    if (request.status !== "pending") {
      res.status(400).json({ error: "Only pending requests can be approved" });
      return;
    }

    request.status = "approved";
    request.approverId = new Types.ObjectId(userId);
    request.approvedAt = new Date();

    if (data.replacementEmployeeId) {
      request.replacementEmployeeId = new Types.ObjectId(data.replacementEmployeeId);
    }

    if (data.notes) {
      request.notes = data.notes;
    }

    await request.save();

    

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: request.employeeId,
      type: "info",
      title: "Solicitud aprobada",
      message: `Tu solicitud de ${request.typeKey} ha sido aprobada`,
      linkUrl: `/admin/requests/${request._id}`,
    });

    const populatedRequest = await Request.findById(request._id)
      .populate("employeeId", "firstName lastName email")
      .populate("approverId", "firstName lastName email")
      .populate("replacementEmployeeId", "firstName lastName email");

    res.json(populatedRequest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Approve request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id/reject", requireRole(["admin", "manager", "superadmin"]), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = rejectRequestSchema.parse(req.body);

    const request = await Request.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!request) {
      res.status(404).json({ error: "Request not found" });
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

    

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: request.employeeId,
      type: "info",
      title: "Solicitud rechazada",
      message: `Tu solicitud de ${request.typeKey} ha sido rechazada`,
      linkUrl: `/admin/requests/${request._id}`,
    });

    const populatedRequest = await Request.findById(request._id)
      .populate("employeeId", "firstName lastName email")
      .populate("approverId", "firstName lastName email")
      .populate("replacementEmployeeId", "firstName lastName email");

    res.json(populatedRequest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Reject request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


router.patch("/:id/cancel", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const request = await Request.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      employeeId: userId,
    });

    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    if (request.status !== "pending") {
      res.status(400).json({ error: "Only pending requests can be cancelled" });
      return;
    }

    request.status = "cancelled";

    await request.save();

    

    const populatedRequest = await Request.findById(request._id)
      .populate("employeeId", "firstName lastName email")
      .populate("approverId", "firstName lastName email")
      .populate("replacementEmployeeId", "firstName lastName email");

    res.json(populatedRequest);
  } catch (error) {
    console.error("Cancel request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as requestRoutes };
