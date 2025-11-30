import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { VacationRequest } from "../models/VacationRequest.js";
import { Order } from "../models/Order.js";
import { OrderCategory } from "../models/OrderCategory.js";
import { CalendarEvent } from "../models/CalendarEvent.js";
import { HRDocument } from "../models/Document.js";
import { Notification } from "../models/Notification.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { authenticateToken, AuthenticatedRequest, requireRole } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { Types } from "mongoose";

const router = Router();

router.use(requireTenant, authenticateToken, requireRole(["admin", "manager", "superadmin"]));

const updateEmployeeSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
  hireDate: z.string().transform((str) => new Date(str)).optional(),
  vacationPolicy: z.object({
    annualDays: z.number().min(0).optional(),
    carryOverDays: z.number().min(0).optional(),
  }).optional(),
  isActive: z.boolean().optional(),
});

const approveVacationSchema = z.object({
  managerComment: z.string().optional(),
});

const rejectVacationSchema = z.object({
  managerComment: z.string().min(1),
});

const approveOrderSchema = z.object({
  deliveryNote: z.string().optional(),
});

const createEventSchema = z.object({
  userId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  start: z.string().transform((str) => new Date(str)),
  end: z.string().transform((str) => new Date(str)),
  isAllDay: z.boolean().default(false),
  visibility: z.enum(["private", "team", "company"]).default("company"),
});

const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  start: z.string().transform((str) => new Date(str)).optional(),
  end: z.string().transform((str) => new Date(str)).optional(),
  isAllDay: z.boolean().optional(),
  visibility: z.enum(["private", "team", "company"]).optional(),
});

const createDocumentSchema = z.object({
  userId: z.string(),
  type: z.enum(["contract", "payroll", "certificate", "other"]),
  title: z.string().min(1),
  description: z.string().optional(),
  filePath: z.string().optional(),
  fileUrl: z.string().url().optional(),
  isVisibleToEmployee: z.boolean().default(true),
});

