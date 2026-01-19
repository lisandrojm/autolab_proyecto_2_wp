import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { VacationConfig } from "../models/VacationConfig.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

// Esquema de validación para crear/editar
const vacationOverlapSchema = z.object({
  areaId: z.string().min(1, "El área es obligatoria"),
  maxSimultaneousUsers: z.number().min(1, "Debe ser al menos 1 usuario"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

// GET / - Listar todas las reglas del tenant (embedded in VacationConfig)
router.get("/", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const config = await VacationConfig.findOne({ tenantId: req.tenantObjectId });

    if (!config) {
      return res.json([]);
    }

    // Populate area names manually
    const Area = mongoose.model("Area");
    const overlaps = await Promise.all(
      config.overlaps.map(async (overlap) => {
        const area = await Area.findById(overlap.areaId).select("name");
        return {
          _id: overlap._id,
          areaId: area ? { _id: overlap.areaId, name: area.name } : { _id: overlap.areaId, name: "Desconocida" },
          maxSimultaneousUsers: overlap.maxSimultaneousUsers,
          description: overlap.description,
          isActive: overlap.isActive,
        };
      }),
    );

    res.json(overlaps);
  } catch (error) {
    console.error("Error fetching vacation overlaps:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST / - Crear nueva regla (add to embedded array)
router.post("/", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = vacationOverlapSchema.parse(req.body);

    let config = await VacationConfig.findOne({ tenantId: req.tenantObjectId });

    if (!config) {
      config = await VacationConfig.create({
        tenantId: req.tenantObjectId,
        permiteArrastre: false,
        permiteFraccionadas: true,
        requiereFirma: true,
        overlaps: [],
      });
    }

    // Verificar si ya existe regla para esta área
    const existing = config.overlaps.find((o) => o.areaId.toString() === data.areaId);
    if (existing) {
      return res.status(409).json({ error: "Ya existe una regla de solapamiento para esta área." });
    }

    // Add new overlap
    const newOverlap = {
      _id: new mongoose.Types.ObjectId(),
      areaId: new mongoose.Types.ObjectId(data.areaId),
      maxSimultaneousUsers: data.maxSimultaneousUsers,
      description: data.description,
      isActive: data.isActive,
    };

    config.overlaps.push(newOverlap);
    await config.save();

    // Populate area name for response
    const Area = mongoose.model("Area");
    const area = await Area.findById(data.areaId).select("name");

    res.status(201).json({
      _id: newOverlap._id,
      areaId: area ? { _id: data.areaId, name: area.name } : { _id: data.areaId, name: "Desconocida" },
      maxSimultaneousUsers: newOverlap.maxSimultaneousUsers,
      description: newOverlap.description,
      isActive: newOverlap.isActive,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", details: error.errors });
    }
    console.error("Error creating vacation overlap:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /:id - Editar regla (update in embedded array)
router.put("/:id", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { id } = req.params;
    const data = vacationOverlapSchema.partial().parse(req.body);

    const config = await VacationConfig.findOne({ tenantId: req.tenantObjectId });

    if (!config) {
      return res.status(404).json({ error: "Configuración no encontrada" });
    }

    const overlapIndex = config.overlaps.findIndex((o) => o._id?.toString() === id);
    if (overlapIndex === -1) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    // Verificar si existe otra regla para la misma área
    if (data.areaId) {
      const existingOther = config.overlaps.find((o, i) => i !== overlapIndex && o.areaId.toString() === data.areaId);
      if (existingOther) {
        return res.status(409).json({ error: "Ya existe una regla de solapamiento para esta área." });
      }
    }

    // Update overlap fields
    if (data.areaId) config.overlaps[overlapIndex].areaId = new mongoose.Types.ObjectId(data.areaId);
    if (data.maxSimultaneousUsers !== undefined) config.overlaps[overlapIndex].maxSimultaneousUsers = data.maxSimultaneousUsers;
    if (data.description !== undefined) config.overlaps[overlapIndex].description = data.description;
    if (data.isActive !== undefined) config.overlaps[overlapIndex].isActive = data.isActive;

    await config.save();

    // Populate area name for response
    const Area = mongoose.model("Area");
    const overlap = config.overlaps[overlapIndex];
    const area = await Area.findById(overlap.areaId).select("name");

    res.json({
      _id: overlap._id,
      areaId: area ? { _id: overlap.areaId, name: area.name } : { _id: overlap.areaId, name: "Desconocida" },
      maxSimultaneousUsers: overlap.maxSimultaneousUsers,
      description: overlap.description,
      isActive: overlap.isActive,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", details: error.errors });
    }
    console.error("Error updating vacation overlap:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /:id - Eliminar regla (remove from embedded array)
router.delete("/:id", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { id } = req.params;

    const config = await VacationConfig.findOne({ tenantId: req.tenantObjectId });

    if (!config) {
      return res.status(404).json({ error: "Configuración no encontrada" });
    }

    const overlapIndex = config.overlaps.findIndex((o) => o._id?.toString() === id);
    if (overlapIndex === -1) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    config.overlaps.splice(overlapIndex, 1);
    await config.save();

    res.json({ message: "Regla eliminada correctamente" });
  } catch (error) {
    console.error("Error deleting vacation overlap:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export const vacationOverlapRoutes = router;
