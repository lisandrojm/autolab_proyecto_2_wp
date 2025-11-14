import { Router } from "express";
import { z } from "zod";
import { OrderCategory } from "../models/OrderCategory.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.use(requireTenant, authenticateToken);

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { isActive } = req.query;

    const filter: any = { tenantId: req.tenantObjectId };
    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const categories = await OrderCategory.find(filter).sort({ sortOrder: 1, name: 1 });

    res.json(categories);
  } catch (error) {
    console.error("Get order categories error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const category = await OrderCategory.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    res.json(category);
  } catch (error) {
    console.error("Get order category error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = createCategorySchema.parse(req.body);

    const existingCategory = await OrderCategory.findOne({
      tenantId: req.tenantObjectId,
      name: data.name,
    });

    if (existingCategory) {
      res.status(400).json({ error: "Ya existe una categoría con ese nombre" });
      return;
    }

    const category = new OrderCategory({
      tenantId: req.tenantObjectId,
      ...data,
    });

    await category.save();

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "order_category_created",
      description: `Created order category: ${category.name}`,
      entityType: "OrderCategory",
      entityId: category._id,
    });

    res.status(201).json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create order category error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const data = updateCategorySchema.parse(req.body);

    const category = await OrderCategory.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    if (data.name && data.name !== category.name) {
      const existingCategory = await OrderCategory.findOne({
        tenantId: req.tenantObjectId,
        name: data.name,
        _id: { $ne: category._id },
      });

      if (existingCategory) {
        res.status(400).json({ error: "Ya existe una categoría con ese nombre" });
        return;
      }
    }

    Object.assign(category, data);
    await category.save();

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "order_category_updated",
      description: `Updated order category: ${category.name}`,
      entityType: "OrderCategory",
      entityId: category._id,
    });

    res.json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update order category error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const category = await OrderCategory.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    await OrderCategory.findByIdAndDelete(category._id);

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "order_category_deleted",
      description: `Deleted order category: ${category.name}`,
      entityType: "OrderCategory",
      entityId: category._id,
    });

    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Delete order category error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as orderCategoryRoutes };
