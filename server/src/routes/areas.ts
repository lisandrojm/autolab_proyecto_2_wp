import { Router } from "express";
import { z } from "zod";
import { Area } from "../models/Area.js";
import { User } from "../models/User.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdOrNull } from "../utils/mongoIds.js";

const router = Router();

const createAreaSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  vacationConfig: z
    .object({
      useGlobalConfig: z.boolean(),
      permiteFraccionadas: z.boolean(),
      minDiasFraccion: z.number().min(1).nullable().optional(),
      diasCorridos: z.boolean().optional(),
    })
    .optional(),
});

const updateAreaSchema = createAreaSchema.partial();

// GET /areas/count - Contar areas
router.get("/count", requireTenant, authenticateToken, requirePermission("admin_areas:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
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

    const count = await Area.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    console.error("Count areas error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /areas - Listar areas
router.get("/", requireTenant, authenticateToken, requirePermission("admin_areas:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 100, name } = req.query;
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    let filter: any = {};

    if (!isSuperAdmin) {
      const tenantId = toObjectIdOrNull(req.tenantObjectId);
      if (!tenantId) {
        /* console.warn("[areas GET] Invalid tenantId:", req.tenantObjectId); */
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      filter.tenantId = tenantId;
    }

    if (name) {
      filter.name = { $regex: name, $options: "i" };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [areas, total] = await Promise.all([Area.find(filter).populate("tenantId", "name slug").sort({ name: 1 }).skip(skip).limit(Number(limit)), Area.countDocuments(filter)]);

    res.json({
      areas,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get areas error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /areas - Crear area
router.post("/", requireTenant, authenticateToken, requirePermission("admin_areas:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createAreaSchema.parse(req.body);

    // Verificar que no existe un area con el mismo nombre en el tenant
    const existingArea = await Area.findOne({
      name: data.name,
      tenantId: req.tenantObjectId,
    });

    if (existingArea) {
      res.status(409).json({ error: "Ya existe un área con este nombre en esta organización" });
      return;
    }

    const area = new Area({
      ...data,
      tenantId: req.tenantObjectId,
    });

    await area.save();
    res.status(201).json(area);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }

    // Manejar error de duplicado de MongoDB
    if ((error as any).code === 11000) {
      res.status(409).json({ error: "Ya existe un área con este nombre en esta organización" });
      return;
    }

    console.error("Create area error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /areas/:id - Obtener area específica
router.get("/:id", requireTenant, authenticateToken, requirePermission("admin_areas:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const areaId = toObjectIdOrNull(req.params.id);
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    const tenantId = toObjectIdOrNull(req.tenantObjectId);

    if (!areaId) {
      /* console.warn("[areas GET :id] Invalid areaId:", req.params.id); */
      res.status(400).json({ error: "Invalid area ID" });
      return;
    }

    const query: any = { _id: areaId };

    if (!isSuperAdmin) {
      if (!tenantId) {
        /* console.warn("[areas GET :id] Invalid tenantId:", req.tenantObjectId); */
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      query.tenantId = tenantId;
    }

    const area = await Area.findOne(query);

    if (!area) {
      res.status(404).json({ error: "Área no encontrada" });
      return;
    }

    res.json(area);
  } catch (error) {
    console.error("Get area error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /areas/:id - Actualizar area
router.patch("/:id", requireTenant, authenticateToken, requirePermission("admin_areas:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = updateAreaSchema.parse(req.body);

    const areaId = toObjectIdOrNull(req.params.id);
    if (!areaId) {
      res.status(400).json({ error: "Invalid area ID" });
      return;
    }

    // Si se está cambiando el nombre, verificar unicidad
    if (data.name) {
      const existingArea = await Area.findOne({
        name: data.name,
        tenantId: req.tenantObjectId,
        _id: { $ne: areaId },
      });

      if (existingArea) {
        res.status(409).json({ error: "Ya existe un área con este nombre en esta organización" });
        return;
      }
    }

    const area = await Area.findOneAndUpdate({ _id: areaId, tenantId: req.tenantObjectId }, data, { new: true, runValidators: true });

    if (!area) {
      res.status(404).json({ error: "Área no encontrada" });
      return;
    }

    res.json(area);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }

    // Manejar error de duplicado de MongoDB
    if ((error as any).code === 11000) {
      res.status(409).json({ error: "Ya existe un área con este nombre en esta organización" });
      return;
    }

    console.error("Update area error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /areas/:id - Eliminar area
router.delete("/:id", requireTenant, authenticateToken, requirePermission("admin_areas:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const areaId = toObjectIdOrNull(req.params.id);
    if (!areaId) {
      res.status(400).json({ error: "Invalid area ID" });
      return;
    }

    // Verificar si el area está asignada a usuarios
    const usersWithArea = await User.countDocuments({
      areaId: areaId,
      tenantId: req.tenantObjectId,
    });

    if (usersWithArea > 0) {
      res.status(409).json({
        error: `No se puede eliminar esta área porque está asignada a ${usersWithArea} usuario(s)`,
        usersCount: usersWithArea,
      });
      return;
    }

    const areaToDelete = await Area.findOne({ _id: areaId, tenantId: req.tenantObjectId });
    if (!areaToDelete) {
      res.status(404).json({ error: "Área no encontrada" });
      return;
    }

    if (areaToDelete.isSystem) {
      res.status(403).json({ error: "No se puede eliminar un área de sistema" });
      return;
    }

    const area = await Area.findOneAndDelete({
      _id: areaId,
      tenantId: req.tenantObjectId,
    });


    if (!area) {
      res.status(404).json({ error: "Área no encontrada" });
      return;
    }

    res.json({ message: "Área eliminada correctamente" });
  } catch (error) {
    console.error("Delete area error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as areaRoutes };
