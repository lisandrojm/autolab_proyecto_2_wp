import { Router } from "express";
import { z } from "zod";
import { OrderConfig } from "../models/OrderConfig.js";
import { Pdf } from "../models/Pdf.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import mongoose from "mongoose";
const router = Router();
router.use(requireTenant, authenticateToken);
const subtypeSchema = z
    .object({
    id: z.string().min(1),
    label: z.string().min(1),
    requiere_certificado: z.boolean().optional(),
    maxDays: z.number().min(1).nullable().optional(),
})
    .passthrough();
const configSchema = z
    .object({
    subtipos: z.array(subtypeSchema).optional(),
    // Campos de datos personales habilitados para modificación (categoryType === "datos_personales").
    camposEditables: z.array(z.string()).optional(),
})
    .passthrough();
const createCategorySchema = z
    .object({
    name: z.string().min(1).max(100),
    informacion: z.string().max(1000).optional(),
    isActive: z.boolean().default(true),
    categoryType: z.enum(["fecha", "dinero", "objeto", "otros", "datos_personales"]).default("otros"),
    dateMode: z.enum(["single", "range"]).default("single").optional(),
    maxDays: z.number().min(1).nullable().optional(),
    config: configSchema.optional(),
    limitType: z.enum(["monto", "porcentaje"]).nullable().optional(),
    montoMaximo: z.number().min(0).nullable().optional(),
    porcentajeMaximo: z.number().min(0).max(100).nullable().optional(),
    requiresAction: z.boolean().default(false),
    actionText: z.string().max(500).optional(),
    actionDescription: z.string().max(500).optional(),
    tituloAccion: z.string().max(500).optional(),
    futureActionType: z.enum(["documento", "otra"]).optional(),
    deadlineMode: z.enum(["none", "plazoDias", "fechaEspecifica"]).optional(),
    plazoDias: z.number().int().min(1).max(365).optional(),
    fechaLimite: z.coerce.date().optional(),
    documentoRequerido: z.string().max(200).optional(),
    requiresSignature: z.boolean().default(true),
    requiresUserConfirmation: z.boolean().default(false),
    pdfId: z.string().optional(),
    pdfText: z.string().optional(),
})
    .refine((data) => {
    if (data.requiresUserConfirmation && !data.actionText) {
        return false;
    }
    return true;
}, {
    message: "actionText is required when requiresUserConfirmation is true",
    path: ["actionText"],
})
    .refine((data) => {
    if (data.deadlineMode === "plazoDias") {
        return data.plazoDias !== undefined && data.plazoDias >= 1 && data.plazoDias <= 365;
    }
    return true;
}, {
    message: "plazoDias is required and must be between 1 and 365 when deadlineMode is plazoDias",
    path: ["plazoDias"],
})
    .refine((data) => {
    if (data.deadlineMode === "fechaEspecifica") {
        return data.fechaLimite !== undefined;
    }
    return true;
}, {
    message: "fechaLimite is required when deadlineMode is fechaEspecifica",
    path: ["fechaLimite"],
})
    .refine((data) => {
    if (data.futureActionType === "documento") {
        return data.documentoRequerido !== undefined && data.documentoRequerido.length > 0;
    }
    return true;
}, {
    message: "documentoRequerido is required when futureActionType is documento",
    path: ["documentoRequerido"],
})
    .refine((data) => {
    if (data.futureActionType === "otra") {
        return data.tituloAccion !== undefined && data.tituloAccion.length > 0;
    }
    return true;
}, {
    message: "tituloAccion is required when futureActionType is otra",
    path: ["tituloAccion"],
});
const updateCategorySchema = z
    .object({
    name: z.string().min(1).max(100).optional(),
    informacion: z.string().max(1000).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
    categoryType: z.enum(["fecha", "dinero", "objeto", "otros", "datos_personales"]).optional(),
    dateMode: z.enum(["single", "range"]).optional(),
    maxDays: z.number().min(1).nullable().optional(),
    config: configSchema.optional(),
    limitType: z.enum(["monto", "porcentaje"]).nullable().optional(),
    montoMaximo: z.number().min(0).nullable().optional(),
    porcentajeMaximo: z.number().min(0).max(100).nullable().optional(),
    requiresAction: z.boolean().optional(),
    actionText: z.string().max(500).optional(),
    actionDescription: z.string().max(500).optional(),
    tituloAccion: z.string().max(500).optional(),
    futureActionType: z.enum(["documento", "otra"]).optional(),
    deadlineMode: z.enum(["none", "plazoDias", "fechaEspecifica"]).optional(),
    plazoDias: z.number().int().min(1).max(365).optional(),
    fechaLimite: z.coerce.date().optional(),
    documentoRequerido: z.string().max(200).optional(),
    requiresSignature: z.boolean().optional(),
    requiresUserConfirmation: z.boolean().optional(),
    pdfId: z.string().optional(),
    pdfText: z.string().optional(),
})
    .refine((data) => {
    if (data.requiresUserConfirmation && !data.actionText) {
        return false;
    }
    return true;
}, {
    message: "actionText is required when requiresUserConfirmation is true",
    path: ["actionText"],
})
    .refine((data) => {
    if (data.deadlineMode === "plazoDias") {
        return data.plazoDias !== undefined && data.plazoDias >= 1 && data.plazoDias <= 365;
    }
    return true;
}, {
    message: "plazoDias is required and must be between 1 and 365 when deadlineMode is plazoDias",
    path: ["plazoDias"],
})
    .refine((data) => {
    if (data.deadlineMode === "fechaEspecifica") {
        return data.fechaLimite !== undefined;
    }
    return true;
}, {
    message: "fechaLimite is required when deadlineMode is fechaEspecifica",
    path: ["fechaLimite"],
})
    .refine((data) => {
    if (data.futureActionType === "documento") {
        return data.documentoRequerido !== undefined && data.documentoRequerido.length > 0;
    }
    return true;
}, {
    message: "documentoRequerido is required when futureActionType is documento",
    path: ["documentoRequerido"],
})
    .refine((data) => {
    if (data.futureActionType === "otra") {
        return data.tituloAccion !== undefined && data.tituloAccion.length > 0;
    }
    return true;
}, {
    message: "tituloAccion is required when futureActionType is otra",
    path: ["tituloAccion"],
});
const reorderCategoriesSchema = z.object({
    categories: z
        .array(z.object({
        id: z.string(),
        sortOrder: z.number().int().min(0),
    }))
        .min(1),
});
// ─────────────────────────────────────────────────────────────────────────────
// General Settings Routes (Must be before /:id)
// ─────────────────────────────────────────────────────────────────────────────
import { OrderGeneralConfig } from "../models/OrderGeneralConfig.js";
router.get("/settings", async (req, res) => {
    try {
        const config = await OrderGeneralConfig.getOrCreateDefault(req.tenantObjectId);
        res.json(config);
    }
    catch (error) {
        console.error("Get order settings error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.put("/settings", async (req, res) => {
    try {
        const { contractRules, orderingEnabled } = req.body;
        // Simple validation
        if (contractRules && !Array.isArray(contractRules)) {
            res.status(400).json({ error: "contractRules must be an array" });
            return;
        }
        const config = await OrderGeneralConfig.findOneAndUpdate({ tenantId: req.tenantObjectId }, {
            $set: {
                contractRules: contractRules || [],
                orderingEnabled: orderingEnabled !== undefined ? orderingEnabled : true,
            },
        }, { new: true, upsert: true, setDefaultsOnInsert: true });
        res.json(config);
    }
    catch (error) {
        console.error("Update order settings error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get("/", async (req, res) => {
    try {
        const { isActive } = req.query;
        const filter = { tenantId: req.tenantObjectId };
        if (isActive !== undefined) {
            filter.isActive = isActive === "true";
        }
        const categories = await OrderConfig.find(filter).sort({ sortOrder: 1, name: 1 });
        res.json(categories);
    }
    catch (error) {
        console.error("Get order categories error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get("/:id", async (req, res) => {
    try {
        const category = await OrderConfig.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
        });
        if (!category) {
            res.status(404).json({ error: "Category not found" });
            return;
        }
        res.json(category);
    }
    catch (error) {
        console.error("Get order category error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.put("/reorder", async (req, res) => {
    try {
        const userId = req.user.userId;
        const { categories } = reorderCategoriesSchema.parse(req.body);
        const categoryIds = categories.map((c) => c.id);
        const existingCategories = await OrderConfig.find({
            _id: { $in: categoryIds },
            tenantId: req.tenantObjectId,
        });
        if (existingCategories.length !== categories.length) {
            res.status(400).json({ error: "Una o más categorías no existen o no pertenecen a este tenant" });
            return;
        }
        const updatePromises = categories.map(({ id, sortOrder }) => OrderConfig.findByIdAndUpdate(id, { sortOrder }, { new: true }));
        await Promise.all(updatePromises);
        res.json({ message: "Categories reordered successfully" });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid data", details: error.errors });
            return;
        }
        console.error("Reorder categories error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.post("/", async (req, res) => {
    try {
        const userId = req.user.userId;
        const data = createCategorySchema.parse(req.body);
        const existingCategory = await OrderConfig.findOne({
            tenantId: req.tenantObjectId,
            name: data.name,
        });
        if (existingCategory) {
            res.status(400).json({ error: "Ya existe una categoría con ese nombre" });
            return;
        }
        if (data.pdfId) {
            if (!mongoose.Types.ObjectId.isValid(data.pdfId)) {
                res.status(400).json({ error: "Invalid pdfId format" });
                return;
            }
            const template = await Pdf.findOne({
                _id: data.pdfId,
                tenantId: req.tenantObjectId,
                isActive: true,
            });
            if (!template) {
                res.status(400).json({ error: "Plantilla PDF no encontrada o inactiva" });
                return;
            }
        }
        const maxOrderCategory = await OrderConfig.findOne({
            tenantId: req.tenantObjectId,
        })
            .sort({ sortOrder: -1 })
            .limit(1);
        const nextSortOrder = maxOrderCategory ? maxOrderCategory.sortOrder + 1 : 1;
        // If requiresAction is true but futureActionType is not provided, default to "sinVencimiento"
        const categoryData = {
            tenantId: req.tenantObjectId,
            ...data,
            sortOrder: nextSortOrder,
        };
        if (categoryData.pdfId) {
            categoryData.pdfId = new mongoose.Types.ObjectId(categoryData.pdfId);
        }
        if (categoryData.requiresAction && !categoryData.futureActionType) {
            categoryData.futureActionType = "sinVencimiento";
        }
        const category = new OrderConfig(categoryData);
        await category.save();
        res.status(201).json(category);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid data", details: error.errors });
            return;
        }
        console.error("Create order category error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.put("/:id", async (req, res) => {
    try {
        const userId = req.user.userId;
        const data = updateCategorySchema.parse(req.body);
        const category = await OrderConfig.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
        });
        if (!category) {
            res.status(404).json({ error: "Category not found" });
            return;
        }
        if (data.name && data.name !== category.name) {
            const existingCategory = await OrderConfig.findOne({
                tenantId: req.tenantObjectId,
                name: data.name,
                _id: { $ne: category._id },
            });
            if (existingCategory) {
                res.status(400).json({ error: "Ya existe una categoría con ese nombre" });
                return;
            }
        }
        if (data.pdfId) {
            if (!mongoose.Types.ObjectId.isValid(data.pdfId)) {
                res.status(400).json({ error: "Invalid pdfId format" });
                return;
            }
            const template = await Pdf.findOne({
                _id: data.pdfId,
                tenantId: req.tenantObjectId,
                isActive: true,
            });
            if (!template) {
                res.status(400).json({ error: "Plantilla PDF no encontrada o inactiva" });
                return;
            }
        }
        const updateData = { ...data };
        if (updateData.pdfId) {
            updateData.pdfId = new mongoose.Types.ObjectId(updateData.pdfId);
        }
        Object.assign(category, updateData);
        await category.save();
        res.json(category);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid data", details: error.errors });
            return;
        }
        console.error("Update order category error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.userId;
        const category = await OrderConfig.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
        });
        if (!category) {
            res.status(404).json({ error: "Category not found" });
            return;
        }
        await OrderConfig.findByIdAndDelete(category._id);
        res.json({ message: "Category deleted successfully" });
    }
    catch (error) {
        console.error("Delete order category error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as orderConfigRoutes };
