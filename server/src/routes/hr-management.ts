import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { z } from "zod";
import { ActivityLog } from "../models/ActivityLog.js";
import { CalendarEvent } from "../models/CalendarEvent.js";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { HRDocument } from "../models/Document.js";
import { Order } from "../models/Order.js";
import { OrderCategory } from "../models/OrderCategory.js";
import { VacationRequest } from "../models/VacationRequest.js";
import { Notification } from "../models/Notification.js";
import { Tenant } from "../models/Tenant.js";
import { PdfTemplate } from "../models/PdfTemplate.js";
import { User } from "../models/User.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { Types } from "mongoose";
import { getPlainOrderNumber } from "../utils/orderHelpers.js";
import { generatePdfFromTemplate } from "../utils/pdfGenerator.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

router.use(requireTenant, authenticateToken);

async function ensureDir(dir: string) {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch (err) {
    console.error("Error creating directory:", dir, err);
    throw err;
  }
}

const orderStorage = multer.diskStorage({
  destination: async (req: any, _file, cb) => {
    try {
      const tenantId = req.tenantId || "unknown_tenant";
      const userId = req.user?.userId || "admin";
      const dir = path.join(__dirname, "../../storage", tenantId, userId, "orders");
      await ensureDir(dir);
      cb(null, dir);
    } catch (err) {
      console.error("Error in multer destination:", err);
      cb(err as any, "");
    }
  },
  filename: (_req: any, file, cb) => {
    const ext = path.extname(file.originalname);
    const orderId = new mongoose.Types.ObjectId();
    const filename = `order_${orderId}${ext}`;
    cb(null, filename);
  },
});

const uploadOrderImage = multer({
  storage: orderStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Solo se permiten imágenes (jpeg, jpg, png, gif, webp)"));
  },
}).single("photo");

const createOrderSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().default("other"),
  categoryId: z.string().optional(),
  subcategories: z.array(z.string()).default([]),
  amount: z.number().min(0).optional(),
  photoUrl: z.string().optional(),
});

const updateOrderSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: z.string().optional(),
  amount: z.number().min(0).optional(),
  status: z.enum(["pending", "pre_approved", "approved", "rejected", "delivered", "cancelled"]).optional(),
  photoUrl: z.string().optional(),
});

