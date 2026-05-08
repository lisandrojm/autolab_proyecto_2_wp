import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { UserProfile } from "../models/UserProfile.js";
import { Vacation } from "../models/Vacation.js";
import { Order } from "../models/Order.js";
import { OrderConfig } from "../models/OrderConfig.js";
import { Pdf } from "../models/Pdf.js";
import { Tenant } from "../models/Tenant.js";
import { Calendar } from "../models/Calendar.js";
import { Notification } from "../models/Notification.js";
import { authenticateToken, AuthenticatedRequest, requireRole } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { Types } from "mongoose";
import { getPlainOrderNumber } from "../utils/orderHelpers.js";
import { generateOrderPDF, generateVacationPDF } from "../utils/pdfGenerator.js";

const router = Router();

router.use(requireTenant, authenticateToken, requireRole(["admin", "manager", "superadmin"]));

const updateEmployeeSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
  hireDate: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
  vacationPolicy: z
    .object({
      annualDays: z.number().min(0).optional(),
      carryOverDays: z.number().min(0).optional(),
    })
    .optional(),
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
  start: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
  end: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
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
    const { page = 1, limit = 1000, department, isActive } = req.query;

    const filter: any = { tenantId: req.tenantObjectId };

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([User.find(filter).select("-password").populate("roles", "name").populate("projectIds", "name").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(), User.countDocuments(filter)]);

    const userIds = users.map((u) => u._id);
    const profiles = await UserProfile.find({
      tenantId: req.tenantObjectId,
      userId: { $in: userIds },
    }).lean();

    const profileMap = new Map(profiles.map((p) => [String(p.userId), p]));

    const usersWithProfiles = users.map((user) => ({
      ...user,
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
      .populate("roles", "name description")
      .populate("projectIds", "name")
      
      .populate({
        path: "metadata.projects",
        populate: { path: "projectId", select: "name status" },
      })
      .lean();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userObj = user as any;
    if (userObj.metadata && Array.isArray(userObj.metadata.projects)) {
      userObj.metadata.projects = userObj.metadata.projects.filter((up: any) => up && up.projectId);
    }

    const profile = await UserProfile.findOne({
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

    const profile = await UserProfile.findOneAndUpdate(
      {
        tenantId: req.tenantObjectId,
        userId: user._id,
      },
      { $set: data },
      { new: true, upsert: true },
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
    const profile = await UserProfile.findOneAndUpdate(
      {
        tenantId: req.tenantObjectId,
        userId: req.params.id,
      },
      { $set: { isActive: false } },
      { new: true },
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
    const vacations = await Vacation.find({
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

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!vacation) {
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }

    if (vacation.status !== "pre_approved") {
      res.status(400).json({ error: "Only pre-approved requests can be approved" });
      return;
    }

    vacation.status = "approved";
    vacation.approvedBy = new Types.ObjectId(approverId);
    vacation.approvedAt = new Date();
    if (managerComment) vacation.managerComment = managerComment;

    if (vacation.requiresSignature) {
      vacation.signatureStatus = "sent";
      vacation.signatureSentAt = new Date();
    }

    await vacation.save();

    if (vacation.requiresSignature) {
      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: vacation.userId,
        type: "vacation",
        title: "Documento enviado para firma",
        message: `Tu solicitud de vacaciones por ${vacation.daysRequested} día${vacation.daysRequested > 1 ? "s" : ""} ha sido aprobada. Revisá tu casilla de email para firmar el documento.`,
        linkUrl: `/vacations/${vacation._id}`,
      });
    } else {
      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: vacation.userId,
        type: "vacation",
        title: "Solicitud de vacaciones aprobada",
        message: `Tu solicitud de vacaciones por ${vacation.daysRequested} día${vacation.daysRequested > 1 ? "s" : ""} ha sido aprobada.`,
        linkUrl: `/vacations/${vacation._id}`,
      });
    }

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

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!vacation) {
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }

    if (!["pending", "pre_approved", "approved"].includes(vacation.status)) {
      res.status(400).json({ error: "Only pending, pre-approved, or approved requests can be rejected" });
      return;
    }

    vacation.status = "rejected";
    vacation.rejectedAt = new Date();
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

router.put("/vacations/:id/pre-approve", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const preApproverId = req.user!.userId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    }).populate("userId");

    if (!vacation) {
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }

    if (vacation.status !== "pending") {
      res.status(400).json({ error: "Only pending requests can be pre-approved" });
      return;
    }

    vacation.status = "pre_approved";
    vacation.preApprovedBy = new Types.ObjectId(preApproverId);
    vacation.preApprovedAt = new Date();

    const tenant = await Tenant.findById(req.tenantObjectId);
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    const requiresSignature = vacation.rules?.requiereFirma || false;
    const pdfId = vacation.rules?.pdfId;

    vacation.requiresSignature = requiresSignature;
    vacation.signatureStatus = requiresSignature ? "pending" : "not_required";

    if (pdfId) {
      const template = await Pdf.findById(pdfId);

      if (template) {
        console.log("[PRE-APPROVE] Generating PDF for vacation:", vacation._id);

        const user = typeof vacation.userId === "object" && "firstName" in vacation.userId ? (vacation.userId as any) : await User.findById(vacation.userId);

        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        const vacationNumber = `VAC-${vacation._id.toString().slice(-6).toUpperCase()}`;

        const pdfResult = await generateVacationPDF(vacation, template, user, req.tenantObjectId.toString(), tenant.name, vacationNumber);

        if (pdfResult.success) {
          vacation.pdfPreAprobacionUrl = pdfResult.pdfUrl;
          console.log("[PRE-APPROVE] PDF generated successfully:", pdfResult.pdfUrl);
        } else {
          console.error("[PRE-APPROVE] PDF generation failed:", pdfResult.error);
        }
      } else {
        console.warn("[PRE-APPROVE] PDF template not found:", pdfId);
      }
    }

    await vacation.save();

    res.json(vacation);
  } catch (error) {
    console.error("Pre-approve vacation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/vacations/:id/deliver", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!vacation) {
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }

    if (vacation.status !== "approved") {
      res.status(400).json({ error: "Only approved requests can be marked as delivered" });
      return;
    }

    vacation.status = "delivered";
    vacation.deliveredAt = new Date();

    await vacation.save();

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: vacation.userId,
      type: "vacation",
      title: "Solicitud de vacaciones entregada",
      message: `Tu solicitud de vacaciones por ${vacation.daysRequested} día${vacation.daysRequested > 1 ? "s" : ""} ha sido marcada como entregada.`,
      linkUrl: `/vacations/${vacation._id}`,
    });

    res.json(vacation);
  } catch (error) {
    console.error("Deliver vacation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/vacations/:id/send-signature", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!vacation) {
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }

    if (vacation.status !== "approved") {
      res.status(400).json({ error: "Only approved requests can be sent for signature" });
      return;
    }

    if (!vacation.requiresSignature) {
      res.status(400).json({ error: "This vacation request does not require signature" });
      return;
    }

    vacation.signatureStatus = "sent";
    vacation.signatureSentAt = new Date();

    await vacation.save();

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: vacation.userId,
      type: "vacation",
      title: "Documento enviado para firma",
      message: `El documento de tu solicitud de vacaciones ha sido enviado para firma.`,
      linkUrl: `/vacations/${vacation._id}`,
    });

    const finalVacation = await Vacation.findById(vacation._id).populate("userId", "firstName lastName email").populate("approvedBy", "firstName lastName email");

    res.json(finalVacation);
  } catch (error) {
    console.error("Send signature error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/vacations/:id/mark-signed", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const signedById = req.user!.userId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!vacation) {
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }

    if (!vacation.requiresSignature) {
      res.status(400).json({ error: "This vacation request does not require signature" });
      return;
    }

    if (vacation.signatureStatus !== "sent") {
      res.status(400).json({ error: "Only requests with sent signature can be marked as signed" });
      return;
    }

    vacation.signatureStatus = "signed";
    vacation.signedAt = new Date();
    vacation.signedBy = new Types.ObjectId(signedById);

    await vacation.save();

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: vacation.userId,
      type: "vacation",
      title: "Firma confirmada",
      message: `Tu firma de la solicitud de vacaciones ha sido verificada y confirmada.`,
      linkUrl: `/vacations/${vacation._id}`,
    });

    const finalVacation = await Vacation.findById(vacation._id).populate("userId", "firstName lastName email").populate("approvedBy", "firstName lastName email").populate("signedBy", "firstName lastName email");

    res.json(finalVacation);
  } catch (error) {
    console.error("Mark signed error:", error);
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
    })
      .populate("userId")
      .populate("categoryId");

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

    if (order.categoryId) {
      const category = await OrderConfig.findById(order.categoryId);
      if (category && category.pdfId) {
        try {
          const template = await Pdf.findOne({
            _id: category.pdfId,
            tenantId: req.tenantObjectId,
            isActive: true,
          });

          if (template) {
            const user = order.userId as any;
            const tenant = await Tenant.findById(req.tenantObjectId);
            const tenantName = tenant?.name || tenant?.slug || "Organización";

            const pdfResult = await generateOrderPDF(order, category, template, user, req.tenantObjectId.toString(), tenantName);

            if (pdfResult.success) {
              order.pdfPreAprobacionUrl = pdfResult.pdfUrl;
              await order.save();
            } else {
              console.error("PDF generation failed:", pdfResult.error);
            }
          }
        } catch (pdfError) {
          console.error("Error in PDF generation process:", pdfError);
        }
      }
    }

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
    }).populate("categoryId");

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

    const category = order.categoryId as any;
    const requiresSignature = category?.requiresSignature || false;

    if (requiresSignature) {
      order.signatureStatus = "sent";
      order.signatureSentAt = new Date();
    }

    await order.save();

    const categoryName = category?.name || order.category;
    const subcategoryText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
    const orderDisplayName = `${categoryName}${subcategoryText}`;

    const orderNumber = order.orderNumber || "N/A";

    if (requiresSignature) {
      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: order.userId,
        type: "order",
        title: "Documento enviado para firma",
        message: `Tu pedido "${orderDisplayName}" N°: ${getPlainOrderNumber(orderNumber)} ha sido aprobado. Revisá tu casilla de email para firmar el documento.`,
        linkUrl: `/orders/${order._id}`,
      });
    } else {
      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: order.userId,
        type: "order",
        title: "Pedido aprobado",
        message: `Tu pedido "${orderDisplayName}" N°: ${getPlainOrderNumber(orderNumber)} ha sido aprobado correctamente`,
        linkUrl: `/orders/${order._id}`,
      });
    }

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

    const categoryName = order.categoryId ? (await OrderConfig.findById(order.categoryId))?.name || order.category : order.category;
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

