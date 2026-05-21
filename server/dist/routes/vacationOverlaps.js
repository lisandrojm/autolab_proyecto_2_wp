import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { VacationConfig } from "../models/VacationConfig.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
const router = Router();
const baseOverlapSchema = z.object({
    areaId: z.string().optional(),
    positionId: z.string().optional(),
    levelId: z.string().optional(),
    projectId: z.string().optional(),
    clientId: z.string().optional(),
    roleFrameId: z.string().optional(),
    maxSimultaneousUsers: z.number().min(1, "Debe ser al menos 1 usuario"),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
    useActiveContractSchedule: z.boolean().default(false),
});
const vacationOverlapSchema = baseOverlapSchema;
const populateOverlap = async (overlap) => {
    const result = {
        _id: overlap._id,
        maxSimultaneousUsers: overlap.maxSimultaneousUsers,
        description: overlap.description,
        isActive: overlap.isActive,
        useActiveContractSchedule: overlap.useActiveContractSchedule || false,
    };
    if (overlap.clientId) {
        try {
            const Client = mongoose.model("Client");
            const doc = await Client.findById(overlap.clientId).select("name");
            result.clientId = doc ? { _id: overlap.clientId, name: doc.name } : { _id: overlap.clientId, name: "Desconocido" };
        }
        catch (e) {
            result.clientId = { _id: overlap.clientId, name: "Error" };
        }
    }
    if (overlap.areaId) {
        try {
            const Area = mongoose.model("Area");
            const doc = await Area.findById(overlap.areaId).select("name");
            result.areaId = doc ? { _id: overlap.areaId, name: doc.name } : { _id: overlap.areaId, name: "Desconocido" };
        }
        catch (e) {
            result.areaId = { _id: overlap.areaId, name: "Error" };
        }
    }
    if (overlap.positionId) {
        try {
            const Position = mongoose.model("Position");
            const doc = await Position.findById(overlap.positionId).select("name");
            result.positionId = doc ? { _id: overlap.positionId, name: doc.name } : { _id: overlap.positionId, name: "Desconocido" };
        }
        catch (e) { }
    }
    if (overlap.levelId) {
        try {
            const Level = mongoose.model("Level");
            const doc = await Level.findById(overlap.levelId).select("name");
            result.levelId = doc ? { _id: overlap.levelId, name: doc.name } : { _id: overlap.levelId, name: "Desconocido" };
        }
        catch (e) { }
    }
    if (overlap.projectId) {
        try {
            const Project = mongoose.model("Project");
            const doc = await Project.findById(overlap.projectId).select("name");
            result.projectId = doc ? { _id: overlap.projectId, name: doc.name } : { _id: overlap.projectId, name: "Desconocido" };
        }
        catch (e) { }
    }
    if (overlap.roleFrameId) {
        try {
            const RoleFrame = mongoose.model("RoleFrame");
            const doc = await RoleFrame.findById(overlap.roleFrameId).select("name");
            result.roleFrameId = doc ? { _id: overlap.roleFrameId, name: doc.name } : { _id: overlap.roleFrameId, name: "Desconocido" };
        }
        catch (e) { }
    }
    return result;
};
// GET / - Listar todas las reglas del tenant (embedded in VacationConfig)
router.get("/", requireTenant, authenticateToken, async (req, res) => {
    try {
        const config = await VacationConfig.findOne({ tenantId: req.tenantObjectId });
        if (!config) {
            return res.json([]);
        }
        const overlaps = await Promise.all(config.overlaps.map((overlap) => populateOverlap(overlap)));
        res.json(overlaps);
    }
    catch (error) {
        console.error("Error fetching vacation overlaps:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST / - Crear nueva regla (add to embedded array)
router.post("/", requireTenant, authenticateToken, async (req, res) => {
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
        // Verificar duplicate exact match
        const existing = config.overlaps.find((o) => {
            const sameArea = String(o.areaId || "") === String(data.areaId || "");
            const samePos = String(o.positionId || "") === String(data.positionId || "");
            const sameLevel = String(o.levelId || "") === String(data.levelId || "");
            const sameProj = String(o.projectId || "") === String(data.projectId || "");
            const sameRole = String(o.roleFrameId || "") === String(data.roleFrameId || "");
            return sameArea && samePos && sameLevel && sameProj && sameRole;
        });
        if (existing) {
            return res.status(409).json({ error: "Ya existe una regla idéntica con estos criterios." });
        }
        // Add new overlap
        const newOverlap = {
            _id: new mongoose.Types.ObjectId(),
            maxSimultaneousUsers: data.maxSimultaneousUsers,
            description: data.description,
            isActive: data.isActive,
            useActiveContractSchedule: data.useActiveContractSchedule || false,
        };
        if (data.clientId)
            newOverlap.clientId = new mongoose.Types.ObjectId(data.clientId);
        if (data.areaId)
            newOverlap.areaId = new mongoose.Types.ObjectId(data.areaId);
        if (data.positionId)
            newOverlap.positionId = new mongoose.Types.ObjectId(data.positionId);
        if (data.levelId)
            newOverlap.levelId = new mongoose.Types.ObjectId(data.levelId);
        if (data.projectId)
            newOverlap.projectId = new mongoose.Types.ObjectId(data.projectId);
        if (data.roleFrameId)
            newOverlap.roleFrameId = new mongoose.Types.ObjectId(data.roleFrameId);
        config.overlaps.push(newOverlap);
        await config.save();
        const response = await populateOverlap(newOverlap);
        res.status(201).json(response);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Datos inválidos", details: error.errors });
        }
        console.error("Error creating vacation overlap:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /:id - Editar regla (update in embedded array)
router.put("/:id", requireTenant, authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        // We use baseOverlapSchema.partial() because ZodEffects doesn't support .partial()
        // Validation of "at least one" must be done manually or via full object reconstruction if necessary
        // Here we assume partial updates are valid as long as individual fields are valid
        const data = baseOverlapSchema.partial().parse(req.body);
        const config = await VacationConfig.findOne({ tenantId: req.tenantObjectId });
        if (!config) {
            return res.status(404).json({ error: "Configuración no encontrada" });
        }
        const overlapIndex = config.overlaps.findIndex((o) => o._id?.toString() === id);
        if (overlapIndex === -1) {
            return res.status(404).json({ error: "Regla no encontrada" });
        }
        const current = config.overlaps[overlapIndex];
        // Check duplicate if criteria changed
        // Construct potential new state to check duplicate
        const nextArea = data.areaId !== undefined ? data.areaId : current.areaId?.toString();
        const nextPos = data.positionId !== undefined ? data.positionId : current.positionId?.toString();
        const nextLevel = data.levelId !== undefined ? data.levelId : current.levelId?.toString();
        const nextProj = data.projectId !== undefined ? data.projectId : current.projectId?.toString();
        const nextRole = data.roleFrameId !== undefined ? data.roleFrameId : current.roleFrameId?.toString();
        const existingOther = config.overlaps.find((o, i) => {
            if (i === overlapIndex)
                return false;
            const sameArea = String(o.areaId || "") === String(nextArea || "");
            const samePos = String(o.positionId || "") === String(nextPos || "");
            const sameLevel = String(o.levelId || "") === String(nextLevel || "");
            const sameProj = String(o.projectId || "") === String(nextProj || "");
            const sameRole = String(o.roleFrameId || "") === String(nextRole || "");
            return sameArea && samePos && sameLevel && sameProj && sameRole;
        });
        if (existingOther) {
            return res.status(409).json({ error: "Ya existe otra regla idéntica con estos criterios." });
        }
        // Update overlap fields
        if (data.clientId !== undefined)
            config.overlaps[overlapIndex].clientId = data.clientId ? new mongoose.Types.ObjectId(data.clientId) : undefined;
        if (data.areaId !== undefined)
            config.overlaps[overlapIndex].areaId = data.areaId ? new mongoose.Types.ObjectId(data.areaId) : undefined;
        if (data.positionId !== undefined)
            config.overlaps[overlapIndex].positionId = data.positionId ? new mongoose.Types.ObjectId(data.positionId) : undefined;
        if (data.levelId !== undefined)
            config.overlaps[overlapIndex].levelId = data.levelId ? new mongoose.Types.ObjectId(data.levelId) : undefined;
        if (data.projectId !== undefined)
            config.overlaps[overlapIndex].projectId = data.projectId ? new mongoose.Types.ObjectId(data.projectId) : undefined;
        if (data.roleFrameId !== undefined)
            config.overlaps[overlapIndex].roleFrameId = data.roleFrameId ? new mongoose.Types.ObjectId(data.roleFrameId) : undefined;
        if (data.maxSimultaneousUsers !== undefined)
            config.overlaps[overlapIndex].maxSimultaneousUsers = data.maxSimultaneousUsers;
        if (data.description !== undefined)
            config.overlaps[overlapIndex].description = data.description;
        if (data.isActive !== undefined)
            config.overlaps[overlapIndex].isActive = data.isActive;
        if (data.useActiveContractSchedule !== undefined)
            config.overlaps[overlapIndex].useActiveContractSchedule = data.useActiveContractSchedule;
        await config.save();
        const response = await populateOverlap(config.overlaps[overlapIndex]);
        res.json(response);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Datos inválidos", details: error.errors });
        }
        console.error("Error updating vacation overlap:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /:id - Eliminar regla (remove from embedded array)
router.delete("/:id", requireTenant, authenticateToken, async (req, res) => {
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
    }
    catch (error) {
        console.error("Error deleting vacation overlap:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export const vacationOverlapRoutes = router;
