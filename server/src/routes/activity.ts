import { Router } from "express";
import { ActivityLog } from "../models/ActivityLog.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.use(requireTenant, authenticateToken);

router.get("/recent", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const activities = await ActivityLog.find({
      tenantId: req.tenantObjectId,
      userId,
    })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json(activities);
  } catch (error) {
    console.error("Get recent activity error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/all", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const [activities, total] = await Promise.all([
      ActivityLog.find({
        tenantId: req.tenantObjectId,
        userId,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      ActivityLog.countDocuments({
        tenantId: req.tenantObjectId,
        userId,
      }),
    ]);

    res.json({
      activities,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get all activity error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as activityRoutes };
