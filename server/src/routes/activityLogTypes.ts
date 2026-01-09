import { Router } from "express";
import { ActivityLogType } from "../models/ActivityLogType.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.use(requireTenant, authenticateToken);

// GET /api/v1/activity-log-types
router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    // Return all types, sorted by order
    const types = await ActivityLogType.find({ tenantId: req.tenantObjectId }).sort({ order: 1 });
    res.json(types);
  } catch (error) {
    console.error("Get activity log types error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/activity-log-types
router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { name, requiresReplacement, status, order } = req.body;

    // Validate inputs
    if (!name) return res.status(400).json({ error: "Name is required" });

    // Determine order if not provided: max order + 1
    let newOrder = order;
    if (newOrder === undefined) {
      const lastItem = await ActivityLogType.findOne({ tenantId: req.tenantObjectId }).sort({ order: -1 });
      newOrder = (lastItem?.order || 0) + 1;
    }

    const newType = new ActivityLogType({
      tenantId: req.tenantObjectId,
      name,
      requiresReplacement: !!requiresReplacement,
      isActive: status === "Activa" || status === true, // Handle "Activa"/"Inactiva" string or boolean
      order: newOrder,
      visibility: req.body.visibility || "all",
      allowedProjectIds: req.body.allowedProjectIds || [],
    });

    await newType.save();
    res.status(201).json(newType);
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "A type with this name already exists" });
    }
    console.error("Create activity log type error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/v1/activity-log-types/:id
router.put("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { id } = req.params;
    const { name, requiresReplacement, status, order } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (requiresReplacement !== undefined) updateData.requiresReplacement = requiresReplacement;
    if (status !== undefined) {
      if (typeof status === "string") updateData.isActive = status === "Activa";
      else updateData.isActive = !!status;
    }
    if (order !== undefined) updateData.order = order;
    if (req.body.visibility !== undefined) updateData.visibility = req.body.visibility;
    if (req.body.allowedProjectIds !== undefined) updateData.allowedProjectIds = req.body.allowedProjectIds;

    const updatedType = await ActivityLogType.findOneAndUpdate({ _id: id, tenantId: req.tenantObjectId }, updateData, { new: true });

    if (!updatedType) return res.status(404).json({ error: "Activity log type not found" });

    res.json(updatedType);
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "A type with this name already exists" });
    }
    console.error("Update activity log type error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/v1/activity-log-types/:id
router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { id } = req.params;
    const deleted = await ActivityLogType.findOneAndDelete({ _id: id, tenantId: req.tenantObjectId });
    if (!deleted) return res.status(404).json({ error: "Activity log type not found" });
    res.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("Delete activity log type error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/v1/activity-log-types/reorder (Bulk update)
router.patch("/reorder", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    // Expects body: { items: [{ id: "...", order: 1 }, ...] }
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "Items array required" });

    // Execute bulk write
    const ops = items.map((item: any) => ({
      updateOne: {
        filter: { _id: item.id, tenantId: req.tenantObjectId },
        update: { $set: { order: item.order } },
      },
    }));

    await ActivityLogType.bulkWrite(ops);
    res.json({ message: "Order updated successfully" });
  } catch (error) {
    console.error("Reorder activity log types error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as activityLogTypeRoutes };
