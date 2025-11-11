import { Router } from "express";
import { ActivityLog } from "../models/ActivityLog.js";
import { CalendarEvent } from "../models/CalendarEvent.js";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { HRDocument } from "../models/Document.js";
import { Order } from "../models/Order.js";
import { VacationRequest } from "../models/VacationRequest.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.use(requireTenant, authenticateToken);

router.get("/activitylogs", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 50, userId, action, entityType } = req.query;

    const filter: any = { tenantId: req.tenantObjectId };

    if (userId) filter.userId = userId;
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("userId", "firstName lastName email")
        .populate("entityId"),
      ActivityLog.countDocuments(filter),
    ]);

    res.json({
      logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get activity logs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/activitylogs/count", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const count = await ActivityLog.countDocuments({ tenantId: req.tenantObjectId });
    res.json({ count });
  } catch (error) {
    console.error("Count activity logs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/calendarevents", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 50, year, month, userId } = req.query;

    const filter: any = { tenantId: req.tenantObjectId };

    if (userId) filter.userId = userId;

    if (year && month) {
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59);
      filter.start = { $gte: startDate, $lte: endDate };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [events, total] = await Promise.all([
      CalendarEvent.find(filter)
        .sort({ start: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("userId", "firstName lastName email")
        .populate("createdBy", "firstName lastName email"),
      CalendarEvent.countDocuments(filter),
    ]);

    res.json({
      events,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get calendar events error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/calendarevents/count", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const count = await CalendarEvent.countDocuments({ tenantId: req.tenantObjectId });
    res.json({ count });
  } catch (error) {
    console.error("Count calendar events error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/employeeprofiles", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 50, department, isActive, search } = req.query;

    const filter: any = { tenantId: req.tenantObjectId };

    if (department) filter.department = department;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [profiles, total] = await Promise.all([
      EmployeeProfile.find(filter)
        .sort({ lastName: 1, firstName: 1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("userId", "email roles"),
      EmployeeProfile.countDocuments(filter),
    ]);

    res.json({
      profiles,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get employee profiles error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/employeeprofiles/count", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const count = await EmployeeProfile.countDocuments({ tenantId: req.tenantObjectId });
    res.json({ count });
  } catch (error) {
    console.error("Count employee profiles error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/hrdocuments", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 50, type, userId } = req.query;

    const filter: any = { tenantId: req.tenantObjectId };

    if (type) filter.type = type;
    if (userId) filter.userId = userId;

    const skip = (Number(page) - 1) * Number(limit);

    const [documents, total] = await Promise.all([
      HRDocument.find(filter)
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("userId", "firstName lastName email")
        .populate("uploadedBy", "firstName lastName email"),
      HRDocument.countDocuments(filter),
    ]);

    res.json({
      documents,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get HR documents error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/hrdocuments/count", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const count = await HRDocument.countDocuments({ tenantId: req.tenantObjectId });
    res.json({ count });
  } catch (error) {
    console.error("Count HR documents error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/orders", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 50, status, category, userId } = req.query;

    const filter: any = { tenantId: req.tenantObjectId };

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (userId) filter.userId = userId;

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("userId", "firstName lastName email")
        .populate("approvedBy", "firstName lastName email"),
      Order.countDocuments(filter),
    ]);

    res.json({
      orders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/orders/count", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const count = await Order.countDocuments({ tenantId: req.tenantObjectId });
    res.json({ count });
  } catch (error) {
    console.error("Count orders error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/vacationrequests", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 50, status, userId, year } = req.query;

    const filter: any = { tenantId: req.tenantObjectId };

    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    if (year) {
      const startDate = new Date(Number(year), 0, 1);
      const endDate = new Date(Number(year), 11, 31, 23, 59, 59);
      filter.startDate = { $gte: startDate, $lte: endDate };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [vacations, total] = await Promise.all([
      VacationRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("userId", "firstName lastName email")
        .populate("approvedBy", "firstName lastName email"),
      VacationRequest.countDocuments(filter),
    ]);

    res.json({
      vacations,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get vacation requests error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/vacationrequests/count", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const count = await VacationRequest.countDocuments({ tenantId: req.tenantObjectId });
    res.json({ count });
  } catch (error) {
    console.error("Count vacation requests error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as hrManagementRoutes };
