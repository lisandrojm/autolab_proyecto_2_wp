import { Router } from "express";
import { z } from "zod";
import { Level } from "../models/Level.js";
import { User } from "../models/User.js";
import { Position } from "../models/Position.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdOrNull } from "../utils/mongoIds.js";

const router = Router();

const createLevelSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    type: z.enum(["general", "position-specific"]).default("general"),
    positionId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.type === "position-specific" && !data.positionId) {
        return false;
      }
      return true;
    },
    {
      message: "positionId es requerido cuando el tipo es 'position-specific'",
      path: ["positionId"],
    }
  );

const updateLevelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
});

// GET /levels/count - Contar niveles
router.get("/count", requireTenant, authenticateToken, requirePermission("admin_levels:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
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

    const count = await Level.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    console.error("Count levels error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /levels - Listar niveles
router.get("/", requireTenant, authenticateToken, requirePermission("admin_levels:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 100, name, positionId } = req.query;
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    let filter: any = {};

    if (!isSuperAdmin) {
      const tenantId = toObjectIdOrNull(req.tenantObjectId);
      if (!tenantId) {
        console.warn("[levels GET] Invalid tenantId:", req.tenantObjectId);
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      filter.tenantId = tenantId;
    }

    if (name) {
      filter.name = { $regex: name, $options: "i" };
    }

    if (positionId) {
      const posObjId = toObjectIdOrNull(positionId as string);
      if (!posObjId) {
        res.status(400).json({ error: "Invalid position ID" });
        return;
      }
      filter.$or = [{ type: "general" }, { type: "position-specific", positionId: posObjId }];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [levels, total] = await Promise.all([Level.find(filter).populate("tenantId", "name slug").populate("positionId", "name").sort({ name: 1 }).skip(skip).limit(Number(limit)), Level.countDocuments(filter)]);

    res.json({
      levels,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get levels error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /levels - Crear nivel
router.post("/", requireTenant, authenticateToken, requirePermission("admin_levels:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createLevelSchema.parse(req.body);

    if (data.positionId) {
      const posObjId = toObjectIdOrNull(data.positionId);
      if (!posObjId) {
        res.status(400).json({ error: "Invalid position ID" });
        return;
      }

      const positionExists = await Position.findOne({
        _id: posObjId,
        tenantId: req.tenantObjectId,
      });

      if (!positionExists) {
        res.status(404).json({ error: "El cargo especificado no existe" });
        return;
      }
    }

    const positionIdObj = data.positionId ? toObjectIdOrNull(data.positionId) : null;
    const existingLevel = await Level.findOne({
      name: data.name,
      tenantId: req.tenantObjectId,
      positionId: positionIdObj,
    });

    if (existingLevel) {
      res.status(409).json({ error: "Ya existe un nivel con este nombre en este contexto" });
      return;
    }

    const level = new Level({
      name: data.name,
      description: data.description,
      type: data.type,
      positionId: positionIdObj,
      tenantId: req.tenantObjectId,
    });

    await level.save();
    res.status(201).json(level);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }

    // Manejar error de duplicado de MongoDB
    if ((error as any).code === 11000) {
      res.status(409).json({ error: "Ya existe un nivel con este nombre en esta organización" });
      return;
    }

    console.error("Create level error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /levels/:id - Obtener nivel específico
router.get("/:id", requireTenant, authenticateToken, requirePermission("admin_levels:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const levelId = toObjectIdOrNull(req.params.id);
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    const tenantId = toObjectIdOrNull(req.tenantObjectId);

    if (!levelId) {
      console.warn("[levels GET :id] Invalid levelId:", req.params.id);
      res.status(400).json({ error: "Invalid level ID" });
      return;
    }

    const query: any = { _id: levelId };

    if (!isSuperAdmin) {
      if (!tenantId) {
        console.warn("[levels GET :id] Invalid tenantId:", req.tenantObjectId);
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      query.tenantId = tenantId;
    }

    const level = await Level.findOne(query).populate("positionId", "name");

    if (!level) {
      res.status(404).json({ error: "Nivel no encontrado" });
      return;
    }

    res.json(level);
  } catch (error) {
    console.error("Get level error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /levels/:id - Actualizar nivel
router.patch("/:id", requireTenant, authenticateToken, requirePermission("admin_levels:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = updateLevelSchema.parse(req.body);

    const levelId = toObjectIdOrNull(req.params.id);
    if (!levelId) {
      res.status(400).json({ error: "Invalid level ID" });
      return;
    }

    const currentLevel = await Level.findOne({
      _id: levelId,
      tenantId: req.tenantObjectId,
    });

    if (!currentLevel) {
      res.status(404).json({ error: "Nivel no encontrado" });
      return;
    }

    if (data.name) {
      const existingLevel = await Level.findOne({
        name: data.name,
        tenantId: req.tenantObjectId,
        positionId: currentLevel.positionId,
        _id: { $ne: levelId },
      });

      if (existingLevel) {
        res.status(409).json({ error: "Ya existe un nivel con este nombre en este contexto" });
        return;
      }
    }

    const level = await Level.findOneAndUpdate({ _id: levelId, tenantId: req.tenantObjectId }, data, { new: true, runValidators: true });

    if (!level) {
      res.status(404).json({ error: "Nivel no encontrado" });
      return;
    }

    res.json(level);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }

    // Manejar error de duplicado de MongoDB
    if ((error as any).code === 11000) {
      res.status(409).json({ error: "Ya existe un nivel con este nombre en esta organización" });
      return;
    }

    console.error("Update level error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /levels/:id - Eliminar nivel
router.delete("/:id", requireTenant, authenticateToken, requirePermission("admin_levels:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const levelId = toObjectIdOrNull(req.params.id);
    if (!levelId) {
      res.status(400).json({ error: "Invalid level ID" });
      return;
    }

    // Verificar si el nivel está asignado a usuarios
    const usersWithLevel = await User.countDocuments({
      levelId: levelId,
      tenantId: req.tenantObjectId,
    });

    if (usersWithLevel > 0) {
      res.status(409).json({
        error: `No se puede eliminar este nivel porque está asignado a ${usersWithLevel} usuario(s)`,
        usersCount: usersWithLevel,
      });
      return;
    }

    const level = await Level.findOneAndDelete({
      _id: levelId,
      tenantId: req.tenantObjectId,
    });

    if (!level) {
      res.status(404).json({ error: "Nivel no encontrado" });
      return;
    }

    res.json({ message: "Nivel eliminado correctamente" });
  } catch (error) {
    console.error("Delete level error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as levelRoutes };