router.get("/users", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 20, department, isActive } = req.query;

    const filter: any = { tenantId: req.tenantObjectId };

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .populate("roles", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    const userIds = users.map((u) => u._id);
    const profiles = await EmployeeProfile.find({
      tenantId: req.tenantObjectId,
      userId: { $in: userIds },
    });

    const profileMap = new Map(profiles.map((p) => [String(p.userId), p]));

    const usersWithProfiles = users.map((user) => ({
      ...user.toObject(),
      profile: profileMap.get(String(user._id)) || null,
    }));

    let filteredUsers = usersWithProfiles;

    if (department) {
      filteredUsers = filteredUsers.filter((u) => u.profile?.department === department);
    }

    if (isActive !== undefined) {
      const activeFilter = isActive === "true";
      filteredUsers = filteredUsers.filter((u) => u.profile?.isActive === activeFilter);
    }

    res.json({
      users: filteredUsers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: filteredUsers.length,
        pages: Math.ceil(filteredUsers.length / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get admin users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    })
      .select("-password")
      .populate("roles", "name description");

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const profile = await EmployeeProfile.findOne({
      tenantId: req.tenantObjectId,
      userId: user._id,
    });

    res.json({
      ...user.toObject(),
      profile,
    });
  } catch (error) {
    console.error("Get admin user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/users/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = updateEmployeeSchema.parse(req.body);

    const user = await User.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const profile = await EmployeeProfile.findOneAndUpdate(
      {
        tenantId: req.tenantObjectId,
        userId: user._id,
      },
      { $set: data },
      { new: true, upsert: true }
    );

    res.json(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update employee error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/users/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const profile = await EmployeeProfile.findOneAndUpdate(
      {
        tenantId: req.tenantObjectId,
        userId: req.params.id,
      },
      { $set: { isActive: false } },
      { new: true }
    );

    if (!profile) {
      res.status(404).json({ error: "Employee profile not found" });
      return;
    }

    res.json({ message: "Employee deactivated successfully" });
  } catch (error) {
    console.error("Deactivate employee error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/vacations/pending", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const vacations = await VacationRequest.find({
      tenantId: req.tenantObjectId,
      status: "pending",
    })
      .sort({ createdAt: -1 })
      .populate("userId", "firstName lastName email");

    res.json(vacations);
  } catch (error) {
    console.error("Get pending vacations error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/vacations/:id/approve", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { managerComment } = approveVacationSchema.parse(req.body);
    const approverId = req.user!.userId;

    const vacation = await VacationRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!vacation) {
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }

    if (vacation.status !== "pending") {
      res.status(400).json({ error: "Only pending requests can be approved" });
      return;
    }

    vacation.status = "approved";
    vacation.approvedBy = new Types.ObjectId(approverId);
    vacation.approvedAt = new Date();
    if (managerComment) vacation.managerComment = managerComment;

    await vacation.save();

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: vacation.userId,
      type: "vacation",
      title: "Solicitud de vacaciones aprobada",
      message: `Tu solicitud de vacaciones por ${vacation.daysRequested} día${vacation.daysRequested > 1 ? 's' : ''} ha sido aprobada.`,
      linkUrl: `/vacations/${vacation._id}`,
    });

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId: vacation.userId,
      action: "vacation_request_approved",
      description: `Solicitud de vacaciones aprobada por el supervisor`,
      entityType: "VacationRequest",
      entityId: vacation._id,
    });

    res.json(vacation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Approve vacation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/vacations/:id/reject", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { managerComment } = rejectVacationSchema.parse(req.body);

    const vacation = await VacationRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!vacation) {
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }

    if (vacation.status !== "pending") {
      res.status(400).json({ error: "Only pending requests can be rejected" });
      return;
    }

    vacation.status = "rejected";
    vacation.managerComment = managerComment;

    await vacation.save();

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: vacation.userId,
      type: "vacation",
      title: "Solicitud de vacaciones rechazada",
      message: `Tu solicitud de vacaciones ha sido rechazada. Motivo: ${managerComment}`,
      linkUrl: `/vacations/${vacation._id}`,
    });

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId: vacation.userId,
      action: "vacation_request_rejected",
      description: `Solicitud de vacaciones rechazada por el supervisor`,
      entityType: "VacationRequest",
      entityId: vacation._id,
    });

    res.json(vacation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Reject vacation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/orders/pending", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const orders = await Order.find({
      tenantId: req.tenantObjectId,
      status: "pending",
    })
      .sort({ requestedAt: -1 })
      .populate("userId", "firstName lastName email")
      .populate("categoryId");

    res.json(orders);
  } catch (error) {
    console.error("Get pending orders error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/orders/:id/pre-approve", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const preApproverId = req.user!.userId;

    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.status !== "pending") {
      res.status(400).json({ error: "Only pending orders can be pre-approved" });
      return;
    }

    order.status = "pre_approved";
    order.preApprovedBy = new Types.ObjectId(preApproverId);
    order.preApprovedAt = new Date();

    await order.save();

    const categoryName = order.categoryId ? (await OrderCategory.findById(order.categoryId))?.name || order.category : order.category;
    const subcategoryText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
    const orderDisplayName = `${categoryName}${subcategoryText}`;

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId: order.userId,
      action: "order_pre_approved",
      description: `Pedido "${orderDisplayName}" preaprobado por el supervisor`,
      entityType: "Order",
      entityId: order._id,
    });

    res.json(order);
  } catch (error) {
    console.error("Pre-approve order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/orders/:id/approve", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const approverId = req.user!.userId;

    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.status !== "pre_approved") {
      res.status(400).json({ error: "Only pre-approved orders can be approved" });
      return;
    }

    order.status = "approved";
    order.approvedBy = new Types.ObjectId(approverId);
    order.approvedAt = new Date();

    await order.save();

    const categoryName = order.categoryId ? (await OrderCategory.findById(order.categoryId))?.name || order.category : order.category;
    const subcategoryText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
    const orderDisplayName = `${categoryName}${subcategoryText}`;

    const orderNumber = order.orderNumber || "N/A";

    if (order.requiresSignature) {
      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: order.userId,
        type: "order",
        title: "Pedido pendiente de firma",
        message: `Tenés un pedido pendiente de firma. Revisá tu casilla de email para completar el proceso. Pedido N°: ${orderNumber}`,
        linkUrl: `/orders/${order._id}`,
      });
    } else {
      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: order.userId,
        type: "order",
        title: "Pedido aprobado",
        message: `Tu pedido "${orderDisplayName}" N°: ${orderNumber} ha sido aprobado correctamente`,
        linkUrl: `/orders/${order._id}`,
      });
    }

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId: order.userId,
      action: "order_approved",
      description: `Pedido "${orderDisplayName}" aprobado por el supervisor`,
      entityType: "Order",
      entityId: order._id,
    });

    res.json(order);
  } catch (error) {
    console.error("Approve order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/orders/:id/reject", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (!["pending", "pre_approved", "approved"].includes(order.status)) {
      res.status(400).json({ error: "Only pending, pre-approved, or approved orders can be rejected" });
      return;
    }

    order.status = "rejected";

    await order.save();

    const categoryName = order.categoryId ? (await OrderCategory.findById(order.categoryId))?.name || order.category : order.category;
    const subcategoryText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
    const orderDisplayName = `${categoryName}${subcategoryText}`;

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: order.userId,
      type: "order",
      title: "Pedido Rechazado",
      message: `Tu pedido "${orderDisplayName}" ha sido rechazado.`,
      linkUrl: `/orders/${order._id}`,
    });

    res.json(order);
  } catch (error) {
    console.error("Reject order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/orders/:id/deliver", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.status !== "approved") {
      res.status(400).json({ error: "Only approved orders can be marked as delivered" });
      return;
    }

    order.status = "delivered";
    order.deliveredAt = new Date();

    await order.save();

    const categoryName = order.categoryId ? (await OrderCategory.findById(order.categoryId))?.name || order.category : order.category;
    const subcategoryText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
    const orderDisplayName = `${categoryName}${subcategoryText}`;

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: order.userId,
      type: "order",
      title: "Order Delivered",
      message: `Your order "${orderDisplayName}" has been delivered.`,
      linkUrl: `/orders/${order._id}`,
    });

    res.json(order);
  } catch (error) {
    console.error("Deliver order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/calendar/events", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createEventSchema.parse(req.body);
    const creatorId = req.user!.userId;

    const targetUserId = data.userId ? new Types.ObjectId(data.userId) : new Types.ObjectId(creatorId);

    const event = new CalendarEvent({
      tenantId: req.tenantObjectId,
      userId: targetUserId,
      title: data.title,
      description: data.description,
      start: data.start,
      end: data.end,
      isAllDay: data.isAllDay,
      visibility: data.visibility,
      createdBy: new Types.ObjectId(creatorId),
    });

    await event.save();

    if (String(targetUserId) !== String(creatorId)) {
      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: targetUserId,
        type: "calendar",
        title: "New Calendar Event",
        message: `A new event "${data.title}" has been added to your calendar.`,
        linkUrl: `/calendar`,
      });
    }

    res.status(201).json(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create event error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/calendar/events/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = updateEventSchema.parse(req.body);
    const updaterId = req.user!.userId;

    const event = await CalendarEvent.findOneAndUpdate(
      {
        _id: req.params.id,
        tenantId: req.tenantObjectId,
      },
      {
        $set: {
          ...data,
          updatedBy: new Types.ObjectId(updaterId),
        },
      },
      { new: true }
    );

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update event error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/calendar/events/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const event = await CalendarEvent.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Delete event error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/documents", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createDocumentSchema.parse(req.body);
    const uploaderId = req.user!.userId;

    const document = new HRDocument({
      tenantId: req.tenantObjectId,
      userId: new Types.ObjectId(data.userId),
      type: data.type,
      title: data.title,
      description: data.description,
      filePath: data.filePath,
      fileUrl: data.fileUrl,
      uploadedBy: new Types.ObjectId(uploaderId),
      uploadedAt: new Date(),
      isVisibleToEmployee: data.isVisibleToEmployee,
    });

    await document.save();

    if (data.isVisibleToEmployee) {
      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: new Types.ObjectId(data.userId),
        type: "document",
        title: "New Document Available",
        message: `A new document "${data.title}" has been added to your profile.`,
        linkUrl: `/documents/${document._id}`,
      });
    }

    res.status(201).json(document);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create document error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/documents/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const document = await HRDocument.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!document) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Delete document error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as hrAdminRoutes };
