import { Router } from "express";
import { z } from "zod";
import { FutureAction } from "../models/FutureAction.js";
import { Order } from "../models/Order.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import {
  createFutureActionSchema,
  updateFutureActionSchema,
  queryFutureActionsSchema,
} from "../validators/futureActionSchemas.js";

const router = Router();

router.use(requireTenant, authenticateToken);

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const query = queryFutureActionsSchema.parse(req.query);
    const userId = req.user!.userId;

    const filter: any = { tenantId: req.tenantObjectId };

    if (query.estadoAccion) {
      filter.estadoAccion = query.estadoAccion;
    }
    if (query.tipoAccionFutura) {
      filter.tipoAccionFutura = query.tipoAccionFutura;
    }
    if (query.responsableAccion) {
      filter.responsableAccion = query.responsableAccion;
    }
    if (query.orderId) {
      filter.orderId = query.orderId;
    }

    if (query.fechaDesde || query.fechaHasta) {
      filter.fechaLimite = {};
      if (query.fechaDesde) {
        filter.fechaLimite.$gte = query.fechaDesde;
      }
      if (query.fechaHasta) {
        filter.fechaLimite.$lte = query.fechaHasta;
      }
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [futureActions, total] = await Promise.all([
      FutureAction.find(filter)
        .sort({ fechaCreacionAccion: -1 })
        .skip(skip)
        .limit(limit)
        .populate("orderId", "title description category status"),
      FutureAction.countDocuments(filter),
    ]);

    res.json({
      data: futureActions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      return;
    }
    console.error("Get future actions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const stats = await FutureAction.aggregate([
      { $match: { tenantId: req.tenantObjectId } },
      {
        $group: {
          _id: "$estadoAccion",
          count: { $sum: 1 },
        },
      },
    ]);

    const statsMap = stats.reduce(
      (acc, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      { pendiente: 0, cumplida: 0, vencida: 0, en_revision: 0 }
    );

    const overdueCount = await FutureAction.countDocuments({
      tenantId: req.tenantObjectId,
      estadoAccion: "pendiente",
      fechaLimite: { $lt: new Date() },
    });

    res.json({
      ...statsMap,
      overdue: overdueCount,
    });
  } catch (error) {
    console.error("Get future actions stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const futureAction = await FutureAction.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    }).populate("orderId", "title description category status userId");

    if (!futureAction) {
      res.status(404).json({ error: "Future action not found" });
      return;
    }

    res.json(futureAction);
  } catch (error) {
    console.error("Get future action error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = createFutureActionSchema.parse(req.body);

    const order = await Order.findOne({
      _id: data.orderId,
      tenantId: req.tenantObjectId,
    });

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.futureActionId) {
      res.status(400).json({ error: "This order already has a future action assigned" });
      return;
    }

    const futureAction = new FutureAction({
      tenantId: req.tenantObjectId,
      orderId: data.orderId,
      requiereAccionFutura: true,
      tipoAccionFutura: data.tipoAccionFutura,
      descripcionAccion: data.descripcionAccion,
      responsableAccion: data.responsableAccion,
      documentoRequerido: data.documentoRequerido,
      plazoDias: data.plazoDias,
      fechaLimite: data.fechaLimite,
      quienDefineVencimiento: data.quienDefineVencimiento,
      fechaCreacionAccion: new Date(),
      estadoAccion: "pendiente",
      metadata: data.metadata,
    });

    await futureAction.save();

    order.requiereAccionFutura = true;
    order.futureActionId = futureAction._id as any;
    await order.save();

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "future_action_created",
      description: `Created future action: ${futureAction.descripcionAccion}`,
      entityType: "FutureAction",
      entityId: futureAction._id,
    });

    res.status(201).json(futureAction);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create future action error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = updateFutureActionSchema.parse(req.body);

    const futureAction = await FutureAction.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!futureAction) {
      res.status(404).json({ error: "Future action not found" });
      return;
    }

    if (data.estadoAccion === "cumplida" && !futureAction.fechaCumplimiento && !data.fechaCumplimiento) {
      data.fechaCumplimiento = new Date();
    }

    Object.assign(futureAction, data);
    await futureAction.save();

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "future_action_updated",
      description: `Updated future action: ${futureAction.descripcionAccion} (new status: ${futureAction.estadoAccion})`,
      entityType: "FutureAction",
      entityId: futureAction._id,
    });

    res.json(futureAction);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update future action error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const futureAction = await FutureAction.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!futureAction) {
      res.status(404).json({ error: "Future action not found" });
      return;
    }

    await Order.updateOne(
      { _id: futureAction.orderId },
      { $unset: { futureActionId: 1 }, $set: { requiereAccionFutura: false } }
    );

    await FutureAction.findByIdAndDelete(futureAction._id);

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "future_action_deleted",
      description: `Deleted future action: ${futureAction.descripcionAccion}`,
      entityType: "FutureAction",
      entityId: futureAction._id,
    });

    res.json({ message: "Future action deleted successfully" });
  } catch (error) {
    console.error("Delete future action error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/check-expired", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const now = new Date();

    const result = await FutureAction.updateMany(
      {
        tenantId: req.tenantObjectId,
        estadoAccion: "pendiente",
        fechaLimite: { $lt: now, $exists: true },
      },
      {
        $set: { estadoAccion: "vencida" },
      }
    );

    res.json({
      message: "Expired actions checked",
      updated: result.modifiedCount,
    });
  } catch (error) {
    console.error("Check expired actions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as futureActionsRoutes };
