import { Router } from "express";
import { RequestConfig } from "../models/RequestConfig.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { ActivityLogGeneralConfig } from "../models/ActivityLogGeneralConfig.js";
const router = Router();
router.use(requireTenant, authenticateToken);
// GET /api/v1/request-config/settings
router.get("/settings", async (req, res) => {
    try {
        const config = await ActivityLogGeneralConfig.getOrCreateDefault(req.tenantObjectId);
        res.json(config);
    }
    catch (error) {
        console.error("Get activity log general settings error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/v1/request-config/settings
router.put("/settings", async (req, res) => {
    try {
        const { allowedPastDays } = req.body;
        if (allowedPastDays !== undefined && (typeof allowedPastDays !== "number" || allowedPastDays < 1)) {
            return res.status(400).json({ error: "allowedPastDays must be a positive number" });
        }
        const config = await ActivityLogGeneralConfig.findOneAndUpdate({ tenantId: req.tenantObjectId }, {
            $set: {
                allowedPastDays: allowedPastDays !== undefined ? allowedPastDays : 3,
            },
        }, { new: true, upsert: true, setDefaultsOnInsert: true });
        res.json(config);
    }
    catch (error) {
        console.error("Update activity log general settings error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/v1/activity-log-types
router.get("/", async (req, res) => {
    try {
        // Return all types, sorted by order
        const types = await RequestConfig.find({ tenantId: req.tenantObjectId }).sort({ order: 1 });
        res.json(types);
    }
    catch (error) {
        console.error("Get activity log types error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/v1/activity-log-types
router.post("/", async (req, res) => {
    try {
        const { name, requiresReplacement, status, isActive, order } = req.body;
        // Validate inputs
        if (!name)
            return res.status(400).json({ error: "Name is required" });
        // Determine order if not provided: max order + 1
        let newOrder = order;
        if (newOrder === undefined) {
            const lastItem = await RequestConfig.findOne({ tenantId: req.tenantObjectId }).sort({ order: -1 });
            newOrder = (lastItem?.order || 0) + 1;
        }
        const statusVal = status !== undefined ? status : isActive;
        const newConfig = new RequestConfig({
            tenantId: req.tenantObjectId,
            name,
            requiresReplacement: !!requiresReplacement,
            isActive: statusVal === "Activa" || statusVal === true, // Handle "Activa"/"Inactiva" string or boolean
            order: newOrder,
            visibility: req.body.visibility || "all",
            allowedProjectIds: req.body.allowedProjectIds || [],
        });
        await newConfig.save();
        res.status(201).json(newConfig);
    }
    catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: "A configuration with this name already exists" });
        }
        console.error("Create activity log config error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/v1/activity-log-types/:id
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, requiresReplacement, status, isActive, order } = req.body;
        const updateData = {};
        if (name !== undefined)
            updateData.name = name;
        if (requiresReplacement !== undefined)
            updateData.requiresReplacement = requiresReplacement;
        const statusVal = status !== undefined ? status : isActive;
        if (statusVal !== undefined) {
            if (typeof statusVal === "string")
                updateData.isActive = statusVal === "Activa";
            else
                updateData.isActive = !!statusVal;
        }
        if (order !== undefined)
            updateData.order = order;
        if (req.body.visibility !== undefined)
            updateData.visibility = req.body.visibility;
        if (req.body.allowedProjectIds !== undefined)
            updateData.allowedProjectIds = req.body.allowedProjectIds;
        const updatedConfig = await RequestConfig.findOneAndUpdate({ _id: id, tenantId: req.tenantObjectId }, updateData, { new: true });
        if (!updatedConfig)
            return res.status(404).json({ error: "Activity log configuration not found" });
        res.json(updatedConfig);
    }
    catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: "A configuration with this name already exists" });
        }
        console.error("Update activity log config error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/v1/activity-log-types/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await RequestConfig.findOneAndDelete({ _id: id, tenantId: req.tenantObjectId });
        if (!deleted)
            return res.status(404).json({ error: "Activity log configuration not found" });
        res.json({ message: "Deleted successfully" });
    }
    catch (error) {
        console.error("Delete activity log config error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/v1/activity-log-types/reorder (Bulk update)
router.patch("/reorder", async (req, res) => {
    try {
        // Expects body: { items: [{ id: "...", order: 1 }, ...] }
        const { items } = req.body;
        if (!Array.isArray(items))
            return res.status(400).json({ error: "Items array required" });
        // Execute bulk write
        const ops = items.map((item) => ({
            updateOne: {
                filter: { _id: item.id, tenantId: req.tenantObjectId },
                update: { $set: { order: item.order } },
            },
        }));
        await RequestConfig.bulkWrite(ops);
        res.json({ message: "Order updated successfully" });
    }
    catch (error) {
        console.error("Reorder activity log configs error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as RequestConfigRoutes };
