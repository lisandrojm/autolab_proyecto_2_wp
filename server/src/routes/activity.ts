import { Router } from "express";
import { ActivityLog } from "../models/ActivityLog.js";
import { Order } from "../models/Order.js";
import { OrderCategory } from "../models/OrderCategory.js";
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

    const enrichedActivities = await Promise.all(
      activities.map(async (activity) => {
        const activityObj = activity.toObject();

        if (activity.action === "order_created" && activity.entityId) {
          try {
            const order = await Order.findById(activity.entityId).populate("categoryId");
            if (order && order.categoryId) {
              const category = order.categoryId as any;
              const categoryName = category.name || order.category;

              let subcategoryText = "";
              if (order.subcategories && order.subcategories.length > 0 && category.config?.subtipos) {
                const subcategoryLabels = order.subcategories.map((subId) => {
                  const subtipo = category.config.subtipos?.find((s: any) => s.id === subId);
                  return subtipo?.label || subId;
                });
                subcategoryText = ` - ${subcategoryLabels.join(", ")}`;
              } else if (order.subcategories && order.subcategories.length > 0) {
                subcategoryText = ` - ${order.subcategories.join(", ")}`;
              }

              activityObj.description = `Pedido creado: ${categoryName}${subcategoryText}`;
            }
          } catch (err) {
            console.error("Error enriching activity:", err);
          }
        }

        return activityObj;
      })
    );

    res.json(enrichedActivities);
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
