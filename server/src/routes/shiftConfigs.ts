import { Router } from "express";
import { z } from "zod";
import { ShiftConfig } from "../models/ShiftConfig.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdOrNull } from "../utils/mongoIds.js";

const router = Router();

const createShiftConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

const updateShiftConfigSchema = createShiftConfigSchema.partial();

// GET /shift-configs/count
router.get("/count", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    let filter: any = {};

    if (!isSuperAdmin) {
      const tenantId = toObjectIdOrNull(req.tenantObjectId);
      if (!tenantId) {
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      filter.tenantId = tenantId;
    }

    const count = await ShiftConfig.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    console.error("Count shift-configs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /shift-configs
router.get("/", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { name } = req.query;
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    let filter: any = {};

    if (!isSuperAdmin) {
      const tenantId = toObjectIdOrNull(req.tenantObjectId);
      if (!tenantId) {
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      filter.tenantId = tenantId;
    }

    if (name) {
      filter.name = { $regex: name, $options: "i" };
    }

    const shiftConfigs = await ShiftConfig.find(filter).sort({ sortOrder: 1, name: 1 });
    res.json(shiftConfigs);
  } catch (error) {
    console.error("Get shift-configs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /shift-configs
router.post("/", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createShiftConfigSchema.parse(req.body);

    const existing = await ShiftConfig.findOne({
      name: data.name,
      tenantId: req.tenantObjectId,
    });

    if (existing) {
      res.status(409).json({ error: "Ya existe un tipo de turno con este nombre" });
      return;
    }

    const shiftConfig = new ShiftConfig({
      ...data,
      tenantId: req.tenantObjectId,
    });

    await shiftConfig.save();
    res.status(201).json(shiftConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }
    console.error("Create shift-config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /shift-configs/:id
router.patch("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = updateShiftConfigSchema.parse(req.body);
    const id = toObjectIdOrNull(req.params.id);

    if (!id) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    if (data.name) {
      const existing = await ShiftConfig.findOne({
        name: data.name,
        tenantId: req.tenantObjectId,
        _id: { $ne: id },
      });

      if (existing) {
        res.status(409).json({ error: "Ya existe un tipo de turno con este nombre" });
        return;
      }
    }

    const shiftConfig = await ShiftConfig.findOneAndUpdate(
      { _id: id, tenantId: req.tenantObjectId },
      data,
      { new: true, runValidators: true }
    );

    if (!shiftConfig) {
      res.status(404).json({ error: "Tipo de turno no encontrado" });
      return;
    }

    res.json(shiftConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }
    console.error("Update shift-config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /shift-configs/:id
router.delete("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const id = toObjectIdOrNull(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const shiftConfig = await ShiftConfig.findOneAndDelete({
      _id: id,
      tenantId: req.tenantObjectId,
    });

    if (!shiftConfig) {
      res.status(404).json({ error: "Tipo de turno no encontrado" });
      return;
    }

    res.json({ message: "Tipo de turno eliminado correctamente" });
  } catch (error) {
    console.error("Delete shift-config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /shift-configs/reorder
router.post("/reorder", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const reorderData = z.array(z.object({ id: z.string(), sortOrder: z.number() })).parse(req.body);

    const updates = reorderData.map((item) =>
      ShiftConfig.updateOne(
        { _id: item.id, tenantId: req.tenantObjectId },
        { sortOrder: item.sortOrder }
      )
    );

    await Promise.all(updates);
    res.json({ message: "Orden actualizado" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }
    console.error("Reorder shift-configs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as shiftConfigRoutes };
