import { Router } from "express";
import { z } from "zod";
import { OrderCategory } from "../models/OrderCategory.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.use(requireTenant, authenticateToken);

const subtypeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    requiere_certificado: z.boolean().optional(),
  })
  .passthrough();

const configSchema = z
  .object({
    subtipos: z.array(subtypeSchema).optional(),
  })
  .passthrough();

const createCategorySchema = z
  .object({
    name: z.string().min(1).max(100),
    informacion: z.string().max(1000).optional(),
    isActive: z.boolean().default(true),
    categoryType: z.enum(["fecha", "dinero", "objeto", "otros"]).default("otros"),
    dateMode: z.enum(["single", "range"]).default("single").optional(),
    config: configSchema.optional(),
    montoMaximo: z.number().min(0).optional(),
    requiresAction: z.boolean().default(false),
    actionText: z.string().max(500).optional(),
    futureActionType: z.enum(["plazoDias", "fechaEspecifica", "presentacionDocumento", "vencimientoSistema", "vencimientoInterno", "sinVencimiento"]).default("sinVencimiento").optional(),
    plazoDias: z.number().int().min(1).max(365).optional(),
    fechaLimite: z.coerce.date().optional(),
    documentoRequerido: z.string().max(200).optional(),
  })
  .refine(
    (data) => {
      if (data.requiresAction && !data.actionText) {
        return false;
      }
      return true;
    },
    {
      message: "actionText is required when requiresAction is true",
      path: ["actionText"],
    }
  )
  .refine(
    (data) => {
      if (data.futureActionType === "plazoDias" || data.futureActionType === "vencimientoSistema") {
        return data.plazoDias !== undefined && data.plazoDias >= 1 && data.plazoDias <= 365;
      }
      return true;
    },
    {
      message: "plazoDias is required and must be between 1 and 365 for plazoDias or vencimientoSistema types",
      path: ["plazoDias"],
    }
  )
  .refine(
    (data) => {
      if (data.futureActionType === "fechaEspecifica") {
        return data.fechaLimite !== undefined;
      }
      return true;
    },
    {
      message: "fechaLimite is required for fechaEspecifica type",
      path: ["fechaLimite"],
    }
  )
  .refine(
    (data) => {
      if (data.futureActionType === "presentacionDocumento") {
        return data.documentoRequerido !== undefined && data.documentoRequerido.length > 0;
      }
      return true;
    },
    {
      message: "documentoRequerido is required for presentacionDocumento type",
      path: ["documentoRequerido"],
    }
  );

const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    informacion: z.string().max(1000).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
    categoryType: z.enum(["fecha", "dinero", "objeto", "otros"]).optional(),
    dateMode: z.enum(["single", "range"]).optional(),
    config: configSchema.optional(),
    montoMaximo: z.number().min(0).optional(),
    requiresAction: z.boolean().optional(),
    actionText: z.string().max(500).optional(),
    futureActionType: z.enum(["plazoDias", "fechaEspecifica", "presentacionDocumento", "vencimientoSistema", "vencimientoInterno", "sinVencimiento"]).optional(),
    plazoDias: z.number().int().min(1).max(365).optional(),
    fechaLimite: z.coerce.date().optional(),
    documentoRequerido: z.string().max(200).optional(),
  })
  .refine(
    (data) => {
      if (data.requiresAction && !data.actionText) {
        return false;
      }
      return true;
    },
    {
      message: "actionText is required when requiresAction is true",
      path: ["actionText"],
    }
  )
  .refine(
    (data) => {
      if (data.futureActionType === "plazoDias" || data.futureActionType === "vencimientoSistema") {
        return data.plazoDias !== undefined && data.plazoDias >= 1 && data.plazoDias <= 365;
      }
      return true;
    },
    {
      message: "plazoDias is required and must be between 1 and 365 for plazoDias or vencimientoSistema types",
      path: ["plazoDias"],
    }
  )
  .refine(
    (data) => {
      if (data.futureActionType === "fechaEspecifica") {
        return data.fechaLimite !== undefined;
      }
      return true;
    },
    {
      message: "fechaLimite is required for fechaEspecifica type",
      path: ["fechaLimite"],
    }
  )
  .refine(
    (data) => {
      if (data.futureActionType === "presentacionDocumento") {
        return data.documentoRequerido !== undefined && data.documentoRequerido.length > 0;
      }
      return true;
    },
    {
      message: "documentoRequerido is required for presentacionDocumento type",
      path: ["documentoRequerido"],
    }
  );

const reorderCategoriesSchema = z.object({
  categories: z
    .array(
      z.object({
        id: z.string(),
        sortOrder: z.number().int().min(0),
      })
    )
    .min(1),
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

router.put("/reorder", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { categories } = reorderCategoriesSchema.parse(req.body);

    const categoryIds = categories.map((c) => c.id);
    const existingCategories = await OrderCategory.find({
      _id: { $in: categoryIds },
      tenantId: req.tenantObjectId,
    });

    if (existingCategories.length !== categories.length) {
      res.status(400).json({ error: "Una o más categorías no existen o no pertenecen a este tenant" });
      return;
    }

    const updatePromises = categories.map(({ id, sortOrder }) => OrderCategory.findByIdAndUpdate(id, { sortOrder }, { new: true }));

    await Promise.all(updatePromises);

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "order_categories_reordered",
      description: `Reordered ${categories.length} order categories`,
      entityType: "OrderCategory",
    });

    res.json({ message: "Categories reordered successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Reorder categories error:", error);
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

    const maxOrderCategory = await OrderCategory.findOne({
      tenantId: req.tenantObjectId,
    })
      .sort({ sortOrder: -1 })
      .limit(1);

    const nextSortOrder = maxOrderCategory ? maxOrderCategory.sortOrder + 1 : 1;

    // If requiresAction is true but futureActionType is not provided, default to "sinVencimiento"
    const categoryData: any = {
      tenantId: req.tenantObjectId,
      ...data,
      sortOrder: nextSortOrder,
    };

    if (categoryData.requiresAction && !categoryData.futureActionType) {
      categoryData.futureActionType = "sinVencimiento";
    }

    const category = new OrderCategory(categoryData);

    await category.save();

    await ActivityLog.create({
      tenantId: req.tenantObjectId,
      userId,
      action: "order_category_created",
      description: `Pedido creado category: ${category.name}`,
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
