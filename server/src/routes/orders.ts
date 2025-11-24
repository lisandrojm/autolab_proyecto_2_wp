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

const createOrderSchema = z.object({
  description: z.string().min(1),
  category: z.string().default("other"),
  categoryId: z.string().optional(),
  subcategories: z.array(z.string()).default([]),
  actionCompleted: z.boolean().optional(),
  dynamicValue: z.any().optional(),
  amount: z.number().min(0).optional(),
  photoUrl: z.string().optional(),
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
      .populate("categoryId");

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
    });

    const stats = orders.reduce(
      (acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      },
      { pending: 0, approved: 0, rejected: 0, delivered: 0, cancelled: 0 }
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
      .populate("approvedBy", "firstName lastName email");

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

    if (req.file) {
      const tenantId = req.tenantId || "unknown_tenant";
      photoUrl = `/storage/${tenantId}/${userId}/orders/${req.file.filename}`;
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
        const montoSolicitado = typeof data.dynamicValue === 'number' ? data.dynamicValue : 0;
        if (montoSolicitado > category.montoMaximo) {
          res.status(400).json({ error: `El monto solicitado ($${montoSolicitado.toLocaleString('es-ES')}) excede el máximo permitido ($${category.montoMaximo.toLocaleString('es-ES')})` });
          return;
        }
      }

      // Sincronizar dynamicValue a amount para categorías de dinero
      if (category.categoryType === "dinero" && typeof data.dynamicValue === 'number') {
        data.amount = data.dynamicValue;
      }
    }

    const order = new Order({
      tenantId: req.tenantObjectId,
      userId,
      ...data,
      subcategories: data.subcategories || [],
      status: "pending",
      requestedAt: new Date(),
    });

    await order.save();

    if (data.categoryId) {
      const category = await OrderCategory.findById(data.categoryId);

      if (category?.requiresAction && data.actionCompleted) {
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
          case "plazoDias":
            if (data.futureActionPlazoDias) {
              futureActionData.plazoDias = data.futureActionPlazoDias;
            }
            break;

          case "fechaEspecifica":
            if (data.futureActionFechaLimite) {
              futureActionData.fechaLimite = new Date(data.futureActionFechaLimite);
            }
            break;

          case "presentacionDocumento":
            if (data.futureActionDocumento) {
              futureActionData.documentoRequerido = data.futureActionDocumento;
            }
            if (data.futureActionFechaLimite) {
              futureActionData.fechaLimite = new Date(data.futureActionFechaLimite);
            }
            break;

          case "vencimientoSistema":
            if (data.futureActionPlazoDias) {
              futureActionData.plazoDias = data.futureActionPlazoDias;
              futureActionData.quienDefineVencimiento = "sistema";
            }
            break;

          case "vencimientoInterno":
            futureActionData.quienDefineVencimiento = "area_interna";
            futureActionData.estadoAccion = "en_revision";
            break;

          case "sinVencimiento":
            break;
        }

        await FutureAction.create(futureActionData);
      }
    }

    const categoryName = data.categoryId ? (await OrderCategory.findById(data.categoryId))?.name || data.category : data.category;
    const subcategoryText = data.subcategories && data.subcategories.length > 0 ? ` - ${data.subcategories.join(", ")}` : "";
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
      .populate("approvedBy", "firstName lastName email");

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
      .populate("approvedBy", "firstName lastName email");

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
