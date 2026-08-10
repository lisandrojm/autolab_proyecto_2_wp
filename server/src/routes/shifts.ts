import { Router } from "express";
import { z } from "zod";
import { Shift } from "../models/Shift.js";
import { User } from "../models/User.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdOrNull } from "../utils/mongoIds.js";
import { createFuzzySearchRegex } from "../utils/searchHelpers.js";

const router = Router();

const createShiftSchema = z.object({
  name: z.string().min(1).max(100),
  days: z.array(z.number().min(0).max(6)),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora de entrada inválido (HH:mm)"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora de salida inválido (HH:mm)"),
  description: z.string().optional(),
  order: z.number().optional(),
});

const updateShiftSchema = createShiftSchema.partial();

// GET /shifts/count - Contar turnos
// Lectura abierta a cualquier usuario autenticado del tenant (igual que el resto de los catálogos
// de referencia): mobile la necesita para coordinadores sin admin_users:view. Solo crear/editar/
// eliminar/reordenar sigue exigiendo el permiso admin.
router.get("/count", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
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

    const count = await Shift.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    console.error("Count shifts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /shifts - Listar turnos (lectura abierta, ver nota en /count)
router.get("/", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 100, name } = req.query;
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
      filter.name = createFuzzySearchRegex(name as string);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [shifts, total] = await Promise.all([
      Shift.find(filter).sort({ order: 1, name: 1 }).skip(skip).limit(Number(limit)),
      Shift.countDocuments(filter),
    ]);

    res.json({
      shifts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get shifts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /shifts - Crear turno
router.post("/", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createShiftSchema.parse(req.body);

    const existingShift = await Shift.findOne({
      name: data.name,
      tenantId: req.tenantObjectId,
    });

    if (existingShift) {
      res.status(409).json({ error: "Ya existe un turno con este nombre en esta organización" });
      return;
    }

    let newOrder = data.order;
    if (newOrder === undefined) {
      const lastItem = await Shift.findOne({ tenantId: req.tenantObjectId }).sort({ order: -1 });
      newOrder = (lastItem?.order || 0) + 1;
    }

    const shift = new Shift({
      ...data,
      order: newOrder,
      tenantId: req.tenantObjectId,
    });

    await shift.save();
    res.status(201).json(shift);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }

    if ((error as any).code === 11000) {
      res.status(409).json({ error: "Ya existe un turno con este nombre en esta organización" });
      return;
    }

    console.error("Create shift error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /shifts/:id - Obtener turno específico (lectura abierta, ver nota en /count)
router.get("/:id", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const shiftId = toObjectIdOrNull(req.params.id);
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    const tenantId = toObjectIdOrNull(req.tenantObjectId);

    if (!shiftId) {
      res.status(400).json({ error: "Invalid shift ID" });
      return;
    }

    const query: any = { _id: shiftId };

    if (!isSuperAdmin) {
      if (!tenantId) {
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      query.tenantId = tenantId;
    }

    const shift = await Shift.findOne(query);

    if (!shift) {
      res.status(404).json({ error: "Turno no encontrado" });
      return;
    }

    res.json(shift);
  } catch (error) {
    console.error("Get shift error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /shifts/reorder - Actualizar orden
router.patch("/reorder", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Se requiere un array de items" });
    }

    const ops = items.map((item: any) => ({
      updateOne: {
        filter: { _id: item.id, tenantId: req.tenantObjectId },
        update: { $set: { order: item.order } },
      },
    }));

    await Shift.bulkWrite(ops);
    res.json({ message: "Orden actualizado correctamente" });
  } catch (error) {
    console.error("Reorder shifts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /shifts/:id - Actualizar turno
router.patch("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = updateShiftSchema.parse(req.body);

    const shiftId = toObjectIdOrNull(req.params.id);
    if (!shiftId) {
      res.status(400).json({ error: "Invalid shift ID" });
      return;
    }

    const currentShift = await Shift.findOne({ _id: shiftId, tenantId: req.tenantObjectId });
    if (!currentShift) {
      res.status(404).json({ error: "Turno no encontrado" });
      return;
    }

    if (data.name) {
      const existingShift = await Shift.findOne({
        name: data.name,
        tenantId: req.tenantObjectId,
        _id: { $ne: shiftId },
      });

      if (existingShift) {
        res.status(409).json({ error: "Ya existe un turno con este nombre en esta organización" });
        return;
      }
    }



    const shift = await Shift.findOneAndUpdate({ _id: shiftId, tenantId: req.tenantObjectId }, data, { new: true, runValidators: true });

    if (!shift) {
      res.status(404).json({ error: "Turno no encontrado" });
      return;
    }

    res.json(shift);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }

    if ((error as any).code === 11000) {
      res.status(409).json({ error: "Ya existe un turno con este nombre en esta organización" });
      return;
    }

    console.error("Update shift error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /shifts/:id - Eliminar turno
router.delete("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const shiftId = toObjectIdOrNull(req.params.id);
    if (!shiftId) {
      res.status(400).json({ error: "Invalid shift ID" });
      return;
    }

    const shift = await Shift.findOne({ _id: shiftId, tenantId: req.tenantObjectId });
    if (!shift) {
      res.status(404).json({ error: "Turno no encontrado" });
      return;
    }

    if (shift.isSystem) {
      res.status(403).json({ error: "No se puede eliminar un turno generado por el sistema" });
      return;
    }

    // Opcional: Verificar si el turno está asignado a usuarios (si agregamos shiftId al User)
    const usersWithShift = await User.countDocuments({
      turnos: shiftId,
      tenantId: req.tenantObjectId,
    });

    if (usersWithShift > 0) {
      res.status(409).json({
        error: `No se puede eliminar este turno porque está asignado a ${usersWithShift} usuario(s)`,
        usersCount: usersWithShift,
      });
      return;
    }

    await Shift.deleteOne({ _id: shiftId, tenantId: req.tenantObjectId });


    if (!shift) {
      res.status(404).json({ error: "Turno no encontrado" });
      return;
    }

    res.json({ message: "Turno eliminado correctamente" });
  } catch (error) {
    console.error("Delete shift error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as shiftRoutes };
