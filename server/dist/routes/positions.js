import { Router } from "express";
import { z } from "zod";
import { Position } from "../models/Position.js";
import { User } from "../models/User.js";
import { Level } from "../models/Level.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdOrNull } from "../utils/mongoIds.js";
import { createFuzzySearchRegex } from "../utils/searchHelpers.js";
const router = Router();
const createPositionSchema = z.object({
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
const updatePositionSchema = createPositionSchema.partial();
// GET /positions/count - Contar posiciones
router.get("/count", requireTenant, authenticateToken, requirePermission("admin_positions:view"), async (req, res) => {
    try {
        const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
        let filter = {};
        if (!isSuperAdmin) {
            const tenantId = toObjectIdOrNull(req.tenantObjectId);
            if (!tenantId) {
                res.status(400).json({ error: "Invalid tenant ID" });
                return;
            }
            filter.tenantId = tenantId;
        }
        const count = await Position.countDocuments(filter);
        res.json({ count });
    }
    catch (error) {
        console.error("Count positions error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /positions - Listar posiciones
router.get("/", requireTenant, authenticateToken, requirePermission("admin_positions:view"), async (req, res) => {
    try {
        const { page = 1, limit = 100, name } = req.query;
        const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
        let filter = {};
        if (!isSuperAdmin) {
            const tenantId = toObjectIdOrNull(req.tenantObjectId);
            if (!tenantId) {
                console.warn("[positions GET] Invalid tenantId:", req.tenantObjectId);
                res.status(400).json({ error: "Invalid tenant ID" });
                return;
            }
            filter.tenantId = tenantId;
        }
        if (name) {
            filter.name = { $regex: createFuzzySearchRegex(String(name)), $options: "i" };
        }
        const skip = (Number(page) - 1) * Number(limit);
        const [positions, total] = await Promise.all([Position.find(filter).populate("tenantId", "name slug").sort({ name: 1 }).skip(skip).limit(Number(limit)), Position.countDocuments(filter)]);
        const positionsWithLevels = await Promise.all(positions.map(async (position) => {
            // Use position's tenantId for level filtering to ensure correctness
            const targetTenantId = position.tenantId; // Might be different if listing all tenants
            let levelFilter = {
                $or: [{ type: "general" }, { type: "position-specific", positionId: position._id }],
            };
            // If we are superadmin viewing all, we should still filter levels by the position's tenant
            // Assuming levels belong to same tenant as position.
            // If position has tenantId, we use it. If not (system?), maybe general levels?
            if (targetTenantId) {
                levelFilter.tenantId = targetTenantId;
            }
            let specificLevelFilter = {
                type: "position-specific",
                positionId: position._id,
            };
            if (targetTenantId) {
                specificLevelFilter.tenantId = targetTenantId;
            }
            const [levels, levelCount, specificLevelCount] = await Promise.all([Level.find(levelFilter).select("name description type").sort({ name: 1 }).limit(5), Level.countDocuments(levelFilter), Level.countDocuments(specificLevelFilter)]);
            return {
                ...position.toObject(),
                levelCount,
                specificLevelCount,
                levels,
            };
        }));
        res.json({
            positions: positionsWithLevels,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit)),
            },
        });
    }
    catch (error) {
        console.error("Get positions error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /positions - Crear posición
router.post("/", requireTenant, authenticateToken, requirePermission("admin_positions:view"), async (req, res) => {
    try {
        const data = createPositionSchema.parse(req.body);
        // Verificar que no existe una posición con el mismo nombre en el tenant
        const existingPosition = await Position.findOne({
            name: data.name,
            tenantId: req.tenantObjectId,
        });
        if (existingPosition) {
            res.status(409).json({ error: "Ya existe un cargo con este nombre en esta organización" });
            return;
        }
        const position = new Position({
            ...data,
            tenantId: req.tenantObjectId,
        });
        await position.save();
        res.status(201).json(position);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Datos inválidos", details: error.errors });
            return;
        }
        // Manejar error de duplicado de MongoDB
        if (error.code === 11000) {
            res.status(409).json({ error: "Ya existe un cargo con este nombre en esta organización" });
            return;
        }
        console.error("Create position error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /positions/:id - Obtener posición específica
router.get("/:id", requireTenant, authenticateToken, requirePermission("admin_positions:view"), async (req, res) => {
    try {
        const positionId = toObjectIdOrNull(req.params.id);
        const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
        const tenantId = toObjectIdOrNull(req.tenantObjectId);
        if (!positionId) {
            console.warn("[positions GET :id] Invalid positionId:", req.params.id);
            res.status(400).json({ error: "Invalid position ID" });
            return;
        }
        const query = { _id: positionId };
        if (!isSuperAdmin) {
            if (!tenantId) {
                console.warn("[positions GET :id] Invalid tenantId:", req.tenantObjectId);
                res.status(400).json({ error: "Invalid tenant ID" });
                return;
            }
            query.tenantId = tenantId;
        }
        const position = await Position.findOne(query);
        if (!position) {
            res.status(404).json({ error: "Cargo no encontrado" });
            return;
        }
        // For levels, we should query using the position's tenantId if available
        const targetTenantId = position.tenantId || (isSuperAdmin ? undefined : tenantId);
        let levelQuery = {
            $or: [{ type: "general" }, { type: "position-specific", positionId: position._id }],
        };
        if (targetTenantId) {
            levelQuery.tenantId = targetTenantId;
        }
        const levels = await Level.find(levelQuery).sort({ name: 1 });
        const levelCount = levels.length;
        const specificLevelCount = levels.filter((l) => l.type === "position-specific").length;
        res.json({
            ...position.toObject(),
            levelCount,
            specificLevelCount,
            levels,
        });
    }
    catch (error) {
        console.error("Get position error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /positions/:id - Actualizar posición
router.patch("/:id", requireTenant, authenticateToken, requirePermission("admin_positions:view"), async (req, res) => {
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
                _id: { $ne: positionId },
            });
            if (existingPosition) {
                res.status(409).json({ error: "Ya existe un cargo con este nombre en esta organización" });
                return;
            }
        }
        const position = await Position.findOneAndUpdate({ _id: positionId, tenantId: req.tenantObjectId }, data, { new: true, runValidators: true });
        if (!position) {
            res.status(404).json({ error: "Cargo no encontrado" });
            return;
        }
        res.json(position);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Datos inválidos", details: error.errors });
            return;
        }
        // Manejar error de duplicado de MongoDB
        if (error.code === 11000) {
            res.status(409).json({ error: "Ya existe un cargo con este nombre en esta organización" });
            return;
        }
        console.error("Update position error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /positions/:id - Eliminar posición
router.delete("/:id", requireTenant, authenticateToken, requirePermission("admin_positions:view"), async (req, res) => {
    try {
        const positionId = toObjectIdOrNull(req.params.id);
        if (!positionId) {
            res.status(400).json({ error: "Invalid position ID" });
            return;
        }
        // Verificar si la posición está asignada a usuarios
        const usersWithPosition = await User.countDocuments({
            positionId: positionId,
            tenantId: req.tenantObjectId,
        });
        if (usersWithPosition > 0) {
            res.status(409).json({
                error: `No se puede eliminar este cargo porque está asignado a ${usersWithPosition} usuario(s)`,
                usersCount: usersWithPosition,
            });
            return;
        }
        const position = await Position.findOneAndDelete({
            _id: positionId,
            tenantId: req.tenantObjectId,
        });
        if (!position) {
            res.status(404).json({ error: "Cargo no encontrado" });
            return;
        }
        res.json({ message: "Cargo eliminado correctamente" });
    }
    catch (error) {
        console.error("Delete position error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as positionRoutes };
