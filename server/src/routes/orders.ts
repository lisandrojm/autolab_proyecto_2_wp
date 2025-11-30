import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Order } from "../models/Order.js";
import { OrderCategory } from "../models/OrderCategory.js";
import { FutureAction } from "../models/FutureAction.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

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
      const userId = req.user?.userId || "unknown_user";
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

const documentStorage = multer.diskStorage({
  destination: async (req: any, _file, cb) => {
    try {
      const tenantId = req.tenantId || "unknown_tenant";
      const userId = req.user?.userId || "unknown_user";
      const dir = path.join(__dirname, "../../storage", tenantId, userId, "documents");
      await ensureDir(dir);
      cb(null, dir);
    } catch (err) {
      console.error("Error in multer destination:", err);
      cb(err as any, "");
    }
  },
  filename: (_req: any, file, cb) => {
    const ext = path.extname(file.originalname);
    const docId = new mongoose.Types.ObjectId();
    const filename = `document_${docId}${ext}`;
    cb(null, filename);
  },
});

const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /jpeg|jpg|png|pdf|application\/pdf/i.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Solo se permiten imágenes (jpeg, jpg, png) y archivos PDF"));
  },
}).single("document");

const createOrderSchema = z.object({
  description: z.string().default(""),
  category: z.string().default("other"),
  categoryId: z.string().optional(),
  subcategories: z.array(z.string()).default([]),
  actionCompleted: z.boolean().optional(),
  dynamicValue: z.any().optional(),
  amount: z.number().min(0).optional(),
  photoUrl: z.string().optional(),
  documentoUrl: z.string().optional(),
  futureActionPlazoDias: z.number().min(1).max(365).optional(),
  futureActionFechaLimite: z.string().optional(),
  futureActionDocumento: z.string().optional(),
});

