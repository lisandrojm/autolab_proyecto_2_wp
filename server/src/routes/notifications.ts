import { Router } from "express";
import { Notification } from "../models/Notification.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.use(requireTenant, authenticateToken);

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const notifications = await Notification.find({
      tenantId: req.tenantObjectId,
      userId,
    }).sort({ createdAt: -1 });

    res.json(notifications);
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/unread", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const notifications = await Notification.find({
      tenantId: req.tenantObjectId,
      userId,
      isRead: false,
    }).sort({ createdAt: -1 });

    res.json(notifications);
  } catch (error) {
    console.error("Get unread notifications error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/count", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const count = await Notification.countDocuments({
      tenantId: req.tenantObjectId,
      userId,
      isRead: false,
    });

    res.json({ count });
  } catch (error) {
    console.error("Get notification count error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id/read", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        tenantId: req.tenantObjectId,
        userId,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
      { new: true }
    );

    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json(notification);
  } catch (error) {
    console.error("Mark notification read error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/read-all", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const result = await Notification.updateMany(
      {
        tenantId: req.tenantObjectId,
        userId,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    res.json({ message: "All notifications marked as read", count: result.modifiedCount });
  } catch (error) {
    console.error("Mark all read error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
    });

    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json({ message: "Notification deleted successfully" });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as notificationRoutes };