router.get("/activitylogs", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 50, userId, action, entityType } = req.query;

    const filter: any = { tenantId: req.tenantObjectId };

    if (userId) filter.userId = userId;
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate("userId", "firstName lastName email").populate("entityId"), ActivityLog.countDocuments(filter)]);

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

    const [events, total] = await Promise.all([CalendarEvent.find(filter).sort({ start: -1 }).skip(skip).limit(Number(limit)).populate("userId", "firstName lastName email").populate("createdBy", "firstName lastName email"), CalendarEvent.countDocuments(filter)]);

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
      filter.$or = [{ firstName: { $regex: search, $options: "i" } }, { lastName: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [profiles, total] = await Promise.all([EmployeeProfile.find(filter).sort({ lastName: 1, firstName: 1 }).skip(skip).limit(Number(limit)).populate("userId", "email roles"), EmployeeProfile.countDocuments(filter)]);

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

    const [documents, total] = await Promise.all([HRDocument.find(filter).sort({ uploadedAt: -1 }).skip(skip).limit(Number(limit)).populate("userId", "firstName lastName email").populate("uploadedBy", "firstName lastName email"), HRDocument.countDocuments(filter)]);

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
    const { page = 1, limit = 50, status, category, userId, search } = req.query;

    const filter: any = { tenantId: req.tenantObjectId };

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (userId) filter.userId = userId;

    if (search && typeof search === "string" && search.trim() !== "") {
      filter.$or = [{ title: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }, { orderNumber: { $regex: search, $options: "i" } }];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate({ path: "userId", select: "firstName lastName email positionId", populate: { path: "positionId", select: "name" } })
        .populate("approvedBy", "firstName lastName email")
        .populate("categoryId")
        .populate("futureActionId"),
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

router.post("/orders", uploadOrderImage, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    let photoUrl: string | undefined;

    if (req.file) {
      const tenantId = req.tenantId || "unknown_tenant";
      photoUrl = `/storage/${tenantId}/${userId}/orders/${req.file.filename}`;
    }

    const data = createOrderSchema.parse({
      ...req.body,
      amount: req.body.amount ? parseFloat(req.body.amount) : undefined,
      photoUrl,
    });

    const order = new Order({
      tenantId: req.tenantObjectId,
      userId,
      ...data,
      status: "pending",
      requestedAt: new Date(),
    });

    await order.save();

    const categoryName = order.categoryId ? (await OrderCategory.findById(order.categoryId))?.name || order.category : order.category;
    const subcategoryText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
    const orderDisplayName = `${categoryName}${subcategoryText}`;

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "order_created",
      description: `Pedido creado: ${orderDisplayName}`,
      entityType: "Order",
      entityId: order._id,
    });

    const populatedOrder = await Order.findById(order._id)
      .populate({ path: "userId", select: "firstName lastName email positionId", populate: { path: "positionId", select: "name" } })
      .populate("approvedBy", "firstName lastName email")
      .populate("categoryId")
      .populate("futureActionId");

    res.status(201).json(populatedOrder);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/orders/:id", uploadOrderImage, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const isOwner = order.userId.toString() === userId;
    const isAdmin = userRole === "admin" || userRole === "superadmin";

    if (req.body.status && !isOwner && !isAdmin) {
      res.status(403).json({ error: "No tienes permisos para modificar este pedido" });
      return;
    }

    if (req.body.status === "cancelled" && order.status !== "pending" && !isAdmin) {
      res.status(400).json({ error: "Solo puedes cancelar pedidos en estado pendiente" });
      return;
    }

    if (req.body.status && req.body.status !== "cancelled" && isOwner && !isAdmin) {
      res.status(403).json({ error: "Solo puedes cancelar tus propios pedidos. Otros cambios de estado están restringidos" });
      return;
    }

    let photoUrl: string | undefined = order.photoUrl;

    if (req.file) {
      if (order.photoUrl) {
        const oldPath = path.join(__dirname, "../../", order.photoUrl);
        try {
          await fs.promises.unlink(oldPath);
        } catch (err) {
          console.error("Error deleting old photo:", err);
        }
      }
      const tenantId = req.tenantId || "unknown_tenant";
      photoUrl = `/storage/${tenantId}/${userId}/orders/${req.file.filename}`;
    }

    const data = updateOrderSchema.parse({
      ...req.body,
      amount: req.body.amount ? parseFloat(req.body.amount) : undefined,
      photoUrl,
    });

    Object.assign(order, data);
    await order.save();

    if (req.body.status === "cancelled") {
      const categoryName = order.categoryId ? (await OrderCategory.findById(order.categoryId))?.name || order.category : order.category;
      const subcategoryText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
      const orderDisplayName = `${categoryName}${subcategoryText}`;

      await ActivityLog.create({
        tenantId: req.tenantObjectId,
        userId,
        action: "order_cancelled",
        description: `Pedido cancelado: ${orderDisplayName}`,
        entityType: "Order",
        entityId: order._id,
      });
    }

    const populatedOrder = await Order.findById(order._id)
      .populate({ path: "userId", select: "firstName lastName email positionId", populate: { path: "positionId", select: "name" } })
      .populate("approvedBy", "firstName lastName email")
      .populate("categoryId")
      .populate("futureActionId");

    res.json(populatedOrder);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/orders/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.photoUrl) {
      const photoPath = path.join(__dirname, "../../", order.photoUrl);
      try {
        await fs.promises.unlink(photoPath);
      } catch (err) {
        console.error("Error deleting photo:", err);
      }
    }

    await Order.findByIdAndDelete(order._id);

    res.json({ message: "Order deleted successfully" });
  } catch (error) {
    console.error("Delete order error:", error);
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

    const [vacations, total] = await Promise.all([VacationRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate("userId", "firstName lastName email").populate("approvedBy", "firstName lastName email"), VacationRequest.countDocuments(filter)]);

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

    const categoryObj = order.categoryId ? await OrderCategory.findById(order.categoryId) : null;
    const categoryName = categoryObj?.name || order.category;
    const subcategoryText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
    const orderDisplayName = `${categoryName}${subcategoryText}`;

    let templateCode: string | null = null;

    if (categoryObj) {
      if (categoryObj.categoryType === "dinero") {
        templateCode = "dinero";
      } else if (categoryObj.categoryType === "fecha") {
        if (categoryObj.dateMode === "range") {
          templateCode = "fechaRango";
        } else {
          templateCode = "fechaUnica";
        }
      }
    }

    if (templateCode) {
      try {
        const template = await PdfTemplate.findOne({
          tenantId: req.tenantObjectId,
          code: templateCode,
          isActive: true,
        });

        if (template) {
          const tenant = await Tenant.findById(req.tenantObjectId);
          const userDoc = await User.findById(order.userId);

          const formatDate = (dateStr: string | Date | undefined) => {
            if (!dateStr) return "";
            const date = new Date(dateStr);
            return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
          };

          const variables = {
            categoria: categoryName,
            subcategoria: order.subcategories?.join(", ") || "",
            monto: order.amount ? order.amount.toLocaleString("es-AR") : "",
            fechaDesde: order.dynamicValue?.fechaDesde ? formatDate(order.dynamicValue.fechaDesde) : "",
            fechaHasta: order.dynamicValue?.fechaHasta ? formatDate(order.dynamicValue.fechaHasta) : "",
            fechaUnica: order.dynamicValue?.fechaUnica ? formatDate(order.dynamicValue.fechaUnica) : "",
            dias: order.dynamicValue?.dias || "",
            nombreUsuario: userDoc ? `${userDoc.firstName} ${userDoc.lastName}` : "",
            numeroOrden: getPlainOrderNumber(order.orderNumber),
          };

          const storagePath = path.join(__dirname, "../../storage");
          const pdfFileName = `preaprobacion_${order._id}.pdf`;
          const tenantIdStr = String(req.tenantObjectId);
          const pdfRelativePath = `/${tenantIdStr}/${order.userId}/orders/${order._id}/${pdfFileName}`;
          const pdfFullPath = path.join(storagePath, pdfRelativePath);

          const tenantInfo = {
            razonSocial: tenant?.company?.legalName || tenant?.name || "Empresa",
            cuit: tenant?.company?.taxId,
            ciudad: tenant?.company?.address?.city || "Ciudad Autónoma de Buenos Aires",
            logoPath: tenant?.company?.logoUrl ? path.join(storagePath, tenant.company.logoUrl) : undefined,
            firmaRRHHPath: tenant?.company?.firmaRRHHUrl ? path.join(storagePath, tenant.company.firmaRRHHUrl) : undefined,
          };

          await generatePdfFromTemplate({
            templateContent: template.content,
            variables,
            outputPath: pdfFullPath,
            tenantInfo,
          });

          order.pdfPreAprobacionUrl = `/storage${pdfRelativePath}`;
          await order.save();

          console.log(`PDF generated successfully for order ${order._id}: ${order.pdfPreAprobacionUrl}`);
        }
      } catch (pdfError) {
        console.error("Error generating PDF for order:", pdfError);
      }
    }

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId: order.userId,
      action: "order_pre_approved",
      description: `Pedido "${orderDisplayName}" preaprobado`,
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
    }).populate('categoryId');

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

    const notificationMessage = requiresSignature ? `Tu pedido "${orderDisplayName}" N°: ${getPlainOrderNumber(orderNumber)} ha sido aprobado. Revisá tu casilla de email para firmar el documento.` : `Tu pedido "${orderDisplayName}" ha sido aprobado.`;

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: order.userId,
      type: "order",
      title: requiresSignature ? "Documento enviado para firma" : "Pedido Aprobado",
      message: notificationMessage,
      linkUrl: `/orders/${order._id}`,
    });

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId: order.userId,
      action: "order_approved",
      description: `Pedido "${orderDisplayName}" aprobado`,
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
      res.status(400).json({ error: "Only approved orders can be delivered" });
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
      title: "Pedido Entregado",
      message: `Tu pedido "${orderDisplayName}" ha sido entregado.`,
      linkUrl: `/orders/${order._id}`,
    });

    res.json(order);
  } catch (error) {
    console.error("Deliver order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/orders/:id/send-signature", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    }).populate('categoryId');

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.status !== "approved") {
      res.status(400).json({ error: "Only approved orders can be sent for signature" });
      return;
    }

    const category = order.categoryId as any;
    if (!category?.requiresSignature) {
      res.status(400).json({ error: "This order does not require signature" });
      return;
    }

    order.signatureStatus = "sent";
    order.signatureSentAt = new Date();

    await order.save();

    const categoryName = category?.name || order.category;
    const subcategoryText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
    const orderDisplayName = `${categoryName}${subcategoryText}`;

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: order.userId,
      type: "order",
      title: "Documento enviado para firma",
      message: `El documento de tu pedido "${orderDisplayName}" ha sido enviado para firma.`,
      linkUrl: `/orders/${order._id}`,
    });

    res.json(order);
  } catch (error) {
    console.error("Send signature error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/orders/:id/mark-signed", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const signedById = req.user!.userId;

    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    }).populate('categoryId');

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const category = order.categoryId as any;
    if (!category?.requiresSignature) {
      res.status(400).json({ error: "This order does not require signature" });
      return;
    }

    if (order.signatureStatus !== "sent") {
      res.status(400).json({ error: "Only orders with sent signature can be marked as signed" });
      return;
    }

    order.signatureStatus = "signed";
    order.signedAt = new Date();
    order.signedBy = new Types.ObjectId(signedById);

    await order.save();

    const categoryName = order.categoryId ? (await OrderCategory.findById(order.categoryId))?.name || order.category : order.category;
    const subcategoryText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
    const orderDisplayName = `${categoryName}${subcategoryText}`;

    await Notification.create({
      tenantId: req.tenantObjectId,
      userId: order.userId,
      type: "order",
      title: "Firma confirmada",
      message: `Tu firma del pedido ${orderDisplayName} N°: ${getPlainOrderNumber(order.orderNumber)} ha sido verificada y confirmada.`,
      linkUrl: `/orders/${order._id}`,
    });

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId: order.userId,
      action: "order_signed",
      description: `Order "${orderDisplayName}" marked as signed`,
      entityType: "Order",
      entityId: order._id,
    });

    res.json(order);
  } catch (error) {
    console.error("Mark signed error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as hrManagementRoutes };
