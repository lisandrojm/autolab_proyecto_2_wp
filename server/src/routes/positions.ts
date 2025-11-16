import { Router } from "express";
import { z } from "zod";
import { Position } from "../models/Position.js";
import { User } from "../models/User.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdOrNull } from "../utils/mongoIds.js";

const router = Router();

const createPositionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

const updatePositionSchema = createPositionSchema.partial();

// GET /positions/count - Contar posiciones
router.get("/count",
  requireTenant,
  authenticateToken,
  requirePermission('users:view'),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const tenantId = toObjectIdOrNull(req.tenantObjectId);
      if (!tenantId) {
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }

      const count = await Position.countDocuments({ tenantId });
      res.json({ count });
    } catch (error) {
      console.error("Count positions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /positions - Listar posiciones
router.get("/",
  requireTenant,
  authenticateToken,
  requirePermission('users:view'),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const { page = 1, limit = 100, name } = req.query;

      const tenantId = toObjectIdOrNull(req.tenantObjectId);
      if (!tenantId) {
        console.warn("[positions GET] Invalid tenantId:", req.tenantObjectId);
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }

      const filter: any = { tenantId };

      if (name) {
        filter.name = { $regex: name, $options: 'i' };
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [positions, total] = await Promise.all([
        Position.find(filter)
          .sort({ name: 1 })
          .skip(skip)
          .limit(Number(limit)),
        Position.countDocuments(filter)
      ]);

      res.json({
        positions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      console.error("Get positions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /positions - Crear posición
router.post("/",
  requireTenant,
  authenticateToken,
  requirePermission('users:view'),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const data = createPositionSchema.parse(req.body);

      // Verificar que no existe una posición con el mismo nombre en el tenant
      const existingPosition = await Position.findOne({
        name: data.name,
        tenantId: req.tenantObjectId
      });

      if (existingPosition) {
        res.status(409).json({ error: "Ya existe un cargo con este nombre en esta organización" });
        return;
      }

      const position = new Position({
        ...data,
        tenantId: req.tenantObjectId
      });

      await position.save();
      res.status(201).json(position);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Datos inválidos", details: error.errors });
        return;
      }

      // Manejar error de duplicado de MongoDB
      if ((error as any).code === 11000) {
        res.status(409).json({ error: "Ya existe un cargo con este nombre en esta organización" });
        return;
      }

      console.error("Create position error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /positions/:id - Obtener posición específica
router.get("/:id",
  requireTenant,
  authenticateToken,
  requirePermission('users:view'),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const positionId = toObjectIdOrNull(req.params.id);
      const tenantId = toObjectIdOrNull(req.tenantObjectId);

      if (!positionId) {
        console.warn("[positions GET :id] Invalid positionId:", req.params.id);
        res.status(400).json({ error: "Invalid position ID" });
        return;
      }

      if (!tenantId) {
        console.warn("[positions GET :id] Invalid tenantId:", req.tenantObjectId);
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }

      const position = await Position.findOne({
        _id: positionId,
        tenantId
      });

      if (!position) {
        res.status(404).json({ error: "Cargo no encontrado" });
        return;
      }

      res.json(position);
    } catch (error) {
      console.error("Get position error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PATCH /positions/:id - Actualizar posición
router.patch("/:id",
  requireTenant,
  authenticateToken,
  requirePermission('users:view'),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const data = updatePositionSchema.parse(req.body);

      const positionId = toObjectIdOrNull(req.params.id);
      if (!positionId) {
        res.status(400).json({ error: "Invalid position ID" });
        return;
      }

      // Si se está cambiando el nombre, verificar unicidad
      if (data.name) {
        const existingPosition = await Position.findOne({
          name: data.name,
          tenantId: req.tenantObjectId,
          _id: { $ne: positionId }
        });

        if (existingPosition) {
          res.status(409).json({ error: "Ya existe un cargo con este nombre en esta organización" });
          return;
        }
      }

      const position = await Position.findOneAndUpdate(
        { _id: positionId, tenantId: req.tenantObjectId },
        data,
        { new: true, runValidators: true }
      );

      if (!position) {
        res.status(404).json({ error: "Cargo no encontrado" });
        return;
      }

      res.json(position);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Datos inválidos", details: error.errors });
        return;
      }

      // Manejar error de duplicado de MongoDB
      if ((error as any).code === 11000) {
        res.status(409).json({ error: "Ya existe un cargo con este nombre en esta organización" });
        return;
      }

      console.error("Update position error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /positions/:id - Eliminar posición
router.delete("/:id",
  requireTenant,
  authenticateToken,
  requirePermission('users:view'),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const positionId = toObjectIdOrNull(req.params.id);
      if (!positionId) {
        res.status(400).json({ error: "Invalid position ID" });
        return;
      }

      // Verificar si la posición está asignada a usuarios
      const usersWithPosition = await User.countDocuments({
        positionId: positionId,
        tenantId: req.tenantObjectId
      });

      if (usersWithPosition > 0) {
        res.status(409).json({
          error: `No se puede eliminar este cargo porque está asignado a ${usersWithPosition} usuario(s)`,
          usersCount: usersWithPosition
        });
        return;
      }

      const position = await Position.findOneAndDelete({
        _id: positionId,
        tenantId: req.tenantObjectId
      });

      if (!position) {
        res.status(404).json({ error: "Cargo no encontrado" });
        return;
      }

      res.json({ message: "Cargo eliminado correctamente" });
    } catch (error) {
      console.error("Delete position error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export { router as positionRoutes };