const updateOrderSchema = z.object({
  description: z.string().min(1).optional(),
  category: z.string().optional(),
  amount: z.number().min(0).optional(),
  status: z.enum(["pending", "approved", "rejected", "delivered", "cancelled"]).optional(),
  photoUrl: z.string().optional(),
});

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const orders = await Order.find({
      tenantId: req.tenantObjectId,
      userId,
    })
      .sort({ requestedAt: -1 })
      .populate({ path: "userId", select: "firstName lastName email positionId", populate: { path: "positionId", select: "name" } })
      .populate("approvedBy", "firstName lastName email")
      .populate("categoryId")
      .populate("futureActionId");

    res.json(orders);
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const orders = await Order.find({
      tenantId: req.tenantObjectId,
      userId,
    }).populate("futureActionId");

    const stats = orders.reduce(
      (acc: any, order: any) => {
        acc[order.status] = (acc[order.status] || 0) + 1;

        if (order.futureActionId &&
            typeof order.futureActionId === 'object' &&
            order.futureActionId.tipoAccionFutura === "documento" &&
            order.futureActionId.estadoAccion === "pendiente_documento") {
          acc.pendingDocuments = (acc.pendingDocuments || 0) + 1;
        }

        return acc;
      },
      { pending: 0, approved: 0, rejected: 0, delivered: 0, cancelled: 0, pendingDocuments: 0 }
    );

    res.json(stats);
  } catch (error) {
    console.error("Get order stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
    })
      .populate({ path: "userId", select: "firstName lastName email positionId", populate: { path: "positionId", select: "name" } })
      .populate("approvedBy", "firstName lastName email")
      .populate("categoryId")
      .populate("futureActionId");

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    res.json(order);
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", uploadOrderImage, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    let photoUrl: string | undefined;
    let documentoUrl: string | undefined;

    if (req.file) {
      const tenantId = req.tenantId || "unknown_tenant";
      const fieldName = req.file.fieldname;

      if (fieldName === "photo") {
        photoUrl = `/storage/${tenantId}/${userId}/orders/${req.file.filename}`;
      } else if (fieldName === "document") {
        documentoUrl = `/storage/${tenantId}/${userId}/documents/${req.file.filename}`;
      }
    }

    let parsedDynamicValue = req.body.dynamicValue;
    if (typeof parsedDynamicValue === "string") {
      try {
        parsedDynamicValue = JSON.parse(parsedDynamicValue);
      } catch (e) {
        console.error("Error parsing dynamicValue:", e);
      }
    }

    let parsedSubcategories = req.body.subcategories || [];
    if (typeof parsedSubcategories === "string") {
      try {
        parsedSubcategories = JSON.parse(parsedSubcategories);
      } catch (e) {
        console.error("Error parsing subcategories:", e);
        parsedSubcategories = [];
      }
    }

    const data = createOrderSchema.parse({
      ...req.body,
      amount: req.body.amount ? parseFloat(req.body.amount) : undefined,
      actionCompleted: req.body.actionCompleted === "true" || req.body.actionCompleted === true,
      futureActionPlazoDias: req.body.futureActionPlazoDias ? parseInt(req.body.futureActionPlazoDias) : undefined,
      dynamicValue: parsedDynamicValue,
      subcategories: parsedSubcategories,
      photoUrl,
      documentoUrl,
    });

    if (data.categoryId) {
      const category = await OrderCategory.findOne({
        _id: data.categoryId,
        tenantId: req.tenantObjectId,
        isActive: true,
      });

      if (!category) {
        res.status(400).json({ error: "Invalid or inactive category" });
        return;
      }

      if (data.subcategories && data.subcategories.length > 0 && category.config?.subtipos) {
        const validSubtypes = category.config.subtipos.map((st: any) => st.id);
        const invalidSubs = data.subcategories.filter(sub => !validSubtypes.includes(sub));

        if (invalidSubs.length > 0) {
          res.status(400).json({ error: `Invalid subcategories: ${invalidSubs.join(", ")}` });
          return;
        }
      }

      if (category.categoryType === "fecha" && category.dateMode === "range") {
        const actionType = category.futureActionType || "sinVencimiento";

        if (actionType !== "sinVencimiento") {
          if (!data.dynamicValue || !data.dynamicValue.fechaDesde || !data.dynamicValue.fechaHasta) {
            res.status(400).json({ error: "Date range categories require both 'fechaDesde' and 'fechaHasta'" });
            return;
          }

          const fechaDesde = new Date(data.dynamicValue.fechaDesde);
          const fechaHasta = new Date(data.dynamicValue.fechaHasta);

          if (fechaDesde > fechaHasta) {
            res.status(400).json({ error: "The 'fechaHasta' must be greater than or equal to 'fechaDesde'" });
            return;
          }
        }
      }

      if (category.categoryType === "dinero" && category.montoMaximo) {
        const montoSolicitado = data.amount || 0;
        if (montoSolicitado > category.montoMaximo) {
          res.status(400).json({ error: `El monto solicitado ($${montoSolicitado.toLocaleString('es-ES')}) excede el máximo permitido ($${category.montoMaximo.toLocaleString('es-ES')})` });
          return;
        }
      }
    }

    let orderData: any = {
      tenantId: req.tenantObjectId,
      userId,
      ...data,
      subcategories: data.subcategories || [],
      status: "pending",
      requestedAt: new Date(),
    };

    if (data.categoryId) {
      const category = await OrderCategory.findById(data.categoryId);
      if (category?.requiresSignature) {
        orderData.requiresSignature = true;
        orderData.signatureStatus = "pending";
      }
    }

    const order = new Order(orderData);

    await order.save();

    if (data.categoryId) {
      const category = await OrderCategory.findById(data.categoryId);

      const shouldCreateFutureAction = category?.requiresAction &&
        (!category.requiresUserConfirmation || data.actionCompleted);

      if (shouldCreateFutureAction) {
        // Default to "sinVencimiento" if futureActionType is not set
        const actionType = category.futureActionType || "sinVencimiento";

        const futureActionData: any = {
          tenantId: req.tenantObjectId,
          orderId: order._id,
          requiereAccionFutura: true,
          tipoAccionFutura: actionType,
          descripcionAccion: category.actionText || "Acción requerida por categoría",
          responsableAccion: "usuario",
          estadoAccion: "pendiente",
          fechaCreacionAccion: new Date(),
        };

        switch (actionType) {
          case "documento":
            if (category.documentoRequerido) {
              futureActionData.documentoRequerido = category.documentoRequerido;
            }
            if (data.futureActionDocumento) {
              futureActionData.documentoRequerido = data.futureActionDocumento;
            }
            if (documentoUrl) {
              futureActionData.documentoUrl = documentoUrl;
              futureActionData.estadoAccion = "documento_presentado";
            } else {
              futureActionData.estadoAccion = "pendiente_documento";
            }
            if (category.deadlineMode === "plazoDias" && category.plazoDias) {
              futureActionData.plazoDias = category.plazoDias;
              futureActionData.deadlineMode = "plazoDias";
            } else if (category.deadlineMode === "fechaEspecifica" && category.fechaLimite) {
              futureActionData.fechaLimite = new Date(category.fechaLimite);
              futureActionData.deadlineMode = "fechaEspecifica";
            } else if (data.futureActionPlazoDias) {
              futureActionData.plazoDias = data.futureActionPlazoDias;
              futureActionData.deadlineMode = "plazoDias";
            } else if (data.futureActionFechaLimite) {
              futureActionData.fechaLimite = new Date(data.futureActionFechaLimite);
              futureActionData.deadlineMode = "fechaEspecifica";
            }
            break;

          case "otra":
            if (category.tituloAccion) {
              futureActionData.descripcionAccion = category.tituloAccion;
            }
            if (category.deadlineMode === "plazoDias" && category.plazoDias) {
              futureActionData.plazoDias = category.plazoDias;
              futureActionData.deadlineMode = "plazoDias";
            } else if (category.deadlineMode === "fechaEspecifica" && category.fechaLimite) {
              futureActionData.fechaLimite = new Date(category.fechaLimite);
              futureActionData.deadlineMode = "fechaEspecifica";
            } else if (data.futureActionPlazoDias) {
              futureActionData.plazoDias = data.futureActionPlazoDias;
              futureActionData.deadlineMode = "plazoDias";
            } else if (data.futureActionFechaLimite) {
              futureActionData.fechaLimite = new Date(data.futureActionFechaLimite);
              futureActionData.deadlineMode = "fechaEspecifica";
            } else {
              futureActionData.deadlineMode = "none";
            }
            break;
        }

        const futureAction = await FutureAction.create(futureActionData);
        order.futureActionId = futureAction._id;
        await order.save();
      }
    }

    const categoryDoc = data.categoryId ? await OrderCategory.findById(data.categoryId) : null;
    const categoryName = categoryDoc?.name || data.category;

    let subcategoryText = "";
    if (data.subcategories && data.subcategories.length > 0 && categoryDoc?.config?.subtipos) {
      const subcategoryLabels = data.subcategories.map((subId) => {
        const subtipo = categoryDoc.config.subtipos?.find((s) => s.id === subId);
        return subtipo?.label || subId;
      });
      subcategoryText = ` - ${subcategoryLabels.join(", ")}`;
    } else if (data.subcategories && data.subcategories.length > 0) {
      subcategoryText = ` - ${data.subcategories.join(", ")}`;
    }

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

