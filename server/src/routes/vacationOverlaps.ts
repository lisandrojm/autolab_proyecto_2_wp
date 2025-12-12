import { Router } from "express";
import { z } from "zod";
import { VacationOverlap } from "../models/VacationOverlap.js";
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

// GET / - Listar todas las reglas del tenant
router.get("/", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const overlaps = await VacationOverlap.find({ tenantId: req.tenantObjectId }).populate("areaId", "name").sort({ createdAt: -1 });

    res.json(overlaps);
  } catch (error) {
    console.error("Error fetching vacation overlaps:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST / - Crear nueva regla
router.post("/", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = vacationOverlapSchema.parse(req.body);

    // Verificar si ya existe regla para esta área
    const existing = await VacationOverlap.findOne({
      tenantId: req.tenantObjectId,
      areaId: data.areaId,
    });

    if (existing) {
      return res.status(409).json({ error: "Ya existe una regla de solapamiento para esta área." });
    }

    const overlap = new VacationOverlap({
      ...data,
      tenantId: req.tenantObjectId,
    });

    await overlap.save();

    // Populate para devolver el objeto completo
    await overlap.populate("areaId", "name");

    res.status(201).json(overlap);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", details: error.errors });
    }
    console.error("Error creating vacation overlap:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /:id - Editar regla
router.put("/:id", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { id } = req.params;
    const data = vacationOverlapSchema.partial().parse(req.body);

    // Verificar si existe otra regla para la misma área (excluyendo la actual)
    // Solo si se está actualizando el areaId
    if (data.areaId) {
      const existing = await VacationOverlap.findOne({
        tenantId: req.tenantObjectId,
        areaId: data.areaId,
        _id: { $ne: id },
      });

      if (existing) {
        return res.status(409).json({ error: "Ya existe una regla de solapamiento para esta área." });
      }
    }

    const overlap = await VacationOverlap.findOneAndUpdate({ _id: id, tenantId: req.tenantObjectId }, data, { new: true, runValidators: true }).populate("areaId", "name");

    if (!overlap) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    res.json(overlap);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", details: error.errors });
    }
    console.error("Error updating vacation overlap:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /:id - Eliminar regla
router.delete("/:id", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { id } = req.params;
    const overlap = await VacationOverlap.findOneAndDelete({
      _id: id,
      tenantId: req.tenantObjectId,
    });

    if (!overlap) {
      return res.status(404).json({ error: "Regla no encontrada" });
    }

    res.json({ message: "Regla eliminada correctamente" });
  } catch (error) {
    console.error("Error deleting vacation overlap:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export const vacationOverlapRoutes = router;
