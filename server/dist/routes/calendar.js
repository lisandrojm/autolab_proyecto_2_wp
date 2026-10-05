import { Router } from "express";
import { Calendar } from "../models/Calendar.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
const router = Router();
router.use(requireTenant, authenticateToken);
router.get("/events", async (req, res) => {
    try {
        const userId = req.user.userId;
        const events = await Calendar.find({
            tenantId: req.tenantObjectId,
            userId,
        })
            .sort({ start: 1 })
            .populate({
            path: "createdBy",
            select: "firstName lastName email",
            options: { strictPopulate: false },
        })
            .lean();
        res.json(events || []);
    }
    catch (error) {
        console.error("Get calendar events error:", error);
        res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" });
    }
});
router.get("/events/:id", async (req, res) => {
    try {
        const userId = req.user.userId;
        const event = await Calendar.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
            userId,
        }).populate("createdBy", "firstName lastName email");
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        res.json(event);
    }
    catch (error) {
        console.error("Get calendar event error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get("/events/month/:year/:month", async (req, res) => {
    try {
        const userId = req.user.userId;
        const year = parseInt(req.params.year);
        const month = parseInt(req.params.month);
        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
            res.status(400).json({ error: "Invalid year or month" });
            return;
        }
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);
        const events = await Calendar.find({
            tenantId: req.tenantObjectId,
            userId,
            start: { $gte: startDate, $lte: endDate },
        })
            .sort({ start: 1 })
            .populate("createdBy", "firstName lastName email");
        res.json(events);
    }
    catch (error) {
        console.error("Get monthly events error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as calendarRoutes };
