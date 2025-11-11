import { Router } from "express";
import { z } from "zod";
import { Order } from "../models/Order.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.use(requireTenant, authenticateToken);

const createOrderSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().default("other"),
  amount: z.number().min(0).optional(),
});

const updateOrderSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: z.string().optional(),
  amount: z.number().min(0).optional(),
});

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const orders = await Order.find({
      tenantId: req.tenantObjectId,
      userId,
    })
      .sort({ requestedAt: -1 })
      .populate("approvedBy", "firstName lastName email");

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
    }).populate("approvedBy", "firstName lastName email");

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

router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = createOrderSchema.parse(req.body);

    const order = new Order({
      tenantId: req.tenantObjectId,
      userId,
      ...data,
      status: "pending",
      requestedAt: new Date(),
    });

    await order.save();

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "order_created",
      description: `Created order: ${order.title}`,
      entityType: "Order",
      entityId: order._id,
    });

    res.status(201).json(order);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = updateOrderSchema.parse(req.body);

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
      res.status(400).json({ error: "Only pending orders can be updated" });
      return;
    }

    Object.assign(order, data);
    await order.save();

    res.json(order);
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

    await Order.findByIdAndDelete(order._id);

    res.json({ message: "Order deleted successfully" });
  } catch (error) {
    console.error("Delete order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as orderRoutes };