router.post("/orders/:id/regenerate-pdf", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const adminId = req.user!.userId;

    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    })
      .populate("userId")
      .populate("categoryId");

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const category = order.categoryId as any;

    if (!category || !category.pdfId) {
      res.status(400).json({ error: "Este tipo de pedido no tiene plantilla PDF asignada" });
      return;
    }

    const template = await Pdf.findOne({
      _id: category.pdfId,
      tenantId: req.tenantObjectId,
      isActive: true,
    });

    if (!template) {
      res.status(404).json({ error: "Plantilla PDF no encontrada o inactiva" });
      return;
    }

    const user = order.userId as any;
    const tenant = await Tenant.findById(req.tenantObjectId);
    const tenantName = tenant?.name || tenant?.slug || "Organización";

    const pdfResult = await generateOrderPDF(order, category, template, user, req.tenantObjectId.toString(), tenantName);

    if (!pdfResult.success) {
      res.status(500).json({ error: `Error al generar PDF: ${pdfResult.error}` });
      return;
    }

    if (order.pdfPreAprobacionUrl) {
      const { deletePdfFromStorage } = await import("../utils/pdfStorage.js");
      await deletePdfFromStorage(order.pdfPreAprobacionUrl);
    }

    order.pdfPreAprobacionUrl = pdfResult.pdfUrl;
    await order.save();

    const categoryName = category?.name || order.category;
    const subcategoryText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
    const orderDisplayName = `${categoryName}${subcategoryText}`;

    res.json({
      success: true,
      message: "PDF regenerado exitosamente",
      pdfUrl: pdfResult.pdfUrl,
    });
  } catch (error) {
    console.error("Regenerate PDF error:", error);
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

    const categoryName = order.categoryId ? (await OrderConfig.findById(order.categoryId))?.name || order.category : order.category;
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

    const event = new Calendar({
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

    const event = await Calendar.findOneAndUpdate(
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
      { new: true },
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
    const event = await Calendar.findOneAndDelete({
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

    // Create a generic order for this document
    const order = new Order({
      tenantId: req.tenantObjectId,
      userId: new Types.ObjectId(data.userId),
      category: "documento",
      description: data.description || data.title,
      status: "delivered",
      requestedAt: new Date(),
      deliveredAt: new Date(),
      documents: [
        {
          type: data.type,
          title: data.title,
          filePath: data.filePath,
          fileUrl: data.fileUrl,
          uploadedAt: new Date(),
        },
      ],
    });

    await order.save();

    if (data.isVisibleToEmployee) {
      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: new Types.ObjectId(data.userId),
        type: "document",
        title: "New Document Available",
        message: `A new document "${data.title}" has been added to your profile.`,
        linkUrl: `/orders/${order._id}`,
      });
    }

    res.status(201).json(order.documents[0]);
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
    // Find the order that contains this document
    const order = await Order.findOne({
      tenantId: req.tenantObjectId,
      "documents._id": req.params.id,
    });

    if (!order) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    order.documents = order.documents.filter((d: any) => d._id.toString() !== req.params.id);
    await order.save();

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Delete document error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as hrAdminRoutes };