router.put("/:id", uploadOrderImage, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (req.body.status === "cancelled" && order.status !== "pending") {
      res.status(400).json({ error: "Solo puedes cancelar pedidos en estado pendiente" });
      return;
    }

    if (req.body.status && req.body.status !== "cancelled") {
      res.status(403).json({ error: "Solo puedes cancelar tus propios pedidos. Otros cambios de estado están restringidos" });
      return;
    }

    if (order.status !== "pending" && !req.body.status) {
      res.status(400).json({ error: "Only pending orders can be updated" });
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

router.patch("/:id/upload-document", uploadDocument, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No document file provided" });
      return;
    }

    const tenantId = req.tenantId || "unknown_tenant";
    const documentoUrl = `/storage/${tenantId}/${userId}/documents/${req.file.filename}`;

    order.documentoUrl = documentoUrl;
    await order.save();

    if (order.futureActionId) {
      const futureAction = await FutureAction.findById(order.futureActionId);
      if (futureAction && futureAction.tipoAccionFutura === "documento") {
        futureAction.documentoUrl = documentoUrl;
        futureAction.estadoAccion = "documento_presentado";
        await futureAction.save();
      }
    }

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "document_uploaded",
      description: `Documento subido para pedido ${order.orderNumber}`,
      entityType: "Order",
      entityId: order._id,
    });

    const populatedOrder = await Order.findById(order._id)
      .populate({ path: "userId", select: "firstName lastName email positionId", populate: { path: "positionId", select: "name" } })
      .populate("approvedBy", "firstName lastName email")
      .populate("categoryId")
      .populate("futureActionId");

    res.json(populatedOrder);
  } catch (error) {
    console.error("Upload document error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/notify-signature-completed", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
    })
      .populate({ path: "userId", select: "firstName lastName email" })
      .populate("categoryId");

    if (!order) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }

    if (!order.requiresSignature) {
      res.status(400).json({ error: "Este pedido no requiere firma" });
      return;
    }

    if (order.signatureStatus !== "sent") {
      res.status(400).json({ error: "Solo se puede notificar cuando el estado es 'Firma Enviada'" });
      return;
    }

    if (order.signatureNotifiedAt) {
      console.log(`Order ${order.orderNumber} already notified at:`, order.signatureNotifiedAt);
      res.status(400).json({ error: "Ya notificaste que completaste la firma" });
      return;
    }

    console.log(`Setting signatureNotifiedAt for order ${order.orderNumber}`);
    order.signatureNotifiedAt = new Date();
    await order.save();
    console.log(`Saved order with signatureNotifiedAt:`, order.signatureNotifiedAt);

    const userInfo = order.userId as any;
    const categoryInfo = order.categoryId as any;
    const userName = userInfo ? `${userInfo.firstName} ${userInfo.lastName}` : "Usuario";
    const categoryName = categoryInfo?.name || order.category || "pedido";
    const subcategoriesText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
    const orderDisplayName = `${categoryName}${subcategoriesText}`;

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId: order.userId,
      action: "user_notified_signature",
      description: `Usuario notificó que completó la firma del pedido "${orderDisplayName}"`,
      entityType: "Order",
      entityId: order._id,
    });

    const supervisors = await User.find({
      tenantId: req.tenantObjectId,
      roles: { $in: ["admin", "manager", "superadmin"] },
    });

    for (const supervisor of supervisors) {
      await Notification.create({
        tenantId: req.tenantObjectId,
        userId: supervisor._id,
        type: "order_signature_notification",
        title: "Usuario indica firma completada",
        message: `El usuario ${userName} indica que completó la firma del documento del pedido ${orderDisplayName} N°: ${order.orderNumber}. Por favor verificá antes de confirmar.`,
        linkUrl: `/hr-management/orders`,
      });
    }

    res.json({ success: true, message: "Notificación enviada al supervisor correctamente" });
  } catch (error) {
    console.error("Notify signature error:", error);
    res.status(500).json({ error: "Error al enviar la notificación" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const order = await Order.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.status !== "pending") {
      res.status(400).json({ error: "Only pending orders can be deleted" });
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

export { router as orderRoutes };
